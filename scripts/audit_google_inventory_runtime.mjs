import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const inventory = JSON.parse(fs.readFileSync(path.join(DATA, 'area1_google_ids.json'), 'utf8'));
const runtimeText = fs.readFileSync(path.join(DATA, 'google_inventory_runtime.js'), 'utf8');
const dishPatchText = fs.readFileSync(path.join(ROOT, 'scripts', 'chinese_dish_runtime_patch.js'), 'utf8');
const reviewedOfficialOverlayPath = path.join(DATA, 'reviewed_official_runtime_sources.json');
const reviewedOfficialOverlay = fs.existsSync(reviewedOfficialOverlayPath)
  ? JSON.parse(fs.readFileSync(reviewedOfficialOverlayPath, 'utf8'))
  : null;

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
if (ids.length !== publishedSet.size) throw new Error('Published runtime contains duplicate Google Place IDs');
if (ids.some((pid) => !expectedSet.has(pid))) throw new Error('Published runtime contains a Place ID outside the frozen catalog');
const expectedPublishedOrder = expected.filter((pid) => publishedSet.has(pid));
if (expectedPublishedOrder.length !== ids.length || expectedPublishedOrder.some((pid, index) => pid !== ids[index])) {
  throw new Error('Published runtime order must preserve frozen catalog order');
}

const overlayById = new Map();
const overlayConflictIds = new Set();
if (reviewedOfficialOverlay) {
  const policy = reviewedOfficialOverlay.policy || {};
  const summary = reviewedOfficialOverlay.summary || {};
  if (policy.sameCollisionLogicAsSQLiteMaster !== true || policy.reviewedRowsOnly !== true || policy.conflictRowsPublished !== false) {
    throw new Error('Reviewed official overlay does not preserve SQLite collision/review semantics');
  }
  if ((policy.paidGoogleDataApiCalls ?? 0) !== 0 || policy.googleDisplayPayloadPersisted === true) {
    throw new Error('Reviewed official overlay violates zero-paid/no-Google-display policy');
  }
  if (policy.runtimeNameMutationAllowed !== false || policy.runtimeCoordinateMutationAllowed !== false || policy.runtimeIdentityMutationAllowed !== false) {
    throw new Error('Reviewed official overlay must remain source-URL-only');
  }
  if (policy.dishEvidencePromotionByOverlayAllowed !== false) {
    throw new Error('Reviewed official overlay must not directly promote dish evidence');
  }
  if (summary.officialCandidateIndexRows !== 194 || summary.reviewedRows !== 193 || summary.conflictDeferredRows !== 1) {
    throw new Error(`Unexpected reviewed official overlay baseline: ${JSON.stringify(summary)}`);
  }
  if ((reviewedOfficialOverlay.rows || []).length !== summary.reviewedRows) {
    throw new Error('Reviewed official overlay row count does not match summary');
  }
  for (const item of reviewedOfficialOverlay.conflictDeferred || []) overlayConflictIds.add(item.googlePlaceId);
  for (const item of reviewedOfficialOverlay.rows || []) {
    if (overlayById.has(item.googlePlaceId)) throw new Error(`Duplicate reviewed official overlay row: ${item.googlePlaceId}`);
    if (overlayConflictIds.has(item.googlePlaceId)) throw new Error(`Conflict Place ID leaked into reviewed official overlay: ${item.googlePlaceId}`);
    if (item.reviewState !== 'reviewed' || !Array.isArray(item.sourceWebsites) || !item.sourceWebsites.length) {
      throw new Error(`Invalid reviewed official overlay row: ${item.googlePlaceId}`);
    }
    if (item.sourceWebsites.some((url) => !String(url || '').startsWith('https://'))) {
      throw new Error(`Non-HTTPS reviewed official URL: ${item.googlePlaceId}`);
    }
    overlayById.set(item.googlePlaceId, item);
  }
}

for (const row of rows) {
  if (!row.googlePlaceId || row.inventoryWithinRadius !== true) throw new Error('Missing frozen-inventory identity marker');
  if (!['canonical', 'source_matched'].includes(row.basicInfoState)) {
    throw new Error(`Unpublished/basic state leaked into public runtime for ${row.googlePlaceId}: ${row.basicInfoState}`);
  }
  if (row.nameKnown !== true || !String(row.name || '').trim()) throw new Error(`Published runtime contains an unnamed restaurant: ${row.googlePlaceId}`);
  if (String(row.name).trim() === 'Google Maps 餐厅') throw new Error(`Legacy placeholder name leaked into public runtime: ${row.googlePlaceId}`);
  for (const key of forbiddenKeys) if (key in row) throw new Error(`Persisted forbidden Google content key ${key}`);
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

  if (row.reviewedOfficialSourceOverlay) {
    const source = overlayById.get(row.googlePlaceId);
    if (!source) throw new Error(`Runtime overlay marker lacks reviewed source row: ${row.googlePlaceId}`);
    if (overlayConflictIds.has(row.googlePlaceId)) throw new Error(`Runtime applied official overlay to conflict row: ${row.googlePlaceId}`);
    const websites = new Set((row.sourceWebsites || []).map((url) => String(url || '').trim()));
    for (const url of source.sourceWebsites) {
      if (!websites.has(url)) throw new Error(`Runtime failed to materialize reviewed official URL for ${row.googlePlaceId}: ${url}`);
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

if (reviewedOfficialOverlay) {
  const applied = rows.filter((row) => row.reviewedOfficialSourceOverlay).length;
  const appliedWithMenu = rows.filter((row) => {
    if (!row.reviewedOfficialSourceOverlay) return false;
    const source = overlayById.get(row.googlePlaceId);
    return Array.isArray(source?.menuUrls) && source.menuUrls.length > 0;
  }).length;
  if (stats.reviewedOfficialOverlayRows !== reviewedOfficialOverlay.summary.reviewedRows) {
    throw new Error('Runtime reviewed-official overlay total diverged from source document');
  }
  if (stats.reviewedOfficialOverlayConflictDeferredRows !== reviewedOfficialOverlay.summary.conflictDeferredRows) {
    throw new Error('Runtime reviewed-official conflict counter diverged from source document');
  }
  if (stats.reviewedOfficialOverlayAppliedRows !== applied || stats.reviewedOfficialOverlayAppliedRowsWithMenuUrl !== appliedWithMenu) {
    throw new Error('Runtime reviewed-official applied counters diverged from rows');
  }
  if (applied > reviewedOfficialOverlay.summary.reviewedRows) throw new Error('Runtime applied more reviewed official overlays than exist');
}

// Dish review strict-source-zh-v1: runtime patch may sanitize/translate already
// retained dish evidence, but it must not synthesize restaurant recommendations
// from cuisine classes, restaurant names, or generic templates.
const dishSandbox = { window: { GOOGLE_INVENTORY_RESTAURANTS: rows, PRODUCTION_RESTAURANTS: [] }, console };
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

let recommendedDishesKnown = 0;
let featuredOnlyRows = 0;
let chineseDishDisplayRows = 0;
let unfilledDishRows = 0;
const pairCounts = new Map();
const unfilledCuisineCounts = {};
const unfilledSamples = [];

for (const row of rows) {
  const forbiddenApproxFields = [
    'dishRecommendationConfidence',
    'dishRecommendationBasis',
    'dishRecommendationQualityTier',
    'dishRecommendationLanguage',
    'dishRecommendationDisplayPolicy'
  ];
  for (const field of forbiddenApproxFields) {
    if (Object.hasOwn(row, field)) throw new Error(`Approximate dish metadata leaked into source-only runtime: ${row.googlePlaceId}: ${field}`);
  }

  const recommended = Array.isArray(row.recommendedDishes) ? row.recommendedDishes : [];
  const featured = Array.isArray(row.featuredDishes) ? row.featuredDishes.map(featuredZh).filter(Boolean) : [];
  if (recommended.some((dish) => !isChineseDish(dish))) throw new Error(`Non-Chinese recommended dish leaked into runtime: ${row.googlePlaceId}`);

  if (recommended.length) {
    recommendedDishesKnown += 1;
    const key = recommended.slice(0, 2).join(' · ');
    pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
  } else if (featured.length) {
    featuredOnlyRows += 1;
  }

  const hasDish = recommended.length > 0 || featured.length > 0;
  if (hasDish) chineseDishDisplayRows += 1;
  else {
    unfilledDishRows += 1;
    const cuisine = String(row.cuisine || '未分类');
    unfilledCuisineCounts[cuisine] = (unfilledCuisineCounts[cuisine] || 0) + 1;
    if (unfilledSamples.length < 100) unfilledSamples.push({ googlePlaceId: row.googlePlaceId, name: row.name, cuisine });
  }
}

const patchStats = dishSandbox.window.CHINESE_DISH_FALLBACK_STATS || {};
if (patchStats.policy !== 'strict-source-zh-v1') throw new Error(`Unexpected Chinese dish patch policy: ${patchStats.policy}`);
if (patchStats.approximateRecommendationsAllowed !== false) throw new Error('Approximate dish recommendations must remain disabled');
if (patchStats.genericFallbackAllowed !== false) throw new Error('Generic dish fallback must remain disabled');
if (patchStats.inventory?.total !== rows.length) throw new Error('Chinese dish sanitizer did not scan the full public runtime');
if ((patchStats.inventory?.rowsWithRecommended || 0) !== recommendedDishesKnown) throw new Error('Sanitizer/audit recommended counts diverged');
if ((patchStats.inventory?.rowsWithFeaturedOnly || 0) !== featuredOnlyRows) throw new Error('Sanitizer/audit featured-only counts diverged');
if ((patchStats.inventory?.rowsWithoutDishEvidence || 0) !== unfilledDishRows) throw new Error('Sanitizer/audit unfilled counts diverged');

const topRepeatedRecommendedPairs = [...pairCounts.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
  .slice(0, 20)
  .map(([pair, count]) => ({ pair, count }));
const topUnfilledCuisines = Object.entries(unfilledCuisineCounts)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
  .slice(0, 30)
  .map(([cuisine, count]) => ({ cuisine, count }));

console.log(JSON.stringify({
  status: 'pass',
  ...stats,
  dishReviewPolicy: 'strict-source-zh-v1',
  approximateChineseDishRows: 0,
  approximateRecommendationsAllowed: false,
  genericFallbackAllowed: false,
  recommendedDishesKnownAfterSanitize: recommendedDishesKnown,
  featuredOnlyRows,
  chineseDishDisplayRows,
  chineseDishDisplayCoveragePct: Number(((chineseDishDisplayRows / rows.length) * 100).toFixed(1)),
  unfilledDishRows,
  topRepeatedRecommendedPairs,
  topUnfilledCuisines,
  unfilledSamples
}));
