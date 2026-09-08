import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const runtimePath = path.join(DATA, 'google_inventory_runtime.js');
const patchPath = path.join(ROOT, 'scripts', 'chinese_dish_runtime_patch.js');

const runtimeText = fs.readFileSync(runtimePath, 'utf8');
const patchText = fs.readFileSync(patchPath, 'utf8');

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

const sandbox = {
  window: {
    GOOGLE_INVENTORY_RESTAURANTS: rows,
    PRODUCTION_RESTAURANTS: []
  },
  console
};
vm.createContext(sandbox);
vm.runInContext(patchText, sandbox, { filename: 'chinese_dish_runtime_patch.js' });

const patchStats = sandbox.window.CHINESE_DISH_FALLBACK_STATS;
if (patchStats?.policy !== 'relaxed-zh-v2') throw new Error(`Unexpected dish policy: ${patchStats?.policy}`);
if (patchStats?.genericFallbackAllowed !== false) throw new Error('Generic dish fallback must remain disabled');
if (patchStats?.inventory?.total !== rows.length) throw new Error('Dish patch did not scan the complete published runtime');

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
let approximateChineseDishRows = 0;
let sourceBackedOrExistingChineseDishRows = 0;
let chineseDishDisplayRows = 0;
let unfilledDishRows = 0;
const tierCounts = {};

for (const row of rows) {
  const recommended = Array.isArray(row.recommendedDishes) ? row.recommendedDishes.filter(isChineseDish) : [];
  const featured = Array.isArray(row.featuredDishes) ? row.featuredDishes.map(featuredZh).filter(Boolean) : [];
  const hasDish = recommended.length > 0 || featured.length > 0;
  if (hasDish) chineseDishDisplayRows += 1;

  if (row.dishRecommendationConfidence === 'approximate') {
    approximateChineseDishRows += 1;
    if (row.dishRecommendationDisplayPolicy !== 'relaxed-zh-v2') throw new Error(`Wrong approximate policy: ${row.googlePlaceId}`);
    if (!row.dishRecommendationBasis || /generic/i.test(String(row.dishRecommendationBasis))) throw new Error(`Approximate row lacks specific basis: ${row.googlePlaceId}`);
    if (!Array.isArray(row.recommendedDishes) || row.recommendedDishes.length < 1 || row.recommendedDishes.length > 2) throw new Error(`Approximate row has invalid dish count: ${row.googlePlaceId}`);
    for (const dish of row.recommendedDishes) {
      if (!isChineseDish(dish)) throw new Error(`Approximate dish is not Chinese: ${row.googlePlaceId}`);
      if (bannedGenericExact.has(String(dish).trim())) throw new Error(`Generic filler leaked into public runtime: ${row.googlePlaceId}`);
    }
    const tier = String(row.dishRecommendationQualityTier || '');
    tierCounts[tier] = (tierCounts[tier] || 0) + 1;
  } else if (hasDish) {
    sourceBackedOrExistingChineseDishRows += 1;
  } else {
    unfilledDishRows += 1;
  }
}

if ((patchStats.inventory.patchedApproximate || 0) !== approximateChineseDishRows) throw new Error('Patch/materialized approximate counts diverged');
if ((patchStats.inventory.unfilledNoSpecificSignal || 0) !== unfilledDishRows) throw new Error('Patch/materialized unfilled counts diverged');

const finalStats = {
  ...stats,
  recommendedDishesKnown: rows.filter((row) => Array.isArray(row.recommendedDishes) && row.recommendedDishes.length > 0).length,
  chineseDishDisplayRows,
  chineseDishDisplayCoveragePct: Number(((chineseDishDisplayRows / rows.length) * 100).toFixed(1)),
  approximateChineseDishRows,
  sourceBackedOrExistingChineseDishRows,
  unfilledDishRows,
  approximateTierCounts: tierCounts,
  dishReviewPolicy: 'relaxed-zh-v2',
  genericFallbackAllowed: false,
  dishRuntimeMaterialized: true
};

fs.writeFileSync(
  runtimePath,
  `// Generated public runtime. Approximate Chinese dish hints are materialized only at this display boundary; they are not source evidence.\n` +
  `window.GOOGLE_INVENTORY_RESTAURANTS=${JSON.stringify(rows)};\n` +
  `window.GOOGLE_INVENTORY_STATS=${JSON.stringify(finalStats)};\n`,
  'utf8'
);

console.log(JSON.stringify(finalStats));
