#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  classifyPriceRangeRelation,
  collectMealPriceClaims,
  isPriceRange,
  selectMealPriceClaim
} from './price_resolver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const STRONG_PROVIDERS = new Set(['official', 'Tabelog', 'Hot Pepper']);

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

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
const enrichment = sourceSandbox.window.RESTAURANTS || [];

const byPlaceId = new Map();
for (const row of enrichment) {
  if (!row.googlePlaceId) continue;
  if (!byPlaceId.has(row.googlePlaceId)) byPlaceId.set(row.googlePlaceId, []);
  byPlaceId.get(row.googlePlaceId).push(row);
}

function claimsMealPrice(row, meal) {
  if (!row?.sourceOnly) return true;
  return (row.sourceRefs || []).some((ref) => {
    const fields = new Set(Array.isArray(ref?.fields) ? ref.fields : []);
    return fields.has('budget') || fields.has(`${meal}Budget`);
  });
}

const unprovenancedStoredFields = [];
for (const row of enrichment) {
  for (const meal of ['lunch', 'dinner']) {
    if (!isPriceRange(row?.[meal]) || claimsMealPrice(row, meal)) continue;
    unprovenancedStoredFields.push({
      id: row.id || null,
      googlePlaceId: row.googlePlaceId || null,
      name: row.name || null,
      source: row.source || null,
      meal,
      range: row[meal],
      refs: (row.sourceRefs || []).map((ref) => ({
        provider: ref?.provider || null,
        url: ref?.url || null,
        fields: Array.isArray(ref?.fields) ? ref.fields : []
      }))
    });
  }
}

const relations = { exact: 0, strong_overlap: 0, partial_overlap: 0, disjoint: 0 };
const conflicts = [];
let multiStrongMealPeriods = 0;

for (const restaurant of production) {
  const rows = byPlaceId.get(restaurant.googlePlaceId) || [];
  for (const meal of ['lunch', 'dinner']) {
    const claims = collectMealPriceClaims(rows, meal)
      .filter((claim) => STRONG_PROVIDERS.has(claim.provider));
    const providers = new Set(claims.map((claim) => claim.provider));
    if (providers.size < 2) continue;
    multiStrongMealPeriods += 1;
    const selected = selectMealPriceClaim(rows, meal);
    if (!selected || !STRONG_PROVIDERS.has(selected.provider)) continue;
    for (const alternate of claims) {
      if (alternate.row === selected.row) continue;
      const relation = classifyPriceRangeRelation(selected.value, alternate.value);
      if (Object.hasOwn(relations, relation)) relations[relation] += 1;
      if (relation === 'partial_overlap' || relation === 'disjoint') {
        conflicts.push({
          googlePlaceId: restaurant.googlePlaceId,
          name: restaurant.name,
          meal,
          selected: {
            provider: selected.provider,
            range: selected.value,
            checkedAt: selected.checkedAt || null
          },
          alternate: {
            provider: alternate.provider,
            range: alternate.value,
            checkedAt: alternate.checkedAt || null
          },
          relation
        });
      }
    }
  }
}

const report = {
  schemaVersion: 2,
  productionEntities: production.length,
  priceCoverage: {
    lunchKnown: production.filter((row) => isPriceRange(row.lunch)).length,
    dinnerKnown: production.filter((row) => isPriceRange(row.dinner)).length,
    bothKnown: production.filter((row) => isPriceRange(row.lunch) && isPriceRange(row.dinner)).length,
    anyKnown: production.filter((row) => isPriceRange(row.lunch) || isPriceRange(row.dinner)).length,
    lunchMissing: production.filter((row) => !isPriceRange(row.lunch)).length,
    dinnerMissing: production.filter((row) => !isPriceRange(row.dinner)).length
  },
  strongProviderClaims: Object.fromEntries([...STRONG_PROVIDERS].map((provider) => [
    provider,
    enrichment.filter((row) => row.source === provider && (isPriceRange(row.lunch) || isPriceRange(row.dinner))).length
  ])),
  storedPriceProvenance: {
    unprovenancedFieldCount: unprovenancedStoredFields.length,
    unprovenancedFields: unprovenancedStoredFields
  },
  multiStrongMealPeriods,
  relationComparisons: relations,
  materialConflictCount: conflicts.length,
  materialConflicts: conflicts
};

console.log(JSON.stringify(report));
if (process.env.STRICT_PRICE_PROVENANCE === '1' && unprovenancedStoredFields.length) {
  console.error(`PRICE PROVENANCE AUDIT FAIL: ${unprovenancedStoredFields.length} stored meal-price fields lack explicit provenance`);
  process.exit(1);
}
