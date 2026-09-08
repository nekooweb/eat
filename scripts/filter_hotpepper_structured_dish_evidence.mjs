#!/usr/bin/env node
import fs from 'node:fs';

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (!inputPath || !outputPath) throw new Error('Usage: node scripts/filter_hotpepper_structured_dish_evidence.mjs <input.json> <output.json>');

const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
if (payload.policy?.paidGoogleDataApiCalls !== 0 || payload.policy?.hotPepperWebServiceApiCalls !== 0) {
  throw new Error('Hot Pepper structured evidence must remain API-free and zero-paid');
}

const DROP_RULES = [
  { id: 'pancake-over-cake', nameZh: '蛋糕', source: /パンケーキ|ホットケーキ/i },
  { id: 'pancake-not-carbonara', nameZh: '卡邦尼意大利面', source: /パンケーキ|ホットケーキ/i },
  { id: 'pad-kee-mao-not-keema-curry', nameZh: '肉末咖喱', source: /パッキーマオ/i },
  { id: 'non-buckwheat-soba-compound', nameZh: '荞麦面', source: /油そば|まぜそば|オムそば|五目そば|スープそば|沖縄そば|焼きそば|焼そば/i },
  { id: 'sushi-shop-not-sushi-dish', nameZh: '寿司', source: /寿司屋の/i }
];

const SPECIFIC_PAIRS = [
  { id: 'grilled-gyoza-over-gyoza', broad: '饺子', specific: '煎饺', source: /焼き?餃子/i },
  { id: 'tonkotsu-over-ramen', broad: '拉面', specific: '豚骨拉面', source: /豚骨ラーメン/i },
  { id: 'margherita-over-pizza', broad: '披萨', specific: '玛格丽特披萨', source: /マルゲリータ/i },
  { id: 'green-curry-over-curry', broad: '咖喱', specific: '泰式绿咖喱', source: /グリーンカレー/i },
  { id: 'meat-sushi-over-sushi', broad: '寿司', specific: '肉寿司', source: /肉寿司/i }
];

const ruleCounts = {};
let droppedLexicalFalsePositiveItems = 0;
let droppedBroadDuplicateItems = 0;

function sourceText(item) {
  return `${item?.nameJa || ''} ${item?.nameOriginal || ''} ${item?.evidenceSnippet || ''}`;
}

function filterGroup(items) {
  const list = Array.isArray(items) ? items : [];
  const names = new Set(list.map((item) => item?.nameZh).filter(Boolean));
  return list.filter((item) => {
    const text = sourceText(item);
    for (const rule of DROP_RULES) {
      if (item?.nameZh === rule.nameZh && rule.source.test(text)) {
        ruleCounts[rule.id] = (ruleCounts[rule.id] || 0) + 1;
        droppedLexicalFalsePositiveItems += 1;
        return false;
      }
    }
    for (const rule of SPECIFIC_PAIRS) {
      if (item?.nameZh === rule.broad && names.has(rule.specific) && rule.source.test(text)) {
        ruleCounts[rule.id] = (ruleCounts[rule.id] || 0) + 1;
        droppedBroadDuplicateItems += 1;
        return false;
      }
    }
    return true;
  });
}

const rows = [];
for (const row of payload.rows || []) {
  const recommendedDishes = filterGroup(row.recommendedDishes);
  const featuredDishes = filterGroup(row.featuredDishes);
  if (!recommendedDishes.length && !featuredDishes.length) continue;
  rows.push({ ...row, recommendedDishes, featuredDishes });
}

const summary = {
  ...(payload.summary || {}),
  evidenceRestaurantsAfterLexicalFilter: rows.length,
  recommendationRestaurantsAfterLexicalFilter: rows.filter((row) => row.recommendedDishes?.length).length,
  featuredRestaurantsAfterLexicalFilter: rows.filter((row) => row.featuredDishes?.length).length,
  recommendationItemsAfterLexicalFilter: rows.reduce((sum, row) => sum + (row.recommendedDishes?.length || 0), 0),
  featuredItemsAfterLexicalFilter: rows.reduce((sum, row) => sum + (row.featuredDishes?.length || 0), 0),
  droppedLexicalFalsePositiveItems,
  droppedBroadDuplicateItems,
  lexicalFilterRuleCounts: ruleCounts
};

const output = {
  ...payload,
  schemaVersion: Math.max(Number(payload.schemaVersion || 0), 3),
  policy: {
    ...(payload.policy || {}),
    deterministicSourceNativeLexicalConflictFilter: true,
    lexicalFilterDoesNotUseCuisineBrandOrRestaurantNameInference: true,
    lexicalFilterDropsOnlyKnownSubstringConflicts: true
  },
  summary,
  rows
};
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  evidenceRestaurants: rows.length,
  recommendationItems: summary.recommendationItemsAfterLexicalFilter,
  featuredItems: summary.featuredItemsAfterLexicalFilter,
  droppedLexicalFalsePositiveItems,
  droppedBroadDuplicateItems,
  ruleCounts
}));
