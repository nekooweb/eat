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
const providers = {};
const classes = {};
let recommendationItems = 0;
let featuredItems = 0;
const HAN_RE = /[\u3400-\u9fff]/u;
const KANA_RE = /[\u3040-\u30ff]/u;
const allowedProviders = new Set(['Hot Pepper', 'sourceWebsite', 'Tabelog', 'official']);
const allowedFeaturedClasses = new Set([
  'provider_promotional_dish_text',
  'structured_menu_item',
  'source_menu_text',
  'tabelog_menu_text',
  'retained_source_menu_item',
  'source_recommendation_text'
]);

if (inventory.count !== 2804 || frozen.size !== 2804) throw new Error('Frozen Google inventory mismatch');
if (payload.policy?.paidGoogleDataApiCalls !== 0) throw new Error('Detail evidence policy must declare zero paid Google data API calls');

for (const row of payload.rows || []) {
  if (!frozen.has(row.googlePlaceId)) throw new Error(`Evidence outside frozen inventory: ${row.googlePlaceId}`);
  if (ids.has(row.googlePlaceId)) throw new Error(`Duplicate evidence row: ${row.googlePlaceId}`);
  ids.add(row.googlePlaceId);
  for (const [kind, items] of [['recommended', row.recommendedDishes || []], ['featured', row.featuredDishes || []]]) {
    const localSeen = new Set();
    for (const item of items) {
      if (!item?.nameZh || !item?.sourceUrl || !/^https?:\/\//.test(item.sourceUrl)) {
        throw new Error(`Invalid ${kind} dish evidence for ${row.googlePlaceId}`);
      }
      const nameZh = String(item.nameZh).trim();
      if (!HAN_RE.test(nameZh) || KANA_RE.test(nameZh) || nameZh.length > 24) {
        throw new Error(`Non-Chinese public dish label in evidence: ${row.googlePlaceId}: ${nameZh}`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item.checkedAt || '')) throw new Error(`Missing ISO check date for ${row.googlePlaceId}`);
      if (!allowedProviders.has(item.provider)) throw new Error(`Unsupported detail provider: ${item.provider}`);
      if (String(item.evidenceSnippet || '').length > 90) throw new Error(`Evidence snippet too long: ${row.googlePlaceId}`);
      if (kind === 'recommended' && item.evidenceClass !== 'source_recommendation_text') {
        throw new Error(`Recommendation lacks strict recommendation evidence: ${row.googlePlaceId}`);
      }
      if (kind === 'featured' && item.evidenceClass && !allowedFeaturedClasses.has(item.evidenceClass)) {
        throw new Error(`Unsupported featured evidence class: ${row.googlePlaceId}: ${item.evidenceClass}`);
      }
      if (item.evidenceClass === 'source_menu_text' && item.provider !== 'sourceWebsite') {
        throw new Error(`Plain menu text evidence must come from an already-bound source website: ${row.googlePlaceId}`);
      }
      if (item.evidenceClass === 'tabelog_menu_text' && item.provider !== 'Tabelog') {
        throw new Error(`Tabelog menu evidence must retain the Tabelog provider: ${row.googlePlaceId}`);
      }
      const duplicateKey = `${kind}|${nameZh}|${item.provider}|${item.sourceUrl}|${item.evidenceClass || ''}`;
      if (localSeen.has(duplicateKey)) throw new Error(`Duplicate dish evidence item: ${row.googlePlaceId}: ${duplicateKey}`);
      localSeen.add(duplicateKey);
      providers[item.provider] = (providers[item.provider] || 0) + 1;
      classes[item.evidenceClass || 'legacy-unspecified'] = (classes[item.evidenceClass || 'legacy-unspecified'] || 0) + 1;
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
  providerItemCounts: providers,
  evidenceClassCounts: classes,
  summary: payload.summary || {}
}));
