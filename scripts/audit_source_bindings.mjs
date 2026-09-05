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

const resolutionFiles = fs.readdirSync(DATA)
  .filter((filename) => /^source_resolution(?:_[a-z0-9-]+)?\.js$/i.test(filename))
  .sort();
const resolutionSandbox = { window: { SOURCE_RESOLUTIONS: [] } };
vm.createContext(resolutionSandbox);
for (const filename of resolutionFiles) {
  vm.runInContext(read(`data/${filename}`), resolutionSandbox, { filename });
}
const resolutions = resolutionSandbox.window.SOURCE_RESOLUTIONS || [];
const allowedStatuses = new Set(['listing_hold', 'ambiguous', 'no_current_usable_source', 'source_not_found']);
const resolutionIds = new Set();
for (const row of resolutions) {
  if (!row.googlePlaceId || !productionIds.has(row.googlePlaceId)) {
    console.error(`SOURCE RESOLUTION AUDIT FAIL: resolution is not a current production identity: ${row.name}\t${row.googlePlaceId}`);
    process.exit(1);
  }
  if (attachedIds.has(row.googlePlaceId)) {
    console.error(`SOURCE RESOLUTION AUDIT FAIL: identity has both usable source and resolution: ${row.name}\t${row.googlePlaceId}`);
    process.exit(1);
  }
  if (resolutionIds.has(row.googlePlaceId)) {
    console.error(`SOURCE RESOLUTION AUDIT FAIL: duplicate resolution: ${row.googlePlaceId}`);
    process.exit(1);
  }
  resolutionIds.add(row.googlePlaceId);
  if (!allowedStatuses.has(row.status)) {
    console.error(`SOURCE RESOLUTION AUDIT FAIL: unsupported status ${row.status}: ${row.name}`);
    process.exit(1);
  }
  if (!row.reason || !row.checkedAt || !/^\d{4}-\d{2}-\d{2}$/.test(row.checkedAt)) {
    console.error(`SOURCE RESOLUTION AUDIT FAIL: incomplete reason/date: ${row.name}`);
    process.exit(1);
  }
  if (!Array.isArray(row.refs) || !row.refs.length || row.refs.some((ref) => !/^https:\/\//.test(ref))) {
    console.error(`SOURCE RESOLUTION AUDIT FAIL: resolution lacks HTTPS evidence: ${row.name}`);
    process.exit(1);
  }
}

console.log(JSON.stringify({
  status: 'pass',
  productionEntities: production.length,
  enrichmentRecords: enrichment.length,
  attachedEnrichmentRecords: enrichment.length,
  sourceBackedProduction: sourceBacked.length,
  resolutionShards: resolutionFiles.length,
  explicitResolutions: resolutions.length,
  unresolvedByBindingAudit: 0,
  unattached: 0
}));
