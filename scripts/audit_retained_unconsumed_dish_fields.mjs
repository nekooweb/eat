#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  DISH_RULES,
  extractStrictRecommendationsFromText
} from './recommended_dish_extractor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(ROOT, '_audit', 'retained-unconsumed-dish-fields.json');

const CONSUMED_SOURCE_ROW_FIELDS = new Set(['recommendedDishes', 'featuredDishes', 'dishes']);
const NON_DISH_SOURCE_REF_FIELDS = new Set([
  'name', 'cuisine', 'budget', 'hours', 'closure', 'address', 'phone', 'telephone',
  'website', 'websites', 'url', 'urls', 'coordinates', 'location', 'geo', 'tags',
  'hyakumeiten', 'price', 'prices', 'facility', 'facilities', 'amenities'
]);
const SAFE_SOURCE_REF_FIELD_NAME = /(?:dish|menu|recommend|specialty|signature|名物|おすすめ|料理|メニュー)/i;
const SAFE_HOTPEPPER_PATHS = new Set([
  // Hot Pepper currently does not normally expose subGenre.catch, but if a retained
  // artifact does contain it, it is provider-authored promotional text rather than
  // a category name and is safe to audit separately from genre/subGenre names.
  'facts.subGenre.catch'
]);
const CONSUMED_HOTPEPPER_PATHS = new Set([
  'facts.catch',
  'facts.genre.catch',
  'facts.freeFood',
  'rich.sourceCatch',
  'rich.specialFeatures[].title',
  'rich.sourceServiceText.allYouCanEat'
]);
const DIAGNOSTIC_HOTPEPPER_PATHS = [
  ['facts.course', (row) => row?.facts?.course],
  ['facts.budgetMemo', (row) => row?.facts?.budgetMemo],
  ['facts.freeDrink', (row) => row?.facts?.freeDrink],
  ['facts.privateRoom', (row) => row?.facts?.privateRoom],
  ['facts.access', (row) => row?.facts?.access],
  ['facts.openingHoursText', (row) => row?.facts?.openingHoursText],
  ['facts.closedText', (row) => row?.facts?.closedText],
  ['facts.lunchAvailabilityText', (row) => row?.facts?.lunchAvailabilityText],
  ['facts.genre.name', (row) => row?.facts?.genre?.name],
  ['facts.subGenre.name', (row) => row?.facts?.subGenre?.name],
  ['facts.subGenre.catch', (row) => row?.facts?.subGenre?.catch]
];
const DIAGNOSTIC_RICH_PATHS = [
  ['rich.budgetMemo', (row) => row?.budgetMemo],
  ['rich.specialFeatures[].name', (row) => (row?.specialFeatures || []).map((x) => x?.name)],
  ['rich.specialFeatures[].category.name', (row) => (row?.specialFeatures || []).map((x) => x?.category?.name)],
  ['rich.sourceServiceText.course', (row) => row?.sourceServiceText?.course],
  ['rich.sourceServiceText.allYouCanDrink', (row) => row?.sourceServiceText?.allYouCanDrink],
  ['rich.sourceServiceText.shopDetail', (row) => row?.sourceServiceText?.shopDetail],
  ['rich.sourceServiceText.otherEquipment', (row) => row?.sourceServiceText?.otherEquipment],
  ['rich.sourceServiceText.wedding', (row) => row?.sourceServiceText?.wedding]
];

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
}
function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}
function flattenStrings(value) {
  if (value == null) return [];
  if (typeof value === 'string') return [clean(value)].filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (typeof value === 'object') return Object.values(value).flatMap(flattenStrings);
  return [];
}
function loadWindowFile(name, base = { window: {}, console }) {
  vm.createContext(base);
  vm.runInContext(fs.readFileSync(path.join(DATA, name), 'utf8'), base, { filename: name });
  return base.window;
}
function loadRuntime() {
  const sandbox = { window: {}, console };
  const window = loadWindowFile('google_inventory_runtime.js', sandbox);
  return {
    rows: Array.isArray(window.GOOGLE_INVENTORY_RESTAURANTS) ? window.GOOGLE_INVENTORY_RESTAURANTS : [],
    stats: window.GOOGLE_INVENTORY_STATS || {}
  };
}
function dishMatches(value, limit = 8) {
  const text = clean(value);
  if (!text) return [];
  const out = [];
  const seen = new Set();
  for (const [pattern, nameZh] of DISH_RULES) {
    const match = text.match(pattern);
    if (!match || seen.has(nameZh)) continue;
    seen.add(nameZh);
    out.push({ nameZh, nameOriginal: match[0], rule: pattern.source });
    if (out.length >= limit) break;
  }
  return out;
}
function safeUrl(value) {
  const text = clean(value);
  return /^https?:\/\//i.test(text) ? text : '';
}
function increment(map, key, count = 1) {
  map[key] = (map[key] || 0) + count;
}
function fieldValues(row, field) {
  if (Object.prototype.hasOwnProperty.call(row, field)) return flattenStrings(row[field]);
  if (field === 'hours') return flattenStrings(row.openingHoursRaw);
  if (field === 'closure') return flattenStrings([row.closedDays, row.closedNote]);
  if (field === 'budget') return flattenStrings([row.lunch, row.dinner]);
  if (field === 'cuisine') return flattenStrings([row.cuisine, row.tags]);
  return [];
}
function candidateItems(text, sourceMeta) {
  const strict = extractStrictRecommendationsFromText(text, 6);
  if (strict.length) {
    return strict.map((match) => ({
      ...sourceMeta,
      target: 'recommended',
      nameZh: match.nameZh,
      nameOriginal: clean(match.nameOriginal || match.nameJa || match.nameZh),
      rule: match.rule || null,
      evidenceSnippet: clean(text).slice(0, 120)
    }));
  }
  return dishMatches(text, 6).map((match) => ({
    ...sourceMeta,
    target: 'featured',
    ...match,
    evidenceSnippet: clean(text).slice(0, 120)
  }));
}
function dedupeItems(items) {
  const map = new Map();
  for (const item of items) {
    const key = [item.googlePlaceId, item.sourcePath, item.sourceUrl, item.target, item.nameZh, item.evidenceSnippet].join('|');
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

const queue = readJson('google_inventory_detail_queue.json');
const runtime = loadRuntime();
const targets = (queue.rows || []).filter((row) => row.nextAction === 'extract_retained_dish_source');
const targetIds = new Set(targets.map((row) => row.googlePlaceId));
const runtimeById = new Map(runtime.rows.map((row) => [row.googlePlaceId, row]));
if (
  queue.summary?.catalogTotal !== 2804
  || runtime.stats?.catalogTotal !== 2804
  || queue.summary?.publicRuntimeTotal !== runtime.rows.length
  || targets.length !== Number(queue.summary?.actionCounts?.extract_retained_dish_source || -1)
) {
  throw new Error('current retained-source queue/runtime contract mismatch');
}

const sourceSandbox = { window: { RESTAURANTS: [], FEATURED_DISHES: [] }, console };
vm.createContext(sourceSandbox);
const sourceFiles = fs.readdirSync(DATA).filter((name) => /^source_enrichment(?:_[a-z0-9-]+)?\.js$/i.test(name)).sort();
for (const filename of sourceFiles) {
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sourceSandbox, { filename });
}

const sourceRefFieldCounts = {};
const unconsumedSourceRefFieldCounts = {};
const sourceRefDiagnosticHits = [];
const sourceRefSafeCandidates = [];
const sourceRows = (sourceSandbox.window.RESTAURANTS || []).filter((row) => row?.sourceOnly && targetIds.has(row.googlePlaceId));
const targetSourceIds = new Set(sourceRows.map((row) => row.googlePlaceId));
for (const row of sourceRows) {
  for (const ref of row.sourceRefs || []) {
    if (!safeUrl(ref?.url) || !Array.isArray(ref?.fields)) continue;
    for (const rawField of ref.fields) {
      const field = clean(rawField);
      if (!field) continue;
      increment(sourceRefFieldCounts, field);
      if (CONSUMED_SOURCE_ROW_FIELDS.has(field)) continue;
      increment(unconsumedSourceRefFieldCounts, field);
      const values = fieldValues(row, field);
      if (!values.length || NON_DISH_SOURCE_REF_FIELDS.has(field)) continue;
      for (const text of values) {
        const matches = dishMatches(text);
        if (!matches.length) continue;
        const meta = {
          googlePlaceId: row.googlePlaceId,
          restaurantName: runtimeById.get(row.googlePlaceId)?.name || row.name || null,
          provider: clean(ref.provider || row.source || 'retainedSource'),
          sourceUrl: clean(ref.url),
          sourcePath: `source_enrichment.${field}`,
          sourceField: field,
          checkedAt: clean(ref.checkedAt) || null
        };
        const items = candidateItems(text, meta);
        sourceRefDiagnosticHits.push(...items);
        if (SAFE_SOURCE_REF_FIELD_NAME.test(field)) sourceRefSafeCandidates.push(...items);
      }
    }
  }
}

const hpCatalog = readJson('hotpepper_catalog_facts.json');
const hpCatalogRows = (hpCatalog.rows || []).filter((row) => targetIds.has(row.googlePlaceId));
const hpDiagnosticHits = [];
const hpSafeCandidates = [];
const hpFieldValueCounts = {};
for (const row of hpCatalogRows) {
  const sourceUrl = safeUrl(row?.facts?.urls?.pc || row?.facts?.urls?.mobile);
  if (!sourceUrl) continue;
  for (const [sourcePath, getter] of DIAGNOSTIC_HOTPEPPER_PATHS) {
    if (CONSUMED_HOTPEPPER_PATHS.has(sourcePath)) continue;
    for (const text of flattenStrings(getter(row))) {
      increment(hpFieldValueCounts, sourcePath);
      const matches = dishMatches(text);
      if (!matches.length) continue;
      const meta = {
        googlePlaceId: row.googlePlaceId,
        restaurantName: runtimeById.get(row.googlePlaceId)?.name || row?.facts?.name || null,
        provider: 'Hot Pepper',
        sourceUrl,
        sourcePath,
        checkedAt: clean(hpCatalog.checkedAt) || null
      };
      const items = candidateItems(text, meta);
      hpDiagnosticHits.push(...items);
      if (SAFE_HOTPEPPER_PATHS.has(sourcePath)) hpSafeCandidates.push(...items);
    }
  }
}

const richSandbox = { window: {}, console };
const richWindow = loadWindowFile('hotpepper_rich_metadata.js', richSandbox);
const richDoc = richWindow.HOTPEPPER_RICH_METADATA || {};
const richRows = (richDoc.rows || []).filter((row) => targetIds.has(row.googlePlaceId) && ['strict_auto', 'manual_exact'].includes(clean(row.hotpepperReviewMode)));
const richDiagnosticHits = [];
const richFieldValueCounts = {};
for (const row of richRows) {
  const sourceUrl = safeUrl(row.hotpepperUrl);
  if (!sourceUrl) continue;
  for (const [sourcePath, getter] of DIAGNOSTIC_RICH_PATHS) {
    if (CONSUMED_HOTPEPPER_PATHS.has(sourcePath)) continue;
    for (const text of flattenStrings(getter(row))) {
      increment(richFieldValueCounts, sourcePath);
      const matches = dishMatches(text);
      if (!matches.length) continue;
      richDiagnosticHits.push(...candidateItems(text, {
        googlePlaceId: row.googlePlaceId,
        restaurantName: runtimeById.get(row.googlePlaceId)?.name || row.hotpepperName || null,
        provider: 'Hot Pepper',
        sourceUrl,
        sourcePath,
        checkedAt: clean(row.checkedAt || richDoc.checkedAt) || null
      }));
    }
  }
}

const safeCandidates = dedupeItems([...sourceRefSafeCandidates, ...hpSafeCandidates]);
const diagnosticHits = dedupeItems([...sourceRefDiagnosticHits, ...hpDiagnosticHits, ...richDiagnosticHits]);
const safeCandidatePlaces = new Set(safeCandidates.map((item) => item.googlePlaceId));
const diagnosticPlaces = new Set(diagnosticHits.map((item) => item.googlePlaceId));
const safeRecommendedPlaces = new Set(safeCandidates.filter((item) => item.target === 'recommended').map((item) => item.googlePlaceId));
const safeFeaturedPlaces = new Set(safeCandidates.filter((item) => item.target === 'featured').map((item) => item.googlePlaceId));

const summary = {
  catalogTotal: 2804,
  publicRuntimeTotal: runtime.rows.length,
  retainedSourceMiningTargets: targets.length,
  sourceEnrichmentFiles: sourceFiles.length,
  retainedTargetSourceRows: sourceRows.length,
  retainedTargetsRepresentedInSourceEnrichment: targetSourceIds.size,
  hotPepperCatalogTargetRows: hpCatalogRows.length,
  reviewedRichHotPepperTargetRows: richRows.length,
  sourceRefFieldCounts,
  unconsumedSourceRefFieldCounts,
  hotPepperUnconsumedFieldValueCounts: hpFieldValueCounts,
  richHotPepperUnconsumedFieldValueCounts: richFieldValueCounts,
  diagnosticDishHitItems: diagnosticHits.length,
  diagnosticDishHitRestaurants: diagnosticPlaces.size,
  safeNewFieldCandidateItems: safeCandidates.length,
  safeNewFieldCandidateRestaurants: safeCandidatePlaces.size,
  safeNewRecommendationCandidateRestaurants: safeRecommendedPlaces.size,
  safeNewFeaturedCandidateRestaurants: safeFeaturedPlaces.size
};

const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  policy: {
    auditOnly: true,
    networkRequests: 0,
    paidGoogleDataApiCalls: 0,
    identityBindingChanges: 0,
    dishEvidenceChanges: 0,
    targetQueueAction: 'extract_retained_dish_source',
    alreadyConsumedSourceFieldsExcluded: [...CONSUMED_SOURCE_ROW_FIELDS],
    alreadyConsumedHotPepperPathsExcluded: [...CONSUMED_HOTPEPPER_PATHS],
    sourceRefRequiredForSourceEnrichmentCandidate: true,
    sourceRefFieldNameMustHaveDishMenuRecommendationSemanticsForSafeCandidate: true,
    hotPepperSafeNewPaths: [...SAFE_HOTPEPPER_PATHS],
    categoryNameCuisineBrandInferenceAllowed: false,
    serviceBudgetAccessHoursTextMayAutoPromoteDishEvidence: false,
    diagnosticDishTermHitIsNotDishEvidence: true,
    recommendationRequiresExplicitLocalRecommendationMarker: true,
    ordinarySafeFieldDishTermWouldBeFeaturedOnly: true,
    noCanonicalMutationFromAudit: true
  },
  summary,
  safeCandidates: safeCandidates.sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId) || a.sourcePath.localeCompare(b.sourcePath)),
  diagnosticHits: diagnosticHits.sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId) || a.sourcePath.localeCompare(b.sourcePath)).slice(0, 250)
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary));
if (payload.safeCandidates.length) console.log('SAFE_CANDIDATE_SAMPLES=' + JSON.stringify(payload.safeCandidates.slice(0, 30)));
if (payload.diagnosticHits.length) console.log('DIAGNOSTIC_HIT_SAMPLES=' + JSON.stringify(payload.diagnosticHits.slice(0, 30)));
