#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { RECOMMENDATION_MARKER } from './recommended_dish_extractor.mjs';
import { assertRuntimeCatalogContract } from './runtime_catalog_contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || '/tmp/retained-hotpepper-strict-gap-recommendations.json';

// These are source-native concrete dish names recovered by the offline
// recommendation-marker gap audit. Each rule is usable only when the same
// retained Hot Pepper text also contains an explicit recommendation/signature
// marker; no cuisine or restaurant-name inference is permitted.
const STRICT_GAP_RULES = [
  { pattern: /上生ネギタン塩/iu, nameZh: '葱盐牛舌', id: 'upper-raw-negi-tan-shio' },
  { pattern: /鯖黒煮/iu, nameZh: '黑煮青花鱼', id: 'saba-kuroni' }
];

function loadWindowFile(filename) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
  return sandbox.window;
}
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function sourceUrl(row) {
  const value = clean(row?.facts?.urls?.pc || row?.facts?.urls?.mobile);
  return /^https:\/\/www\.hotpepper\.jp\/strJ\d+/iu.test(value) ? value : '';
}
function sourceTexts(row) {
  return [
    ['facts.catch', row?.facts?.catch],
    ['facts.genre.catch', row?.facts?.genre?.catch],
    ['facts.freeFood', row?.facts?.freeFood]
  ].map(([field, value]) => [field, clean(value)]).filter(([, value]) => value);
}

const runtime = loadWindowFile('google_inventory_runtime.js');
const { rows: runtimeRows, stats } = assertRuntimeCatalogContract(runtime);
const gapById = new Map(runtimeRows
  .filter((row) => !Array.isArray(row.recommendedDishes) || row.recommendedDishes.length === 0)
  .map((row) => [row.googlePlaceId, row]));

const catalog = JSON.parse(fs.readFileSync(path.join(DATA, 'hotpepper_catalog_facts.json'), 'utf8'));
const checkedAt = clean(catalog.checkedAt) || '2026-09-06';
const rows = [];
const ruleCounts = {};

for (const sourceRow of catalog.rows || []) {
  const pid = clean(sourceRow.googlePlaceId);
  const runtimeRow = gapById.get(pid);
  const url = sourceUrl(sourceRow);
  if (!runtimeRow || !url) continue;
  const recommended = [];
  const seen = new Set();
  for (const [field, text] of sourceTexts(sourceRow)) {
    RECOMMENDATION_MARKER.lastIndex = 0;
    if (!RECOMMENDATION_MARKER.test(text)) continue;
    for (const rule of STRICT_GAP_RULES) {
      const match = text.match(rule.pattern);
      if (!match || seen.has(rule.nameZh)) continue;
      seen.add(rule.nameZh);
      ruleCounts[rule.id] = (ruleCounts[rule.id] || 0) + 1;
      recommended.push({
        nameZh: rule.nameZh,
        nameJa: match[0],
        provider: 'Hot Pepper',
        sourceUrl: url,
        checkedAt,
        evidenceClass: 'source_recommendation_text',
        evidenceRule: `hotpepper-strict-gap-${field}:${rule.id}`,
        evidenceSnippet: text.slice(0, 90)
      });
    }
  }
  if (!recommended.length) continue;
  rows.push({
    googlePlaceId: pid,
    name: runtimeRow.name,
    recommendedDishes: recommended.slice(0, 2),
    featuredDishes: []
  });
}

rows.sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));
const payload = {
  schemaVersion: 2,
  checkedAt,
  policy: {
    source: 'retained Hot Pepper catalog facts only',
    networkRequests: 0,
    paidGoogleDataApiCalls: 0,
    catalogIdentityKey: 'frozen Place ID only',
    publicRuntimeCountPolicy: 'dynamic; validate runtime stats and public+unpublished catalog reconciliation instead of a fixed named-row count',
    toolIdentityNameSource: 'runtime_catalog_name',
    identityMutationAllowed: false,
    recommendationRequiresExplicitMarker: true,
    recommendationRequiresConcreteSourceNativeDishRule: true,
    cuisineInferenceAllowed: false,
    restaurantNameInferenceAllowed: false,
    automaticGenericPromotionAllowed: false,
    outputOnlyCurrentRecommendationGaps: true,
    zeroGapIsValid: true
  },
  summary: {
    catalogTotal: Number(stats.catalogTotal),
    publicRuntimeTotal: runtimeRows.length,
    recommendationGapRows: gapById.size,
    strictGapRules: STRICT_GAP_RULES.length,
    recommendationRestaurants: rows.length,
    recommendationItems: rows.reduce((sum, row) => sum + row.recommendedDishes.length, 0),
    ruleCounts
  },
  rows
};
fs.mkdirSync(path.dirname(path.resolve(OUTPUT)), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(payload.summary));
for (const row of rows) console.log(JSON.stringify({googlePlaceId: row.googlePlaceId, name: row.name, dishes: row.recommendedDishes.map((x) => x.nameZh)}));
