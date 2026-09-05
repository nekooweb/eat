#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const productionSandbox = { window: {} };
vm.createContext(productionSandbox);
vm.runInContext(read('data/production_area1.js'), productionSandbox, { filename: 'production_area1.js' });
const production = productionSandbox.window.PRODUCTION_RESTAURANTS || [];

const enrichmentFiles = fs.readdirSync(DATA)
  .filter((filename) => /^source_enrichment(?:_[a-z0-9-]+)?\.js$/i.test(filename))
  .sort();
const sourceSandbox = { window: { RESTAURANTS: [] } };
vm.createContext(sourceSandbox);
for (const filename of enrichmentFiles) {
  vm.runInContext(read(`data/${filename}`), sourceSandbox, { filename });
}
const enrichments = sourceSandbox.window.RESTAURANTS || [];

const sourceById = new Map();
for (const row of enrichments) {
  if (!row.googlePlaceId) continue;
  if (!sourceById.has(row.googlePlaceId)) sourceById.set(row.googlePlaceId, []);
  sourceById.get(row.googlePlaceId).push(row);
}

function dishSources(placeId) {
  const refs = [];
  for (const row of sourceById.get(placeId) || []) {
    for (const ref of row.sourceRefs || []) {
      if (!(ref.fields || []).includes('dishes')) continue;
      refs.push({ provider: ref.provider, url: ref.url, checkedAt: ref.checkedAt });
    }
  }
  const seen = new Set();
  return refs.filter((ref) => {
    const key = `${ref.provider}|${ref.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const candidates = production
  .filter((row) => Array.isArray(row.dishes) && row.dishes.length)
  .map((row) => ({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    cuisine: row.cuisine,
    legacyDishes: row.dishes,
    featuredDishes: Array.isArray(row.featuredDishes) ? row.featuredDishes : [],
    strictRecommendations: Array.isArray(row.recommendedDishes) ? row.recommendedDishes : [],
    sources: dishSources(row.googlePlaceId)
  }))
  .filter((row) => row.sources.length)
  .sort((a, b) => Number(Boolean(a.featuredDishes.length)) - Number(Boolean(b.featuredDishes.length)) || a.name.localeCompare(b.name, 'ja'));

const missingFeatured = candidates.filter((row) => !row.featuredDishes.length);
const report = {
  productionEntities: production.length,
  sourceBackedLegacyDishRows: candidates.length,
  featuredChineseComplete: candidates.filter((row) => row.featuredDishes.length).length,
  strictRecommendationRowsWithinLegacy: candidates.filter((row) => row.strictRecommendations.length).length,
  sourceBackedDishRowsMissingFeaturedChinese: missingFeatured.length,
  uniqueLegacyDishNamesMissingFeatureReview: [...new Set(missingFeatured.flatMap((row) => row.legacyDishes))].sort((a, b) => a.localeCompare(b, 'ja')),
  candidates: missingFeatured
};

console.log(JSON.stringify(report));
