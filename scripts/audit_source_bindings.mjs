#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const productionSandbox = { window: {} };
vm.createContext(productionSandbox);
vm.runInContext(read('data/production_area1.js'), productionSandbox, { filename: 'production_area1.js' });
const production = productionSandbox.window.PRODUCTION_RESTAURANTS || [];
const productionIds = new Set(production.map((row) => row.googlePlaceId).filter(Boolean));

const enrichmentFiles = fs.readdirSync(DATA)
  .filter((filename) => /^source_enrichment(?:_[a-z0-9-]+)?\.js$/i.test(filename))
  .sort();
const enrichmentSandbox = { window: { RESTAURANTS: [] } };
vm.createContext(enrichmentSandbox);
for (const filename of enrichmentFiles) {
  vm.runInContext(read(`data/${filename}`), enrichmentSandbox, { filename });
}
const enrichment = enrichmentSandbox.window.RESTAURANTS || [];

const unattached = enrichment.filter((row) => !productionIds.has(row.googlePlaceId));
if (unattached.length) {
  console.error('SOURCE BINDING AUDIT FAIL: source rows do not attach to current canonical production');
  for (const row of unattached) {
    console.error(`${row.id}\t${row.name}\t${row.googlePlaceId}`);
  }
  process.exit(1);
}

const attachedIds = new Set(enrichment.map((row) => row.googlePlaceId));
const sourceBacked = production.filter((row) =>
  (row.sources || []).some((source) => source === 'Tabelog' || source === 'official'));
const missingLabel = sourceBacked.filter((row) => !attachedIds.has(row.googlePlaceId));
if (missingLabel.length) {
  console.error('SOURCE BINDING AUDIT FAIL: canonical source label lacks a current enrichment row');
  for (const row of missingLabel) console.error(`${row.name}\t${row.googlePlaceId}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  productionEntities: production.length,
  enrichmentRecords: enrichment.length,
  attachedEnrichmentRecords: enrichment.length,
  sourceBackedProduction: sourceBacked.length,
  unattached: 0
}));
