#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_COOLDOWN_DAYS,
  findDishReviewCooldown,
  loadDishReviewCooldowns
} from './dish_review_cooldown.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const INPUT = path.join(DATA, 'google_inventory_detail_queue.json');
const OUTPUT = process.argv[2] || path.join(DATA, 'dish_batch_plan.json');
const REVIEW_ROOT = path.join(DATA, 'agent_reviews');
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

const reviewNow = process.env.DISH_REVIEW_NOW ? new Date(process.env.DISH_REVIEW_NOW) : new Date();
if (!Number.isFinite(reviewNow.getTime())) throw new Error('Invalid DISH_REVIEW_NOW');
const reviewCooldowns = fs.existsSync(REVIEW_ROOT)
  ? loadDishReviewCooldowns(REVIEW_ROOT, { now: reviewNow })
  : new Map();

const rows = [];
const deferredReviewCooldownRows = [];
for (const row of queue.rows || []) {
  const lane = laneFor(row.nextAction);
  if (!lane) continue;

  const cooldown = findDishReviewCooldown(reviewCooldowns, row.googlePlaceId, lane);
  if (cooldown) {
    deferredReviewCooldownRows.push({
      googlePlaceId: row.googlePlaceId,
      name: row.name,
      lane,
      nextAction: row.nextAction,
      terminalStatus: cooldown.terminalStatus,
      lastReviewedAt: cooldown.lastReviewedAt,
      retryAfter: cooldown.retryAfter,
      reviewFile: cooldown.reviewFile
    });
    continue;
  }

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
deferredReviewCooldownRows.sort((a, b) =>
  a.retryAfter.localeCompare(b.retryAfter) || a.lane.localeCompare(b.lane) || a.googlePlaceId.localeCompare(b.googlePlaceId));

const laneCounts = {};
const shardCounts = Array.from({ length: SHARDS }, (_, shard) => ({ shard, total: 0, lanes: {} }));
for (const row of rows) {
  laneCounts[row.lane] = (laneCounts[row.lane] || 0) + 1;
  const bucket = shardCounts[row.shard];
  bucket.total += 1;
  bucket.lanes[row.lane] = (bucket.lanes[row.lane] || 0) + 1;
}

const deferredByStatus = {};
const deferredByLane = {};
for (const row of deferredReviewCooldownRows) {
  deferredByStatus[row.terminalStatus] = (deferredByStatus[row.terminalStatus] || 0) + 1;
  deferredByLane[row.lane] = (deferredByLane[row.lane] || 0) + 1;
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
    ordinaryMenuDishBecomesFeaturedOnly: true,
    reviewCooldown: {
      purpose: 'recent terminal reviews are not immediately reassigned when the runtime field is still empty',
      acceptedEvidenceDays: DEFAULT_COOLDOWN_DAYS.accepted_evidence,
      candidateDays: DEFAULT_COOLDOWN_DAYS.candidate,
      noEvidenceDays: DEFAULT_COOLDOWN_DAYS.no_evidence,
      blockedDays: DEFAULT_COOLDOWN_DAYS.blocked,
      acceptedEvidenceDeferred: true,
      sourceChangeInvalidation: 'not yet automatic; rerun may be forced by changing review date/status or after retryAfter'
    }
  },
  summary: {
    publicRuntimeTotal: Number(queue.summary?.publicRuntimeTotal || 0),
    recommendationGap: Number(queue.summary?.recommendationGap || 0),
    rawDishWorkRows: rows.length + deferredReviewCooldownRows.length,
    dishWorkRows: rows.length,
    deferredRecentlyReviewedRows: deferredReviewCooldownRows.length,
    deferredByStatus,
    deferredByLane,
    shards: SHARDS,
    laneCounts,
    shardCounts
  },
  rows,
  deferredReviewCooldownRows
};

fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(payload.summary));