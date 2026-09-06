#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const POOL = path.join(DATA, 'public_pool_area1.js');
const AUTO = path.join(DATA, 'public_featured_dishes_auto.json');

function loadPool() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(POOL, 'utf8'), sandbox, { filename: 'public_pool_area1.js' });
  return {
    rows: Array.isArray(sandbox.window.PUBLIC_OPEN_RESTAURANTS)
      ? sandbox.window.PUBLIC_OPEN_RESTAURANTS
      : [],
    stats: sandbox.window.PUBLIC_POOL_STATS && typeof sandbox.window.PUBLIC_POOL_STATS === 'object'
      ? sandbox.window.PUBLIC_POOL_STATS
      : {}
  };
}

function validDish(dish) {
  return dish
    && typeof dish === 'object'
    && typeof dish.nameZh === 'string'
    && dish.nameZh.trim()
    && typeof dish.nameJa === 'string'
    && dish.nameJa.trim()
    && dish.provider === 'sourceWebsite'
    && /^https:\/\//.test(String(dish.sourceUrl || ''))
    && /^\d{4}-\d{2}-\d{2}$/.test(String(dish.checkedAt || ''))
    && dish.evidenceClass === 'source_recommendation_text'
    && typeof dish.evidenceText === 'string'
    && dish.evidenceText.trim();
}

const { rows, stats } = loadPool();
let evidence = { rows: [], summary: null, checkedAt: null };
if (fs.existsSync(AUTO)) {
  evidence = JSON.parse(fs.readFileSync(AUTO, 'utf8'));
}

const evidenceByKey = new Map();
for (const record of evidence.rows || []) {
  if (!record?.identityKey || !Array.isArray(record.featuredDishes)) continue;
  const dishes = record.featuredDishes.filter(validDish).slice(0, 2);
  if (!dishes.length) continue;
  evidenceByKey.set(record.identityKey, dishes);
}

let newlyAppliedRestaurants = 0;
let newlyAppliedDishItems = 0;
let skippedExistingSourceBacked = 0;
for (const row of rows) {
  const existing = Array.isArray(row.featuredDishes) && row.featuredDishes.length > 0;
  if (existing) {
    skippedExistingSourceBacked += 1;
    continue;
  }
  const dishes = evidenceByKey.get(row.identityKey);
  if (!dishes?.length) continue;
  row.featuredDishes = dishes;
  row.featuredDishConfidence = 'source_recommendation_text';
  newlyAppliedRestaurants += 1;
  newlyAppliedDishItems += dishes.length;
}

const sourceBackedRows = rows.filter((row) => Array.isArray(row.featuredDishes) && row.featuredDishes.length > 0);
stats.publicWithSourceBackedFeaturedDishes = sourceBackedRows.length;
stats.publicFeaturedDishItems = sourceBackedRows.reduce((sum, row) => sum + row.featuredDishes.length, 0);
stats.publicFeaturedDishEvidenceFile = fs.existsSync(AUTO) ? path.basename(AUTO) : null;
stats.publicFeaturedDishEvidenceCheckedAt = evidence.checkedAt || null;

const output = [
  '// Auto-generated public restaurant pool from retained Hot Pepper bindings and open data.',
  '// Public rows are display/recommendation candidates, not equivalent to canonical Google-verified identities.',
  '// Source-backed public featured dishes may additionally be applied from retained provider/official website evidence.',
  `window.PUBLIC_OPEN_RESTAURANTS = ${JSON.stringify(rows)};`,
  `window.PUBLIC_POOL_STATS = ${JSON.stringify(stats)};`,
  ''
].join('\n');
fs.writeFileSync(POOL, output, 'utf8');

console.log(JSON.stringify({
  evidenceFilePresent: fs.existsSync(AUTO),
  evidenceRestaurants: evidenceByKey.size,
  newlyAppliedRestaurants,
  newlyAppliedDishItems,
  skippedExistingSourceBacked,
  publicWithSourceBackedFeaturedDishes: stats.publicWithSourceBackedFeaturedDishes,
  publicFeaturedDishItems: stats.publicFeaturedDishItems
}));
