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
const enrichmentSource = read('data/source_enrichment.js');

if (!/leaflet@1\.9\.4/i.test(index)) fail('Leaflet 1.9.4 is not loaded by the public page');
if (!/overview-map/.test(app)) fail('three-result overview map is missing');
if (!/store-map-/.test(app)) fail('per-store result maps are missing');
if (!/renderComparison/.test(app)) fail('three-store comparison table is missing');
if (/<iframe\b/i.test(index + app)) fail('iframe map implementation should not be used');
if (/area1_google(?:_places)?\.(?:js|json)/i.test(index)) fail('legacy Google discovery payload is public');
if (/google_entities(?:\.generated)?\.js/i.test(index)) fail('maintenance overlays are public runtime dependencies');
if (!/data\/production_area1\.js/.test(index)) fail('canonical production dataset is not loaded');

const scriptSources = [...index.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((match) => match[1]);
const localRuntimeScripts = scriptSources.filter((source) => source.startsWith('./'));
if (localRuntimeScripts.length !== 2
  || !localRuntimeScripts.some((source) => source.includes('production_area1.js'))
  || !localRuntimeScripts.some((source) => source.includes('app.js'))) {
  fail('public local runtime should load exactly canonical production data + app.js');
}

if (/data-filter-toggle|filterEnabled/.test(index + app)) fail('redundant filter enable/disable state reappeared');
if (/身份已核验/.test(app)) fail('generic verification badge should not appear on every result');
if (/googleBusinessStatus|googlePrimaryType|googleDisplayName|googleTypes/.test(app)) {
  fail('Google Places response-content runtime logic reappeared');
}
if (!/translate="no">Google Maps</.test(index)) fail('Google Maps text attribution is missing');
if (!/OpenStreetMap contributors/.test(index)) fail('OpenStreetMap attribution is missing');

const forbiddenGoogleFields = [
  'googleMapsUrl',
  'googleDisplayName',
  'googleBusinessStatus',
  'googlePrimaryType',
  'googleTypes'
];

// Source-backed enrichment must remain enrichment-only: a record may carry the
// durable Place ID cross-reference, but it cannot declare itself Google-verified.
const enrichmentSandbox = { window: { RESTAURANTS: [] } };
vm.createContext(enrichmentSandbox);
vm.runInContext(enrichmentSource, enrichmentSandbox, { filename: 'source_enrichment.js' });
const enrichmentRows = enrichmentSandbox.window.RESTAURANTS || [];
const enrichmentKeys = new Set();
for (const row of enrichmentRows) {
  if (!row.sourceOnly) fail(`source enrichment is not sourceOnly: ${row.id || row.name}`);
  if (!row.googlePlaceId) fail(`source enrichment lacks Place ID key: ${row.id || row.name}`);
  if (row.googleStatus === 'verified') fail(`source enrichment may not self-verify: ${row.id || row.name}`);
  if (!['Tabelog', 'official'].includes(row.source)) fail(`unsupported enrichment source: ${row.source}`);
  if (!Array.isArray(row.sourceRefs) || !row.sourceRefs.length) {
    fail(`source enrichment lacks provenance: ${row.id || row.name}`);
  }
  const key = `${row.source}:${row.googlePlaceId}`;
  if (enrichmentKeys.has(key)) fail(`duplicate provider/Place-ID enrichment: ${key}`);
  enrichmentKeys.add(key);
  for (const ref of row.sourceRefs || []) {
    if (!ref.provider || !ref.url || !/^https:\/\//.test(ref.url)) {
      fail(`invalid source reference: ${row.id || row.name}`);
    }
    if (!Array.isArray(ref.fields) || !ref.fields.length) {
      fail(`source reference has no field provenance: ${row.id || row.name}`);
    }
  }
  for (const field of forbiddenGoogleFields) {
    if (Object.hasOwn(row, field)) fail(`persisted Google content field ${field} in enrichment: ${row.name}`);
  }
}

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(productionSource, sandbox, { filename: 'production_area1.js' });
const rows = sandbox.window.PRODUCTION_RESTAURANTS;
const stats = sandbox.window.PRODUCTION_STATS;

if (!Array.isArray(rows) || rows.length < 3) fail('canonical production pool has fewer than 3 rows');
if (!stats || stats.productionEntities !== rows?.length) fail('production statistics do not match dataset length');

const placeIds = new Set();
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
  if (Object.hasOwn(row, 'sourceRefs') || Object.hasOwn(row, 'sourceOnly')) {
    fail(`maintenance provenance leaked into public canonical row: ${row.name}`);
  }
}

if (enrichmentRows.length && !(rows || []).some((row) => row.sources?.includes('Tabelog') || row.sources?.includes('official'))) {
  fail('source enrichment exists but no source-backed row reaches canonical production');
}

if (!process.exitCode) {
  console.log(JSON.stringify({
    status: 'pass',
    productionEntities: rows.length,
    uniquePlaceIds: placeIds.size,
    cuisineKnown: stats.cuisineKnown,
    budgetKnown: stats.budgetKnown,
    scheduleKnown: stats.scheduleKnown,
    sourceBacked: stats.sourceBacked,
    enrichmentRecords: enrichmentRows.length,
    awards: stats.awards,
    resultViews: ['overview-map', 'store-maps', 'comparison-table']
  }));
}
