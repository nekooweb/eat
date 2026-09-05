#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const INVENTORY_PATH = path.join(DATA, 'area1_google_ids.json');
const CACHE_PATH = path.join(DATA, 'google_places_cache.json');
const PRODUCTION_PATH = path.join(DATA, 'production_area1.js');
const OUTPUT_PATH = process.argv[2] || path.join(DATA, 'area1_inventory_ledger.json');

function loadProduction() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(PRODUCTION_PATH, 'utf8'), sandbox, { filename: 'production_area1.js' });
  if (!Array.isArray(sandbox.window.PRODUCTION_RESTAURANTS)) {
    throw new Error('production_area1.js did not expose PRODUCTION_RESTAURANTS');
  }
  return sandbox.window.PRODUCTION_RESTAURANTS;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

const inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
const production = loadProduction();

if (!inventory.complete || !inventory.coverageVerified || !inventory.independentCountVerified) {
  throw new Error('Area1 exact inventory is not declared complete/verified');
}
if (!Array.isArray(inventory.googlePlaceIds)) throw new Error('inventory googlePlaceIds must be an array');

const inventoryIds = uniqueSorted(inventory.googlePlaceIds);
if (inventoryIds.length !== inventory.count || inventoryIds.length !== inventory.aggregateExactCount) {
  throw new Error(`inventory count mismatch: ids=${inventoryIds.length} count=${inventory.count} exact=${inventory.aggregateExactCount}`);
}
if (inventoryIds.length !== 2804) {
  throw new Error(`unexpected Area1 inventory total: ${inventoryIds.length}`);
}

const inventorySet = new Set(inventoryIds);
const productionIds = uniqueSorted(production.map((row) => row.googlePlaceId));
const productionSet = new Set(productionIds);

const qcByPlaceId = new Map();
for (const row of Object.values(cache || {})) {
  if (!row || !row.googlePlaceId) continue;
  if (!qcByPlaceId.has(row.googlePlaceId)) {
    qcByPlaceId.set(row.googlePlaceId, { verifiedCandidateCount: 0, rejectedCandidateCount: 0, rejectedReasons: [] });
  }
  const state = qcByPlaceId.get(row.googlePlaceId);
  if (row.status === 'verified') state.verifiedCandidateCount += 1;
  if (row.status === 'rejected') {
    state.rejectedCandidateCount += 1;
    if (row.reason) state.rejectedReasons.push(row.reason);
  }
}
for (const state of qcByPlaceId.values()) state.rejectedReasons = uniqueSorted(state.rejectedReasons);

const entries = inventoryIds.map((googlePlaceId) => {
  const qc = qcByPlaceId.get(googlePlaceId) || { verifiedCandidateCount: 0, rejectedCandidateCount: 0, rejectedReasons: [] };
  let status = 'inventory_only';
  if (productionSet.has(googlePlaceId)) status = 'production';
  else if (qc.verifiedCandidateCount > 0) status = 'verified_independent_source_not_production';

  const row = { googlePlaceId, status };
  if (qc.verifiedCandidateCount || qc.rejectedCandidateCount) {
    row.candidateQc = {
      verifiedCandidateCount: qc.verifiedCandidateCount,
      rejectedCandidateCount: qc.rejectedCandidateCount
    };
    if (qc.rejectedReasons.length) row.candidateQc.rejectedReasons = qc.rejectedReasons;
  }
  return row;
});

const statusCounts = entries.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] || 0) + 1;
  return acc;
}, {});
const verifiedIndependentInInventory = entries.filter((row) =>
  (row.candidateQc?.verifiedCandidateCount || 0) > 0).length;
const candidateRejectedOnly = entries.filter((row) =>
  row.status === 'inventory_only'
  && (row.candidateQc?.verifiedCandidateCount || 0) === 0
  && (row.candidateQc?.rejectedCandidateCount || 0) > 0).length;
const untouchedInventoryOnly = entries.filter((row) =>
  row.status === 'inventory_only'
  && !row.candidateQc).length;
const productionOutsideInventory = productionIds.filter((id) => !inventorySet.has(id));
const verifiedOutsideInventory = [...qcByPlaceId.entries()]
  .filter(([id, qc]) => !inventorySet.has(id) && qc.verifiedCandidateCount > 0)
  .map(([id]) => id)
  .sort();

const output = {
  schemaVersion: 1,
  scope: inventory.scope,
  radiusMeters: inventory.radiusMeters,
  inventoryMethod: inventory.method,
  inventoryCheckedAt: inventory.checkedAt,
  generatedAt: '2026-09-06',
  policy: {
    googlePlaceIdOnly: true,
    googleDisplayPayloadPersisted: false,
    statusMeaning: {
      production: 'Exact inventory Place ID is already in canonical production.',
      verified_independent_source_not_production: 'At least one independent-source candidate passed Google identity QC, but this Place ID is not canonical production.',
      inventory_only: 'Exact inventory identity has no verified independent-source admission path yet. Candidate-level rejections, if present, do not invalidate the Google identity.'
    }
  },
  summary: {
    inventoryTotal: entries.length,
    productionTotal: productionIds.length,
    productionInInventory: statusCounts.production || 0,
    productionOutsideInventory: productionOutsideInventory.length,
    verifiedIndependentInInventory,
    verifiedIndependentSourceNotProduction: statusCounts.verified_independent_source_not_production || 0,
    inventoryOnly: statusCounts.inventory_only || 0,
    candidateRejectedOnly,
    untouchedInventoryOnly,
    verifiedOutsideInventory: verifiedOutsideInventory.length,
    statusCounts
  },
  productionOutsideInventory,
  verifiedOutsideInventory,
  entries
};

if (output.summary.inventoryTotal !== 2804) throw new Error('ledger must cover exactly 2,804 inventory identities');
if (entries.some((row) => !inventorySet.has(row.googlePlaceId))) throw new Error('ledger contains non-inventory ID');
if (new Set(entries.map((row) => row.googlePlaceId)).size !== entries.length) throw new Error('ledger contains duplicate Place IDs');
if ((statusCounts.production || 0) + (statusCounts.verified_independent_source_not_production || 0) + (statusCounts.inventory_only || 0) !== entries.length) {
  throw new Error('ledger status partition does not cover inventory exactly');
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(output.summary));
