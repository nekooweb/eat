#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { isExcludedIndependentHost } from './independent_source_host_policy.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');

const SHARD_INDEX = Number(process.argv[2] ?? process.env.DISH_COLLECTOR_SHARD_INDEX ?? 0);
const SHARD_COUNT = Number(process.argv[3] ?? process.env.DISH_COLLECTOR_SHARD_COUNT ?? 1);
const MANIFEST = process.argv[4] || '';

if (!Number.isInteger(SHARD_COUNT) || SHARD_COUNT < 1 || SHARD_COUNT > 32) {
  throw new Error(`Invalid shard count: ${SHARD_COUNT}`);
}
if (!Number.isInteger(SHARD_INDEX) || SHARD_INDEX < 0 || SHARD_INDEX >= SHARD_COUNT) {
  throw new Error(`Invalid shard index: ${SHARD_INDEX}/${SHARD_COUNT}`);
}

function loadWindowFile(filename) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
  return sandbox.window;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const ch of String(value || '')) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hostOf(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

const runtimeWindow = loadWindowFile('google_inventory_runtime.js');
const rows = Array.isArray(runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS)
  ? runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS
  : [];
const stats = runtimeWindow.GOOGLE_INVENTORY_STATS || {};
if (stats.catalogTotal !== 2804 || rows.length + Number(stats.unpublishedPlaceIdOnly || 0) !== 2804) {
  throw new Error('Frozen 2,804 runtime contract failed before sharding');
}
if (rows.some((row) => !row.googlePlaceId || !String(row.name || '').trim())) {
  throw new Error('Dish shard input contains unnamed runtime rows');
}

const provenanceWindow = fs.existsSync(path.join(DATA, 'source_provenance.js'))
  ? loadWindowFile('source_provenance.js')
  : {};
const provenanceById = new Map((provenanceWindow.SOURCE_PROVENANCE?.rows || [])
  .map((row) => [row.googlePlaceId, row]));

function shardKey(row) {
  const hosts = new Set();
  // Runtime sourceWebsites may include shared discovery/directory providers such
  // as Hot Pepper or Tabelog. Using those as the shard key collapses hundreds
  // of unrelated restaurants into one runner. Only merchant-like hosts that
  // pass the centralized independent-source host policy are allowed to pin a
  // row to a host shard; excluded directories fall back to the Place ID hash.
  for (const raw of row.sourceWebsites || []) {
    const host = hostOf(raw);
    if (host && !isExcludedIndependentHost(host)) hosts.add(host);
  }
  // A provenance link explicitly reviewed as official is a stronger host pin
  // and is kept even when no runtime sourceWebsite is present.
  for (const link of provenanceById.get(row.googlePlaceId)?.sourceLinks || []) {
    if (String(link?.provider || '').toLowerCase() !== 'official') continue;
    const host = hostOf(link?.url);
    if (host) hosts.add(host);
  }
  const orderedHosts = [...hosts].sort();
  return orderedHosts.length ? `host:${orderedHosts[0]}` : `pid:${row.googlePlaceId}`;
}

const selectedRows = [];
const selectedIds = new Set();
let hostKeyRows = 0;
let placeIdKeyRows = 0;
for (const row of rows) {
  const key = shardKey(row);
  if (key.startsWith('host:')) hostKeyRows += 1;
  else placeIdKeyRows += 1;
  if (stableHash(key) % SHARD_COUNT !== SHARD_INDEX) continue;
  selectedRows.push(row);
  selectedIds.add(row.googlePlaceId);
}

const selectedSharePct = rows.length
  ? Number(((selectedRows.length / rows.length) * 100).toFixed(1))
  : 0;
const shardStats = {
  ...stats,
  inventoryTotal: selectedRows.length,
  publicRuntimeTotal: selectedRows.length,
  namedBasic: selectedRows.length,
  unpublishedPlaceIdOnly: 2804 - selectedRows.length,
  catalogPlaceIdOnly: 2804 - selectedRows.length,
  dishCollectorShardIndex: SHARD_INDEX,
  dishCollectorShardCount: SHARD_COUNT
};

fs.writeFileSync(
  path.join(DATA, 'google_inventory_runtime.js'),
  `// Ephemeral deterministic dish-collector shard ${SHARD_INDEX}/${SHARD_COUNT}. Identity fields are unchanged.\n` +
  `window.GOOGLE_INVENTORY_RESTAURANTS=${JSON.stringify(selectedRows)};\n` +
  `window.GOOGLE_INVENTORY_STATS=${JSON.stringify(shardStats)};\n`,
  'utf8'
);

const queuePath = path.join(DATA, 'google_inventory_detail_queue.json');
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const queueRowsBefore = Array.isArray(queue.rows) ? queue.rows : [];
const shardQueueRows = queueRowsBefore.filter((row) => selectedIds.has(row.googlePlaceId));
const shardQueue = {
  ...queue,
  policy: {
    ...(queue.policy || {}),
    ephemeralDishCollectorShard: true,
    identityMutationAllowed: false,
    paidGoogleDataApiCalls: 0
  },
  summary: {
    ...(queue.summary || {}),
    publicRuntimeTotal: selectedRows.length,
    dishCollectorShardIndex: SHARD_INDEX,
    dishCollectorShardCount: SHARD_COUNT,
    shardRows: shardQueueRows.length
  },
  rows: shardQueueRows
};
fs.writeFileSync(queuePath, JSON.stringify(shardQueue, null, 2) + '\n', 'utf8');

const manifest = {
  schemaVersion: 1,
  shardIndex: SHARD_INDEX,
  shardCount: SHARD_COUNT,
  catalogTotal: 2804,
  originalPublicRuntimeTotal: rows.length,
  selectedRuntimeRows: selectedRows.length,
  selectedSharePct,
  originalQueueRows: queueRowsBefore.length,
  selectedQueueRows: shardQueueRows.length,
  hostKeyRows,
  placeIdKeyRows,
  selectedIds: [...selectedIds].sort(),
  policy: {
    deterministic: true,
    shardKey: 'first sorted merchant-like source/official hostname, excluding centralized directory hosts; else frozen Place ID',
    centralizedDirectoryHostsExcludedFromShardPinning: true,
    sourceRowsMutated: false,
    identityFieldsMutated: false,
    paidGoogleDataApiCalls: 0
  }
};

if (MANIFEST) {
  fs.mkdirSync(path.dirname(path.resolve(MANIFEST)), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}
console.log(JSON.stringify({
  shardIndex: SHARD_INDEX,
  shardCount: SHARD_COUNT,
  selectedRuntimeRows: selectedRows.length,
  selectedSharePct,
  selectedQueueRows: shardQueueRows.length,
  originalPublicRuntimeTotal: rows.length,
  hostKeyRows,
  placeIdKeyRows
}));
