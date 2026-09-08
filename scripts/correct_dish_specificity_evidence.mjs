#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DEFAULT_INPUT = path.join(ROOT, 'data', 'google_inventory_detail_evidence.json');
const INPUT = process.argv[2] || DEFAULT_INPUT;
const OUTPUT = process.argv[3] || INPUT;

const RULES = [
  {
    id: 'teppan-yakisoba-over-soba',
    currentNameZh: '荞麦面',
    sourcePattern: /鉄板焼(?:き)?そば/i,
    correctedNameZh: '铁板炒面'
  },
  {
    id: 'yakisoba-over-soba',
    currentNameZh: '荞麦面',
    sourcePattern: /焼きそば|焼そば/i,
    correctedNameZh: '炒面'
  },
  {
    id: 'meat-sushi-over-sushi',
    currentNameZh: '寿司',
    sourcePattern: /肉寿司/i,
    correctedNameZh: '肉寿司'
  }
];

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sourceText(item) {
  return clean([
    item?.nameJa,
    item?.nameOriginal,
    item?.evidenceSnippet
  ].filter(Boolean).join(' '));
}

function correctItem(item, counts) {
  if (!item || typeof item !== 'object') return item;
  const source = sourceText(item);
  if (!source || !clean(item.nameZh)) return item;

  for (const rule of RULES) {
    if (item.nameZh !== rule.currentNameZh || !rule.sourcePattern.test(source)) continue;
    counts[rule.id] = (counts[rule.id] || 0) + 1;
    const oldRule = clean(item.evidenceRule);
    return {
      ...item,
      nameZh: rule.correctedNameZh,
      evidenceRule: oldRule.startsWith(`specificity:${rule.id}:`)
        ? oldRule
        : `specificity:${rule.id}:${oldRule || 'source-native-composite-term'}`,
      specificityCorrection: {
        rule: rule.id,
        previousNameZh: rule.currentNameZh,
        sourceNativeCompositeRequired: true
      }
    };
  }
  return item;
}

function dedupe(items) {
  const map = new Map();
  for (const item of items || []) {
    if (!item?.nameZh || !item?.sourceUrl) continue;
    const key = [
      item.nameZh,
      item.provider || '',
      item.sourceUrl,
      item.evidenceClass || ''
    ].join('|');
    const old = map.get(key);
    if (!old || clean(item.checkedAt) >= clean(old.checkedAt)) map.set(key, item);
  }
  return [...map.values()];
}

const doc = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
if (doc.policy?.paidGoogleDataApiCalls !== 0) {
  throw new Error('Dish specificity correction requires zero-paid-API evidence input');
}
if (!Array.isArray(doc.rows)) throw new Error('Invalid detail evidence rows');

const counts = {};
let correctedRestaurants = 0;
let correctedItems = 0;
let duplicateItemsRemoved = 0;

for (const row of doc.rows) {
  let rowChanged = false;
  for (const field of ['recommendedDishes', 'featuredDishes']) {
    const before = Array.isArray(row[field]) ? row[field] : [];
    const corrected = before.map((item) => {
      const next = correctItem(item, counts);
      if (next !== item) {
        correctedItems += 1;
        rowChanged = true;
      }
      return next;
    });
    const after = dedupe(corrected);
    duplicateItemsRemoved += corrected.length - after.length;
    row[field] = after;
  }
  if (rowChanged) correctedRestaurants += 1;
}

const totalRecommendations = doc.rows.reduce((sum, row) => sum + (row.recommendedDishes || []).length, 0);
const totalFeatured = doc.rows.reduce((sum, row) => sum + (row.featuredDishes || []).length, 0);
doc.policy = {
  ...(doc.policy || {}),
  dishSpecificityCorrection: 'source-native-composite-v1',
  dishSpecificityCorrectionUsesSourceNativeEvidenceOnly: true,
  dishSpecificityCorrectionCuisineInferenceAllowed: false,
  dishSpecificityCorrectionBrandInferenceAllowed: false,
  dishSpecificityCorrectionPaidGoogleDataApiCalls: 0
};
doc.summary = {
  ...(doc.summary || {}),
  specificityCorrection: {
    correctedRestaurants,
    correctedItems,
    duplicateItemsRemoved,
    ruleCounts: counts,
    recommendationItemsAfterCorrection: totalRecommendations,
    featuredItemsAfterCorrection: totalFeatured
  }
};

fs.writeFileSync(OUTPUT, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  status: 'pass',
  correctedRestaurants,
  correctedItems,
  duplicateItemsRemoved,
  ruleCounts: counts,
  recommendationItemsAfterCorrection: totalRecommendations,
  featuredItemsAfterCorrection: totalFeatured,
  paidGoogleDataApiCalls: 0,
  identityChanges: 0
}));
