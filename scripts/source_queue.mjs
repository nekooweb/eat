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

const enrichmentFiles = fs.readdirSync(DATA)
  .filter((filename) => /^source_enrichment(?:_[a-z0-9-]+)?\.js$/i.test(filename))
  .sort();
const sourceSandbox = { window: { RESTAURANTS: [] } };
vm.createContext(sourceSandbox);
for (const filename of enrichmentFiles) {
  vm.runInContext(read(`data/${filename}`), sourceSandbox, { filename });
}
const sourceRows = sourceSandbox.window.RESTAURANTS || [];
const sourceIds = new Set(sourceRows.map((row) => row.googlePlaceId).filter(Boolean));

const resolutionSandbox = { window: {} };
vm.createContext(resolutionSandbox);
if (fs.existsSync(path.join(DATA, 'source_resolution.js'))) {
  vm.runInContext(read('data/source_resolution.js'), resolutionSandbox, { filename: 'source_resolution.js' });
}
const resolutions = resolutionSandbox.window.SOURCE_RESOLUTIONS || [];
const resolutionIds = new Set(resolutions.map((row) => row.googlePlaceId).filter(Boolean));

const unresolved = production
  .filter((row) => !sourceIds.has(row.googlePlaceId) && !resolutionIds.has(row.googlePlaceId))
  .sort((a, b) => a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name, 'ja'))
  .map((row) => ({
    distanceMeters: row.distanceMeters,
    name: row.name,
    googlePlaceId: row.googlePlaceId,
    cuisine: row.cuisine,
    sources: row.sources
  }));

const usable = production.filter((row) => sourceIds.has(row.googlePlaceId)).length;
const explicitlyResolved = production.filter((row) => resolutionIds.has(row.googlePlaceId)).length;
const resolved = usable + explicitlyResolved;
const byResolutionStatus = resolutions.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] || 0) + 1;
  return acc;
}, {});

const report = {
  productionEntities: production.length,
  usableSourceIndexed: usable,
  usableSourceCoveragePct: production.length
    ? Number((100 * usable / production.length).toFixed(1))
    : null,
  explicitlyResolved,
  resolutionStatus: byResolutionStatus,
  sourceResolvedTotal: resolved,
  sourceResolutionCoveragePct: production.length
    ? Number((100 * resolved / production.length).toFixed(1))
    : null,
  unresolved: unresolved.length,
  nextUnresolved: unresolved.slice(0, 60)
};

console.log(JSON.stringify(report));
