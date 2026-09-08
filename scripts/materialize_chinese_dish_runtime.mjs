import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { materializePublicHours, PUBLIC_HOURS_POLICY } from './public_hours_runtime.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const runtimePath = path.join(DATA, 'google_inventory_runtime.js');
const sourceFactsPath = path.join(DATA, 'source_facts.js');
const patchPath = path.join(ROOT, 'scripts', 'chinese_dish_runtime_patch.js');

const runtimeText = fs.readFileSync(runtimePath, 'utf8');
const sourceFactsText = fs.existsSync(sourceFactsPath) ? fs.readFileSync(sourceFactsPath, 'utf8') : '';
const patchText = fs.readFileSync(patchPath, 'utf8');

function parseAssignment(text, name) {
  const prefix = `window.${name}=`;
  const start = text.indexOf(prefix);
  if (start < 0) throw new Error(`Missing ${name}`);
  const valueStart = start + prefix.length;
  const end = text.indexOf(';\n', valueStart);
  if (end < 0) throw new Error(`Cannot parse ${name}`);
  return JSON.parse(text.slice(valueStart, end));
}

const rows = parseAssignment(runtimeText, 'GOOGLE_INVENTORY_RESTAURANTS');
const stats = parseAssignment(runtimeText, 'GOOGLE_INVENTORY_STATS');
const sourceFactsDoc = sourceFactsText ? parseAssignment(sourceFactsText, 'SOURCE_FACTS') : { rows: [] };
const sourceFactsById = new Map(
  (sourceFactsDoc.rows || [])
    .filter((row) => row?.googlePlaceId)
    .map((row) => [row.googlePlaceId, Array.isArray(row.sourceFacts) ? row.sourceFacts : []])
);

// Public Pages exposes one schedule field only. Canonical rows with maintained
// provider facts are re-derived from strict raw evidence at this boundary;
// conflicting or ambiguous schedules are hidden instead of preserving a
// potentially wrong older normalization.
const hoursStats = materializePublicHours(rows, sourceFactsById);

// Dish data is displayable only when it already exists in retained evidence or
// curated canonical data. This pass sanitizes Chinese display text and removes
// all legacy approximate-template metadata; it never invents a recommendation.
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
if (patchStats?.policy !== 'strict-source-zh-v1') throw new Error(`Unexpected dish policy: ${patchStats?.policy}`);
if (patchStats?.approximateRecommendationsAllowed !== false) throw new Error('Approximate dish recommendations must remain disabled');
if (patchStats?.genericFallbackAllowed !== false) throw new Error('Generic dish fallback must remain disabled');
if (patchStats?.inventory?.total !== rows.length) throw new Error('Dish sanitizer did not scan the complete published runtime');

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

let recommendedDishesKnown = 0;
let featuredOnlyRows = 0;
let chineseDishDisplayRows = 0;
let unfilledDishRows = 0;

for (const row of rows) {
  // Maintenance values remain in source records, not in the public package.
  delete row.dishes;
  delete row.priceReference;
  for (const field of [
    'dishRecommendationConfidence',
    'dishRecommendationBasis',
    'dishRecommendationQualityTier',
    'dishRecommendationLanguage',
    'dishRecommendationDisplayPolicy'
  ]) {
    if (Object.hasOwn(row, field)) throw new Error(`Approximate dish metadata survived strict sanitizer: ${row.googlePlaceId}: ${field}`);
  }

  const recommended = Array.isArray(row.recommendedDishes) ? row.recommendedDishes : [];
  const featured = Array.isArray(row.featuredDishes) ? row.featuredDishes.map(featuredZh).filter(Boolean) : [];
  if (recommended.some((dish) => !isChineseDish(dish))) throw new Error(`Non-Chinese recommended dish survived strict sanitizer: ${row.googlePlaceId}`);

  if (recommended.length) recommendedDishesKnown += 1;
  else if (featured.length) featuredOnlyRows += 1;

  if (recommended.length || featured.length) chineseDishDisplayRows += 1;
  else unfilledDishRows += 1;
}

if ((patchStats.inventory.rowsWithRecommended || 0) !== recommendedDishesKnown) throw new Error('Dish sanitizer/materialized recommended counts diverged');
if ((patchStats.inventory.rowsWithFeaturedOnly || 0) !== featuredOnlyRows) throw new Error('Dish sanitizer/materialized featured-only counts diverged');
if ((patchStats.inventory.rowsWithoutDishEvidence || 0) !== unfilledDishRows) throw new Error('Dish sanitizer/materialized unfilled counts diverged');

const finalStats = {
  ...stats,
  hoursKnown: rows.filter((row) => typeof row.hoursReference === 'string' && row.hoursReference.trim()).length,
  hoursRuntimePolicy: PUBLIC_HOURS_POLICY,
  hoursNormalizedRows: hoursStats.normalized,
  hoursNormalizedFromEvidence: hoursStats.normalizedFromEvidence,
  hoursNormalizedFromExistingSchedule: hoursStats.normalizedFromExistingSchedule,
  hoursNormalizedFromStrictRaw: hoursStats.normalizedFromStrictRaw,
  hoursHiddenUnparseableRows: hoursStats.hiddenUnparseable,
  hoursHiddenConflictRows: hoursStats.hiddenConflict,
  hoursHiddenSemanticRows: hoursStats.hiddenSemantic,
  hoursRowsWithoutSource: hoursStats.noScheduleSource,
  hoursLegacyFieldsStripped: hoursStats.strippedLegacyFields,
  recommendedDishesKnown,
  featuredDishesKnown: rows.filter((row) => Array.isArray(row.featuredDishes) && row.featuredDishes.map(featuredZh).filter(Boolean).length > 0).length,
  chineseDishDisplayRows,
  chineseDishDisplayCoveragePct: Number(((chineseDishDisplayRows / rows.length) * 100).toFixed(1)),
  approximateChineseDishRows: 0,
  sourceBackedOrExistingChineseDishRows: chineseDishDisplayRows,
  unfilledDishRows,
  approximateTierCounts: {},
  dishReviewPolicy: 'strict-source-zh-v1',
  approximateRecommendationsAllowed: false,
  genericFallbackAllowed: false,
  dishRuntimeMaterialized: true
};

// Detailed crawl reports remain in source/audit records only.
for (const field of ['detailEvidenceSummary', 'publicWebFieldEvidenceSummary', 'reviewedOfficialOverlaySummary', 'sourceBasicProviders']) {
  delete finalStats[field];
}

fs.writeFileSync(
  runtimePath,
  `// Generated public runtime. Opening hours are semantically validated; dish recommendations are source/curation-backed Chinese display data only. Approximate cuisine-template recommendations are disabled.\n` +
  `window.GOOGLE_INVENTORY_RESTAURANTS=${JSON.stringify(rows)};\n` +
  `window.GOOGLE_INVENTORY_STATS=${JSON.stringify(finalStats)};\n`,
  'utf8'
);

console.log(JSON.stringify(finalStats));
