#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const runtimePath = path.join(DATA, 'google_inventory_runtime.js');
const reviewPath = path.join(DATA, 'reviewed_independent_dish_sources.json');

function assignment(text, name) {
  const prefix = `window.${name}=`;
  const start = text.indexOf(prefix);
  if (start < 0) throw new Error(`Missing ${name}`);
  const begin = start + prefix.length;
  const end = text.indexOf(';\n', begin);
  if (end < 0) throw new Error(`Cannot parse ${name}`);
  return JSON.parse(text.slice(begin, end));
}

if (!fs.existsSync(reviewPath)) {
  console.log(JSON.stringify({ status: 'pass', reviewedRows: 0, appliedRows: 0, reason: 'overlay_missing' }));
  process.exit(0);
}
const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
const text = fs.readFileSync(runtimePath, 'utf8');
const rows = assignment(text, 'GOOGLE_INVENTORY_RESTAURANTS');
const stats = assignment(text, 'GOOGLE_INVENTORY_STATS');
const byId = new Map(rows.map((row) => [row.googlePlaceId, row]));
const reviewed = review.rows || [];
if (review.policy?.strictAutoOnly !== true || review.policy?.sourceOverlayOnly !== true
  || review.policy?.paidGoogleDataApiCalls !== 0 || review.policy?.identityBindingChanges !== 0
  || review.policy?.dishEvidenceCreatedByReview !== false || review.policy?.genericBrandHomepageAloneAccepted !== false) {
  throw new Error('Reviewed independent overlay policy is not strict/source-only');
}
if (stats.reviewedIndependentOverlayRows !== reviewed.length || stats.reviewedIndependentOverlayAppliedRows !== reviewed.length) {
  throw new Error('Reviewed independent overlay runtime counters diverged');
}
for (const item of reviewed) {
  const row = byId.get(item.googlePlaceId);
  if (!row || row.reviewedIndependentSourceOverlay !== true) throw new Error(`Missing runtime independent overlay marker: ${item.googlePlaceId}`);
  const sites = new Set((row.sourceWebsites || []).map(String));
  for (const raw of item.sourceWebsites || []) {
    const url = new URL(raw);
    if (url.protocol !== 'https:') throw new Error(`Non-HTTPS reviewed independent source: ${item.googlePlaceId}`);
    if (!sites.has(url.toString())) throw new Error(`Reviewed independent source URL missing from runtime: ${item.googlePlaceId}`);
  }
}
for (const row of rows) {
  if (row.reviewedIndependentSourceOverlay === true && !reviewed.some((item) => item.googlePlaceId === row.googlePlaceId)) {
    throw new Error(`Untraceable independent overlay marker: ${row.googlePlaceId}`);
  }
}
console.log(JSON.stringify({
  status: 'pass',
  catalogTotal: stats.catalogTotal,
  publicRuntimeTotal: rows.length,
  reviewedRows: reviewed.length,
  appliedRows: stats.reviewedIndependentOverlayAppliedRows,
  addedUrls: stats.reviewedIndependentOverlayAddedUrls || 0,
  paidGoogleDataApiCalls: 0,
  identityChanges: 0,
  dishEvidenceCreated: 0
}));
