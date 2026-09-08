#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(DATA, 'independent_dish_source_candidates.json');
const SHARDS = Math.max(1, Math.min(32, Number(process.argv[3] || 8)));
const MAX_OVERTURE_DISTANCE_M = 120;
const GRID_DEG = 0.0015;
const EARTH_RADIUS_M = 6371000;

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
}

function loadWindowFile(name) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, name), 'utf8'), sandbox, { filename: name });
  return sandbox.window;
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
  if (/openstreetmap\.org$|hotpepper\.jp$|tabelog\.com$/.test(h)) return true;
  if (/(^|\.)google\./.test(h) || /googleusercontent\.com$/.test(h)) return true;
  if (/facebook\.com$|instagram\.com$|x\.com$|twitter\.com$|youtube\.com$|tiktok\.com$/.test(h)) return true;
  // Restaurant directories / reservation aggregators are not independent sources.
  if (/gnavi\.co\.jp$|retty\.me$|tripadvisor\.[a-z.]+$|yelp\.[a-z.]+$|foursquare\.com$/.test(h)) return true;
  if (/loco\.yahoo\.co\.jp$|paypaygourmet\.yahoo\.co\.jp$|autoreserve\.com$|ekiten\.jp$/.test(h)) return true;
  if (/restaurant\.ikyu\.com$|bar-navi\.suntory\.co\.jp$/.test(h)) return true;
  return false;
}

function eligibleIndependentUrl(value) {
  const url = safeUrl(value);
  return Boolean(url && !excludedIndependentHost(url.hostname));
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
    if (short >= 4) return Math.max(0.84, short / long);
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

function namesCompatible(a, b) {
  const score = nameSimilarity(a, b);
  const x = normalizeName(a);
  const y = normalizeName(b);
  return Boolean(x && y && (x === y || x.includes(y) || y.includes(x) || score >= 0.82));
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

function nearbyGridKeys(lat, lng) {
  const y = Math.floor(Number(lat) / GRID_DEG);
  const x = Math.floor(Number(lng) / GRID_DEG);
  const out = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) out.push(`${y + dy}:${x + dx}`);
  }
  return out;
}

function flattenStrings(value) {
  if (value == null) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (typeof value === 'object') return Object.values(value).flatMap(flattenStrings);
  return [];
}

function independentUrls(value) {
  return [...new Set(flattenStrings(value)
    .filter(eligibleIndependentUrl)
    .map((item) => safeUrl(item).toString()))];
}

function hostList(urls) {
  return [...new Set(urls.map((value) => new URL(value).hostname.toLowerCase().replace(/^www\./, '')))];
}

const queueDoc = readJson('google_inventory_detail_queue.json');
const indexDoc = readJson('official_candidate_index.json');
const overtureDoc = readJson('overture_area1_candidates.json');
const runtimeWindow = loadWindowFile('google_inventory_runtime.js');
const runtimeRows = Array.isArray(runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS)
  ? runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS
  : [];

if (queueDoc.summary?.catalogTotal !== 2804 || queueDoc.summary?.publicRuntimeTotal !== 1415) {
  throw new Error('Dish queue must be built from the frozen 2,804 / named 1,415 baseline');
}
if (runtimeRows.length !== 1415 || runtimeRows.some((row) => !row.googlePlaceId || !clean(row.name))) {
  throw new Error('Independent-source planning requires the named 1,415 public runtime');
}

const runtimeById = new Map(runtimeRows.map((row) => [row.googlePlaceId, row]));
const targetRows = (queueDoc.rows || []).filter((row) => row.nextAction === 'find_independent_dish_source');
const targetById = new Map(targetRows.map((row) => [row.googlePlaceId, row]));
const outputById = new Map();
const indexRecords = Array.isArray(indexDoc.records) ? indexDoc.records : [];
const overtureRows = Array.isArray(overtureDoc.rows) ? overtureDoc.rows : [];

let invalidUrls = 0;
let nameMismatch = 0;
let alreadyHasSource = 0;
let candidateRecordsOutsideGap = 0;
let excludedAggregatorUrls = 0;

function putProposal(row) {
  const old = outputById.get(row.googlePlaceId);
  if (!old || Number(row.proposalScore || 0) > Number(old.proposalScore || 0)) outputById.set(row.googlePlaceId, row);
}

// Lane 1: retained official candidate index.
for (const record of indexRecords) {
  const pid = clean(record.googlePlaceId);
  const target = targetById.get(pid);
  if (!target) {
    candidateRecordsOutsideGap += 1;
    continue;
  }
  if (Number(target.sourceUrlCount || 0) > 0) {
    alreadyHasSource += 1;
    continue;
  }
  if (!namesCompatible(target.name, record.name)) {
    nameMismatch += 1;
    continue;
  }
  const rawUrls = [record.pageUrl, ...(record.menuUrls || [])].filter(Boolean);
  excludedAggregatorUrls += rawUrls.filter((value) => {
    const url = safeUrl(value);
    return Boolean(url && excludedIndependentHost(url.hostname));
  }).length;
  const pageUrl = eligibleIndependentUrl(record.pageUrl) ? safeUrl(record.pageUrl).toString() : null;
  const menuUrls = [...new Set((record.menuUrls || []).filter(eligibleIndependentUrl).map((value) => safeUrl(value).toString()))];
  if (!pageUrl && !menuUrls.length) {
    invalidUrls += 1;
    continue;
  }
  const urls = [...new Set([pageUrl, ...menuUrls].filter(Boolean))];
  const score = nameSimilarity(target.name, record.name);
  putProposal({
    googlePlaceId: pid,
    name: target.name,
    distanceMeters: target.distanceMeters ?? record.distanceMeters ?? null,
    currentAction: target.nextAction,
    currentSourceUrlCount: Number(target.sourceUrlCount || 0),
    pageUrl,
    menuUrls,
    candidateHosts: hostList(urls),
    checkedAt: clean(record.checkedAt || indexDoc.checkedAt) || null,
    candidateName: clean(record.name),
    candidateProvider: 'retained_official_candidate_index',
    candidateProviderId: null,
    candidateDistanceMeters: null,
    nameSimilarity: Number(score.toFixed(3)),
    proposalScore: Number(score.toFixed(4)),
    proposalState: menuUrls.length ? 'review_existing_official_menu_candidate' : 'review_existing_official_page_candidate',
    confidenceSignals: [
      'same_frozen_google_place_id_in_retained_official_candidate_index',
      'normalized_candidate_name_compatible_with_current_public_name',
      'independently_fetched_http_url_retained_in_repository',
      ...(menuUrls.length ? ['candidate_index_retains_explicit_menu_url'] : [])
    ],
    shard: fnv1a(pid) % SHARDS,
    reviewRequiredBeforeBinding: true,
    mayWriteDishEvidenceBeforeIdentityReview: false
  });
}

// Lane 2: retained Overture snapshot, proposal-only.
const overtureSpatial = new Map();
let overtureRowsWithIndependentUrls = 0;
for (const row of overtureRows) {
  if (!Number.isFinite(row?.lat) || !Number.isFinite(row?.lng) || !clean(row?.name)) continue;
  const allWebsites = flattenStrings(row.websites);
  excludedAggregatorUrls += allWebsites.filter((value) => {
    const url = safeUrl(value);
    return Boolean(url && excludedIndependentHost(url.hostname));
  }).length;
  const urls = independentUrls(row.websites);
  if (!urls.length) continue;
  overtureRowsWithIndependentUrls += 1;
  const key = gridKey(row.lat, row.lng);
  if (!overtureSpatial.has(key)) overtureSpatial.set(key, []);
  overtureSpatial.get(key).push({ row, urls });
}

const overtureProposals = [];
let overtureTargetsWithoutCoordinates = 0;
let overtureTargetsWithNearbyCandidates = 0;
let overtureRejectedName = 0;
let overtureRejectedAmbiguous = 0;
let overtureRejectedWeak = 0;

for (const target of targetRows) {
  if (outputById.has(target.googlePlaceId)) continue;
  const runtime = runtimeById.get(target.googlePlaceId);
  if (!Number.isFinite(runtime?.lat) || !Number.isFinite(runtime?.lng)) {
    overtureTargetsWithoutCoordinates += 1;
    continue;
  }
  const candidates = [];
  for (const key of nearbyGridKeys(runtime.lat, runtime.lng)) {
    for (const entry of overtureSpatial.get(key) || []) {
      const distance = haversine(runtime.lat, runtime.lng, entry.row.lat, entry.row.lng);
      if (distance > MAX_OVERTURE_DISTANCE_M) continue;
      const similarity = nameSimilarity(runtime.name, entry.row.name);
      const distanceScore = Math.max(0, 1 - distance / MAX_OVERTURE_DISTANCE_M);
      const score = similarity * 0.78 + distanceScore * 0.22;
      candidates.push({ ...entry, distance, similarity, score });
    }
  }
  if (!candidates.length) continue;
  overtureTargetsWithNearbyCandidates += 1;
  candidates.sort((a, b) => b.score - a.score || a.distance - b.distance);
  const best = candidates[0];
  const second = candidates[1] || null;
  const margin = best.score - Number(second?.score || 0);
  if (!namesCompatible(runtime.name, best.row.name)) {
    overtureRejectedName += 1;
    continue;
  }
  const strong = (
    (best.similarity >= 0.96 && best.distance <= 80)
    || (best.similarity >= 0.88 && best.distance <= 45)
    || (best.similarity >= 0.82 && best.distance <= 25)
  );
  if (!strong || best.score < 0.78) {
    overtureRejectedWeak += 1;
    continue;
  }
  if (second && margin < 0.065 && !(best.similarity >= 0.98 && best.distance <= 20)) {
    overtureRejectedAmbiguous += 1;
    continue;
  }
  const pid = target.googlePlaceId;
  overtureProposals.push({
    googlePlaceId: pid,
    name: target.name,
    distanceMeters: target.distanceMeters ?? runtime.distanceMeters ?? null,
    currentAction: target.nextAction,
    currentSourceUrlCount: Number(target.sourceUrlCount || 0),
    pageUrl: best.urls[0] || null,
    menuUrls: [],
    candidateHosts: hostList(best.urls),
    checkedAt: clean(overtureDoc.checkedAt || overtureDoc.release) || null,
    candidateName: clean(best.row.name),
    candidateProvider: 'Overture Maps',
    candidateProviderId: clean(best.row.overtureId) || null,
    candidateDistanceMeters: Number(best.distance.toFixed(1)),
    nameSimilarity: Number(best.similarity.toFixed(3)),
    candidateMargin: Number(margin.toFixed(4)),
    proposalScore: Number(best.score.toFixed(4)),
    overtureConfidence: best.row.confidence ?? null,
    proposalState: best.similarity >= 0.96 && best.distance <= 40 && margin >= 0.08
      ? 'review_high_confidence_overture_website_candidate'
      : 'review_overture_website_candidate',
    confidenceSignals: [
      'current_public_identity_has_independent_name_and_coordinates',
      'retained_overture_candidate_with_independent_http_url',
      'normalized_name_similarity_above_proposal_threshold',
      'candidate_within_bounded_coordinate_distance',
      'best_candidate_margin_above_ambiguity_threshold'
    ],
    candidateUrls: best.urls.slice(0, 4),
    shard: fnv1a(pid) % SHARDS,
    reviewRequiredBeforeBinding: true,
    mayWriteDishEvidenceBeforeIdentityReview: false
  });
}

// A native Overture entity must not fan out to multiple Place IDs.
const overtureByNative = new Map();
for (const proposal of overtureProposals.sort((a, b) => b.proposalScore - a.proposalScore || a.candidateDistanceMeters - b.candidateDistanceMeters)) {
  const native = proposal.candidateProviderId || `${proposal.candidateName}|${proposal.pageUrl}`;
  if (overtureByNative.has(native)) {
    overtureRejectedAmbiguous += 1;
    continue;
  }
  overtureByNative.set(native, proposal.googlePlaceId);
  putProposal(proposal);
}

const outputRows = [...outputById.values()].sort((a, b) =>
  Number(b.proposalState === 'review_high_confidence_overture_website_candidate') - Number(a.proposalState === 'review_high_confidence_overture_website_candidate')
  || Number(Boolean(b.menuUrls?.length)) - Number(Boolean(a.menuUrls?.length))
  || Number(b.proposalScore || 0) - Number(a.proposalScore || 0)
  || Number(a.candidateDistanceMeters ?? 99999) - Number(b.candidateDistanceMeters ?? 99999)
  || a.googlePlaceId.localeCompare(b.googlePlaceId)
);

const shardCounts = Array.from({ length: SHARDS }, (_, shard) => ({
  shard,
  total: outputRows.filter((row) => row.shard === shard).length,
  withMenuUrl: outputRows.filter((row) => row.shard === shard && row.menuUrls?.length).length,
  overture: outputRows.filter((row) => row.shard === shard && row.candidateProvider === 'Overture Maps').length
}));

const summary = {
  schemaVersion: 3,
  catalogTotal: 2804,
  publicRuntimeTotal: 1415,
  currentIndependentDishSourceGap: targetRows.length,
  officialCandidateIndexRecords: indexRecords.length,
  overtureSnapshotRows: overtureRows.length,
  overtureRowsWithIndependentUrls,
  proposalRows: outputRows.length,
  retainedIndexProposalRows: outputRows.filter((row) => row.candidateProvider === 'retained_official_candidate_index').length,
  overtureProposalRows: outputRows.filter((row) => row.candidateProvider === 'Overture Maps').length,
  highConfidenceOvertureProposalRows: outputRows.filter((row) => row.proposalState === 'review_high_confidence_overture_website_candidate').length,
  proposalRowsWithExplicitMenuUrls: outputRows.filter((row) => row.menuUrls?.length).length,
  proposalRowsPageOnly: outputRows.filter((row) => !row.menuUrls?.length).length,
  proposalCoverageOfIndependentGapPct: targetRows.length ? Number((outputRows.length * 100 / targetRows.length).toFixed(1)) : 0,
  explicitMenuCoverageOfIndependentGapPct: targetRows.length ? Number((outputRows.filter((row) => row.menuUrls?.length).length * 100 / targetRows.length).toFixed(1)) : 0,
  overtureTargetsWithoutCoordinates,
  overtureTargetsWithNearbyCandidates,
  overtureRejectedName,
  overtureRejectedWeak,
  overtureRejectedAmbiguous,
  excludedAggregatorUrls,
  nameMismatch,
  invalidUrls,
  alreadyHasSource,
  candidateRecordsOutsideGap,
  shards: SHARDS,
  shardCounts
};

const payload = {
  schemaVersion: 3,
  generatedAt: new Date().toISOString(),
  policy: {
    proposalOnly: true,
    identityBindingChanges: 0,
    networkRequests: 0,
    paidGoogleDataApiCalls: 0,
    candidateSources: ['retained official_candidate_index.json', 'retained Overture Maps area snapshot'],
    currentQueueRestriction: 'find_independent_dish_source only',
    nameCompatibilityRequired: true,
    boundedCoordinateAgreementRequiredForOverture: true,
    overtureMaximumDistanceMeters: MAX_OVERTURE_DISTANCE_M,
    candidateAmbiguityMarginRequired: true,
    independentHttpUrlRequired: true,
    socialUrlsExcluded: true,
    thirdPartyAggregatorUrlsExcluded: true,
    excludedAggregatorFamilies: ['Gurunavi', 'Retty', 'Tripadvisor', 'Yelp', 'Foursquare', 'Yahoo Loco/PayPay Gourmet', 'AutoReserve', 'Ekiten', 'Ikyu Restaurant', 'Suntory Bar-Navi'],
    proximityOnlyBindingAllowed: false,
    dishEvidencePromotionBeforeIdentityReviewAllowed: false,
    centralIdentityReviewRequired: true,
    currentPublicRuntimeFieldsUsedForMatching: ['independent-source name', 'independent-source coordinates'],
    googleDisplayPayloadUsed: false
  },
  summary,
  rows: outputRows
};

fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary));
