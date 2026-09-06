#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  LEGACY_IDENTITY_ADMISSION,
  CATALOG_IDENTITY_ADMISSION,
  loadCatalogAdmissionPayload
} from './catalog_identity.mjs';

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

const ALLOWED_ENRICHMENT_SOURCES = new Set(['Tabelog', 'official', 'Hot Pepper']);

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
const publicPoolSource = fs.existsSync(path.join(DATA, 'public_pool_area1.js'))
  ? read('data/public_pool_area1.js')
  : '';
const admissionPayload = loadCatalogAdmissionPayload(DATA);
const admittedIds = new Set((admissionPayload.rows || []).map((row) => row.googlePlaceId));
if (admittedIds.size !== (admissionPayload.rows || []).length) fail('catalog admission ledger contains duplicate IDs');

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
if (!/data\/public_pool_area1\.js/.test(index)) fail('public open restaurant pool is not loaded');

const requiredEffectAssets = ['effects.js', 'effects.css'];
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

// Public runtime is layered deliberately. Canonical production loads first;
// the separate public/open pool extends recommendation coverage without changing
// canonical identity admission. Provenance/provider facts and Hot Pepper rich
// metadata follow, then app/effects run. Maintenance source shards must never be
// loaded directly by index.html.
const scriptSources = [...index.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((match) => match[1]);
const localRuntimeScripts = scriptSources.filter((source) => source.startsWith('./'));
const runtimePath = (source) => source.split('?', 1)[0];
const runtimePaths = localRuntimeScripts.map(runtimePath);
const expectedRuntimePaths = [
  './data/production_area1.js',
  './data/public_pool_area1.js',
  './data/source_provenance.js',
  './data/source_facts.js',
  './data/hotpepper_rich_metadata.js',
  './app.js',
  './effects.js'
];
if (runtimePaths.length !== expectedRuntimePaths.length
  || runtimePaths.some((source, index) => source !== expectedRuntimePaths[index])) {
  fail(`public local runtime order mismatch: expected ${expectedRuntimePaths.join(' -> ')}, got ${runtimePaths.join(' -> ')}`);
}
if (runtimePaths.some((source) => /source_enrichment|source_resolution|hotpepper_bindings|google_entities/i.test(source))) {
  fail('maintenance data shard leaked into public runtime dependencies');
}

if (/data-filter-toggle|filterEnabled/.test(index + app)) fail('redundant filter enable/disable state reappeared');
if (/身份已核验/.test(app)) fail('generic verification badge should not appear on every result');
if (/googleBusinessStatus|googlePrimaryType|googleDisplayName|googleTypes/.test(app)) {
  fail('Google Places response-content runtime logic reappeared');
}
if (!/translate="no">Google Maps</.test(index)) fail('Google Maps text attribution is missing');
if (!/OpenStreetMap contributors/.test(index)) fail('OpenStreetMap attribution is missing');
if (!/Overture Maps/.test(index)) fail('Overture Maps attribution is missing');
if (!/参考菜品/.test(index + app)) fail('public dish hints must be explicitly labeled as reference dishes');

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
  if (!ALLOWED_ENRICHMENT_SOURCES.has(row.source)) fail(`unsupported enrichment source: ${row.source}`);
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

if (publicPoolSource) {
  const publicSandbox = { window: {} };
  vm.createContext(publicSandbox);
  vm.runInContext(publicPoolSource, publicSandbox, { filename: 'public_pool_area1.js' });
  const publicRows = publicSandbox.window.PUBLIC_OPEN_RESTAURANTS;
  const publicStats = publicSandbox.window.PUBLIC_POOL_STATS;
  if (!Array.isArray(publicRows)) fail('public open restaurant pool is not an array');
  if (!publicStats || publicStats.publicRows !== publicRows?.length) fail('public open pool statistics do not match dataset length');
  if ((rows?.length || 0) + (publicRows?.length || 0) < 2000) fail('combined public restaurant pool must contain at least 2000 rows');
  const publicKeys = new Set();
  for (const row of publicRows || []) {
    if (row.identityAdmission !== 'open_public_catalog') fail(`public row has invalid admission tier: ${row.name || row.id}`);
    if (!row.identityKey) fail(`public row lacks identity key: ${row.name || row.id}`);
    if (publicKeys.has(row.identityKey)) fail(`duplicate public identity key: ${row.identityKey}`);
    publicKeys.add(row.identityKey);
    if (!row.name || !Number.isFinite(row.lat) || !Number.isFinite(row.lng)) fail(`public row lacks display identity: ${row.identityKey}`);
    if (!Number.isFinite(row.distanceMeters) || row.distanceMeters > 1200) fail(`public row outside Area1 radius: ${row.identityKey}`);
    if (!Array.isArray(row.dishHints) || !row.dishHints.length) fail(`public row lacks dish reference hint: ${row.identityKey}`);
    if (row.featuredDishConfidence !== 'reference_hint') fail(`public dish hint is not marked as reference-only: ${row.identityKey}`);
    for (const field of forbiddenGoogleFields) {
      if (Object.hasOwn(row, field)) fail(`persisted Google content field ${field} in public pool: ${row.name}`);
    }
  }
}

const placeIds = new Set();
let legacyAdmissionRows = 0;
let catalogAdmissionRows = 0;
for (const row of rows || []) {
  if (!row.googlePlaceId) fail(`missing Google Place ID: ${row.id || row.name}`);

  if (row.identityAdmission === CATALOG_IDENTITY_ADMISSION) {
    catalogAdmissionRows += 1;
    if (!admittedIds.has(row.googlePlaceId)) fail(`catalog-reviewed production row is absent from admission ledger: ${row.name}`);
    if (Object.hasOwn(row, 'googleStatus')) fail(`catalog-reviewed production row must not synthesize googleStatus: ${row.name}`);
  } else if (row.identityAdmission === LEGACY_IDENTITY_ADMISSION) {
    legacyAdmissionRows += 1;
    if (row.googleStatus !== 'verified') fail(`legacy production row is not independently verified: ${row.name}`);
  } else {
    fail(`unknown production identity admission path: ${row.name}`);
  }

  if (placeIds.has(row.googlePlaceId)) fail(`duplicate Place ID: ${row.googlePlaceId}`);
  placeIds.add(row.googlePlaceId);
  if (!Number.isFinite(row.distanceMeters) || row.distanceMeters > 1200) fail(`production row outside 1.2km boundary: ${row.name}`);
  if (!row.name || !row.cuisine) fail(`production row lacks basic display fields: ${row.googlePlaceId}`);
  for (const field of forbiddenGoogleFields) {
    if (Object.hasOwn(row, field)) fail(`persisted Google content field ${field} in production: ${row.name}`);
  }
}

if (catalogAdmissionRows !== admittedIds.size) {
  fail(`catalog admission count mismatch: production=${catalogAdmissionRows} ledger=${admittedIds.size}`);
}

console.log(JSON.stringify({
  status: process.exitCode ? 'fail' : 'pass',
  productionEntities: rows?.length || 0,
  uniquePlaceIds: placeIds.size,
  legacyAdmissionRows,
  catalogAdmissionRows,
  cuisineKnown: stats?.cuisineKnown || 0,
  budgetKnown: stats?.budgetKnown || 0,
  scheduleKnown: stats?.scheduleKnown || 0,
  sourceBacked: stats?.sourceBacked || 0,
  enrichmentShards: enrichmentFiles.length,
  enrichmentRecords: enrichmentRows.length,
  publicRuntimeLayers: runtimePaths,
  awards: stats?.awards || 0,
  resultViews: ['overview-map', 'google-store-maps-with-leaflet-fallback', 'comparison-table'],
  uiFeedback: ['5-voice-random-pool-45pct-max-2s', '3-mascot-random-pool', 'nonrepeating-random-position']
}));
