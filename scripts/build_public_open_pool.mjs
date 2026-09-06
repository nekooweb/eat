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
    featuredDishConfidence: 'reference_hint',
    randomWeight: 1,
    hyakumeiten: false
  };
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
    sourceUrl: facts.urls?.pc || facts.urls?.mobile || null,
    dataTier: 'inventory_source_bound',
    dishHints: dishHintsFor(facts.name, cuisine)
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
  addPublic({
    id: `public-${row.id}`,
    identityKey: `osm:${row.sourceId || row.id}`,
    openPlaceId: `osm:${row.sourceId || row.id}`,
    name: row.name,
    cuisine: text(row.cuisine) || cuisineFor(row.name),
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
    dishHints: dishHintsFor(row.name, text(row.cuisine) || cuisineFor(row.name))
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
