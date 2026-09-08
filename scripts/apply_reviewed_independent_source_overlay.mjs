#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const RUNTIME = process.argv[2] || path.join(DATA, 'google_inventory_runtime.js');
const REVIEW = process.argv[3] || path.join(DATA, 'reviewed_independent_dish_sources.json');

function parseAssignment(text, name) {
  const prefix = `window.${name}=`;
  const start = text.indexOf(prefix);
  if (start < 0) throw new Error(`Missing ${name}`);
  const valueStart = start + prefix.length;
  const end = text.indexOf(';\n', valueStart);
  if (end < 0) throw new Error(`Cannot parse ${name}`);
  return JSON.parse(text.slice(valueStart, end));
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

if (!fs.existsSync(REVIEW)) {
  console.log(JSON.stringify({ status: 'skip', reason: 'review_overlay_missing', appliedRows: 0 }));
  process.exit(0);
}

const review = JSON.parse(fs.readFileSync(REVIEW, 'utf8'));
const policy = review.policy || {};
const summary = review.summary || {};
if (
  policy.strictAutoOnly !== true
  || policy.sourceOverlayOnly !== true
  || policy.paidGoogleDataApiCalls !== 0
  || policy.googleDisplayPayloadUsed !== false
  || policy.identityBindingChanges !== 0
  || policy.runtimeNameMutationAllowed !== false
  || policy.runtimeCoordinateMutationAllowed !== false
  || policy.runtimeIdentityMutationAllowed !== false
  || policy.dishEvidenceCreatedByReview !== false
  || policy.genericBrandHomepageAloneAccepted !== false
  || policy.strongPageNameEvidenceRequired !== true
  || policy.crossSiteRedirectAllowed !== false
) {
  throw new Error('Reviewed independent source overlay violates strict source-only policy');
}
if ((summary.approvedRows ?? (review.rows || []).length) !== (review.rows || []).length) {
  throw new Error('Reviewed independent source approved-row summary mismatch');
}

const runtimeText = fs.readFileSync(RUNTIME, 'utf8');
const rows = parseAssignment(runtimeText, 'GOOGLE_INVENTORY_RESTAURANTS');
const stats = parseAssignment(runtimeText, 'GOOGLE_INVENTORY_STATS');
if (stats.catalogTotal !== 2804 || stats.inventoryTotal !== rows.length || rows.length + Number(stats.unpublishedPlaceIdOnly || 0) !== 2804) {
  throw new Error('Current runtime is not the complete frozen-catalog public baseline');
}
const byId = new Map(rows.map((row) => [row.googlePlaceId, row]));
if (byId.size !== rows.length) throw new Error('Runtime contains duplicate Place IDs');

let appliedRows = 0;
let addedUrls = 0;
const overlayIds = new Set();
for (const item of review.rows || []) {
  if (item.reviewState !== 'strict_auto' || !item.googlePlaceId || !Array.isArray(item.sourceWebsites) || !item.sourceWebsites.length) {
    throw new Error(`Invalid reviewed independent source row: ${item.googlePlaceId || '<missing>'}`);
  }
  const row = byId.get(item.googlePlaceId);
  if (!row || row.nameKnown !== true || !String(row.name || '').trim() || row.basicInfoState === 'google_place_id_only') {
    throw new Error(`Reviewed independent source row is not a current named public identity: ${item.googlePlaceId}`);
  }
  const urls = item.sourceWebsites.map(safeHttpsUrl).filter(Boolean);
  if (urls.length !== item.sourceWebsites.length) throw new Error(`Non-HTTPS reviewed independent source URL: ${item.googlePlaceId}`);
  const before = new Set((row.sourceWebsites || []).map((value) => String(value || '').trim()).filter(Boolean));
  for (const url of urls) before.add(url);
  addedUrls += before.size - (row.sourceWebsites || []).filter(Boolean).length;
  row.sourceWebsites = [...before];
  row.reviewedIndependentSourceOverlay = true;
  row.reviewedIndependentSourceCheckedAt = item.checkedAt || review.checkedAt || null;
  overlayIds.add(item.googlePlaceId);
  appliedRows += 1;
}

for (const row of rows) {
  if (row.reviewedIndependentSourceOverlay && !overlayIds.has(row.googlePlaceId)) {
    delete row.reviewedIndependentSourceOverlay;
    delete row.reviewedIndependentSourceCheckedAt;
  }
}

const nextStats = {
  ...stats,
  reviewedIndependentOverlayRows: (review.rows || []).length,
  reviewedIndependentOverlayAppliedRows: appliedRows,
  reviewedIndependentOverlayAddedUrls: addedUrls,
  reviewedIndependentOverlayCheckedAt: review.checkedAt || null
};
const firstLine = runtimeText.startsWith('//') ? runtimeText.split('\n', 1)[0] : '// Generated public runtime with strict source overlays.';
fs.writeFileSync(
  RUNTIME,
  `${firstLine}\nwindow.GOOGLE_INVENTORY_RESTAURANTS=${JSON.stringify(rows)};\nwindow.GOOGLE_INVENTORY_STATS=${JSON.stringify(nextStats)};\n`,
  'utf8'
);
console.log(JSON.stringify({
  status: 'pass',
  reviewedRows: (review.rows || []).length,
  appliedRows,
  addedUrls,
  publicRuntimeTotal: rows.length,
  paidGoogleDataApiCalls: 0,
  identityChanges: 0,
  dishEvidenceCreated: 0
}));
