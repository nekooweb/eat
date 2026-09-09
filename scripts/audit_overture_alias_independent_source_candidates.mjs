#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(ROOT, '_audit', 'overture-alias-independent-source-candidates.json');
const MAX_DISTANCE_M = 120;
const REVIEW_ADDRESS_DISTANCE_M = 40;
const REVIEW_POSTCODE_ULTRANEar_M = 5;
const ULTRANEar_DIAGNOSTIC_M = 3;
const EARTH_RADIUS_M = 6371000;
const GRID_DEG = 0.0015;

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
}

function loadRuntime() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, 'google_inventory_runtime.js'), 'utf8'), sandbox, {
    filename: 'google_inventory_runtime.js'
  });
  return {
    rows: Array.isArray(sandbox.window.GOOGLE_INVENTORY_RESTAURANTS)
      ? sandbox.window.GOOGLE_INVENTORY_RESTAURANTS
      : [],
    stats: sandbox.window.GOOGLE_INVENTORY_STATS || {}
  };
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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
  const grams = (text) => text.length < 2
    ? [text]
    : Array.from({ length: text.length - 1 }, (_, i) => text.slice(i, i + 2));
  const left = grams(x);
  const right = grams(y);
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
  const x = normalizeName(a);
  const y = normalizeName(b);
  const score = nameSimilarity(a, b);
  return Boolean(x && y && (x === y || x.includes(y) || y.includes(x) || score >= 0.82));
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
  if (/gnavi\.co\.jp$|retty\.me$|tripadvisor\.[a-z.]+$|yelp\.[a-z.]+$|foursquare\.com$/.test(h)) return true;
  if (/loco\.yahoo\.co\.jp$|paypaygourmet\.yahoo\.co\.jp$|autoreserve\.com$|ekiten\.jp$/.test(h)) return true;
  if (/restaurant\.ikyu\.com$|bar-navi\.suntory\.co\.jp$/.test(h)) return true;
  return false;
}

function flattenStrings(value) {
  if (value == null) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (typeof value === 'object') return Object.values(value).flatMap(flattenStrings);
  return [];
}

function independentUrls(value) {
  const output = [];
  const seen = new Set();
  for (const raw of flattenStrings(value)) {
    const url = safeUrl(raw);
    if (!url || excludedIndependentHost(url.hostname)) continue;
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(key);
  }
  return output;
}

function addressStrings(value) {
  if (value == null) return [];
  if (typeof value === 'string') return [clean(value)].filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(addressStrings);
  if (typeof value !== 'object') return [];
  const preferred = [
    value.freeform,
    value.streetAddress,
    value.addressLine,
    value.addressLocality,
    value.locality,
    value.addressRegion,
    value.region,
    value.postcode,
    value.postalCode
  ].filter(Boolean).map(clean);
  const combined = clean(preferred.join(' '));
  const nested = Object.entries(value)
    .filter(([key]) => !['freeform','streetAddress','addressLine','addressLocality','locality','addressRegion','region','postcode','postalCode'].includes(key))
    .flatMap(([, item]) => addressStrings(item));
  return [...new Set([combined, ...nested].filter(Boolean))];
}

function overtureAddress(value) {
  const values = addressStrings(value);
  if (!values.length) return '';
  return values.sort((a, b) => b.length - a.length)[0];
}

function postcode(value) {
  const text = clean(value).normalize('NFKC');
  const match = text.match(/(?:〒\s*)?(\d{3})[-ー－\s]?(\d{4})/);
  return match ? `${match[1]}${match[2]}` : '';
}

function normalizeAddress(value) {
  return clean(value).normalize('NFKC').toLowerCase()
    .replace(/〒\s*\d{3}[-ー－\s]?\d{4}/g, '')
    .replace(/日本|japan|東京都|tokyo(?:-to)?/gi, '')
    .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆!！?？.,，。:：/\\]+/g, '');
}

function addressAgreement(a, b) {
  const x = normalizeAddress(a);
  const y = normalizeAddress(b);
  if (!x || !y) return false;
  if (x.length >= 8 && y.includes(x)) return true;
  if (y.length >= 8 && x.includes(y)) return true;
  const max = Math.min(22, x.length, y.length);
  for (let size = max; size >= 8; size -= 1) {
    for (let i = 0; i <= x.length - size; i += 1) {
      if (y.includes(x.slice(i, i + size))) return true;
    }
  }
  return false;
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
  const output = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) output.push(`${y + dy}:${x + dx}`);
  }
  return output;
}

const queueDoc = readJson('google_inventory_detail_queue.json');
const overtureDoc = readJson('overture_area1_candidates.json');
const runtime = loadRuntime();
const runtimeRows = runtime.rows;
const runtimeById = new Map(runtimeRows.map((row) => [row.googlePlaceId, row]));
const targetRows = (queueDoc.rows || []).filter((row) => row.nextAction === 'find_independent_dish_source');

if (
  queueDoc.summary?.catalogTotal !== 2804
  || runtime.stats?.catalogTotal !== 2804
  || queueDoc.summary?.publicRuntimeTotal !== runtimeRows.length
  || targetRows.length !== Number(queueDoc.summary?.recommendationGapNeedingNewDishSource || targetRows.length)
) {
  throw new Error('current runtime/queue contract mismatch');
}

const spatial = new Map();
let overtureRowsWithIndependentUrls = 0;
for (const row of overtureDoc.rows || []) {
  if (!Number.isFinite(row?.lat) || !Number.isFinite(row?.lng) || !clean(row?.name)) continue;
  const urls = independentUrls(row.websites);
  if (!urls.length) continue;
  overtureRowsWithIndependentUrls += 1;
  const key = gridKey(row.lat, row.lng);
  if (!spatial.has(key)) spatial.set(key, []);
  spatial.get(key).push({ row, urls });
}

const auditRows = [];
let targetsWithNearbyIndependentCandidate = 0;
let targetsWhoseNearestNameIsCompatible = 0;
let targetsWhoseNearestNameIsDifferent = 0;
let differentNameWithRuntimeAddress = 0;
let differentNameWithCandidateAddress = 0;
let differentNameWithAddressAgreement = 0;
let differentNameWithPostcodeAgreement = 0;
let ultraNearDifferentName = 0;
let reviewableByNonNameEvidence = 0;

for (const target of targetRows) {
  const current = runtimeById.get(target.googlePlaceId);
  if (!current || !Number.isFinite(current.lat) || !Number.isFinite(current.lng)) continue;
  const candidates = [];
  for (const key of nearbyGridKeys(current.lat, current.lng)) {
    for (const entry of spatial.get(key) || []) {
      const distance = haversine(current.lat, current.lng, entry.row.lat, entry.row.lng);
      if (distance > MAX_DISTANCE_M) continue;
      candidates.push({ ...entry, distance });
    }
  }
  if (!candidates.length) continue;
  targetsWithNearbyIndependentCandidate += 1;
  candidates.sort((a, b) => a.distance - b.distance || String(a.row.overtureId || '').localeCompare(String(b.row.overtureId || '')));
  const best = candidates[0];
  const second = candidates[1] || null;
  const similarity = nameSimilarity(current.name, best.row.name);
  if (namesCompatible(current.name, best.row.name)) {
    targetsWhoseNearestNameIsCompatible += 1;
    continue;
  }
  targetsWhoseNearestNameIsDifferent += 1;

  const runtimeAddress = clean(current.address);
  const candidateAddress = overtureAddress(best.row.addresses);
  if (runtimeAddress) differentNameWithRuntimeAddress += 1;
  if (candidateAddress) differentNameWithCandidateAddress += 1;
  const addressMatch = Boolean(runtimeAddress && candidateAddress && addressAgreement(runtimeAddress, candidateAddress));
  const runtimePostcode = postcode(runtimeAddress);
  const candidatePostcode = postcode(candidateAddress);
  const postcodeMatch = Boolean(runtimePostcode && candidatePostcode && runtimePostcode === candidatePostcode);
  if (addressMatch) differentNameWithAddressAgreement += 1;
  if (postcodeMatch) differentNameWithPostcodeAgreement += 1;
  if (best.distance <= ULTRANEar_DIAGNOSTIC_M) ultraNearDifferentName += 1;

  const runnerUpDistance = second ? second.distance : null;
  const runnerUpGap = second ? second.distance - best.distance : null;
  const addressQualified = addressMatch && best.distance <= REVIEW_ADDRESS_DISTANCE_M;
  const postcodeUltraNearQualified = postcodeMatch && best.distance <= REVIEW_POSTCODE_ULTRANEar_M;
  const reviewable = addressQualified || postcodeUltraNearQualified;
  if (reviewable) reviewableByNonNameEvidence += 1;

  let auditState = 'different_name_nearby_diagnostic_only';
  if (addressQualified && postcodeMatch) auditState = 'review_alias_candidate_address_postcode_location';
  else if (addressQualified) auditState = 'review_alias_candidate_address_location';
  else if (postcodeUltraNearQualified) auditState = 'review_alias_candidate_postcode_ultranear';
  else if (best.distance <= ULTRANEar_DIAGNOSTIC_M) auditState = 'ultranear_alias_diagnostic_only';

  auditRows.push({
    googlePlaceId: target.googlePlaceId,
    name: current.name,
    candidateName: clean(best.row.name),
    candidateProvider: 'Overture Maps',
    candidateProviderId: clean(best.row.overtureId) || null,
    candidateUrls: best.urls.slice(0, 4),
    candidateDistanceMeters: Number(best.distance.toFixed(1)),
    runnerUpDistanceMeters: Number.isFinite(runnerUpDistance) ? Number(runnerUpDistance.toFixed(1)) : null,
    runnerUpGapMeters: Number.isFinite(runnerUpGap) ? Number(runnerUpGap.toFixed(1)) : null,
    nameSimilarity: Number(similarity.toFixed(3)),
    runtimeAddress: runtimeAddress || null,
    candidateAddress: candidateAddress || null,
    runtimePostcode: runtimePostcode || null,
    candidatePostcode: candidatePostcode || null,
    addressAgreement: addressMatch,
    postcodeAgreement: postcodeMatch,
    overtureConfidence: best.row.confidence ?? null,
    auditState,
    reviewableByNonNameEvidence: reviewable,
    sourceAliasMayReplaceCatalogIdentity: false,
    identityBindingChanges: 0,
    mayWriteDishEvidenceBeforeAliasReview: false
  });
}

// Do not let one retained Overture entity silently become a proposed alias for multiple Place IDs.
const nativeCounts = new Map();
for (const row of auditRows.filter((item) => item.reviewableByNonNameEvidence)) {
  const key = row.candidateProviderId || `${row.candidateName}|${row.candidateUrls[0] || ''}`;
  nativeCounts.set(key, (nativeCounts.get(key) || 0) + 1);
}
let nativeCollisionRows = 0;
for (const row of auditRows) {
  if (!row.reviewableByNonNameEvidence) continue;
  const key = row.candidateProviderId || `${row.candidateName}|${row.candidateUrls[0] || ''}`;
  if ((nativeCounts.get(key) || 0) <= 1) continue;
  row.auditState = 'alias_candidate_native_collision_diagnostic_only';
  row.reviewableByNonNameEvidence = false;
  row.nativeCandidateCollision = true;
  nativeCollisionRows += 1;
}

const reviewRows = auditRows.filter((row) => row.reviewableByNonNameEvidence);
const stateCounts = Object.fromEntries([...new Set(auditRows.map((row) => row.auditState))]
  .sort()
  .map((state) => [state, auditRows.filter((row) => row.auditState === state).length]));
const reviewStateCounts = Object.fromEntries([...new Set(reviewRows.map((row) => row.auditState))]
  .sort()
  .map((state) => [state, reviewRows.filter((row) => row.auditState === state).length]));

const summary = {
  catalogTotal: 2804,
  publicRuntimeTotal: runtimeRows.length,
  independentSourceGap: targetRows.length,
  overtureRows: (overtureDoc.rows || []).length,
  overtureRowsWithIndependentUrls,
  targetsWithNearbyIndependentCandidate,
  targetsWhoseNearestNameIsCompatible,
  targetsWhoseNearestNameIsDifferent,
  differentNameWithRuntimeAddress,
  differentNameWithCandidateAddress,
  differentNameWithAddressAgreement,
  differentNameWithPostcodeAgreement,
  ultraNearDifferentName,
  reviewableByNonNameEvidence: reviewRows.length,
  nativeCollisionRows,
  stateCounts,
  reviewStateCounts
};

const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  policy: {
    auditOnly: true,
    proposalOnly: true,
    networkRequests: 0,
    paidGoogleDataApiCalls: 0,
    identityBindingChanges: 0,
    dishEvidenceChanges: 0,
    catalogIdentityNameSource: 'current runtime/catalog name',
    candidateNameRole: 'source alias candidate only',
    sourceAliasMayReplaceCatalogIdentity: false,
    proximityOnlyBindingAllowed: false,
    reviewableAliasCandidateRequiresIndependentAddressOrPostcodeEvidence: true,
    centralAliasIdentityReviewRequiredBeforeBinding: true,
    dishEvidencePromotionBeforeAliasReviewAllowed: false,
    maximumOvertureDistanceMeters: MAX_DISTANCE_M,
    addressReviewMaximumDistanceMeters: REVIEW_ADDRESS_DISTANCE_M,
    postcodeUltraNearMaximumDistanceMeters: REVIEW_POSTCODE_ULTRANEar_M,
    ultraNearWithoutAddressEvidenceIsDiagnosticOnly: true
  },
  summary,
  reviewCandidates: reviewRows.sort((a, b) =>
    Number(b.postcodeAgreement) - Number(a.postcodeAgreement)
    || Number(b.addressAgreement) - Number(a.addressAgreement)
    || a.candidateDistanceMeters - b.candidateDistanceMeters
    || a.googlePlaceId.localeCompare(b.googlePlaceId)
  ),
  diagnosticRows: auditRows.sort((a, b) =>
    Number(b.reviewableByNonNameEvidence) - Number(a.reviewableByNonNameEvidence)
    || a.candidateDistanceMeters - b.candidateDistanceMeters
    || a.googlePlaceId.localeCompare(b.googlePlaceId)
  )
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary));
if (payload.reviewCandidates.length) {
  console.log('REVIEW_CANDIDATE_SAMPLES=' + JSON.stringify(payload.reviewCandidates.slice(0, 20)));
}
if (payload.diagnosticRows.length) {
  console.log('ULTRANEAR_DIAGNOSTIC_SAMPLES=' + JSON.stringify(payload.diagnosticRows
    .filter((row) => row.candidateDistanceMeters <= ULTRANEar_DIAGNOSTIC_M)
    .slice(0, 20)));
}
