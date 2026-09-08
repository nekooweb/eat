import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const inventory = JSON.parse(fs.readFileSync(path.join(DATA, 'area1_google_ids.json'), 'utf8'));
const runtimeText = fs.readFileSync(path.join(DATA, 'google_inventory_runtime.js'), 'utf8');
const dishPatchText = fs.readFileSync(path.join(ROOT, 'scripts', 'chinese_dish_runtime_patch.js'), 'utf8');

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
const expected = inventory.googlePlaceIds || [];
const expectedSet = new Set(expected);
const ids = rows.map((row) => row.googlePlaceId);
const publishedSet = new Set(ids);
const forbiddenKeys = new Set([
  'displayName', 'formattedAddress', 'googleName', 'googleAddress', 'googleLocation',
  'currentOpeningHours', 'nationalPhoneNumber', 'internationalPhoneNumber', 'websiteUri'
]);

if (expected.length !== 2804 || expectedSet.size !== 2804) {
  throw new Error('Frozen catalog must contain exactly 2,804 unique Google Place IDs');
}
if (ids.length !== publishedSet.size) {
  throw new Error('Published runtime contains duplicate Google Place IDs');
}
if (ids.some((pid) => !expectedSet.has(pid))) {
  throw new Error('Published runtime contains a Place ID outside the frozen catalog');
}
const expectedPublishedOrder = expected.filter((pid) => publishedSet.has(pid));
if (expectedPublishedOrder.length !== ids.length || expectedPublishedOrder.some((pid, index) => pid !== ids[index])) {
  throw new Error('Published runtime order must preserve frozen catalog order');
}

for (const row of rows) {
  if (!row.googlePlaceId || row.inventoryWithinRadius !== true) throw new Error('Missing frozen-inventory identity marker');
  if (!['canonical', 'source_matched'].includes(row.basicInfoState)) {
    throw new Error(`Unpublished/basic state leaked into public runtime for ${row.googlePlaceId}: ${row.basicInfoState}`);
  }
  if (row.nameKnown !== true || !String(row.name || '').trim()) {
    throw new Error(`Published runtime contains an unnamed restaurant: ${row.googlePlaceId}`);
  }
  if (String(row.name).trim() === 'Google Maps 餐厅') {
    throw new Error(`Legacy placeholder name leaked into public runtime: ${row.googlePlaceId}`);
  }
  for (const key of forbiddenKeys) {
    if (key in row) throw new Error(`Persisted forbidden Google content key ${key}`);
  }
  if (Number.isFinite(row.distanceMeters) && (row.distanceMeters < 0 || row.distanceMeters > 1200)) {
    throw new Error(`Out-of-radius distance for ${row.googlePlaceId}`);
  }
  if (row.basicInfoState === 'source_matched') {
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng) || !Number.isFinite(row.distanceMeters)) {
      throw new Error(`Source-matched row lacks durable basics: ${row.googlePlaceId}`);
    }
    if (!Array.isArray(row.sources) || row.sources.length !== 1 || row.sources[0] === 'Google Place ID') {
      throw new Error(`Source-matched row lacks independent source: ${row.googlePlaceId}`);
    }
  }
}

if (stats.catalogTotal !== 2804) throw new Error('Runtime stats lost the full frozen catalog count');
if (stats.inventoryTotal !== rows.length || stats.uniquePlaceIds !== rows.length) throw new Error('Published runtime stats mismatch');
if ((stats.canonicalRich + stats.sourceBasic) !== rows.length) throw new Error('Published state counts mismatch');
if (stats.placeIdOnly !== 0) throw new Error('Public runtime must not report published ID-only rows');
if (stats.unpublishedPlaceIdOnly !== 2804 - rows.length) throw new Error('Held ID-only count does not reconcile with catalog');
if (stats.catalogPlaceIdOnly !== stats.unpublishedPlaceIdOnly) throw new Error('Catalog/public ID-only counters diverged');
if (rows.length < 3) throw new Error('Published recommendation runtime has fewer than 3 rows');

// Dish review v2: approximate suggestions are allowed, but only when a concrete
// brand/dish/cuisine rule fires. Meaningless universal fallbacks are forbidden.
const dishSandbox = {
  window: {
    GOOGLE_INVENTORY_RESTAURANTS: rows,
    PRODUCTION_RESTAURANTS: []
  },
  console
};
vm.createContext(dishSandbox);
vm.runInContext(dishPatchText, dishSandbox, { filename: 'chinese_dish_runtime_patch.js' });

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
const allowedTiers = new Set(['brand', 'dish-keyword', 'cuisine']);
let approximateChineseDishRows = 0;
let sourceBackedOrExistingChineseDishRows = 0;
let chineseDishDisplayRows = 0;
let unfilledDishRows = 0;
const tierCounts = {};
const unfilledCuisineCounts = {};
const unfilledSamples = [];

for (const row of rows) {
  const recommended = Array.isArray(row.recommendedDishes) ? row.recommendedDishes.filter(isChineseDish) : [];
  const featured = Array.isArray(row.featuredDishes) ? row.featuredDishes.map(featuredZh).filter(Boolean) : [];
  const hasDish = recommended.length > 0 || featured.length > 0;
  if (hasDish) chineseDishDisplayRows += 1;

  if (row.dishRecommendationConfidence === 'approximate') {
    approximateChineseDishRows += 1;
    const tier = String(row.dishRecommendationQualityTier || '');
    if (row.dishRecommendationLanguage !== 'zh-CN' || row.dishRecommendationDisplayPolicy !== 'relaxed-zh-v2') {
      throw new Error(`Approximate dish metadata is incomplete: ${row.googlePlaceId}`);
    }
    if (!allowedTiers.has(tier)) {
      throw new Error(`Approximate dish tier is not allowed: ${row.googlePlaceId}: ${tier}`);
    }
    if (!Array.isArray(row.recommendedDishes) || row.recommendedDishes.length < 1 || row.recommendedDishes.length > 2) {
      throw new Error(`Approximate dish count must be 1-2: ${row.googlePlaceId}`);
    }
    if (row.recommendedDishes.some((dish) => !isChineseDish(dish))) {
      throw new Error(`Approximate recommendation is not Chinese: ${row.googlePlaceId}`);
    }
    if (row.recommendedDishes.some((dish) => bannedGenericExact.has(String(dish).trim()))) {
      throw new Error(`Meaningless generic dish fallback is forbidden: ${row.googlePlaceId}`);
    }
    if (!row.dishRecommendationBasis || /generic/i.test(String(row.dishRecommendationBasis))) {
      throw new Error(`Approximate recommendation lacks a specific basis: ${row.googlePlaceId}`);
    }
    tierCounts[tier] = (tierCounts[tier] || 0) + 1;
  } else if (hasDish) {
    sourceBackedOrExistingChineseDishRows += 1;
  } else {
    unfilledDishRows += 1;
    const cuisine = String(row.cuisine || '未分类');
    unfilledCuisineCounts[cuisine] = (unfilledCuisineCounts[cuisine] || 0) + 1;
    if (unfilledSamples.length < 80) {
      unfilledSamples.push({
        googlePlaceId: row.googlePlaceId,
        name: row.name,
        cuisine
      });
    }
  }
}

const dishPatchStats = dishSandbox.window.CHINESE_DISH_FALLBACK_STATS?.inventory || {};
const patchPolicy = dishSandbox.window.CHINESE_DISH_FALLBACK_STATS?.policy;
if (patchPolicy !== 'relaxed-zh-v2') throw new Error(`Unexpected Chinese dish patch policy: ${patchPolicy}`);
if (dishSandbox.window.CHINESE_DISH_FALLBACK_STATS?.genericFallbackAllowed !== false) {
  throw new Error('Generic dish fallback must remain disabled');
}
if (dishPatchStats.total !== rows.length) throw new Error('Chinese dish patch did not scan the full public runtime');
if ((dishPatchStats.patchedApproximate || 0) !== approximateChineseDishRows) {
  throw new Error('Chinese dish patch/audit approximate counts diverged');
}
if ((dishPatchStats.unfilledNoSpecificSignal || 0) !== unfilledDishRows) {
  throw new Error('Chinese dish patch/audit unfilled counts diverged');
}

const topUnfilledCuisines = Object.entries(unfilledCuisineCounts)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
  .slice(0, 30)
  .map(([cuisine, count]) => ({ cuisine, count }));

console.log(JSON.stringify({
  status: 'pass',
  ...stats,
  chineseDishDisplayRows,
  chineseDishDisplayCoveragePct: Number(((chineseDishDisplayRows / rows.length) * 100).toFixed(1)),
  approximateChineseDishRows,
  sourceBackedOrExistingChineseDishRows,
  unfilledDishRows,
  approximateTierCounts: tierCounts,
  topUnfilledCuisines,
  unfilledSamples,
  dishReviewPolicy: 'relaxed-zh-v2',
  genericFallbackAllowed: false
}));
