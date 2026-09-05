#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const IMAGE = path.join(ROOT, 'image');
const VOICE = path.join(ROOT, 'voice');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const fail = (message) => {
  console.error(`AUDIT FAIL: ${message}`);
  process.exitCode = 1;
};

const enrichmentFiles = fs.readdirSync(DATA)
  .filter((filename) => /^source_enrichment(?:_[a-z0-9-]+)?\.js$/i.test(filename))
  .sort();
const mascotFiles = fs.existsSync(IMAGE)
  ? fs.readdirSync(IMAGE).filter((filename) => /\.webp$/i.test(filename)).sort()
  : [];
const voiceFiles = fs.existsSync(VOICE)
  ? fs.readdirSync(VOICE).filter((filename) => /\.mp3$/i.test(filename)).sort()
  : [];

const index = read('index.html');
const app = read('app.js');
const effects = read('effects.js');
const productionSource = read('data/production_area1.js');

if (!/leaflet@1\.9\.4/i.test(index)) fail('Leaflet 1.9.4 is not loaded by the public page');
if (!/overview-map/.test(app)) fail('three-result overview map is missing');
if (!/store-map-/.test(app)) fail('Leaflet per-store fallback is missing');
if (!/google-store-map/.test(app)) fail('Google per-store embed rendering is missing');
if (!/www\.google\.com\/maps\/embed\/v1\/place/.test(app)) fail('Google Maps Embed place endpoint is missing');
if (!/google-maps-embed-key/.test(index)) fail('Google Maps Embed key placeholder is missing');
if (/<iframe\b/i.test(index)) fail('static iframe markup should not be present in index.html');
if (/<iframe\b/i.test(app) && !/referrerpolicy="no-referrer-when-downgrade"/.test(app)) {
  fail('Google Maps iframe must carry the required referrer policy');
}
if (!/renderComparison/.test(app)) fail('three-store comparison table is missing');
if (/area1_google(?:_places)?\.(?:js|json)/i.test(index)) fail('legacy Google discovery payload is public');
if (/google_entities(?:\.generated)?\.js/i.test(index)) fail('maintenance overlays are public runtime dependencies');
if (!/data\/production_area1\.js/.test(index)) fail('canonical production dataset is not loaded');

const requiredEffectAssets = [
  'effects.js',
  'effects.css'
];
for (const relativePath of requiredEffectAssets) {
  if (!fs.existsSync(path.join(ROOT, relativePath))) fail(`missing public effect asset: ${relativePath}`);
}
if (!voiceFiles.length) fail('no MP3 voice assets found in voice/');
for (const filename of voiceFiles) {
  const expectedPath = `./voice/${filename}`;
  if (!effects.includes(expectedPath)) fail(`voice MP3 is not configured in effects.js: ${filename}`);
}
if (!mascotFiles.length) fail('no mascot WebP assets found in image/');
for (const filename of mascotFiles) {
  const expectedPath = `./image/${filename}`;
  if (!effects.includes(expectedPath)) fail(`mascot WebP is not configured in effects.js: ${filename}`);
}
if (!/effects\.css/.test(index)) fail('effect stylesheet is not loaded');
if (!/effects\.js/.test(index)) fail('effect runtime is not loaded');
if (!/generate-mascot/.test(index)) fail('generate-button mascot element is not wired into the page');
if (!/MAX_VOICE_MS\s*=\s*2000/.test(effects)) fail('voice playback cap must remain 2000 ms');
if (!/audio\.volume\s*=\s*0\.45/.test(effects)) fail('voice playback volume must remain 45%');
if (!/lastMascotSource/.test(effects) || !/lastMascotPlacement/.test(effects)) {
  fail('mascot character and placement should avoid immediate repeats');
}

const scriptSources = [...index.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((match) => match[1]);
const localRuntimeScripts = scriptSources.filter((source) => source.startsWith('./'));
if (localRuntimeScripts.length !== 3
  || !localRuntimeScripts.some((source) => source.includes('production_area1.js'))
  || !localRuntimeScripts.some((source) => source.includes('app.js'))
  || !localRuntimeScripts.some((source) => source.includes('effects.js'))) {
  fail('public local runtime should load canonical production data + app.js + effects.js');
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

const enrichmentSandbox = { window: { RESTAURANTS: [] } };
vm.createContext(enrichmentSandbox);
for (const filename of enrichmentFiles) {
  vm.runInContext(read(`data/${filename}`), enrichmentSandbox, { filename });
}
const enrichmentRows = enrichmentSandbox.window.RESTAURANTS || [];
const enrichmentKeys = new Set();
const enrichmentIds = new Set();
for (const row of enrichmentRows) {
  if (!row.id) fail(`source enrichment lacks maintenance id: ${row.name || row.googlePlaceId}`);
  if (enrichmentIds.has(row.id)) fail(`duplicate enrichment maintenance id: ${row.id}`);
  enrichmentIds.add(row.id);
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
    if (!ref.checkedAt || !/^\d{4}-\d{2}-\d{2}$/.test(ref.checkedAt)) {
      fail(`source reference lacks ISO check date: ${row.id || row.name}`);
    }
    if (!Array.isArray(ref.fields) || !ref.fields.length) {
      fail(`source reference has no field provenance: ${row.id || row.name}`);
    }
  }
  if (row.suppressFields && !Array.isArray(row.suppressFields)) {
    fail(`suppressFields must be an array: ${row.id || row.name}`);
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
  if (Object.hasOwn(row, 'sourceRefs') || Object.hasOwn(row, 'sourceOnly') || Object.hasOwn(row, 'suppressFields')) {
    fail(`maintenance provenance leaked into public canonical row: ${row.name}`);
  }
}

const sourceBackedRows = (rows || []).filter((row) =>
  row.sources?.includes('Tabelog') || row.sources?.includes('official'));
if (enrichmentRows.length && !sourceBackedRows.length) {
  fail('source enrichment exists but no source-backed row reaches canonical production');
}
if (stats?.sourceBacked !== sourceBackedRows.length) {
  fail(`source-backed statistic mismatch: stats=${stats?.sourceBacked}, actual=${sourceBackedRows.length}`);
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
    enrichmentShards: enrichmentFiles.length,
    enrichmentRecords: enrichmentRows.length,
    awards: stats.awards,
    resultViews: ['overview-map', 'google-store-maps-with-leaflet-fallback', 'comparison-table'],
    uiFeedback: [
      `${voiceFiles.length}-voice-random-pool-45pct-max-2s`,
      `${mascotFiles.length}-mascot-random-pool`,
      'nonrepeating-random-position'
    ]
  }));
}
