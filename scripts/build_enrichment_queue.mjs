#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

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
const enrichments = sourceSandbox.window.RESTAURANTS || [];

const byPlaceId = new Map();
for (const row of enrichments) {
  if (!row.googlePlaceId) continue;
  if (!byPlaceId.has(row.googlePlaceId)) byPlaceId.set(row.googlePlaceId, []);
  byPlaceId.get(row.googlePlaceId).push(row);
}

function sourceHosts(rows) {
  const hosts = new Set();
  for (const row of rows) {
    for (const ref of row.sourceRefs || []) {
      try {
        hosts.add(new URL(ref.url).hostname.replace(/^www\./, ''));
      } catch (_) {
        // Invalid URLs are handled by source-binding audit.
      }
    }
  }
  return [...hosts].sort();
}

function gaps(row) {
  const missing = [];
  if (!Array.isArray(row.recommendedDishes) || !row.recommendedDishes.length) missing.push('recommendedDishes');
  if (!row.openingHours) missing.push('openingHours');
  if (!Array.isArray(row.lunch) && !Array.isArray(row.dinner)) missing.push('budget');
  if (!row.address) missing.push('address');
  if (!row.cuisine || row.cuisine === '餐厅') missing.push('cuisine');
  return missing;
}

const records = production.map((row) => {
  const sourceRows = byPlaceId.get(row.googlePlaceId) || [];
  return {
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    distanceMeters: row.distanceMeters,
    sourceHosts: sourceHosts(sourceRows),
    gaps: gaps(row)
  };
});

const withUsableSource = records.filter((row) => row.sourceHosts.length);
const withoutUsableSource = records.filter((row) => !row.sourceHosts.length);
const needingFields = withUsableSource.filter((row) => row.gaps.length);

const grouped = new Map();
for (const row of needingFields) {
  for (const host of row.sourceHosts) {
    if (!grouped.has(host)) grouped.set(host, []);
    grouped.get(host).push(row);
  }
}

const sourceGroups = [...grouped.entries()]
  .map(([host, rows]) => ({
    host,
    restaurants: rows.length,
    gapCounts: rows.reduce((acc, row) => {
      for (const gap of row.gaps) acc[gap] = (acc[gap] || 0) + 1;
      return acc;
    }, {}),
    rows: rows
      .sort((a, b) => a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name, 'ja'))
      .slice(0, 100)
  }))
  .sort((a, b) => b.restaurants - a.restaurants || a.host.localeCompare(b.host));

const report = {
  productionEntities: production.length,
  withUsableSource: withUsableSource.length,
  withoutUsableSource: withoutUsableSource.length,
  usableSourceRowsNeedingFields: needingFields.length,
  gapCounts: needingFields.reduce((acc, row) => {
    for (const gap of row.gaps) acc[gap] = (acc[gap] || 0) + 1;
    return acc;
  }, {}),
  sourceGroups
};

console.log(JSON.stringify(report));
