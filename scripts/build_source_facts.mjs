#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(DATA, 'source_facts.js');
const DISH_PATCH = path.join(HERE, 'chinese_dish_runtime_patch.js');

const norm = (value) => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆]+/g, '');
const unique = (values) => [...new Set(values.filter((value) => value != null && value !== ''))];
const clone = (value) => JSON.parse(JSON.stringify(value));
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

const maintenanceSandbox = { window: { RESTAURANTS: [] }, console };
vm.createContext(maintenanceSandbox);
const sourceFiles = fs.readdirSync(DATA)
  .filter((filename) => /^source_enrichment(?:_[a-z0-9-]+)?\.js$/i.test(filename))
  .sort();
for (const filename of sourceFiles) {
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), maintenanceSandbox, { filename });
}

const productionSandbox = { window: {}, console };
vm.createContext(productionSandbox);
vm.runInContext(fs.readFileSync(path.join(DATA, 'production_area1.js'), 'utf8'), productionSandbox, {
  filename: 'production_area1.js'
});
const production = productionSandbox.window.PRODUCTION_RESTAURANTS || [];
const productionById = new Map(production.map((row) => [row.googlePlaceId, row]));
const productionIdsByName = new Map();
for (const row of production) {
  const key = norm(row.name);
  if (!key) continue;
  if (!productionIdsByName.has(key)) productionIdsByName.set(key, new Set());
  productionIdsByName.get(key).add(row.googlePlaceId);
}

function resolveProductionId(row) {
  if (row.googlePlaceId && productionById.has(row.googlePlaceId)) return row.googlePlaceId;
  if (row.googlePlaceId) return null;
  const ids = productionIdsByName.get(norm(row.name));
  if (ids?.size === 1) return [...ids][0];
  return null;
}

function sourceRefSummary(row) {
  const refs = Array.isArray(row.sourceRefs) ? row.sourceRefs : [];
  const fields = unique(refs.flatMap((ref) => Array.isArray(ref?.fields) ? ref.fields.map(String) : [])).sort();
  const dates = refs.map((ref) => ref?.checkedAt).filter(validDate).sort();
  const evidenceClasses = unique(refs.map((ref) => ref?.priceEvidenceClass));
  return {
    claimedFields: fields,
    checkedAt: dates.at(-1) || null,
    priceEvidenceClasses: evidenceClasses.length ? evidenceClasses : null
  };
}

const factsById = new Map();
const fieldCounts = {};
const providerCounts = {};
let unattached = 0;

function assign(fact, key, value) {
  if (value == null) return;
  if (Array.isArray(value) && value.length === 0) return;
  if (typeof value === 'string' && !value.trim()) return;
  fact[key] = clone(value);
  fieldCounts[key] = (fieldCounts[key] || 0) + 1;
}

for (const row of maintenanceSandbox.window.RESTAURANTS || []) {
  if (!row?.sourceOnly || !row?.source) continue;
  const googlePlaceId = resolveProductionId(row);
  if (!googlePlaceId) {
    unattached += 1;
    continue;
  }

  const refSummary = sourceRefSummary(row);
  const fact = {
    provider: String(row.source),
    claimedFields: refSummary.claimedFields,
    checkedAt: refSummary.checkedAt
  };
  if (refSummary.priceEvidenceClasses) fact.priceEvidenceClasses = refSummary.priceEvidenceClasses;

  assign(fact, 'sourceName', row.name);
  assign(fact, 'address', row.address);
  assign(fact, 'cuisine', row.cuisine);
  assign(fact, 'tags', row.tags);
  assign(fact, 'lunch', row.lunch);
  assign(fact, 'dinner', row.dinner);
  assign(fact, 'dishes', row.dishes);
  assign(fact, 'recommendedDishes', row.recommendedDishes);
  assign(fact, 'featuredDishes', row.featuredDishes);
  assign(fact, 'openingHoursRaw', row.openingHoursRaw);
  assign(fact, 'closedDays', row.closedDays);
  assign(fact, 'closedNote', row.closedNote);
  assign(fact, 'hyakumeiten', row.hyakumeiten);
  assign(fact, 'hyakumeitenYear', row.hyakumeitenYear);
  assign(fact, 'hyakumeitenCategory', row.hyakumeitenCategory);
  assign(fact, 'priceDerivations', row.priceDerivations);
  assign(fact, 'hotpepperId', row.hotpepperId);
  assign(fact, 'hotpepperMatchConfidence', row.hotpepperMatchConfidence);
  assign(fact, 'hotpepperMatchScore', row.hotpepperMatchScore);

  if (!factsById.has(googlePlaceId)) factsById.set(googlePlaceId, []);
  const facts = factsById.get(googlePlaceId);
  if (facts.some((item) => item.provider === fact.provider)) {
    throw new Error(`duplicate provider facts for ${googlePlaceId}: ${fact.provider}`);
  }
  facts.push(fact);
  providerCounts[fact.provider] = (providerCounts[fact.provider] || 0) + 1;
}

const rows = [...factsById.entries()]
  .map(([googlePlaceId, sourceFacts]) => ({
    googlePlaceId,
    sourceFacts: sourceFacts.sort((a, b) => a.provider.localeCompare(b.provider))
  }))
  .sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));

const dishPatch = fs.readFileSync(DISH_PATCH, 'utf8').trim();
if (!dishPatch.includes("const POLICY = 'relaxed-zh-v2'")) {
  throw new Error('Chinese dish runtime patch is missing its relaxed-zh-v2 marker');
}
if (!dishPatch.includes('genericFallbackAllowed: false')) {
  throw new Error('Chinese dish runtime patch must keep generic fallback disabled');
}

const summary = {
  productionEntities: production.length,
  rowsWithSourceFacts: rows.length,
  providerFactRecords: rows.reduce((sum, row) => sum + row.sourceFacts.length, 0),
  providerCounts,
  fieldCounts,
  unattachedMaintenanceRows: unattached,
  chineseDishRuntimePatch: 'relaxed-zh-v2',
  genericDishFallbackAllowed: false
};

const payload = {
  schemaVersion: 1,
  policy: {
    providerFactsRemainSeparate: true,
    overwritesCanonicalCoreFields: false,
    googleResponseContentExcluded: true,
    reviewTextExcluded: true,
    approximateDishSuggestionsRemainDisplayOnly: true,
    genericDishFallbackAllowed: false
  },
  summary,
  rows
};

const output = [
  '// Auto-generated provider-level maintained source facts. Do not edit directly.',
  `window.SOURCE_FACTS=${JSON.stringify(payload)};`,
  'if (Array.isArray(window.PRODUCTION_RESTAURANTS)) {',
  '  const byId=new Map(window.PRODUCTION_RESTAURANTS.map((row)=>[row.googlePlaceId,row]));',
  '  for (const meta of window.SOURCE_FACTS.rows) {',
  '    const row=byId.get(meta.googlePlaceId);',
  '    if (row) row.sourceFacts=meta.sourceFacts;',
  '  }',
  '}',
  dishPatch,
  ''
].join('\n');

fs.writeFileSync(OUT, output, 'utf8');
console.log(JSON.stringify(summary));
