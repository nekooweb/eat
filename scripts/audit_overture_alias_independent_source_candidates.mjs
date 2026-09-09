#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(ROOT, '_audit', 'overture-alias-independent-source-candidates.json');
const OVERTURE_PATH = process.argv[3] || path.join(DATA, 'overture_area1_candidates.json');
const MAX_DISTANCE_M = 120;
const GRID_DEG = 0.0015;
const EARTH_RADIUS_M = 6371000;

function readJsonFile(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function readJson(name) { return readJsonFile(path.join(DATA, name)); }
function loadRuntime() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, 'google_inventory_runtime.js'), 'utf8'), sandbox, { filename: 'google_inventory_runtime.js' });
  return {
    rows: Array.isArray(sandbox.window.GOOGLE_INVENTORY_RESTAURANTS) ? sandbox.window.GOOGLE_INVENTORY_RESTAURANTS : [],
    stats: sandbox.window.GOOGLE_INVENTORY_STATS || {}
  };
}
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function normalizeName(value) {
  return clean(value).normalize('NFKC').toLowerCase()
    .replace(/株式会社|有限会社|合同会社/g, '')
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
function namesCompatible(a, b) {
  const x = normalizeName(a), y = normalizeName(b), score = nameSimilarity(a, b);
  return Boolean(x && y && (x === y || x.includes(y) || y.includes(x) || score >= 0.82));
}
function flattenStrings(value) {
  if (value == null) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (typeof value === 'object') return Object.values(value).flatMap(flattenStrings);
  return [];
}
function looksLikeName(value) {
  const text = clean(value);
  if (text.length < 2 || text.length > 120 || /https?:\/\//i.test(text)) return false;
  if (/^[a-z]{2,3}(?:[-_][a-z]{2,4})?$/i.test(text)) return false;
  if (/^\d+(?:\.\d+)?$/.test(text)) return false;
  return true;
}
function sourceNameVariants(row) {
  const primary = clean(row?.name);
  const common = flattenStrings(row?.names?.common).map(clean).filter(looksLikeName);
  const seen = new Set(), output = [];
  for (const item of [primary, ...common]) {
    const key = normalizeName(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push({ value: item, kind: item === primary ? 'primary' : 'common' });
  }
  return output;
}
function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url;
  } catch { return null; }
}
function excludedIndependentHost(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  if (/openstreetmap\.org$|hotpepper\.jp$|tabelog\.com$/.test(h)) return true;
  if (/(^|\.)google\./.test(h) || /googleusercontent\.com$/.test(h)) return true;
  if (/facebook\.com$|instagram\.com$|x\.com$|twitter\.com$|youtube\.com$|tiktok\.com$/.test(h)) return true;
  if (/gnavi\.co\.jp$|retty\.me$|tripadvisor\.[a-z.]+$|yelp\.[a-z.]+$|foursquare\.com$/.test(h)) return true;
  if (/loco\.yahoo\.co\.jp$|paypaygourmet\.yahoo\.co\.jp$|autoreserve\.com$|ekiten\.jp$/.test(h)) return true;
  if (/restaurant\.ikyu\.com$|bar-navi\.suntory\.co\.jp$/.test(h)) return true;
  if (/hitosara\.com$|localplace\.jp$|demae-can\.com$|epark\.jp$|ubereats\.com$|wolt\.com$/.test(h)) return true;
  return false;
}
function independentUrls(value) {
  const out = [], seen = new Set();
  for (const raw of flattenStrings(value)) {
    const url = safeUrl(raw);
    if (!url || excludedIndependentHost(url.hostname)) continue;
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key); out.push(key);
  }
  return out;
}
function addressStrings(value) {
  if (value == null) return [];
  if (typeof value === 'string') return [clean(value)].filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(addressStrings);
  if (typeof value !== 'object') return [];
  const preferred = [value.freeform, value.streetAddress, value.addressLine, value.addressLocality, value.locality, value.addressRegion, value.region, value.postcode, value.postalCode]
    .filter(Boolean).map(clean);
  return [...new Set([clean(preferred.join(' ')), ...Object.values(value).flatMap(addressStrings)].filter(Boolean))];
}
function overtureAddress(value) {
  const values = addressStrings(value);
  return values.length ? values.sort((a, b) => b.length - a.length)[0] : '';
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
function strongAliasBridge(similarity, distance) {
  return (similarity >= 0.96 && distance <= 80)
    || (similarity >= 0.88 && distance <= 45)
    || (similarity >= 0.82 && distance <= 25);
}

const queue = readJson('google_inventory_detail_queue.json');
const overture = readJsonFile(OVERTURE_PATH);
const runtime = loadRuntime();
const runtimeById = new Map(runtime.rows.map((row) => [row.googlePlaceId, row]));
const targets = (queue.rows || []).filter((row) => row.nextAction === 'find_independent_dish_source');
if (queue.summary?.catalogTotal !== 2804 || runtime.stats?.catalogTotal !== 2804 || queue.summary?.publicRuntimeTotal !== runtime.rows.length || targets.length !== 296) {
  throw new Error('current runtime/queue contract mismatch');
}

const spatial = new Map();
let rowsWithCommonNames = 0, commonNameVariants = 0, overtureRowsWithIndependentUrls = 0, excludedUrlValues = 0;
for (const row of overture.rows || []) {
  const variants = sourceNameVariants(row);
  const common = variants.filter((item) => item.kind === 'common');
  if (common.length) { rowsWithCommonNames += 1; commonNameVariants += common.length; }
  if (!Number.isFinite(row?.lat) || !Number.isFinite(row?.lng) || !clean(row?.name)) continue;
  const rawUrls = flattenStrings(row.websites), urls = independentUrls(row.websites);
  excludedUrlValues += Math.max(0, rawUrls.length - urls.length);
  if (!urls.length) continue;
  overtureRowsWithIndependentUrls += 1;
  const key = gridKey(row.lat, row.lng);
  if (!spatial.has(key)) spatial.set(key, []);
  spatial.get(key).push({ row, urls, variants });
}

const bridgeRows = [];
let targetsWithNearbyIndependentCandidate = 0, targetsWithPrimaryNameCompatibleCandidate = 0, targetsWithSourceCommonNameBridge = 0;
for (const target of targets) {
  const current = runtimeById.get(target.googlePlaceId);
  if (!current || !Number.isFinite(current.lat) || !Number.isFinite(current.lng)) continue;
  const nearby = [];
  for (const key of nearbyGridKeys(current.lat, current.lng)) {
    for (const entry of spatial.get(key) || []) {
      const distance = haversine(current.lat, current.lng, entry.row.lat, entry.row.lng);
      if (distance <= MAX_DISTANCE_M) nearby.push({ ...entry, distance });
    }
  }
  if (!nearby.length) continue;
  targetsWithNearbyIndependentCandidate += 1;
  if (nearby.some((entry) => namesCompatible(current.name, entry.row.name))) targetsWithPrimaryNameCompatibleCandidate += 1;
  const bridged = [];
  for (const entry of nearby) {
    if (namesCompatible(current.name, entry.row.name)) continue;
    const commonMatches = entry.variants.filter((item) => item.kind === 'common')
      .map((item) => ({ ...item, similarity: nameSimilarity(current.name, item.value) }))
      .filter((item) => namesCompatible(current.name, item.value) && strongAliasBridge(item.similarity, entry.distance))
      .sort((a, b) => b.similarity - a.similarity || a.value.localeCompare(b.value));
    if (commonMatches.length) bridged.push({ ...entry, match: commonMatches[0] });
  }
  if (!bridged.length) continue;
  targetsWithSourceCommonNameBridge += 1;
  bridged.sort((a, b) => b.match.similarity - a.match.similarity || a.distance - b.distance);
  const best = bridged[0], second = bridged[1] || null;
  bridgeRows.push({
    googlePlaceId: target.googlePlaceId,
    name: current.name,
    candidateName: clean(best.row.name),
    matchedSourceCommonName: best.match.value,
    matchedSourceCommonNameSimilarity: Number(best.match.similarity.toFixed(3)),
    candidateProvider: 'Overture Maps',
    candidateProviderId: clean(best.row.overtureId) || null,
    candidateDistanceMeters: Number(best.distance.toFixed(1)),
    competingAliasBridgeCandidateDistanceMeters: second ? Number(second.distance.toFixed(1)) : null,
    competingAliasBridgeCandidateName: second ? clean(second.row.name) : null,
    candidateAddress: overtureAddress(best.row.addresses) || null,
    candidateUrls: best.urls.slice(0, 4),
    overtureConfidence: best.row.confidence ?? null,
    auditState: second && Math.abs(second.match.similarity - best.match.similarity) < 0.03 && Math.abs(second.distance - best.distance) < 15
      ? 'source_common_name_bridge_ambiguous'
      : 'source_common_name_bridge_candidate',
    sourceAliasBridgeEstablishedBySameOvertureEntity: true,
    sourceAliasMayReplaceCatalogIdentity: false,
    identityBindingChanges: 0,
    dishEvidenceChanges: 0,
    centralAliasIdentityReviewRequiredBeforeBinding: true
  });
}

const nativeCounts = new Map();
for (const row of bridgeRows) {
  const key = row.candidateProviderId || `${row.candidateName}|${row.candidateUrls[0] || ''}`;
  nativeCounts.set(key, (nativeCounts.get(key) || 0) + 1);
}
let nativeCollisionRows = 0;
for (const row of bridgeRows) {
  const key = row.candidateProviderId || `${row.candidateName}|${row.candidateUrls[0] || ''}`;
  if ((nativeCounts.get(key) || 0) <= 1) continue;
  row.auditState = 'source_common_name_bridge_native_collision';
  row.nativeCandidateCollision = true;
  nativeCollisionRows += 1;
}
const cleanBridgeRows = bridgeRows.filter((row) => row.auditState === 'source_common_name_bridge_candidate');
const summary = {
  catalogTotal: 2804,
  publicRuntimeTotal: runtime.rows.length,
  independentSourceGap: targets.length,
  overtureSchemaVersion: overture.schemaVersion || null,
  overtureRows: (overture.rows || []).length,
  overtureRowsWithIndependentUrls,
  rowsWithCommonNames,
  commonNameVariants,
  excludedUrlValues,
  targetsWithNearbyIndependentCandidate,
  targetsWithPrimaryNameCompatibleCandidate,
  targetsWithSourceCommonNameBridge,
  bridgeCandidatesBeforeCollision: bridgeRows.length,
  cleanSourceCommonNameBridgeCandidates: cleanBridgeRows.length,
  ambiguousBridgeRows: bridgeRows.filter((row) => row.auditState === 'source_common_name_bridge_ambiguous').length,
  nativeCollisionRows
};
const payload = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  policy: {
    auditOnly: true,
    proposalOnly: true,
    networkRequests: 0,
    paidGoogleDataApiCalls: 0,
    identityBindingChanges: 0,
    dishEvidenceChanges: 0,
    catalogIdentityNameSource: 'current runtime/catalog name',
    candidatePrimaryNameRole: 'source entity primary name only',
    sourceCommonNameRole: 'source-provided alias bridge evidence only',
    sourceAliasMayReplaceCatalogIdentity: false,
    addressOrProximityMayEstablishAliasEquivalence: false,
    proximityOnlyBindingAllowed: false,
    sourceCommonNameBridgeMustBelongToSameOvertureEntity: true,
    centralAliasIdentityReviewRequiredBeforeBinding: true,
    dishEvidencePromotionBeforeAliasReviewAllowed: false,
    thirdPartyAggregatorUrlsExcluded: true,
    maximumOvertureDistanceMeters: MAX_DISTANCE_M
  },
  summary,
  aliasBridgeCandidates: cleanBridgeRows.sort((a, b) => b.matchedSourceCommonNameSimilarity - a.matchedSourceCommonNameSimilarity || a.candidateDistanceMeters - b.candidateDistanceMeters || a.googlePlaceId.localeCompare(b.googlePlaceId)),
  allBridgeRows: bridgeRows
};
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary));
if (payload.aliasBridgeCandidates.length) console.log('ALIAS_BRIDGE_SAMPLES=' + JSON.stringify(payload.aliasBridgeCandidates.slice(0, 30)));
