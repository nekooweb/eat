#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const LEDGER = process.argv[2] || path.join(DATA, 'area1_inventory_ledger.json');
const OUTPUT = process.argv[3] || path.join(DATA, 'area1_inventory_expansion_queue.json');

function loadOsm() {
  const sandbox = { window: { RESTAURANTS: [] } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, 'area1_osm.js'), 'utf8'), sandbox, { filename: 'area1_osm.js' });
  return sandbox.window.RESTAURANTS || [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const cache = JSON.parse(fs.readFileSync(path.join(DATA, 'google_places_cache.json'), 'utf8'));
const osmRows = loadOsm();
const osmById = new Map(osmRows.map((row) => [row.id, row]));

const reasonPriority = {
  name_mismatch: 1,
  location_mismatch: 2,
  non_food_google_type: 3,
  closed_permanently: 4,
  outside_1_2km: 5,
  no_google_place: 6
};

const rejectedByPlaceId = new Map();
for (const row of Object.values(cache || {})) {
  if (!row?.googlePlaceId || row.status !== 'rejected') continue;
  if (!rejectedByPlaceId.has(row.googlePlaceId)) rejectedByPlaceId.set(row.googlePlaceId, []);
  rejectedByPlaceId.get(row.googlePlaceId).push(row);
}

const rows = [];
for (const entry of ledger.entries || []) {
  if (entry.status !== 'inventory_only') continue;
  const rejected = rejectedByPlaceId.get(entry.googlePlaceId) || [];
  if (!rejected.length) continue;

  const candidates = rejected.map((qc) => {
    const source = osmById.get(qc.sourceId) || osmById.get(String(qc.sourceId || '').replace(/^osm-/, 'osm-'));
    return {
      sourceCandidateId: qc.sourceId,
      reason: qc.reason || 'unknown',
      ...(source ? {
        sourceName: source.name || '',
        cuisine: source.cuisine || '餐厅',
        distanceMeters: Number.isFinite(source.distanceMeters) ? source.distanceMeters : null,
        lat: Number.isFinite(source.lat) ? source.lat : null,
        lng: Number.isFinite(source.lng) ? source.lng : null,
        address: source.address || ''
      } : { sourceCandidateMissing: true })
    };
  });

  const reasons = unique(candidates.map((item) => item.reason)).sort((a, b) =>
    (reasonPriority[a] || 99) - (reasonPriority[b] || 99) || a.localeCompare(b));
  const bestPriority = Math.min(...reasons.map((reason) => reasonPriority[reason] || 99));
  rows.push({
    googlePlaceId: entry.googlePlaceId,
    reviewPriority: bestPriority,
    rejectionReasons: reasons,
    candidates
  });
}

rows.sort((a, b) =>
  a.reviewPriority - b.reviewPriority
  || (a.candidates[0]?.distanceMeters ?? 99999) - (b.candidates[0]?.distanceMeters ?? 99999)
  || a.googlePlaceId.localeCompare(b.googlePlaceId));

const reasonCounts = {};
for (const row of rows) {
  for (const reason of row.rejectionReasons) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
}
const missingCandidateRows = rows.reduce((sum, row) =>
  sum + row.candidates.filter((candidate) => candidate.sourceCandidateMissing).length, 0);

const output = {
  schemaVersion: 1,
  scope: ledger.scope,
  generatedAt: '2026-09-06',
  purpose: 'Zero-Google-cost review queue for inventory-only identities that already have at least one rejected independent OSM candidate match. Candidate rejection does not invalidate the Google identity and does not establish an identity match.',
  summary: {
    queueIdentities: rows.length,
    candidateLinks: rows.reduce((sum, row) => sum + row.candidates.length, 0),
    reasonCounts,
    missingCandidateRows
  },
  priorityMeaning: {
    1: 'name_mismatch: independent candidate exists; re-check branch/name evolution first',
    2: 'location_mismatch: re-check coordinates/branch movement',
    3: 'non_food_google_type: likely category/identity mismatch; lower confidence',
    4: 'closed_permanently: source may be stale/replaced; do not promote without current evidence',
    5: 'outside_1_2km: previous candidate-to-Google match was geographically invalid; likely wrong pairing'
  },
  rows
};

if (rows.length !== ledger.summary.candidateRejectedOnly) {
  throw new Error(`expansion queue mismatch: queue=${rows.length} ledgerCandidateRejectedOnly=${ledger.summary.candidateRejectedOnly}`);
}
if (missingCandidateRows) {
  throw new Error(`expansion queue lost ${missingCandidateRows} OSM candidate rows`);
}

fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(output.summary));
