#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inventoryPath = path.join(ROOT, 'data', 'area1_google_ids.json');
const qcPath = path.join(ROOT, 'data', 'google_entities.generated.js');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readQcRows(file) {
  const source = fs.readFileSync(file, 'utf8');
  const match = source.match(/const rows=(\[.*?\]);const byId=/s);
  if (!match) throw new Error(`Unable to parse QC rows from ${file}`);
  return JSON.parse(match[1]);
}

const inventory = readJson(inventoryPath);
const qcRows = readQcRows(qcPath);
const inventoryIds = new Set(inventory.googlePlaceIds || []);
const verifiedIds = new Set(
  qcRows
    .filter(row => row.status === 'verified' && row.googlePlaceId)
    .map(row => row.googlePlaceId)
);
const rejectedIds = new Set(
  qcRows
    .filter(row => row.status === 'rejected' && row.googlePlaceId)
    .map(row => row.googlePlaceId)
);
const pendingRows = qcRows.filter(row => row.status === 'pending');

const verifiedInInventory = [...verifiedIds].filter(id => inventoryIds.has(id));
const inventoryWithoutVerifiedSource = [...inventoryIds].filter(id => !verifiedIds.has(id));
const verifiedOutsideInventory = [...verifiedIds].filter(id => !inventoryIds.has(id));
const rejectedInventoryIds = [...rejectedIds].filter(id => inventoryIds.has(id));

const report = {
  inventoryMethod: inventory.method || 'legacy/unknown',
  inventoryDeclaredComplete: inventory.complete === true,
  inventoryDeclaredCount: inventory.count ?? null,
  inventoryUniquePlaceIds: inventoryIds.size,
  qcRows: qcRows.length,
  qcPendingRows: pendingRows.length,
  verifiedUniquePlaceIds: verifiedIds.size,
  verifiedPlaceIdsCoveredByInventory: verifiedInInventory.length,
  inventoryPlaceIdsWithoutVerifiedIndependentSource: inventoryWithoutVerifiedSource.length,
  rejectedPlaceIdsPresentInInventory: rejectedInventoryIds.length,
  verifiedPlaceIdsOutsideInventory: verifiedOutsideInventory.length,
  exactCoverageReady:
    inventory.complete === true &&
    Number.isInteger(inventory.count) &&
    inventoryIds.size === inventory.count
};

console.log(JSON.stringify(report, null, 2));

if (!report.exactCoverageReady) {
  console.error(
    'Area1 exact coverage gate is BLOCKED: inventory is not a completeness-audited exact Place-ID set.'
  );
  process.exitCode = 2;
}
