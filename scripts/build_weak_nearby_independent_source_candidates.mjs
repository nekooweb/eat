#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(DATA, 'weak_nearby_independent_source_candidates.json');
const MAX_DISTANCE_M = Math.max(8, Math.min(50, Number(process.env.WEAK_SOURCE_MAX_DISTANCE_M || 25)));
const AMBIGUITY_GAP_M = Math.max(3, Math.min(20, Number(process.env.WEAK_SOURCE_AMBIGUITY_GAP_M || 8)));
const GRID_DEG = 0.0015;
const EARTH_RADIUS_M = 6371000;
const BANNED_HOST = /(?:^|\.)(?:facebook\.com|instagram\.com|x\.com|twitter\.com|youtube\.com|tiktok\.com|tabelog\.com|hotpepper\.jp|google\.[a-z.]+|googleusercontent\.com|gnavi\.co\.jp|retty\.me|foursquare\.com|autoreserve\.com|ekiten\.jp)$/i;

function readJson(name) { return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')); }
function loadWindowFile(name) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, name), 'utf8'), sandbox, { filename: name });
  return sandbox.window;
}
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (BANNED_HOST.test(host)) return null;
    if (/tripadvisor\.|yelp\./i.test(host) || host === 'loco.yahoo.co.jp' || host === 'paypaygourmet.yahoo.co.jp' || host === 'restaurant.ikyu.com' || host === 'bar-navi.suntory.co.jp') return null;
    return url;
  } catch { return null; }
}
function flattenStrings(value) {
  if (value == null) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (typeof value === 'object') return Object.values(value).flatMap(flattenStrings);
  return [];
}
function independentUrls(value) {
  return [...new Set(flattenStrings(value).map(safeUrl).filter(Boolean).map((url) => url.toString()))];
}
function hostList(urls) { return [...new Set(urls.map((value) => new URL(value).hostname.toLowerCase().replace(/^www\./, '')))]; }
function normalizeName(value) {
  return clean(value).normalize('NFKC').toLowerCase().replace(/株式会社|有限会社|合同会社/g, '')
    .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆!！?？.,，。:：/\\]+/g, '');
}
function nameSimilarity(a, b) {
  const x = normalizeName(a), y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) {
    const short = Math.min(x.length, y.length), long = Math.max(x.length, y.length);
    if (short >= 4) return Math.max(0.84, short / long);
  }
  const grams = (text) => text.length < 2 ? [text] : Array.from({ length: text.length - 1 }, (_, i) => text.slice(i, i + 2));
  const left = grams(x), right = grams(y), counts = new Map();
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
function haversine(lat1, lng1, lat2, lng2) {
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dlat = (lat2 - lat1) * Math.PI / 180, dlng = (lng2 - lng1) * Math.PI / 180;
  const value = Math.sin(dlat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}
function gridKey(lat, lng) { return `${Math.floor(Number(lat) / GRID_DEG)}:${Math.floor(Number(lng) / GRID_DEG)}`; }
function nearbyGridKeys(lat, lng) {
  const y = Math.floor(Number(lat) / GRID_DEG), x = Math.floor(Number(lng) / GRID_DEG), out = [];
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) out.push(`${y + dy}:${x + dx}`);
  return out;
}

const queue = readJson('google_inventory_detail_queue.json');
const overture = readJson('overture_area1_candidates.json');
const standard = readJson('independent_dish_source_candidates.json');
const runtimeWindow = loadWindowFile('google_inventory_runtime.js');
const runtimeRows = Array.isArray(runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS) ? runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS : [];
const runtimeStats = runtimeWindow.GOOGLE_INVENTORY_STATS || {};
if (queue.summary?.catalogTotal !== 2804 || runtimeStats.catalogTotal !== 2804 || queue.summary?.publicRuntimeTotal !== runtimeRows.length || runtimeStats.inventoryTotal !== runtimeRows.length) {
  throw new Error('Weak source candidate builder requires current complete runtime/queue');
}
const runtimeById = new Map(runtimeRows.map((row) => [row.googlePlaceId, row]));
const targetRows = (queue.rows || []).filter((row) => row.nextAction === 'find_independent_dish_source');
const standardIds = new Set((standard.rows || []).map((row) => row.googlePlaceId));
const spatial = new Map();
let overtureWebsiteRows = 0;
for (const row of overture.rows || []) {
  if (!Number.isFinite(row?.lat) || !Number.isFinite(row?.lng) || !clean(row?.name)) continue;
  const urls = independentUrls(row.websites);
  if (!urls.length) continue;
  overtureWebsiteRows += 1;
  const key = gridKey(row.lat, row.lng);
  if (!spatial.has(key)) spatial.set(key, []);
  spatial.get(key).push({ row, urls });
}

const rows = [];
let standardProposalExcluded = 0;
let noCoordinate = 0;
let noNearbyWebsite = 0;
let ambiguousNearby = 0;
let tooFar = 0;
for (const target of targetRows) {
  if (standardIds.has(target.googlePlaceId)) {
    standardProposalExcluded += 1;
    continue;
  }
  const runtime = runtimeById.get(target.googlePlaceId);
  if (!Number.isFinite(runtime?.lat) || !Number.isFinite(runtime?.lng)) {
    noCoordinate += 1;
    continue;
  }
  const candidates = [];
  for (const key of nearbyGridKeys(runtime.lat, runtime.lng)) {
    for (const entry of spatial.get(key) || []) {
      const distance = haversine(runtime.lat, runtime.lng, entry.row.lat, entry.row.lng);
      if (distance > MAX_DISTANCE_M + AMBIGUITY_GAP_M) continue;
      candidates.push({ ...entry, distance, similarity: nameSimilarity(runtime.name, entry.row.name) });
    }
  }
  if (!candidates.length) {
    noNearbyWebsite += 1;
    continue;
  }
  candidates.sort((a, b) => a.distance - b.distance || b.similarity - a.similarity);
  const best = candidates[0];
  if (best.distance > MAX_DISTANCE_M) {
    tooFar += 1;
    continue;
  }
  const bestHosts = new Set(hostList(best.urls));
  const competing = candidates.slice(1).find((candidate) => {
    const hosts = hostList(candidate.urls);
    return candidate.distance - best.distance < AMBIGUITY_GAP_M && hosts.some((host) => !bestHosts.has(host));
  });
  if (competing) {
    ambiguousNearby += 1;
    continue;
  }
  rows.push({
    googlePlaceId: target.googlePlaceId,
    name: target.name,
    distanceMeters: target.distanceMeters ?? runtime.distanceMeters ?? null,
    currentAction: target.nextAction,
    currentSourceUrlCount: Number(target.sourceUrlCount || 0),
    pageUrl: best.urls[0] || null,
    menuUrls: [],
    candidateHosts: hostList(best.urls),
    checkedAt: clean(overture.checkedAt || overture.release) || null,
    candidateName: clean(best.row.name),
    candidateProvider: 'Overture Maps',
    candidateProviderId: clean(best.row.overtureId) || null,
    candidateDistanceMeters: Number(best.distance.toFixed(1)),
    nameSimilarity: Number(best.similarity.toFixed(3)),
    proposalScore: Number(Math.max(0, 1 - best.distance / MAX_DISTANCE_M).toFixed(4)),
    proposalState: 'review_overture_website_candidate',
    confidenceSignals: [
      'proximity_only_candidate_for_strict_page_review',
      'current_runtime_has_independent_coordinates',
      'retained_overture_row_has_independent_website',
      'candidate_not_used_for_binding_without_page_name_and_location_evidence'
    ],
    reviewRequiredBeforeBinding: true,
    mayWriteDishEvidenceBeforeIdentityReview: false
  });
}
rows.sort((a, b) => a.candidateDistanceMeters - b.candidateDistanceMeters || b.nameSimilarity - a.nameSimilarity || a.googlePlaceId.localeCompare(b.googlePlaceId));
const summary = {
  catalogTotal: 2804,
  publicRuntimeTotal: runtimeRows.length,
  currentIndependentDishSourceGap: targetRows.length,
  standardProposalRows: standardIds.size,
  standardProposalExcluded,
  overtureWebsiteRows,
  maximumCandidateDistanceMeters: MAX_DISTANCE_M,
  ambiguityGapMeters: AMBIGUITY_GAP_M,
  proposalRows: rows.length,
  noCoordinate,
  noNearbyWebsite,
  ambiguousNearby,
  tooFar,
  lowNameSimilarityRows: rows.filter((row) => row.nameSimilarity < 0.82).length,
  exactOrCompatibleNameRows: rows.filter((row) => row.nameSimilarity >= 0.82).length
};
const payload = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString().slice(0, 10),
  policy: {
    proposalOnly: true,
    candidateProvider: 'retained Overture Maps snapshot',
    networkRequests: 0,
    paidGoogleDataApiCalls: 0,
    identityBindingChanges: 0,
    proximityOnlyBindingAllowed: false,
    candidateNameCompatibilityRequiredForProposal: false,
    finalPageNameAndLocationReviewRequired: true,
    dishEvidencePromotionBeforeIdentityReviewAllowed: false,
    standardIndependentProposalRowsExcluded: true,
    multipleDifferentHostCandidatesWithinAmbiguityGapRejected: true
  },
  summary,
  rows
};
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary));
