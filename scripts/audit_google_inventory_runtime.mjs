import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const inventory = JSON.parse(fs.readFileSync(path.join(DATA, 'area1_google_ids.json'), 'utf8'));
const runtimeText = fs.readFileSync(path.join(DATA, 'google_inventory_runtime.js'), 'utf8');

function parseAssignment(name) {
  const prefix = `window.${name}=`;
  const start = runtimeText.indexOf(prefix);
  if (start < 0) throw new Error(`Missing ${name}`);
  const valueStart = start + prefix.length;
  const end = runtimeText.indexOf(';\n', valueStart);
  if (end < 0) throw new Error(`Cannot parse ${name}`);
  return JSON.parse(runtimeText.slice(valueStart, end));
}

const rows = parseAssignment('GOOGLE_INVENTORY_RESTAURANTS');
const stats = parseAssignment('GOOGLE_INVENTORY_STATS');
const expected = inventory.googlePlaceIds || [];
const expectedSet = new Set(expected);
const ids = rows.map((row) => row.googlePlaceId);
const publishedSet = new Set(ids);
const forbiddenKeys = new Set([
  'displayName', 'formattedAddress', 'googleName', 'googleAddress', 'googleLocation',
  'currentOpeningHours', 'nationalPhoneNumber', 'internationalPhoneNumber', 'websiteUri'
]);

if (expected.length !== 2804 || expectedSet.size !== 2804) {
  throw new Error('Frozen catalog must contain exactly 2,804 unique Google Place IDs');
}
if (ids.length !== publishedSet.size) {
  throw new Error('Published runtime contains duplicate Google Place IDs');
}
if (ids.some((pid) => !expectedSet.has(pid))) {
  throw new Error('Published runtime contains a Place ID outside the frozen catalog');
}
const expectedPublishedOrder = expected.filter((pid) => publishedSet.has(pid));
if (expectedPublishedOrder.length !== ids.length || expectedPublishedOrder.some((pid, index) => pid !== ids[index])) {
  throw new Error('Published runtime order must preserve frozen catalog order');
}

for (const row of rows) {
  if (!row.googlePlaceId || row.inventoryWithinRadius !== true) throw new Error('Missing frozen-inventory identity marker');
  if (!['canonical', 'source_matched'].includes(row.basicInfoState)) {
    throw new Error(`Unpublished/basic state leaked into public runtime for ${row.googlePlaceId}: ${row.basicInfoState}`);
  }
  if (row.nameKnown !== true || !String(row.name || '').trim()) {
    throw new Error(`Published runtime contains an unnamed restaurant: ${row.googlePlaceId}`);
  }
  if (String(row.name).trim() === 'Google Maps 餐厅') {
    throw new Error(`Legacy placeholder name leaked into public runtime: ${row.googlePlaceId}`);
  }
  for (const key of forbiddenKeys) {
    if (key in row) throw new Error(`Persisted forbidden Google content key ${key}`);
  }
  if (Number.isFinite(row.distanceMeters) && (row.distanceMeters < 0 || row.distanceMeters > 1200)) {
    throw new Error(`Out-of-radius distance for ${row.googlePlaceId}`);
  }
  if (row.basicInfoState === 'source_matched') {
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng) || !Number.isFinite(row.distanceMeters)) {
      throw new Error(`Source-matched row lacks durable basics: ${row.googlePlaceId}`);
    }
    if (!Array.isArray(row.sources) || row.sources.length !== 1 || row.sources[0] === 'Google Place ID') {
      throw new Error(`Source-matched row lacks independent source: ${row.googlePlaceId}`);
    }
  }
}

if (stats.catalogTotal !== 2804) throw new Error('Runtime stats lost the full frozen catalog count');
if (stats.inventoryTotal !== rows.length || stats.uniquePlaceIds !== rows.length) throw new Error('Published runtime stats mismatch');
if ((stats.canonicalRich + stats.sourceBasic) !== rows.length) throw new Error('Published state counts mismatch');
if (stats.placeIdOnly !== 0) throw new Error('Public runtime must not report published ID-only rows');
if (stats.unpublishedPlaceIdOnly !== 2804 - rows.length) throw new Error('Held ID-only count does not reconcile with catalog');
if (stats.catalogPlaceIdOnly !== stats.unpublishedPlaceIdOnly) throw new Error('Catalog/public ID-only counters diverged');
if (rows.length < 3) throw new Error('Published recommendation runtime has fewer than 3 rows');

console.log(JSON.stringify({ status: 'pass', ...stats }));
