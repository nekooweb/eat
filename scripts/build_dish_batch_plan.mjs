#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const INPUT = path.join(DATA, 'google_inventory_detail_queue.json');
const OUTPUT = process.argv[2] || path.join(DATA, 'dish_batch_plan.json');
const requestedShards = Number(process.argv[3] || process.env.DISH_BATCH_SHARDS || 8);
const SHARDS = Number.isInteger(requestedShards) ? Math.max(1, Math.min(32, requestedShards)) : 8;

if (!fs.existsSync(INPUT)) throw new Error('Missing google_inventory_detail_queue.json; build the detail queue first');
const queue = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
if (queue.summary?.catalogTotal !== 2804 || !queue.summary?.runtimeBaselineComplete) {
  throw new Error('Bulk dish plan requires the frozen 2,804 Place-ID baseline');
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value || '')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function laneFor(action) {
  if (action === 'collect_strict_recommended_dishes') return 'official_crawl';
  if (action === 'extract_retained_dish_source') return 'retained_source_mining';
  if (action === 'find_independent_dish_source') return 'independent_source_discovery';
  if (action === 'collect_source_backed_featured_dishes') return 'official_or_retained_featured';
  return null;
}

const rows = [];
for (const row of queue.rows || []) {
  const lane = laneFor(row.nextAction);
  if (!lane) continue;
  rows.push({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    lane,
    nextAction: row.nextAction,
    shard: fnv1a(row.googlePlaceId) % SHARDS,
    priorityScore: row.priorityScore,
    cuisine: row.cuisine || null,
    crawlableOfficialUrlCount: Number(row.crawlableOfficialUrlCount || 0),
    retainedThirdPartyUrlCount: Number(row.retainedThirdPartyUrlCount || 0),
    sourceUrlCount: Number(row.sourceUrlCount || 0),
    recommendedDishesKnown: Number(row.recommendedDishesKnown || 0),
    featuredDishesKnown: Number(row.featuredDishesKnown || 0)
  });
}

rows.sort((a, b) => a.shard - b.shard || b.priorityScore - a.priorityScore || a.googlePlaceId.localeCompare(b.googlePlaceId));
const laneCounts = {};
const shardCounts = Array.from({ length: SHARDS }, (_, shard) => ({ shard, total: 0, lanes: {} }));
for (const row of rows) {
  laneCounts[row.lane] = (laneCounts[row.lane] || 0) + 1;
  const bucket = shardCounts[row.shard];
  bucket.total += 1;
  bucket.lanes[row.lane] = (bucket.lanes[row.lane] || 0) + 1;
}

const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  policy: {
    catalogIdentityKey: 'frozen Place ID only',
    catalogTotal: 2804,
    sourceLanguageMayBeJapanese: true,
    targetLanguage: 'zh-CN',
    paidGoogleDataApiCalls: 0,
    deterministicSharding: 'FNV-1a(googlePlaceId) modulo shard count',
    workerContract: 'workers collect proposal/evidence only; central merge/resolver writes canonical truth',
    proximityOnlyIdentityBindingAllowed: false,
    recommendationRequiresExplicitRecommendationSemantics: true,
    ordinaryMenuDishBecomesFeaturedOnly: true
  },
  summary: {
    publicRuntimeTotal: Number(queue.summary?.publicRuntimeTotal || 0),
    recommendationGap: Number(queue.summary?.recommendationGap || 0),
    dishWorkRows: rows.length,
    shards: SHARDS,
    laneCounts,
    shardCounts
  },
  rows
};

fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(payload.summary));
