#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(DATA, 'independent_dish_source_candidates.json');
const SHARDS = Math.max(1, Math.min(32, Number(process.argv[3] || 8)));

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
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

function eligibleIndependentUrl(value) {
  const url = safeUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (/openstreetmap\.org$|hotpepper\.jp$|tabelog\.com$/.test(host)) return false;
  if (/(^|\.)google\./.test(host) || /googleusercontent\.com$/.test(host)) return false;
  if (/facebook\.com$|instagram\.com$|x\.com$|twitter\.com$|youtube\.com$|tiktok\.com$/.test(host)) return false;
  return true;
}

function normalizeName(value) {
  return clean(value).normalize('NFKC').toLowerCase()
    .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆!！?？.,，。:：/\\]+/g, '');
}

function namesCompatible(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  return Boolean(x && y && (x === y || x.includes(y) || y.includes(x)));
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const queueDoc = readJson('google_inventory_detail_queue.json');
const indexDoc = readJson('official_candidate_index.json');
if (queueDoc.summary?.catalogTotal !== 2804 || queueDoc.summary?.publicRuntimeTotal !== 1415) {
  throw new Error('Dish queue must be built from the frozen 2,804 / named 1,415 baseline');
}

const targetRows = (queueDoc.rows || []).filter((row) => row.nextAction === 'find_independent_dish_source');
const targetById = new Map(targetRows.map((row) => [row.googlePlaceId, row]));
const indexRecords = Array.isArray(indexDoc.records) ? indexDoc.records : [];
const outputRows = [];
let invalidUrls = 0;
let nameMismatch = 0;
let alreadyHasSource = 0;
let candidateRecordsOutsideGap = 0;

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

  const pageUrl = eligibleIndependentUrl(record.pageUrl) ? safeUrl(record.pageUrl).toString() : null;
  const menuUrls = [...new Set((record.menuUrls || [])
    .filter(eligibleIndependentUrl)
    .map((value) => safeUrl(value).toString()))];
  if (!pageUrl && !menuUrls.length) {
    invalidUrls += 1;
    continue;
  }

  const urls = [...new Set([pageUrl, ...menuUrls].filter(Boolean))];
  const hostSet = [...new Set(urls.map((value) => new URL(value).hostname.toLowerCase().replace(/^www\./, '')))];
  const shard = fnv1a(pid) % SHARDS;
  const confidenceSignals = [
    'same_frozen_google_place_id_in_retained_official_candidate_index',
    'normalized_candidate_name_compatible_with_current_public_name',
    'independently_fetched_http_url_retained_in_repository'
  ];
  if (menuUrls.length) confidenceSignals.push('candidate_index_retains_explicit_menu_url');

  outputRows.push({
    googlePlaceId: pid,
    name: target.name,
    distanceMeters: target.distanceMeters ?? record.distanceMeters ?? null,
    currentAction: target.nextAction,
    currentSourceUrlCount: Number(target.sourceUrlCount || 0),
    pageUrl,
    menuUrls,
    candidateHosts: hostSet,
    checkedAt: clean(record.checkedAt || indexDoc.checkedAt) || null,
    candidateName: clean(record.name),
    nameCompatible: true,
    proposalState: menuUrls.length ? 'review_existing_official_menu_candidate' : 'review_existing_official_page_candidate',
    confidenceSignals,
    shard,
    reviewRequiredBeforeBinding: true,
    mayWriteDishEvidenceBeforeIdentityReview: false
  });
}

outputRows.sort((a, b) =>
  Number(Boolean(b.menuUrls.length)) - Number(Boolean(a.menuUrls.length))
  || b.menuUrls.length - a.menuUrls.length
  || (a.distanceMeters ?? 99999) - (b.distanceMeters ?? 99999)
  || a.googlePlaceId.localeCompare(b.googlePlaceId)
);

const shardCounts = Array.from({ length: SHARDS }, (_, shard) => ({
  shard,
  total: outputRows.filter((row) => row.shard === shard).length,
  withMenuUrl: outputRows.filter((row) => row.shard === shard && row.menuUrls.length).length
}));

const summary = {
  schemaVersion: 1,
  catalogTotal: 2804,
  publicRuntimeTotal: 1415,
  currentIndependentDishSourceGap: targetRows.length,
  officialCandidateIndexRecords: indexRecords.length,
  proposalRows: outputRows.length,
  proposalRowsWithExplicitMenuUrls: outputRows.filter((row) => row.menuUrls.length).length,
  proposalRowsPageOnly: outputRows.filter((row) => !row.menuUrls.length).length,
  proposalCoverageOfIndependentGapPct: targetRows.length ? Number((outputRows.length * 100 / targetRows.length).toFixed(1)) : 0,
  explicitMenuCoverageOfIndependentGapPct: targetRows.length ? Number((outputRows.filter((row) => row.menuUrls.length).length * 100 / targetRows.length).toFixed(1)) : 0,
  nameMismatch,
  invalidUrls,
  alreadyHasSource,
  candidateRecordsOutsideGap,
  shards: SHARDS,
  shardCounts
};

const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  policy: {
    proposalOnly: true,
    identityBindingChanges: 0,
    networkRequests: 0,
    paidGoogleDataApiCalls: 0,
    candidateSource: 'retained official_candidate_index.json only',
    currentQueueRestriction: 'find_independent_dish_source only',
    nameCompatibilityRequired: true,
    independentHttpUrlRequired: true,
    socialUrlsExcluded: true,
    thirdPartyAggregatorUrlsExcluded: true,
    proximityOnlyBindingAllowed: false,
    dishEvidencePromotionBeforeIdentityReviewAllowed: false,
    centralIdentityReviewRequired: true
  },
  summary,
  rows: outputRows
};

fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary));
