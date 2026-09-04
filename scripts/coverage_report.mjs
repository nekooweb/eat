#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

const productionSandbox = { window: {} };
vm.createContext(productionSandbox);
vm.runInContext(read('data/production_area1.js'), productionSandbox, { filename: 'production_area1.js' });
const production = productionSandbox.window.PRODUCTION_RESTAURANTS || [];

const sourceSandbox = { window: { RESTAURANTS: [] } };
vm.createContext(sourceSandbox);
vm.runInContext(read('data/area1_osm.js'), sourceSandbox, { filename: 'area1_osm.js' });
const sourceRows = sourceSandbox.window.RESTAURANTS || [];

const inventory = fs.existsSync(path.join(ROOT, 'data/area1_google_ids.json'))
  ? readJson('data/area1_google_ids.json')
  : { googlePlaceIds: [] };
const inventoryIds = new Set(inventory.googlePlaceIds || []);

const cache = fs.existsSync(path.join(ROOT, 'data/google_places_cache.json'))
  ? readJson('data/google_places_cache.json')
  : {};
const verification = Object.values(cache).filter((row) => row && typeof row === 'object');

const countBy = (rows, keyFn) => rows.reduce((acc, row) => {
  const key = keyFn(row) || 'unknown';
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});
const validPrice = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const priceMatches = (p, min, max = Infinity) => validPrice(p) && p[0] <= max && p[1] >= min;
const anyPrice = (row, predicate) => [row.lunch, row.dinner].some(predicate);

const distances = Object.fromEntries([300, 500, 800, 1200].map((limit) => [
  `lte${limit}`,
  production.filter((row) => Number.isFinite(row.distanceMeters) && row.distanceMeters <= limit).length
]));

const budgets = {
  under1000: production.filter((row) => anyPrice(row, (p) => validPrice(p) && p[1] <= 999)).length,
  '1000_1999': production.filter((row) => anyPrice(row, (p) => priceMatches(p, 1000, 1999))).length,
  '2000_3999': production.filter((row) => anyPrice(row, (p) => priceMatches(p, 2000, 3999))).length,
  gte4000: production.filter((row) => anyPrice(row, (p) => priceMatches(p, 4000))).length,
  anyKnown: production.filter((row) => validPrice(row.lunch) || validPrice(row.dinner)).length
};

const productionIds = new Set(production.map((row) => row.googlePlaceId).filter(Boolean));
const productionInInventory = [...productionIds].filter((id) => inventoryIds.has(id)).length;
const statusCounts = countBy(verification, (row) => row.status);
const rejectionReasons = countBy(
  verification.filter((row) => row.status === 'rejected'),
  (row) => row.reason
);
const qcVersions = countBy(verification, (row) => row.qcVersion == null ? 'unversioned' : `v${row.qcVersion}`);
const cuisines = countBy(production, (row) => row.cuisine);

const report = {
  sourceCandidates: sourceRows.length,
  googleInventoryPlaceIds: inventoryIds.size,
  verificationCacheEntries: verification.length,
  verificationStatus: statusCounts,
  verificationQcVersions: qcVersions,
  rejectionReasons,
  productionEntities: production.length,
  productionInGoogleInventory,
  productionInventoryCoveragePct: inventoryIds.size
    ? Number((100 * productionInInventory / inventoryIds.size).toFixed(1))
    : null,
  distinctCuisineLabels: Object.keys(cuisines).length,
  topCuisineCounts: Object.entries(cuisines).sort((a, b) => b[1] - a[1]).slice(0, 12),
  distancePools: distances,
  budgetPools: budgets,
  awards: production.filter((row) => row.hyakumeiten).length
};

console.log(JSON.stringify(report));
