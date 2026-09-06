#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const POOL = path.join(DATA, 'public_pool_area1.js');
const FACTS = path.join(DATA, 'hotpepper_catalog_facts.json');

function loadPool() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(POOL, 'utf8'), sandbox, { filename: 'public_pool_area1.js' });
  return {
    rows: sandbox.window.PUBLIC_OPEN_RESTAURANTS || [],
    stats: sandbox.window.PUBLIC_POOL_STATS || {}
  };
}

const DISH_RULES = [
  [/ビリヤニ/i, '印度香饭'], [/焼き?鳥|やきとり/i, '烤鸡串'], [/串揚げ|串カツ/i, '炸串'],
  [/唐揚げ|から揚げ|からあげ/i, '炸鸡块'], [/チキン南蛮/i, '南蛮鸡'],
  [/ラーメン|らーめん/i, '拉面'], [/中華そば/i, '中华拉面'], [/つけ麺/i, '蘸面'],
  [/担々麺|担担麺/i, '担担面'], [/油そば/i, '油拌面'], [/蕎麦|そば/i, '荞麦面'],
  [/うどん/i, '乌冬面'], [/カレー/i, '咖喱'], [/ナン/i, '烤饼'],
  [/ステーキ/i, '牛排'], [/ハンバーグ/i, '汉堡排'], [/寿司|すし|鮨/i, '寿司'],
  [/刺身|お造り/i, '刺身'], [/海鮮丼/i, '海鲜丼'], [/うなぎ|鰻/i, '鳗鱼'],
  [/天ぷら|天麩羅/i, '天妇罗'], [/とんかつ|豚カツ/i, '炸猪排'], [/牛カツ/i, '炸牛排'],
  [/牛タン/i, '牛舌'], [/焼肉/i, '烤肉'], [/ホルモン/i, '烤内脏'],
  [/しゃぶしゃぶ/i, '涮涮锅'], [/すき焼き|すきやき/i, '寿喜烧'], [/もつ鍋/i, '牛杂锅'],
  [/餃子/i, '饺子'], [/小籠包/i, '小笼包'], [/麻婆豆腐/i, '麻婆豆腐'],
  [/炒飯|チャーハン/i, '炒饭'], [/パスタ|スパゲッティ/i, '意大利面'], [/ピザ|ピッツァ/i, '披萨'],
  [/オムライス/i, '蛋包饭'], [/グラタン/i, '焗烤'], [/サンドイッチ|サンド/i, '三明治'],
  [/ハンバーガー|バーガー/i, '汉堡'], [/タコス/i, '塔可'], [/ケバブ/i, '烤肉卷'],
  [/フォー/i, '越南河粉'], [/ガパオ/i, '打抛饭'], [/パッタイ/i, '泰式炒河粉'],
  [/サムギョプサル/i, '韩式烤五花肉'], [/チヂミ/i, '韩式煎饼'], [/ビビンバ/i, '石锅拌饭'],
  [/お好み焼き?|お好み焼/i, '御好烧'], [/もんじゃ/i, '文字烧'], [/たこ焼き?|たこ焼/i, '章鱼烧'],
  [/おでん/i, '关东煮'], [/親子丼/i, '亲子丼'], [/牛丼/i, '牛肉饭'], [/天丼/i, '天妇罗丼'],
  [/カツ丼/i, '炸猪排丼'], [/ローストビーフ/i, '烤牛肉'], [/燻製/i, '烟熏料理'],
  [/クロワッサン/i, '可颂'], [/パンケーキ/i, '松饼'], [/ケーキ/i, '蛋糕'],
  [/パフェ/i, '芭菲'], [/プリン/i, '布丁'], [/クレープ/i, '可丽饼'], [/ジェラート/i, '意式冰淇淋']
];

function extractFromCatch(catchText, sourceUrl, checkedAt) {
  const value = String(catchText || '').trim();
  if (!value || !/^https:\/\//.test(String(sourceUrl || ''))) return [];
  const dishes = [];
  const seen = new Set();
  for (const [pattern, nameZh] of DISH_RULES) {
    const match = value.match(pattern);
    if (!match || seen.has(nameZh)) continue;
    seen.add(nameZh);
    dishes.push({
      nameZh,
      nameJa: match[0],
      provider: 'Hot Pepper',
      sourceUrl,
      checkedAt,
      evidenceClass: 'provider_signature_description',
      evidenceText: value.slice(0, 160)
    });
    if (dishes.length >= 2) break;
  }
  return dishes;
}

const { rows, stats } = loadPool();
const payload = JSON.parse(fs.readFileSync(FACTS, 'utf8'));
const checkedAt = payload.checkedAt || new Date().toISOString().slice(0, 10);
const byId = new Map((payload.rows || []).filter((row) => row.googlePlaceId).map((row) => [row.googlePlaceId, row]));

let promotedRestaurants = 0;
let promotedItems = 0;
for (const row of rows) {
  if (row.featuredDishConfidence !== 'reference_hint') continue;
  if (row.dataTier !== 'inventory_source_bound' || !row.googlePlaceId) continue;
  const source = byId.get(row.googlePlaceId);
  const facts = source?.facts || {};
  const sourceUrl = facts.urls?.pc || facts.urls?.mobile || row.sourceUrl || '';
  const dishes = extractFromCatch(facts.catch, sourceUrl, checkedAt);
  if (!dishes.length) continue;
  row.featuredDishes = dishes;
  row.featuredDishConfidence = 'provider_signature_text';
  promotedRestaurants += 1;
  promotedItems += dishes.length;
}

const sourceBacked = rows.filter((row) => Array.isArray(row.featuredDishes) && row.featuredDishes.length);
stats.publicWithSourceBackedFeaturedDishes = sourceBacked.length;
stats.publicFeaturedDishItems = sourceBacked.reduce((sum, row) => sum + row.featuredDishes.length, 0);
stats.hotPepperCatchPromotedRestaurants = promotedRestaurants;
stats.hotPepperCatchPromotedItems = promotedItems;

const output = [
  '// Auto-generated public restaurant pool from retained Hot Pepper bindings and open data.',
  '// Public rows are display/recommendation candidates, not equivalent to canonical Google-verified identities.',
  '// Concrete dishes in the restaurant-level Hot Pepper catch field are retained as provider promotional evidence.',
  `window.PUBLIC_OPEN_RESTAURANTS = ${JSON.stringify(rows)};`,
  `window.PUBLIC_POOL_STATS = ${JSON.stringify(stats)};`,
  ''
].join('\n');
fs.writeFileSync(POOL, output, 'utf8');
console.log(JSON.stringify({
  promotedRestaurants,
  promotedItems,
  publicWithSourceBackedFeaturedDishes: stats.publicWithSourceBackedFeaturedDishes,
  publicFeaturedDishItems: stats.publicFeaturedDishItems
}));
