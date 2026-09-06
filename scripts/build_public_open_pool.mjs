#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(DATA, 'public_pool_area1.js');
const CENTER = { lat: 35.6959, lng: 139.7576 };
const MAX_DISTANCE_M = 1200;
const MIN_ONLINE_TOTAL = 2000;

function readJson(name, fallback = null) {
  const file = path.join(DATA, name);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadJs(name, initialWindow = {}) {
  const file = path.join(DATA, name);
  const sandbox = { window: initialWindow, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: name });
  return sandbox.window;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normName(value) {
  return text(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆.,。!！?？:：/\\]+/g, '');
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const r = 6371000;
  const toRad = (value) => value * Math.PI / 180;
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function finitePriceBand(value) {
  const raw = text(value).replaceAll(',', '').replaceAll('，', '').replaceAll('〜', '～').replaceAll('~', '～');
  const numbers = [...raw.matchAll(/\d+/g)].map((match) => Number(match[0]));
  if (numbers.length < 2) return null;
  const [low, high] = numbers;
  return Number.isFinite(low) && Number.isFinite(high) && low >= 0 && low <= high && high <= 1000000
    ? [low, high]
    : null;
}

function flattenStrings(value, out = []) {
  if (value == null) return out;
  if (typeof value === 'string') {
    if (value.trim()) out.push(value.trim());
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenStrings(item, out);
    return out;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) flattenStrings(item, out);
  }
  return out;
}

const CUISINE_RULES = [
  [/ラーメン|中華そば|つけ麺|ramen|noodle/i, '拉面'],
  [/寿司|すし|鮨|sushi/i, '寿司'],
  [/焼肉|ホルモン|yakiniku|barbecue|bbq/i, '烤肉'],
  [/焼き鳥|焼鳥|yakitori/i, '烤鸡串'],
  [/韓国|korean/i, '韩国菜'],
  [/中華|中国料理|四川|広東|台湾|chinese/i, '中华'],
  [/タイ|thai/i, '泰国菜'],
  [/ベトナム|vietnam/i, '越南菜'],
  [/インド.*ネパール|ネパール|nepal/i, '印度・尼泊尔'],
  [/インド|indian/i, '印度菜'],
  [/イタリア|italian|trattoria|osteria/i, '意大利菜'],
  [/フレンチ|フランス|french|bistro/i, '法国菜'],
  [/スペイン|spanish/i, '西班牙菜'],
  [/メキシコ|mexican|taco/i, '墨西哥菜'],
  [/ステーキ|steak/i, '牛排'],
  [/とんかつ|tonkatsu/i, '炸猪排'],
  [/カレー|curry/i, '咖喱'],
  [/そば|蕎麦|soba/i, '荞麦面'],
  [/うどん|udon/i, '乌冬'],
  [/お好み焼|okonomiyaki/i, '御好烧'],
  [/ハンバーガ|burger/i, '汉堡'],
  [/ピザ|pizza|pizzeria/i, '披萨'],
  [/パン|ベーカリー|bakery|boulanger/i, '面包・烘焙'],
  [/スイーツ|デザート|ケーキ|パフェ|dessert|ice.?cream|confection/i, '甜品'],
  [/カフェ|喫茶|コーヒー|coffee|cafe|tea/i, '咖啡'],
  [/居酒屋|izakaya/i, '居酒屋'],
  [/バー|bar|pub|beer|wine/i, '酒吧'],
  [/和食|日本料理|japanese/i, '日式']
];

function cuisineFor(...values) {
  const haystack = values.flatMap((value) => flattenStrings(value)).join(' ');
  for (const [pattern, cuisine] of CUISINE_RULES) {
    if (pattern.test(haystack)) return cuisine;
  }
  return '餐厅';
}

const DISH_HINTS = new Map([
  ['拉面', ['拉面']],
  ['寿司', ['寿司']],
  ['烤肉', ['烤肉']],
  ['烤鸡串', ['烤鸡串']],
  ['韩国菜', ['韩式料理']],
  ['中华', ['中式料理']],
  ['泰国菜', ['泰式料理']],
  ['越南菜', ['越南料理']],
  ['印度・尼泊尔', ['咖喱・烤饼']],
  ['印度菜', ['印度咖喱']],
  ['意大利菜', ['意大利面・披萨']],
  ['法国菜', ['法式料理']],
  ['西班牙菜', ['西班牙料理']],
  ['墨西哥菜', ['塔可']],
  ['牛排', ['牛排']],
  ['炸猪排', ['炸猪排']],
  ['咖喱', ['咖喱饭']],
  ['荞麦面', ['荞麦面']],
  ['乌冬', ['乌冬面']],
  ['御好烧', ['御好烧']],
  ['汉堡', ['汉堡']],
  ['披萨', ['披萨']],
  ['面包・烘焙', ['面包・烘焙']],
  ['甜品', ['甜品']],
  ['咖啡', ['咖啡・轻食']],
  ['居酒屋', ['居酒屋料理']],
  ['酒吧', ['酒类・下酒菜']],
  ['日式', ['日式料理']],
  ['餐厅', ['店内招牌料理待补全']]
]);

const CHAIN_HINTS = [
  [/マクドナルド|mcdonald/i, ['汉堡・薯条']],
  [/スターバックス|starbucks/i, ['咖啡・星冰乐']],
  [/ドトール|doutor/i, ['咖啡・三明治']],
  [/タリーズ|tully/i, ['咖啡・轻食']],
  [/吉野家/i, ['牛肉饭']],
  [/すき家/i, ['牛肉饭']],
  [/松屋/i, ['牛肉饭・定食']],
  [/なか卯/i, ['亲子丼・乌冬']],
  [/日高屋/i, ['拉面・饺子']],
  [/丸亀製麺/i, ['乌冬面']],
  [/はなまるうどん/i, ['乌冬面']],
  [/餃子の王将|大阪王将/i, ['饺子・中华料理']],
  [/coco.?壱番屋|ココイチ/i, ['咖喱饭']],
  [/サイゼリヤ/i, ['意大利料理']],
  [/ガスト|ジョナサン/i, ['家庭餐厅料理']],
  [/鳥貴族/i, ['烤鸡串']],
  [/モスバーガー|mos burger/i, ['汉堡']],
  [/バーガーキング|burger king/i, ['汉堡']],
  [/ケンタッキー|kfc/i, ['炸鸡']]
];

function dishHintsFor(name, cuisine) {
  for (const [pattern, hints] of CHAIN_HINTS) {
    if (pattern.test(text(name))) return hints;
  }
  return DISH_HINTS.get(cuisine) || ['店内招牌料理待补全'];
}

// Promote a dish to real `featuredDishes` only when Hot Pepper's own current
// descriptive text pairs a food term with explicit signature wording such as
// 自慢 / 名物 / 看板 / おすすめ / 人気 / 絶品 / 専門. Generic cuisine labels do
// not qualify. This keeps `特色菜` materially stronger than taxonomy-only hints.
const HOTPEPPER_SIGNATURE_MARKER = /自慢|名物|看板|おすすめ|オススメ|人気|絶品|こだわり|専門|本格|イチオシ|一押し|必食|推し|売り/i;
const HOTPEPPER_DISH_RULES = [
  [/ビリヤニ/i, '印度香饭'],
  [/焼き?鳥|やきとり/i, '烤鸡串'],
  [/串揚げ|串カツ/i, '炸串'],
  [/唐揚げ|から揚げ|からあげ/i, '炸鸡块'],
  [/チキン南蛮/i, '南蛮鸡'],
  [/ラーメン|らーめん/i, '拉面'],
  [/中華そば/i, '中华拉面'],
  [/つけ麺/i, '蘸面'],
  [/担々麺|担担麺/i, '担担面'],
  [/油そば/i, '油拌面'],
  [/蕎麦|そば/i, '荞麦面'],
  [/うどん/i, '乌冬面'],
  [/カレー/i, '咖喱'],
  [/ナン/i, '烤饼'],
  [/ステーキ/i, '牛排'],
  [/ハンバーグ/i, '汉堡排'],
  [/寿司|すし|鮨/i, '寿司'],
  [/刺身|お造り/i, '刺身'],
  [/海鮮丼/i, '海鲜丼'],
  [/海鮮/i, '海鲜料理'],
  [/うなぎ|鰻/i, '鳗鱼'],
  [/天ぷら|天麩羅/i, '天妇罗'],
  [/とんかつ|豚カツ/i, '炸猪排'],
  [/牛カツ/i, '炸牛排'],
  [/牛タン/i, '牛舌'],
  [/焼肉/i, '烤肉'],
  [/ホルモン/i, '烤内脏'],
  [/しゃぶしゃぶ/i, '涮涮锅'],
  [/すき焼き|すきやき/i, '寿喜烧'],
  [/もつ鍋/i, '牛杂锅'],
  [/鍋/i, '火锅'],
  [/餃子/i, '饺子'],
  [/小籠包/i, '小笼包'],
  [/麻婆豆腐/i, '麻婆豆腐'],
  [/炒飯|チャーハン/i, '炒饭'],
  [/回鍋肉/i, '回锅肉'],
  [/青椒肉絲/i, '青椒肉丝'],
  [/酢豚/i, '糖醋猪肉'],
  [/パスタ|スパゲッティ/i, '意大利面'],
  [/ピザ|ピッツァ/i, '披萨'],
  [/オムライス/i, '蛋包饭'],
  [/ドリア/i, '焗饭'],
  [/グラタン/i, '焗烤'],
  [/サンドイッチ|サンド/i, '三明治'],
  [/ハンバーガー|バーガー/i, '汉堡'],
  [/タコス/i, '塔可'],
  [/ケバブ/i, '烤肉卷'],
  [/フォー/i, '越南河粉'],
  [/ガパオ/i, '打抛饭'],
  [/パッタイ/i, '泰式炒河粉'],
  [/サムギョプサル/i, '韩式烤五花肉'],
  [/チヂミ/i, '韩式煎饼'],
  [/冷麺/i, '冷面'],
  [/ビビンバ/i, '石锅拌饭'],
  [/お好み焼き?|お好み焼/i, '御好烧'],
  [/もんじゃ/i, '文字烧'],
  [/たこ焼き?|たこ焼/i, '章鱼烧'],
  [/おでん/i, '关东煮'],
  [/親子丼/i, '亲子丼'],
  [/牛丼/i, '牛肉饭'],
  [/天丼/i, '天妇罗丼'],
  [/カツ丼/i, '炸猪排丼'],
  [/ローストビーフ/i, '烤牛肉'],
  [/燻製/i, '烟熏料理'],
  [/日替わり定食/i, '每日定食'],
  [/定食/i, '定食'],
  [/クロワッサン/i, '可颂'],
  [/パン/i, '面包'],
  [/ケーキ/i, '蛋糕'],
  [/パフェ/i, '芭菲'],
  [/プリン/i, '布丁'],
  [/クレープ/i, '可丽饼'],
  [/ジェラート|アイスクリーム/i, '冰淇淋'],
  [/コーヒー|珈琲/i, '咖啡']
];

function hotPepperFeaturedDishes(facts, sourceUrl, checkedAt) {
  const clauses = [
    text(facts?.genre?.catch),
    text(facts?.catch),
    text(facts?.freeFood),
    text(facts?.budgetMemo)
  ]
    .filter(Boolean)
    .join('。')
    .split(/[。\n♪！!？?]/)
    .map((value) => value.trim())
    .filter(Boolean);

  const dishes = [];
  const seenZh = new Set();
  for (const clause of clauses) {
    if (!HOTPEPPER_SIGNATURE_MARKER.test(clause)) continue;
    for (const [pattern, nameZh] of HOTPEPPER_DISH_RULES) {
      const match = clause.match(pattern);
      if (!match || seenZh.has(nameZh)) continue;
      seenZh.add(nameZh);
      dishes.push({
        nameZh,
        nameJa: match[0],
        provider: 'Hot Pepper',
        sourceUrl: sourceUrl || null,
        checkedAt: checkedAt || null,
        evidenceClass: 'provider_signature_description',
        evidenceText: clause.slice(0, 160)
      });
      if (dishes.length >= 2) return dishes;
    }
  }
  return dishes;
}

function addressFromOverture(value) {
  const records = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    for (const key of ['freeform', 'address', 'formatted', 'fullAddress', 'full_address']) {
      if (text(record[key])) return text(record[key]);
    }
    const parts = ['region', 'county', 'locality', 'district', 'street', 'houseNumber', 'house_number', 'postcode']
      .map((key) => text(record[key]))
      .filter(Boolean);
    if (parts.length) return [...new Set(parts)].join(' ');
  }
  return '';
}

function canonicalKey(row) {
  return `${normName(row.name)}|${Math.round((row.lat || 0) * 10000)}|${Math.round((row.lng || 0) * 10000)}`;
}

function nearbyDuplicate(row, candidates) {
  const name = normName(row.name);
  if (!name) return false;
  for (const other of candidates) {
    if (normName(other.name) !== name) continue;
    const d = haversineMeters(row.lat, row.lng, other.lat, other.lng);
    if (Number.isFinite(d) && d <= 80) return true;
  }
  return false;
}

const productionWindow = loadJs('production_area1.js', {});
const canonical = Array.isArray(productionWindow.PRODUCTION_RESTAURANTS)
  ? productionWindow.PRODUCTION_RESTAURANTS
  : [];
const canonicalByName = new Map();
for (const row of canonical) {
  const key = normName(row.name);
  if (!key) continue;
  if (!canonicalByName.has(key)) canonicalByName.set(key, []);
  canonicalByName.get(key).push(row);
}

const inventory = readJson('area1_google_ids.json', { googlePlaceIds: [] });
const inventoryIds = new Set(inventory.googlePlaceIds || []);
const canonicalGoogleIds = new Set(canonical.map((row) => row.googlePlaceId).filter(Boolean));
const hpFacts = readJson('hotpepper_catalog_facts.json', { rows: [], checkedAt: null });
const overture = readJson('overture_area1_candidates.json', { rows: [], release: null });
const osmWindow = loadJs('area1_osm.js', { RESTAURANTS: [] });
const osmRows = Array.isArray(osmWindow.RESTAURANTS) ? osmWindow.RESTAURANTS : [];

const publicRows = [];
const seenIds = new Set();
const seenKeys = new Set(canonical.map(canonicalKey));
const sourceCounts = { hotpepperInventory: 0, overture: 0, osm: 0 };

function addPublic(row, sourceBucket) {
  if (!row || !text(row.name) || !Number.isFinite(row.lat) || !Number.isFinite(row.lng)) return false;
  const distanceMeters = Number.isFinite(row.distanceMeters)
    ? row.distanceMeters
    : haversineMeters(CENTER.lat, CENTER.lng, row.lat, row.lng);
  if (!Number.isFinite(distanceMeters) || distanceMeters > MAX_DISTANCE_M) return false;
  const identityKey = text(row.identityKey) || text(row.googlePlaceId) || text(row.openPlaceId) || text(row.id);
  if (!identityKey || seenIds.has(identityKey)) return false;
  const sameNameCanonical = canonicalByName.get(normName(row.name)) || [];
  if (nearbyDuplicate(row, sameNameCanonical) || nearbyDuplicate(row, publicRows)) return false;
  const key = canonicalKey(row);
  if (seenKeys.has(key)) return false;

  const cuisine = text(row.cuisine) || '餐厅';
  const featuredDishes = Array.isArray(row.featuredDishes) ? row.featuredDishes.slice(0, 2) : [];
  const cleaned = {
    id: text(row.id) || `public-${identityKey}`,
    identityKey,
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: text(row.name),
    cuisine,
    tags: Array.isArray(row.tags) && row.tags.length ? row.tags : [cuisine],
    distanceMeters: Math.round(distanceMeters),
    lunch: Array.isArray(row.lunch) ? row.lunch : null,
    dinner: Array.isArray(row.dinner) ? row.dinner : null,
    address: text(row.address),
    lat: row.lat,
    lng: row.lng,
    googlePlaceId: text(row.googlePlaceId) || null,
    googleStatus: text(row.googlePlaceId) ? 'inventory_public' : 'not_applicable',
    identityAdmission: 'open_public_catalog',
    dataTier: text(row.dataTier) || 'open_catalog',
    sources: Array.isArray(row.sources) ? row.sources : [text(row.source)].filter(Boolean),
    source: text(row.source) || 'open_public_catalog',
    sourceUrl: text(row.sourceUrl) || null,
    hoursReference: text(row.hoursReference) || null,
    dishHints: Array.isArray(row.dishHints) && row.dishHints.length
      ? row.dishHints.slice(0, 2)
      : dishHintsFor(row.name, cuisine),
    featuredDishConfidence: featuredDishes.length ? 'provider_signature_text' : 'reference_hint',
    randomWeight: 1,
    hyakumeiten: false
  };
  if (featuredDishes.length) cleaned.featuredDishes = featuredDishes;
  if (row.openPlaceId) cleaned.openPlaceId = row.openPlaceId;
  if (row.openingHoursRaw) cleaned.openingHoursRaw = row.openingHoursRaw;
  seenIds.add(identityKey);
  seenKeys.add(key);
  publicRows.push(cleaned);
  sourceCounts[sourceBucket] += 1;
  return true;
}

for (const row of hpFacts.rows || []) {
  if (!row?.googlePlaceId || canonicalGoogleIds.has(row.googlePlaceId) || !inventoryIds.has(row.googlePlaceId)) continue;
  const facts = row.facts || {};
  if (!text(facts.name) || !Number.isFinite(facts.lat) || !Number.isFinite(facts.lng)) continue;
  const cuisine = cuisineFor(facts.genre, facts.subGenre, facts.catch, facts.name);
  const sourceUrl = facts.urls?.pc || facts.urls?.mobile || '';
  const featuredDishes = hotPepperFeaturedDishes(facts, sourceUrl, hpFacts.checkedAt);
  addPublic({
    id: `public-hp-${row.hotpepperId || row.googlePlaceId}`,
    identityKey: row.googlePlaceId,
    googlePlaceId: row.googlePlaceId,
    name: facts.name,
    cuisine,
    tags: [cuisine],
    address: facts.address || '',
    lat: facts.lat,
    lng: facts.lng,
    dinner: finitePriceBand(facts.budget?.name),
    hoursReference: facts.openingHoursText || null,
    source: 'Hot Pepper',
    sources: ['Hot Pepper'],
    sourceUrl,
    dataTier: 'inventory_source_bound',
    dishHints: dishHintsFor(facts.name, cuisine),
    featuredDishes
  }, 'hotpepperInventory');
}

for (const row of overture.rows || []) {
  if (!text(row?.name) || !Number.isFinite(row?.lat) || !Number.isFinite(row?.lng)) continue;
  const cuisine = cuisineFor(row.basicCategory, row.taxonomy, row.brand, row.name);
  addPublic({
    id: `public-ovt-${row.overtureId}`,
    identityKey: `ovt:${row.overtureId}`,
    openPlaceId: `ovt:${row.overtureId}`,
    name: row.name,
    cuisine,
    tags: [cuisine],
    address: addressFromOverture(row.addresses),
    lat: row.lat,
    lng: row.lng,
    distanceMeters: row.distanceMeters,
    source: 'Overture Maps',
    sources: ['Overture Maps'],
    sourceUrl: Array.isArray(row.websites) ? text(row.websites[0]) : '',
    dataTier: 'open_catalog',
    dishHints: dishHintsFor(row.name, cuisine)
  }, 'overture');
}

for (const row of osmRows) {
  if (!text(row?.name) || !Number.isFinite(row?.lat) || !Number.isFinite(row?.lng)) continue;
  const cuisine = text(row.cuisine) || cuisineFor(row.name);
  addPublic({
    id: `public-${row.id}`,
    identityKey: `osm:${row.sourceId || row.id}`,
    openPlaceId: `osm:${row.sourceId || row.id}`,
    name: row.name,
    cuisine,
    tags: row.tags,
    address: row.address || '',
    lat: row.lat,
    lng: row.lng,
    distanceMeters: row.distanceMeters,
    source: 'OpenStreetMap',
    sources: ['OpenStreetMap'],
    sourceUrl: row.sourceId ? `https://www.openstreetmap.org/${row.sourceId}` : '',
    hoursReference: row.openingHoursRaw || null,
    openingHoursRaw: row.openingHoursRaw || null,
    dataTier: 'open_catalog',
    dishHints: dishHintsFor(row.name, cuisine)
  }, 'osm');
}

publicRows.sort((a, b) => a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name, 'ja'));
const stats = {
  canonicalRows: canonical.length,
  publicRows: publicRows.length,
  totalOnline: canonical.length + publicRows.length,
  sourceCounts,
  googleInventorySourceBoundPublic: publicRows.filter((row) => row.googlePlaceId).length,
  openOnlyPublic: publicRows.filter((row) => !row.googlePlaceId).length,
  publicWithAddress: publicRows.filter((row) => row.address).length,
  publicWithHours: publicRows.filter((row) => row.hoursReference).length,
  publicWithBudget: publicRows.filter((row) => row.lunch || row.dinner).length,
  publicWithDishHints: publicRows.filter((row) => row.dishHints?.length).length,
  publicWithSourceBackedFeaturedDishes: publicRows.filter((row) => row.featuredDishes?.length).length,
  publicFeaturedDishItems: publicRows.reduce((sum, row) => sum + (row.featuredDishes?.length || 0), 0),
  overtureRelease: overture.release || null,
  generatedAt: new Date().toISOString().slice(0, 10)
};

if (stats.totalOnline < MIN_ONLINE_TOTAL) {
  throw new Error(`public online pool below target: ${stats.totalOnline} < ${MIN_ONLINE_TOTAL}`);
}

const output = [
  '// Auto-generated public restaurant pool from retained Hot Pepper bindings and open data.',
  '// Public rows are display/recommendation candidates, not equivalent to canonical Google-verified identities.',
  `window.PUBLIC_OPEN_RESTAURANTS = ${JSON.stringify(publicRows)};`,
  `window.PUBLIC_POOL_STATS = ${JSON.stringify(stats)};`,
  ''
].join('\n');
fs.writeFileSync(OUT, output, 'utf8');
console.log(JSON.stringify(stats));
