#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { translateDishText } from './recommended_dish_extractor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(DATA, 'retained_dish_evidence.json');
const PENDING_OUTPUT = process.argv[3] || path.join(DATA, 'dish_translation_pending.json');
const TODAY = new Date().toISOString().slice(0, 10);

const sandbox = { window: { RESTAURANTS: [], FEATURED_DISHES: [] }, console };
vm.createContext(sandbox);
const sourceFiles = fs.readdirSync(DATA)
  .filter((name) => /^source_enrichment(?:_[a-z0-9-]+)?\.js$/i.test(name))
  .sort();
for (const filename of sourceFiles) {
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
}

function validRef(ref, field) {
  return ref && /^https?:\/\//.test(String(ref.url || ''))
    && Array.isArray(ref.fields) && ref.fields.includes(field)
    && /^\d{4}-\d{2}-\d{2}$/.test(String(ref.checkedAt || ''));
}

function rawDish(item) {
  if (typeof item === 'string') return item.trim();
  if (!item || typeof item !== 'object') return '';
  return String(item.nameZh || item.nameJa || item.name || '').trim();
}

function translate(item) {
  if (item && typeof item === 'object') {
    const zh = String(item.nameZh || '').trim();
    if (zh && /[\u3400-\u9fff]/u.test(zh) && !/[\u3040-\u30ff]/u.test(zh) && zh.length <= 24) {
      return { nameZh: zh, nameOriginal: String(item.nameJa || item.name || zh).trim() || zh, rule: 'retained-nameZh' };
    }
  }
  return translateDishText(rawDish(item));
}

function evidenceItem(item, ref, evidenceClass, sourceField) {
  const translated = translate(item);
  if (!translated) return null;
  return {
    nameZh: translated.nameZh,
    nameJa: translated.nameOriginal,
    provider: String(ref.provider || 'sourceWebsite'),
    sourceUrl: String(ref.url),
    checkedAt: String(ref.checkedAt),
    evidenceClass,
    evidenceRule: `retained:${sourceField}:${translated.rule}`,
    evidenceSnippet: rawDish(item).slice(0, 90)
  };
}

function mergeItem(map, item) {
  if (!item) return;
  const key = `${item.nameZh}|${item.provider}|${item.sourceUrl}|${item.evidenceClass}`;
  const old = map.get(key);
  if (!old || item.checkedAt >= old.checkedAt) map.set(key, item);
}

const pendingMap = new Map();
function addPending(row, value, ref, evidenceClass, sourceField, target) {
  const sourceName = rawDish(value);
  if (!sourceName) return;
  const item = {
    googlePlaceId: row.googlePlaceId,
    restaurantName: row.name || null,
    sourceName,
    sourceLanguageHint: /[\u3040-\u30ff]/u.test(sourceName) ? 'ja' : 'source-native',
    targetField: target === 'recommended' ? 'recommendedDishes' : 'featuredDishes',
    sourceField,
    evidenceClass,
    provider: String(ref.provider || 'sourceWebsite'),
    sourceUrl: String(ref.url),
    checkedAt: String(ref.checkedAt),
    status: 'needs_zh_normalization',
    reason: 'source-backed dish exists but current deterministic dictionary has no Chinese normalization'
  };
  const key = [item.googlePlaceId, item.sourceName, item.provider, item.sourceUrl, item.sourceField].join('|');
  const old = pendingMap.get(key);
  if (!old || item.checkedAt >= old.checkedAt) pendingMap.set(key, item);
}

const byId = new Map();
const stats = {
  sourceFiles: sourceFiles.length,
  sourceRowsScanned: 0,
  rowsWithClaimedDishFields: 0,
  translatedItems: 0,
  skippedUntranslatableItems: 0,
  translationPendingItems: 0,
  recommendationItems: 0,
  featuredItems: 0,
  providerItems: {}
};

for (const row of sandbox.window.RESTAURANTS || []) {
  if (!row?.sourceOnly || !row.googlePlaceId || !row.source) continue;
  stats.sourceRowsScanned += 1;
  const refs = Array.isArray(row.sourceRefs) ? row.sourceRefs : [];
  const fieldSpecs = [
    ['recommendedDishes', 'source_recommendation_text', 'recommended'],
    ['featuredDishes', 'retained_source_menu_item', 'featured'],
    ['dishes', 'retained_source_menu_item', 'featured']
  ];
  let claimed = false;
  for (const [field, evidenceClass, target] of fieldSpecs) {
    const values = Array.isArray(row[field]) ? row[field] : [];
    if (!values.length) continue;
    const matchingRefs = refs.filter((ref) => validRef(ref, field));
    if (!matchingRefs.length) continue;
    claimed = true;
    const state = byId.get(row.googlePlaceId) || {
      googlePlaceId: row.googlePlaceId,
      name: row.name || null,
      recommended: new Map(),
      featured: new Map()
    };
    for (const value of values) {
      let added = false;
      for (const ref of matchingRefs) {
        const item = evidenceItem(value, ref, evidenceClass, field);
        if (!item) {
          addPending(row, value, ref, evidenceClass, field, target);
          continue;
        }
        mergeItem(state[target], item);
        stats.providerItems[item.provider] = (stats.providerItems[item.provider] || 0) + 1;
        added = true;
      }
      if (added) stats.translatedItems += 1;
      else stats.skippedUntranslatableItems += 1;
    }
    byId.set(row.googlePlaceId, state);
  }
  if (claimed) stats.rowsWithClaimedDishFields += 1;
}

// A few historical featured-dish records are stored in FEATURED_DISHES rather
// than directly on the source row. They are accepted only when the matching
// restaurant also has an exact sourceRef claiming `dishes` for the same URL.
const sourceRowsById = new Map();
for (const row of sandbox.window.RESTAURANTS || []) {
  if (!row?.sourceOnly || !row.googlePlaceId) continue;
  if (!sourceRowsById.has(row.googlePlaceId)) sourceRowsById.set(row.googlePlaceId, []);
  sourceRowsById.get(row.googlePlaceId).push(row);
}
for (const patch of sandbox.window.FEATURED_DISHES || []) {
  if (!patch?.googlePlaceId || !/^https?:\/\//.test(String(patch.sourceUrl || ''))) continue;
  const sourceRow = (sourceRowsById.get(patch.googlePlaceId) || []).find((row) =>
    (row.sourceRefs || []).some((ref) => validRef(ref, 'dishes') && String(ref.url) === String(patch.sourceUrl))
  );
  if (!sourceRow) continue;
  const ref = (sourceRow.sourceRefs || []).find((item) => validRef(item, 'dishes') && String(item.url) === String(patch.sourceUrl));
  const state = byId.get(patch.googlePlaceId) || {
    googlePlaceId: patch.googlePlaceId,
    name: sourceRow.name || null,
    recommended: new Map(),
    featured: new Map()
  };
  for (const value of patch.dishes || []) {
    const item = evidenceItem(value, ref, 'retained_source_menu_item', 'featuredDishes');
    if (!item) {
      addPending(sourceRow, value, ref, 'retained_source_menu_item', 'featuredDishes', 'featured');
      continue;
    }
    mergeItem(state.featured, item);
  }
  byId.set(patch.googlePlaceId, state);
}

const rows = [...byId.values()].map((row) => ({
  googlePlaceId: row.googlePlaceId,
  name: row.name,
  recommendedDishes: [...row.recommended.values()].sort((a, b) => b.checkedAt.localeCompare(a.checkedAt)).slice(0, 6),
  featuredDishes: [...row.featured.values()].sort((a, b) => b.checkedAt.localeCompare(a.checkedAt)).slice(0, 6)
})).filter((row) => row.recommendedDishes.length || row.featuredDishes.length)
  .sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));

const pendingRows = [...pendingMap.values()].sort((a, b) =>
  a.googlePlaceId.localeCompare(b.googlePlaceId)
  || a.sourceName.localeCompare(b.sourceName)
  || a.sourceUrl.localeCompare(b.sourceUrl)
);

stats.recommendationRestaurants = rows.filter((row) => row.recommendedDishes.length).length;
stats.featuredRestaurants = rows.filter((row) => row.featuredDishes.length).length;
stats.evidenceRestaurants = rows.length;
stats.recommendationItems = rows.reduce((n, row) => n + row.recommendedDishes.length, 0);
stats.featuredItems = rows.reduce((n, row) => n + row.featuredDishes.length, 0);
stats.translationPendingItems = pendingRows.length;
stats.translationPendingRestaurants = new Set(pendingRows.map((row) => row.googlePlaceId)).size;

const payload = {
  schemaVersion: 4,
  checkedAt: TODAY,
  policy: {
    networkRequests: 0,
    usesRetainedProviderFactsOnly: true,
    recommendationRequiresExplicitSourceField: true,
    ordinaryDishesBecomeFeaturedOnly: true,
    cuisineNameBrandInferenceAllowed: false,
    sourceLanguageMayBeJapanese: true,
    publicCanonicalDishLanguage: 'zh-CN',
    untranslatedSourceDishIsNotMissingDishEvidence: true,
    paidGoogleDataApiCalls: 0
  },
  summary: stats,
  rows
};
const pendingPayload = {
  schemaVersion: 1,
  checkedAt: TODAY,
  policy: {
    sourceBackedOnly: true,
    sourceLanguageMayBeJapanese: true,
    targetLanguage: 'zh-CN',
    networkRequests: 0,
    cuisineNameBrandInferenceAllowed: false,
    note: 'A pending row means source-backed dish evidence exists but Chinese normalization is not yet available; it must not be counted as no dish evidence.'
  },
  summary: {
    pendingItems: pendingRows.length,
    pendingRestaurants: new Set(pendingRows.map((row) => row.googlePlaceId)).size,
    japaneseHintItems: pendingRows.filter((row) => row.sourceLanguageHint === 'ja').length
  },
  rows: pendingRows
};
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
fs.writeFileSync(PENDING_OUTPUT, JSON.stringify(pendingPayload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(stats));
