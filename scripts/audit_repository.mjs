#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const fail = (message) => {
  console.error(`AUDIT FAIL: ${message}`);
  process.exitCode = 1;
};

const index = read('index.html');
const app = read('app.js');
const productionSource = read('data/production_area1.js');

if (/leaflet/i.test(index)) fail('Leaflet is still referenced by the public page');
if (/<iframe\b/i.test(index + app)) fail('embedded result maps reappeared');
if (/area1_google(?:_places)?\.(?:js|json)/i.test(index)) fail('legacy Google discovery payload is public');
if (/google_entities(?:\.generated)?\.js/i.test(index)) fail('maintenance overlays are public runtime dependencies');
if (!/data\/production_area1\.js/.test(index)) fail('canonical production dataset is not loaded');
if ((index.match(/<script\b/gi) || []).length !== 2) fail('public page should load exactly production data + app.js');
if (/data-filter-toggle|filterEnabled/.test(index + app)) fail('redundant filter enable/disable state reappeared');
if (/身份已核验/.test(app)) fail('generic verification badge should not appear on every result');
if (/overview-map|renderCompare|embedUrl|googleBusinessStatus|googlePrimaryType/.test(app)) {
  fail('removed map/comparison/Google-content runtime logic is still present');
}
if (!/translate="no">Google Maps</.test(index)) fail('Google Maps text attribution is missing');
if (!/OpenStreetMap contributors/.test(index)) fail('OpenStreetMap attribution is missing');

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(productionSource, sandbox, { filename: 'production_area1.js' });
const rows = sandbox.window.PRODUCTION_RESTAURANTS;
const stats = sandbox.window.PRODUCTION_STATS;

if (!Array.isArray(rows) || rows.length < 3) fail('canonical production pool has fewer than 3 rows');
if (!stats || stats.productionEntities !== rows?.length) fail('production statistics do not match dataset length');

const placeIds = new Set();
const forbiddenGoogleFields = [
  'googleMapsUrl',
  'googleDisplayName',
  'googleBusinessStatus',
  'googlePrimaryType',
  'googleTypes'
];

for (const row of rows || []) {
  if (!row.googlePlaceId) fail(`missing Google Place ID: ${row.id || row.name}`);
  if (row.googleStatus !== 'verified') fail(`non-verified production row: ${row.name}`);
  if (!Number.isFinite(row.distanceMeters) || row.distanceMeters < 0 || row.distanceMeters > 1200) {
    fail(`invalid Area1 distance: ${row.name} -> ${row.distanceMeters}`);
  }
  if (placeIds.has(row.googlePlaceId)) fail(`duplicate Google Place ID: ${row.googlePlaceId}`);
  placeIds.add(row.googlePlaceId);
  for (const field of forbiddenGoogleFields) {
    if (Object.hasOwn(row, field)) fail(`persisted Google content field ${field}: ${row.name}`);
  }
}

if (!process.exitCode) {
  console.log(JSON.stringify({
    status: 'pass',
    productionEntities: rows.length,
    uniquePlaceIds: placeIds.size,
    cuisineKnown: stats.cuisineKnown,
    budgetKnown: stats.budgetKnown,
    awards: stats.awards
  }));
}
