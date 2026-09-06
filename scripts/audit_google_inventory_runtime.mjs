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
const ids = rows.map((row) => row.googlePlaceId);
const forbiddenKeys = new Set([
  'displayName', 'formattedAddress', 'googleName', 'googleAddress', 'googleLocation',
  'currentOpeningHours', 'nationalPhoneNumber', 'internationalPhoneNumber', 'websiteUri'
]);

if (rows.length !== 2804 || ids.length !== 2804 || new Set(ids).size !== 2804) {
  throw new Error('Runtime must contain exactly 2,804 unique Google Place IDs');
}
if (expected.length !== 2804 || expected.some((pid, index) => ids[index] !== pid)) {
  throw new Error('Runtime Place IDs/order must exactly match frozen inventory');
}

for (const row of rows) {
  if (!row.googlePlaceId || row.inventoryWithinRadius !== true) throw new Error('Missing frozen-inventory identity marker');
  if (!['canonical', 'source_matched', 'google_place_id_only'].includes(row.basicInfoState)) {
    throw new Error(`Unknown basicInfoState for ${row.googlePlaceId}`);
  }
  for (const key of forbiddenKeys) {
    if (key in row) throw new Error(`Persisted forbidden Google content key ${key}`);
  }
  if (Number.isFinite(row.distanceMeters) && (row.distanceMeters < 0 || row.distanceMeters > 1200)) {
    throw new Error(`Out-of-radius distance for ${row.googlePlaceId}`);
  }
  if (row.basicInfoState === 'source_matched') {
    if (!row.nameKnown || !row.name || !Number.isFinite(row.lat) || !Number.isFinite(row.lng) || !Number.isFinite(row.distanceMeters)) {
      throw new Error(`Source-matched row lacks durable basics: ${row.googlePlaceId}`);
    }
    if (!Array.isArray(row.sources) || row.sources.length !== 1 || row.sources[0] === 'Google Place ID') {
      throw new Error(`Source-matched row lacks independent source: ${row.googlePlaceId}`);
    }
  }
  if (row.basicInfoState === 'google_place_id_only') {
    if (row.nameKnown !== false || row.lat !== null || row.lng !== null || row.distanceMeters !== null) {
      throw new Error(`Place-ID-only row contains invented durable basics: ${row.googlePlaceId}`);
    }
  }
}

if (stats.inventoryTotal !== 2804 || stats.uniquePlaceIds !== 2804) throw new Error('Runtime stats mismatch');
if ((stats.canonicalRich + stats.sourceBasic + stats.placeIdOnly) !== 2804) throw new Error('Runtime state counts mismatch');

console.log(JSON.stringify({ status: 'pass', ...stats }));
