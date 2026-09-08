import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_HOURS_POLICY, publicHoursForbiddenFields } from './public_hours_runtime.mjs';

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
if (stats.dishReviewPolicy !== 'strict-source-zh-v1') throw new Error(`Unexpected public dish policy: ${stats.dishReviewPolicy}`);
if (stats.approximateRecommendationsAllowed !== false) throw new Error('Approximate dish recommendations are enabled');
if (stats.genericFallbackAllowed !== false) throw new Error('Public runtime permits generic dish fallback');
if (stats.inventoryTotal !== rows.length || rows.length !== 1415) throw new Error(`Unexpected public runtime size: ${rows.length}`);
if (stats.hoursRuntimePolicy !== PUBLIC_HOURS_POLICY) throw new Error(`Unexpected public hours policy: ${stats.hoursRuntimePolicy}`);

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

const forbiddenHourFields = publicHoursForbiddenFields();
const canonicalHoursChars = /^[周一二三四五六日节假休息、；0-9:–\s]+$/u;
const dayToken = /(周[一二三四五六日]|节假日)/u;
const intervalOrClosed = /(\d{2}:\d{2}–\d{2}:\d{2}|休息)/u;
const forbiddenApproxFields = [
  'dishRecommendationConfidence',
  'dishRecommendationBasis',
  'dishRecommendationQualityTier',
  'dishRecommendationLanguage',
  'dishRecommendationDisplayPolicy'
];

let recommendedDishesKnown = 0;
let featuredOnlyRows = 0;
let chineseDishDisplayRows = 0;
let unfilledDishRows = 0;
let publicHoursKnown = 0;
const pairCounts = new Map();
const unfilledCuisineCounts = {};

for (const row of rows) {
  for (const field of forbiddenHourFields) {
    if (Object.hasOwn(row, field)) throw new Error(`Legacy/multiple hours field leaked into public runtime: ${row.googlePlaceId}: ${field}`);
  }
  if (Object.hasOwn(row, 'hoursReference')) {
    const value = String(row.hoursReference || '').trim();
    if (!value || !canonicalHoursChars.test(value) || !dayToken.test(value) || !intervalOrClosed.test(value)) {
      throw new Error(`Non-canonical public hours string: ${row.googlePlaceId}: ${value}`);
    }
    if (value.includes('\n') || KANA_RE.test(value) || /[A-Za-z]/.test(value)) {
      throw new Error(`Raw-language schedule leaked into public hours: ${row.googlePlaceId}: ${value}`);
    }
    publicHoursKnown += 1;
  }

  for (const field of forbiddenApproxFields) {
    if (Object.hasOwn(row, field)) throw new Error(`Approximate dish metadata leaked into strict public runtime: ${row.googlePlaceId}: ${field}`);
  }

  const recommended = Array.isArray(row.recommendedDishes) ? row.recommendedDishes : [];
  const featured = Array.isArray(row.featuredDishes) ? row.featuredDishes.map(featuredZh).filter(Boolean) : [];
  if (recommended.some((dish) => !isChineseDish(dish))) throw new Error(`Non-Chinese recommended dish leaked into public runtime: ${row.googlePlaceId}`);

  if (recommended.length) {
    recommendedDishesKnown += 1;
    const key = recommended.slice(0, 2).join(' · ');
    pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
  } else if (featured.length) {
    featuredOnlyRows += 1;
  }

  if (recommended.length || featured.length) chineseDishDisplayRows += 1;
  else {
    unfilledDishRows += 1;
    const cuisine = String(row.cuisine || '未分类');
    unfilledCuisineCounts[cuisine] = (unfilledCuisineCounts[cuisine] || 0) + 1;
  }
}

if (runtimeText.includes('dishRecommendationConfidence') || runtimeText.includes('dishRecommendationBasis')) {
  throw new Error('Legacy approximate recommendation metadata is present in the public runtime');
}
if (stats.hoursKnown !== publicHoursKnown) throw new Error('hoursKnown stat does not match single-field public runtime');
if (stats.hoursNormalizedRows !== publicHoursKnown) throw new Error('hoursNormalizedRows does not match single-field public runtime');
if ((stats.hoursNormalizedFromEvidence || 0) + (stats.hoursNormalizedFromExistingSchedule || 0) + (stats.hoursNormalizedFromStrictRaw || 0) !== publicHoursKnown) {
  throw new Error('Public hours normalization-source counts do not reconcile');
}
if (
  (stats.hoursNormalizedRows || 0)
  + (stats.hoursHiddenUnparseableRows || 0)
  + (stats.hoursHiddenConflictRows || 0)
  + (stats.hoursHiddenSemanticRows || 0)
  + (stats.hoursRowsWithoutSource || 0)
  !== rows.length
) {
  throw new Error('Public hours normalized/hidden/no-source counts do not reconcile');
}

const apaCurry = rows.find((item) => item.googlePlaceId === 'ChIJ-byfbkGMGGAReOVUQDAy6qM');
const expectedApaHours = '周一、周二、周三、周四、周五 11:00–15:00、18:00–22:00；周六 11:00–18:00；周日、节假日 休息';
if (apaCurry?.hoursReference !== expectedApaHours) {
  throw new Error(`Merged weekday schedule was not corrected: ${apaCurry?.hoursReference || 'hidden'}`);
}
const barNozawa = rows.find((item) => item.googlePlaceId === 'ChIJ-Tl-7xuMGGARoFHeidLo0ns');
if (barNozawa?.hoursReference) throw new Error('Variable closure schedule must remain hidden: Bar野澤');

if (stats.recommendedDishesKnown !== recommendedDishesKnown) throw new Error('recommendedDishesKnown stat does not match strict runtime');
if (stats.chineseDishDisplayRows !== chineseDishDisplayRows) throw new Error('Chinese dish display count does not match strict runtime');
if (stats.approximateChineseDishRows !== 0) throw new Error('Approximate dish rows remain in strict runtime');
if (stats.sourceBackedOrExistingChineseDishRows !== chineseDishDisplayRows) throw new Error('Source-backed/existing dish count does not match strict runtime');
if (stats.unfilledDishRows !== unfilledDishRows) throw new Error('Unfilled dish count does not match strict runtime');
if (Object.keys(stats.approximateTierCounts || {}).length) throw new Error('Approximate tier counts remain in strict runtime');
if (chineseDishDisplayRows + unfilledDishRows !== rows.length) throw new Error('Dish display/unfilled counts do not reconcile');

const topRepeatedRecommendedPairs = [...pairCounts.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
  .slice(0, 20)
  .map(([pair, count]) => ({ pair, count }));
const topUnfilledCuisines = Object.entries(unfilledCuisineCounts)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
  .slice(0, 20)
  .map(([cuisine, count]) => ({ cuisine, count }));

console.log(JSON.stringify({
  status: 'pass',
  inventoryTotal: rows.length,
  hoursRuntimePolicy: stats.hoursRuntimePolicy,
  publicHoursKnown,
  hoursNormalizedFromEvidence: stats.hoursNormalizedFromEvidence,
  hoursNormalizedFromExistingSchedule: stats.hoursNormalizedFromExistingSchedule,
  hoursNormalizedFromStrictRaw: stats.hoursNormalizedFromStrictRaw,
  hoursHiddenUnparseableRows: stats.hoursHiddenUnparseableRows,
  hoursHiddenConflictRows: stats.hoursHiddenConflictRows,
  hoursHiddenSemanticRows: stats.hoursHiddenSemanticRows,
  hoursRowsWithoutSource: stats.hoursRowsWithoutSource,
  hoursLegacyFieldsStripped: stats.hoursLegacyFieldsStripped,
  recommendedDishesKnown,
  featuredOnlyRows,
  chineseDishDisplayRows,
  chineseDishDisplayCoveragePct: Number(((chineseDishDisplayRows / rows.length) * 100).toFixed(1)),
  approximateChineseDishRows: 0,
  approximateRecommendationsAllowed: false,
  sourceBackedOrExistingChineseDishRows: chineseDishDisplayRows,
  unfilledDishRows,
  topRepeatedRecommendedPairs,
  topUnfilledCuisines,
  dishReviewPolicy: stats.dishReviewPolicy,
  genericFallbackAllowed: stats.genericFallbackAllowed,
  dishRuntimeMaterialized: stats.dishRuntimeMaterialized
}));
