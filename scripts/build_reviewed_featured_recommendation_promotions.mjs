#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { RECOMMENDATION_MARKER } from './recommended_dish_extractor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || '/tmp/reviewed-featured-recommendation-promotions.json';

const RULES = [
  {
    googlePlaceId: 'ChIJJS9BPgCNGGAR90vpFuQ1ONU',
    id: 'kochi-sawachi-specialty',
    required: /高知名物！?皿鉢料理/iu,
    nameJa: '皿鉢料理',
    nameZh: '高知皿钵料理'
  },
  {
    googlePlaceId: 'ChIJKyY0j9KNGGARE2VGUX508rs',
    id: 'zaku-yaki-udon-pride',
    required: /当店自慢(?:の)?焼きうどん/iu,
    nameJa: '焼きうどん',
    nameZh: '炒乌冬面'
  },
  {
    googlePlaceId: 'ChIJKyY0j9KNGGARE2VGUX508rs',
    id: 'zaku-sauce-yakisoba-pride',
    required: /当店自慢(?:の)?ソース焼きそば/iu,
    nameJa: 'ソース焼きそば',
    nameZh: '日式酱汁炒面'
  },
  {
    googlePlaceId: 'ChIJSzLrKbeNGGARKfvL5eX_KG8',
    id: 'kougai-basque-cheesecake-specialty',
    required: /(?:バスクチーズケーキ.{0,28}名物デザート|名物デザート.{0,28}バスクチーズケーキ)/iu,
    nameJa: 'バスクチーズケーキ',
    nameZh: '巴斯克芝士蛋糕'
  },
  {
    googlePlaceId: 'ChIJSzLrKbeNGGARKfvL5eX_KG8',
    id: 'kougai-hamburg-popular-specialty',
    required: /(?:開業以来)?人気の名物ハンバーグ/iu,
    nameJa: 'ハンバーグ',
    nameZh: '汉堡排'
  },
  {
    googlePlaceId: 'ChIJv9k8LRuMGGARbldbtpre1oc',
    id: 'uokai-six-sashimi-most-popular',
    required: /本日の刺身六種盛り.{0,55}(?:圧倒的)?一番人気の看板刺身盛り合せ/iu,
    nameJa: '本日の刺身六種盛り',
    nameZh: '六种刺身拼盘'
  },
  {
    googlePlaceId: 'ChIJv9k8LRuMGGARbldbtpre1oc',
    id: 'uokai-aji-fry-popular',
    required: /人気のアジフライ/iu,
    nameJa: 'アジフライ',
    nameZh: '炸竹荚鱼'
  },
  {
    googlePlaceId: 'ChIJr50HJIONGGARU6Hr_LYxRPE',
    id: 'hakata-karaage-recommended',
    required: /鶏の唐揚げ.{0,85}おすすめの逸品/iu,
    nameJa: '鶏の唐揚げ',
    nameZh: '日式炸鸡'
  },
  {
    googlePlaceId: 'ChIJF-2NKGuMGGARTY1IRrHlOh8',
    id: 'versailles-meat-sauce-pride',
    required: /濃厚ミートソーススパゲッティ.{0,85}自慢のミートソース/iu,
    nameJa: '濃厚ミートソーススパゲッティ',
    nameZh: '浓厚肉酱意大利面'
  }
];

function loadWindowFile(filename) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
  return sandbox.window;
}
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }

const runtime = loadWindowFile('google_inventory_runtime.js');
const runtimeRows = runtime.GOOGLE_INVENTORY_RESTAURANTS || [];
const runtimeStats = runtime.GOOGLE_INVENTORY_STATS || {};
if (runtimeStats.catalogTotal !== 2804 || runtimeRows.length !== 1422) throw new Error('Unexpected runtime baseline');
const runtimeById = new Map(runtimeRows.map((row) => [row.googlePlaceId, row]));
const evidence = JSON.parse(fs.readFileSync(path.join(DATA, 'google_inventory_detail_evidence.json'), 'utf8'));
const evidenceById = new Map((evidence.rows || []).map((row) => [row.googlePlaceId, row]));
const grouped = new Map();
const ruleCounts = {};

for (const rule of RULES) {
  const runtimeRow = runtimeById.get(rule.googlePlaceId);
  if (!runtimeRow) throw new Error(`Reviewed promotion target missing from runtime: ${rule.googlePlaceId}`);
  if (Array.isArray(runtimeRow.recommendedDishes) && runtimeRow.recommendedDishes.length) {
    continue;
  }
  const evidenceRow = evidenceById.get(rule.googlePlaceId);
  if (!evidenceRow) throw new Error(`Reviewed promotion target missing evidence: ${rule.googlePlaceId}`);

  const candidates = (evidenceRow.featuredDishes || []).filter((item) => {
    const snippet = clean(item.evidenceSnippet);
    RECOMMENDATION_MARKER.lastIndex = 0;
    return item?.provider === 'Hot Pepper'
      && item?.evidenceClass === 'hotpepper_menu_text'
      && /^https:\/\/www\.hotpepper\.jp\/strJ\d+/iu.test(clean(item.sourceUrl))
      && RECOMMENDATION_MARKER.test(snippet)
      && rule.required.test(snippet);
  });
  if (candidates.length !== 1) {
    throw new Error(`Reviewed promotion rule ${rule.id} matched ${candidates.length} evidence items for ${rule.googlePlaceId}`);
  }
  const source = candidates[0];
  if (!clean(source.checkedAt).match(/^\d{4}-\d{2}-\d{2}$/u)) throw new Error(`Missing checkedAt for ${rule.id}`);
  const out = grouped.get(rule.googlePlaceId) || {
    googlePlaceId: rule.googlePlaceId,
    name: runtimeRow.name,
    recommendedDishes: [],
    featuredDishes: []
  };
  out.recommendedDishes.push({
    nameZh: rule.nameZh,
    nameJa: rule.nameJa,
    provider: 'Hot Pepper',
    sourceUrl: source.sourceUrl,
    checkedAt: source.checkedAt,
    evidenceClass: 'source_recommendation_text',
    evidenceRule: `reviewed-featured-promotion:${rule.id}`,
    evidenceSnippet: clean(source.evidenceSnippet).slice(0, 90)
  });
  grouped.set(rule.googlePlaceId, out);
  ruleCounts[rule.id] = (ruleCounts[rule.id] || 0) + 1;
}

const rows = [...grouped.values()]
  .map((row) => ({ ...row, recommendedDishes: row.recommendedDishes.slice(0, 2) }))
  .sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));
if (rows.some((row) => row.recommendedDishes.length < 1 || row.recommendedDishes.length > 2)) {
  throw new Error('Reviewed promotion output violates 1-2 recommendation limit');
}

const payload = {
  schemaVersion: 1,
  policy: {
    source: 'existing retained Hot Pepper featured evidence only',
    networkRequests: 0,
    paidGoogleDataApiCalls: 0,
    catalogIdentityKey: 'frozen Place ID only',
    toolIdentityNameSource: 'runtime_catalog_name',
    identityMutationAllowed: false,
    explicitRecommendationMarkerInSameSnippetRequired: true,
    sourceNativeConcreteDishInSameSnippetRequired: true,
    reviewedRuleWhitelistRequired: true,
    genericCuisinePromotionAllowed: false,
    automaticDistanceOnlyPromotionAllowed: false
  },
  summary: {
    catalogTotal: 2804,
    publicRuntimeTotal: runtimeRows.length,
    reviewedRules: RULES.length,
    recommendationRestaurants: rows.length,
    recommendationItems: rows.reduce((sum, row) => sum + row.recommendedDishes.length, 0),
    ruleCounts
  },
  rows
};
fs.mkdirSync(path.dirname(path.resolve(OUTPUT)), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(payload.summary));
for (const row of rows) {
  console.log(JSON.stringify({ googlePlaceId: row.googlePlaceId, name: row.name, recommendedDishes: row.recommendedDishes.map((item) => item.nameZh) }));
}
