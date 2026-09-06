#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const inventory = JSON.parse(fs.readFileSync(path.join(DATA, 'area1_google_ids.json'), 'utf8'));
const file = path.join(DATA, 'google_inventory_detail_evidence.json');
const payload = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { rows: [], summary: {} };
const frozen = new Set(inventory.googlePlaceIds || []);
const ids = new Set();
let recommendationItems = 0;
let featuredItems = 0;

if (inventory.count !== 2804 || frozen.size !== 2804) throw new Error('Frozen Google inventory mismatch');
if (payload.policy?.paidGoogleDataApiCalls !== 0) throw new Error('Detail evidence policy must declare zero paid Google data API calls');

for (const row of payload.rows || []) {
  if (!frozen.has(row.googlePlaceId)) throw new Error(`Evidence outside frozen inventory: ${row.googlePlaceId}`);
  if (ids.has(row.googlePlaceId)) throw new Error(`Duplicate evidence row: ${row.googlePlaceId}`);
  ids.add(row.googlePlaceId);
  for (const [kind, items] of [['recommended', row.recommendedDishes || []], ['featured', row.featuredDishes || []]]) {
    for (const item of items) {
      if (!item?.nameZh || !item?.sourceUrl || !/^https:\/\//.test(item.sourceUrl)) {
        throw new Error(`Invalid ${kind} dish evidence for ${row.googlePlaceId}`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item.checkedAt || '')) throw new Error(`Missing ISO check date for ${row.googlePlaceId}`);
      if (!['Hot Pepper', 'sourceWebsite'].includes(item.provider)) throw new Error(`Unsupported detail provider: ${item.provider}`);
      if (String(item.evidenceSnippet || '').length > 90) throw new Error(`Evidence snippet too long: ${row.googlePlaceId}`);
      if (kind === 'recommended' && item.evidenceClass !== 'source_recommendation_text') {
        throw new Error(`Recommendation lacks strict recommendation evidence: ${row.googlePlaceId}`);
      }
      if (kind === 'recommended') recommendationItems += 1;
      else featuredItems += 1;
    }
  }
}

console.log(JSON.stringify({
  status: 'pass',
  evidenceRestaurants: ids.size,
  recommendationRestaurants: (payload.rows || []).filter((row) => row.recommendedDishes?.length).length,
  featuredOnlyRestaurants: (payload.rows || []).filter((row) => !row.recommendedDishes?.length && row.featuredDishes?.length).length,
  recommendationItems,
  featuredItems,
  summary: payload.summary || {}
}));
