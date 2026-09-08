import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const runtimeText = fs.readFileSync(path.join(DATA, 'google_inventory_runtime.js'), 'utf8');

function parseAssignment(name) {
  const prefix = `window.${name}=`;
  const start = runtimeText.indexOf(prefix);
  if (start < 0) throw new Error(`Missing ${name}`);
  const valueStart = start + prefix.length;
  const end = runtimeText.indexOf(';\n', valueStart);
  if (end < 0) throw new Error(`Cannot parse ${name}`);
  return JSON.parse(runtimeText.slice(valueStart, end));
}

const rows = parseAssignment('GOOGLE_INVENTORY_RESTAURANTS');
const stats = parseAssignment('GOOGLE_INVENTORY_STATS');

if (stats.dishRuntimeMaterialized !== true) throw new Error('Public runtime does not contain the materialized dish layer');
if (stats.dishReviewPolicy !== 'relaxed-zh-v2') throw new Error(`Unexpected public dish policy: ${stats.dishReviewPolicy}`);
if (stats.genericFallbackAllowed !== false) throw new Error('Public runtime permits generic dish fallback');
if (stats.inventoryTotal !== rows.length || rows.length !== 1415) throw new Error(`Unexpected public runtime size: ${rows.length}`);

const HAN_RE = /[\u3400-\u9fff]/u;
const KANA_RE = /[\u3040-\u30ff]/u;
const isChineseDish = (value) => {
  const text = String(value || '').trim();
  return Boolean(text) && text.length <= 24 && HAN_RE.test(text) && !KANA_RE.test(text);
};
const featuredZh = (item) => {
  if (typeof item === 'string') return isChineseDish(item) ? item.trim() : '';
  if (!item || typeof item !== 'object') return '';
  const value = String(item.nameZh || '').trim();
  return isChineseDish(value) ? value : '';
};

const bannedGenericExact = new Set(['招牌主菜', '时令小菜', '推荐菜', '特色菜', '主菜']);
const allowedTiers = new Set(['brand', 'dish-keyword', 'cuisine', 'broad-cuisine']);
let approximateChineseDishRows = 0;
let sourceBackedOrExistingChineseDishRows = 0;
let chineseDishDisplayRows = 0;
let unfilledDishRows = 0;
let recommendedDishesKnown = 0;
const tierCounts = {};
const unfilledCuisineCounts = {};

for (const row of rows) {
  const recommendedRaw = Array.isArray(row.recommendedDishes) ? row.recommendedDishes : [];
  const recommended = recommendedRaw.filter(isChineseDish);
  const featured = Array.isArray(row.featuredDishes) ? row.featuredDishes.map(featuredZh).filter(Boolean) : [];
  if (recommendedRaw.length > 0) recommendedDishesKnown += 1;
  const hasDish = recommended.length > 0 || featured.length > 0;
  if (hasDish) chineseDishDisplayRows += 1;

  if (row.dishRecommendationConfidence === 'approximate') {
    approximateChineseDishRows += 1;
    const tier = String(row.dishRecommendationQualityTier || '');
    if (!allowedTiers.has(tier)) throw new Error(`Invalid approximate tier for ${row.googlePlaceId}: ${tier}`);
    if (row.dishRecommendationLanguage !== 'zh-CN' || row.dishRecommendationDisplayPolicy !== 'relaxed-zh-v2') {
      throw new Error(`Incomplete approximate metadata for ${row.googlePlaceId}`);
    }
    if (!row.dishRecommendationBasis || /generic/i.test(String(row.dishRecommendationBasis))) {
      throw new Error(`Approximate row lacks specific basis: ${row.googlePlaceId}`);
    }
    if (recommendedRaw.length < 1 || recommendedRaw.length > 2) throw new Error(`Approximate row has invalid dish count: ${row.googlePlaceId}`);
    for (const dish of recommendedRaw) {
      if (!isChineseDish(dish)) throw new Error(`Approximate dish is not Chinese: ${row.googlePlaceId}`);
      if (bannedGenericExact.has(String(dish).trim())) throw new Error(`Generic filler leaked into public runtime: ${row.googlePlaceId}`);
    }
    tierCounts[tier] = (tierCounts[tier] || 0) + 1;
  } else if (hasDish) {
    sourceBackedOrExistingChineseDishRows += 1;
  } else {
    unfilledDishRows += 1;
    const cuisine = String(row.cuisine || '未分类');
    unfilledCuisineCounts[cuisine] = (unfilledCuisineCounts[cuisine] || 0) + 1;
  }
}

if (runtimeText.includes('招牌主菜') || runtimeText.includes('时令小菜')) throw new Error('Legacy universal filler text is present in the public runtime');
if (stats.recommendedDishesKnown !== recommendedDishesKnown) throw new Error('recommendedDishesKnown stat does not match materialized runtime');
if (stats.chineseDishDisplayRows !== chineseDishDisplayRows) throw new Error('Chinese dish display count does not match materialized runtime');
if (stats.approximateChineseDishRows !== approximateChineseDishRows) throw new Error('Approximate dish count does not match materialized runtime');
if (stats.sourceBackedOrExistingChineseDishRows !== sourceBackedOrExistingChineseDishRows) throw new Error('Existing/source-backed dish count does not match materialized runtime');
if (stats.unfilledDishRows !== unfilledDishRows) throw new Error('Unfilled dish count does not match materialized runtime');
if (JSON.stringify(stats.approximateTierCounts || {}) !== JSON.stringify(tierCounts)) throw new Error('Approximate tier counts do not match materialized runtime');
if (chineseDishDisplayRows + unfilledDishRows !== rows.length) throw new Error('Dish display/unfilled counts do not reconcile');

const topUnfilledCuisines = Object.entries(unfilledCuisineCounts)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
  .slice(0, 20)
  .map(([cuisine, count]) => ({ cuisine, count }));

console.log(JSON.stringify({
  status: 'pass',
  inventoryTotal: rows.length,
  recommendedDishesKnown,
  chineseDishDisplayRows,
  chineseDishDisplayCoveragePct: Number(((chineseDishDisplayRows / rows.length) * 100).toFixed(1)),
  approximateChineseDishRows,
  sourceBackedOrExistingChineseDishRows,
  unfilledDishRows,
  approximateTierCounts: tierCounts,
  topUnfilledCuisines,
  dishReviewPolicy: stats.dishReviewPolicy,
  genericFallbackAllowed: stats.genericFallbackAllowed,
  dishRuntimeMaterialized: stats.dishRuntimeMaterialized
}));
