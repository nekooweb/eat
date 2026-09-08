#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(DATA, 'osm_independent_dish_source_candidates.json');
const SHARDS = Math.max(1, Math.min(32, Number(process.argv[3] || 8)));
const MAX_DISTANCE_M = 60;
const GRID_DEG = 0.0008;
const EARTH_RADIUS_M = 6371000;

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
}

function loadRuntime() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, 'google_inventory_runtime.js'), 'utf8'), sandbox, { filename: 'google_inventory_runtime.js' });
  return sandbox.window;
}

function loadOsmRows() {
  const sandbox = { window: { RESTAURANTS: [] }, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, 'area1_osm.js'), 'utf8'), sandbox, { filename: 'area1_osm.js' });
  return sandbox.window.RESTAURANTS || [];
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function excludedIndependentHost(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  if (!h) return true;
  if (/openstreetmap\.org$|hotpepper\.jp$|tabelog\.com$/.test(h)) return true;
  if (/(^|\.)google\./.test(h) || /googleusercontent\.com$/.test(h)) return true;
  if (/facebook\.com$|instagram\.com$|x\.com$|twitter\.com$|youtube\.com$|tiktok\.com$/.test(h)) return true;
  if (/gnavi\.co\.jp$|retty\.me$|tripadvisor\.[a-z.]+$|yelp\.[a-z.]+$|foursquare\.com$/.test(h)) return true;
  if (/loco\.yahoo\.co\.jp$|paypaygourmet\.yahoo\.co\.jp$|autoreserve\.com$|ekiten\.jp$/.test(h)) return true;
  if (/restaurant\.ikyu\.com$|bar-navi\.suntory\.co\.jp$/.test(h)) return true;
  return false;
}

function independentUrls(values) {
  const input = Array.isArray(values) ? values : [values];
  const out = [];
  const seen = new Set();
  for (const value of input) {
    const url = safeUrl(value);
    if (!url || excludedIndependentHost(url.hostname)) continue;
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function normalizeName(value) {
  return clean(value).normalize('NFKC').toLowerCase()
    .replace(/株式会社|有限会社|合同会社/g, '')
    .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆!！?？.,，。:：/\\]+/g, '');
}

function nameSimilarity(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) {
    const short = Math.min(x.length, y.length);
    const long = Math.max(x.length, y.length);
    if (short >= 4) return Math.max(0.86, short / long);
  }
  function bigrams(text) {
    if (text.length < 2) return [text];
    const out = [];
    for (let i = 0; i < text.length - 1; i += 1) out.push(text.slice(i, i + 2));
    return out;
  }
  const left = bigrams(x);
  const right = bigrams(y);
  const counts = new Map();
  for (const token of left) counts.set(token, (counts.get(token) || 0) + 1);
  let overlap = 0;
  for (const token of right) {
    const count = counts.get(token) || 0;
    if (!count) continue;
    overlap += 1;
    counts.set(token, count - 1);
  }
  return (2 * overlap) / (left.length + right.length);
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function haversine(lat1, lng1, lat2, lng2) {
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dlat = (lat2 - lat1) * Math.PI / 180;
  const dlng = (lng2 - lng1) * Math.PI / 180;
  const value = Math.sin(dlat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

function gridKey(lat, lng) {
  return `${Math.floor(Number(lat) / GRID_DEG)}:${Math.floor(Number(lng) / GRID_DEG)}`;
}

function nearbyKeys(lat, lng) {
  const y = Math.floor(Number(lat) / GRID_DEG);
  const x = Math.floor(Number(lng) / GRID_DEG);
  const out = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) out.push(`${y + dy}:${x + dx}`);
  }
  return out;
}

const queueDoc = readJson('google_inventory_detail_queue.json');
const runtimeWindow = loadRuntime();
const runtimeRows = Array.isArray(runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS)
  ? runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS : [];
const runtimeStats = runtimeWindow.GOOGLE_INVENTORY_STATS || {};
const osmRows = loadOsmRows();

if (queueDoc.summary?.catalogTotal !== 2804 || queueDoc.summary?.publicRuntimeTotal !== 1415) {
  throw new Error('OSM source plan requires frozen 2,804 / public 1,415 queue baseline');
}
if (runtimeStats.catalogTotal !== 2804 || runtimeRows.length !== 1415) {
  throw new Error('OSM source plan requires frozen 2,804 / public 1,415 runtime baseline');
}

const runtimeById = new Map(runtimeRows.map((row) => [row.googlePlaceId, row]));
const targetRows = (queueDoc.rows || []).filter((row) => row.nextAction === 'find_independent_dish_source');
const spatial = new Map();
let osmWebsiteRows = 0;
let osmWebsiteValues = 0;
let excludedWebsiteValues = 0;

for (const row of osmRows) {
  if (!Number.isFinite(row?.lat) || !Number.isFinite(row?.lng) || !clean(row?.name)) continue;
  const raw = Array.isArray(row.sourceWebsites) ? row.sourceWebsites : [];
  const urls = independentUrls(raw);
  excludedWebsiteValues += raw.length - urls.length;
  if (!urls.length) continue;
  osmWebsiteRows += 1;
  osmWebsiteValues += urls.length;
  const key = gridKey(row.lat, row.lng);
  if (!spatial.has(key)) spatial.set(key, []);
  spatial.get(key).push({ row, urls });
}

const proposals = [];
let targetsWithoutCoordinates = 0;
let targetsWithNearbyWebsiteRows = 0;
let rejectedName = 0;
let rejectedWeak = 0;
let rejectedAmbiguous = 0;

for (const target of targetRows) {
  const runtime = runtimeById.get(target.googlePlaceId);
  if (!runtime || !Number.isFinite(runtime.lat) || !Number.isFinite(runtime.lng)) {
    targetsWithoutCoordinates += 1;
    continue;
  }
  const candidates = [];
  for (const key of nearbyKeys(runtime.lat, runtime.lng)) {
    for (const entry of spatial.get(key) || []) {
      const distance = haversine(runtime.lat, runtime.lng, entry.row.lat, entry.row.lng);
      if (distance > MAX_DISTANCE_M) continue;
      const similarity = nameSimilarity(runtime.name, entry.row.name);
      const distanceScore = Math.max(0, 1 - distance / MAX_DISTANCE_M);
      const score = similarity * 0.86 + distanceScore * 0.14;
      candidates.push({ ...entry, distance, similarity, score });
    }
  }
  if (!candidates.length) continue;
  targetsWithNearbyWebsiteRows += 1;
  candidates.sort((a, b) => b.score - a.score || a.distance - b.distance);
  const best = candidates[0];
  const second = candidates[1] || null;
  const margin = best.score - Number(second?.score || 0);

  if (best.similarity < 0.88) {
    rejectedName += 1;
    continue;
  }
  const strong = (
    (best.similarity >= 0.98 && best.distance <= 50)
    || (best.similarity >= 0.94 && best.distance <= 25)
    || (best.similarity >= 0.90 && best.distance <= 12)
  );
  if (!strong || best.score < 0.82) {
    rejectedWeak += 1;
    continue;
  }
  if (second && margin < 0.075 && !(best.similarity >= 0.99 && best.distance <= 10)) {
    rejectedAmbiguous += 1;
    continue;
  }

  const highConfidence = (
    (best.similarity >= 0.99 && best.distance <= 25)
    || (best.similarity >= 0.96 && best.distance <= 12)
  ) && (!second || margin >= 0.08 || (best.similarity >= 0.995 && best.distance <= 8));

  proposals.push({
    googlePlaceId: target.googlePlaceId,
    name: target.name,
    currentAction: target.nextAction,
    currentSourceUrlCount: Number(target.sourceUrlCount || 0),
    candidateName: best.row.name,
    candidateProvider: 'OpenStreetMap',
    candidateProviderId: best.row.sourceId || best.row.id || null,
    candidateDistanceMeters: Number(best.distance.toFixed(1)),
    nameSimilarity: Number(best.similarity.toFixed(3)),
    candidateMargin: Number(margin.toFixed(4)),
    proposalScore: Number(best.score.toFixed(4)),
    pageUrl: best.urls[0],
    candidateUrls: best.urls.slice(0, 4),
    candidateAddress: clean(best.row.address) || null,
    proposalState: highConfidence
      ? 'review_high_confidence_osm_website_candidate'
      : 'review_osm_website_candidate',
    confidenceSignals: [
      'retained_osm_poi_has_public_website_tag',
      'current_public_identity_has_independent_name_and_coordinates',
      'strong_normalized_name_agreement',
      'osm_poi_within_bounded_coordinate_distance',
      'best_candidate_margin_checked'
    ],
    shard: fnv1a(target.googlePlaceId) % SHARDS,
    reviewRequiredBeforeBinding: true,
    mayWriteDishEvidenceBeforeIdentityReview: false
  });
}

// Prevent one OSM native POI from being proposed to multiple frozen Place IDs.
const uniqueNative = new Map();
const outputRows = [];
for (const proposal of proposals.sort((a, b) => b.proposalScore - a.proposalScore || a.candidateDistanceMeters - b.candidateDistanceMeters)) {
  const native = proposal.candidateProviderId || `${proposal.candidateName}|${proposal.pageUrl}`;
  if (uniqueNative.has(native)) {
    rejectedAmbiguous += 1;
    continue;
  }
  uniqueNative.set(native, proposal.googlePlaceId);
  outputRows.push(proposal);
}
outputRows.sort((a, b) =>
  Number(b.proposalState === 'review_high_confidence_osm_website_candidate') - Number(a.proposalState === 'review_high_confidence_osm_website_candidate')
  || b.proposalScore - a.proposalScore
  || a.candidateDistanceMeters - b.candidateDistanceMeters
  || a.googlePlaceId.localeCompare(b.googlePlaceId)
);

const highConfidenceRows = outputRows.filter((row) => row.proposalState === 'review_high_confidence_osm_website_candidate').length;
const shardCounts = Array.from({ length: SHARDS }, (_, shard) => ({
  shard,
  total: outputRows.filter((row) => row.shard === shard).length,
  highConfidence: outputRows.filter((row) => row.shard === shard && row.proposalState === 'review_high_confidence_osm_website_candidate').length
}));

const summary = {
  schemaVersion: 1,
  catalogTotal: 2804,
  publicRuntimeTotal: 1415,
  currentIndependentDishSourceGap: targetRows.length,
  osmRows: osmRows.length,
  osmRowsWithIndependentWebsites: osmWebsiteRows,
  osmIndependentWebsiteValues: osmWebsiteValues,
  excludedWebsiteValues,
  targetsWithoutCoordinates,
  targetsWithNearbyWebsiteRows,
  proposalRows: outputRows.length,
  highConfidenceProposalRows: highConfidenceRows,
  proposalCoverageOfIndependentGapPct: targetRows.length ? Number((outputRows.length * 100 / targetRows.length).toFixed(1)) : 0,
  highConfidenceCoveragePct: targetRows.length ? Number((highConfidenceRows * 100 / targetRows.length).toFixed(1)) : 0,
  rejectedName,
  rejectedWeak,
  rejectedAmbiguous,
  shards: SHARDS,
  shardCounts
};

const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  policy: {
    proposalOnly: true,
    source: 'retained OpenStreetMap Area1 POI website/contact:website tags',
    networkRequests: 0,
    paidGoogleDataApiCalls: 0,
    identityBindingChanges: 0,
    googleDisplayPayloadUsed: false,
    currentQueueRestriction: 'find_independent_dish_source only',
    osmGoogleStatusMustRemainPending: true,
    maximumCandidateDistanceMeters: MAX_DISTANCE_M,
    strongNameAgreementRequired: true,
    ambiguityMarginRequired: true,
    independentHttpUrlRequired: true,
    socialUrlsExcluded: true,
    thirdPartyAggregatorUrlsExcluded: true,
    proximityOnlyBindingAllowed: false,
    dishEvidencePromotionBeforeSourceReviewAllowed: false,
    sourcePageReviewRequired: true
  },
  summary,
  rows: outputRows
};

fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary));
