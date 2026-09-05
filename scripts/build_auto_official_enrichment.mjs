#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const INPUT = process.argv[2] || path.join(ROOT, '_audit', 'official_index_field_candidates.json');
const OUTPUT = process.argv[3] || path.join(DATA, 'source_enrichment_autoofficial.js');
const CHECKED_AT = process.env.AUTO_OFFICIAL_CHECKED_AT || '2026-09-06';
const FOOD_TYPES = new Set(['Restaurant','FoodEstablishment','CafeOrCoffeeShop','Bakery','BarOrPub','FastFoodRestaurant','Store','LocalBusiness']);

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
function loadProduction() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read('data/production_area1.js'), sandbox);
  return sandbox.window.PRODUCTION_RESTAURANTS || [];
}
function loadResolutions() {
  const files = fs.readdirSync(DATA).filter((f) => /^source_resolution(?:_[a-z0-9-]+)?\.js$/i.test(f)).sort();
  const sandbox = { window: { SOURCE_RESOLUTIONS: [] } };
  vm.createContext(sandbox);
  for (const f of files) vm.runInContext(read(`data/${f}`), sandbox, { filename: f });
  return sandbox.window.SOURCE_RESOLUTIONS || [];
}
function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆!！?？.,，。:：/\\]+/g, '');
}
function nameMatch(a, b) {
  const x = normalize(a), y = normalize(b);
  return Boolean(x && y && (x.includes(y) || y.includes(x)));
}
function titleStrongMatch(name, title) {
  const x = normalize(name), y = normalize(title);
  return Boolean(x.length >= 5 && y && (y.includes(x) || (y.length >= 5 && x.includes(y))));
}
function areaAddress(value) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  return (s.includes('千代田区') || s.includes('文京区')) ? s.slice(0, 220) : null;
}
function pathSpecific(url) {
  try {
    const u = new URL(url);
    return Boolean(u.pathname.replace(/\/+$/, '').length > 1 || u.search);
  } catch { return false; }
}
function safeStructured(row) {
  return (row.main?.structuredFacts || []).filter((f) =>
    (f.types || []).some((t) => FOOD_TYPES.has(t)) && nameMatch(row.name, f.name));
}
function pickAddress(row) {
  for (const f of safeStructured(row)) {
    const a = areaAddress(f.address);
    if (a) return a;
  }
  if (normalize(row.name).length >= 5 && row.nameMatched) return areaAddress(row.main?.visibleAddress);
  return null;
}
function pickHours(row) {
  for (const f of safeStructured(row)) {
    if (areaAddress(f.address) && Array.isArray(f.openingHours) && f.openingHours.length) {
      return f.openingHours.join('; ').slice(0, 520);
    }
  }
  return null;
}
function cuisineFromStructured(value) {
  const s = Array.isArray(value) ? value.join(' ') : String(value || '');
  const rules = [
    [/カフェ|喫茶|コーヒー|珈琲|coffee|cafe/i, '咖啡'],
    [/居酒屋|izakaya/i, '居酒屋'],
    [/ラーメン|中華そば|ramen/i, '拉面'],
    [/そば|蕎麦|soba/i, '荞麦面'],
    [/うどん|udon/i, '乌冬'],
    [/カレー|カリー|curry/i, '咖喱'],
    [/中華|中国料理|四川|広東|餃子|chinese/i, '中华'],
    [/インド|ネパール|ビリヤニ|indian|biryani/i, '印度菜'],
    [/イタリアン|パスタ|ピザ|italian|pasta|pizza/i, '意大利菜'],
    [/韓国|korean/i, '韩国菜'],
    [/焼肉|ホルモン|yakiniku/i, '烤肉'],
    [/寿司|鮨|sushi/i, '寿司'],
    [/焼き鳥|やきとり|yakitori/i, '烤鸡'],
    [/とんかつ|豚カツ|tonkatsu/i, '炸猪排'],
    [/ステーキ|steak/i, '牛排'],
    [/天ぷら|天婦羅|tempura/i, '天妇罗'],
    [/バー|bar|pub/i, '酒吧'],
    [/パン|ベーカリー|bakery|bread/i, '面包・烘焙'],
    [/スイーツ|ケーキ|甘味|dessert|sweets/i, '甜品'],
    [/魚介|海鮮|seafood/i, '海鲜'],
    [/定食|食堂/i, '食堂'],
    [/フレンチ|ビストロ|french|bistro/i, '西餐'],
    [/日本料理|和食|割烹|懐石|おでん|japanese/i, '日式']
  ];
  for (const [re, result] of rules) if (re.test(s)) return result;
  return null;
}
function pickCuisine(row) {
  for (const f of safeStructured(row)) {
    const value = cuisineFromStructured(f.cuisine);
    if (value) return value;
  }
  return null;
}
function js(value) { return JSON.stringify(value).replace(/</g, '\\u003c'); }

const payload = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const production = loadProduction();
const productionById = new Map(production.map((r) => [r.googlePlaceId, r]));
const resolutionIds = new Set(loadResolutions().map((r) => r.googlePlaceId));
const records = [];
for (const row of payload.results || []) {
  const current = productionById.get(row.googlePlaceId);
  if (!current || resolutionIds.has(row.googlePlaceId) || !row.main?.ok || !row.nameMatched) continue;
  const fields = [];
  const out = {};
  const address = !current.address ? pickAddress(row) : null;
  if (address) { out.address = address; fields.push('address'); }
  const hours = !current.hoursReference ? pickHours(row) : null;
  if (hours) { out.openingHoursRaw = hours; fields.push('hours'); }
  const cuisine = (!current.cuisine || current.cuisine === '餐厅') ? pickCuisine(row) : null;
  if (cuisine) { out.cuisine = cuisine; out.tags = [cuisine]; fields.push('cuisine'); }
  const branchSource = fields.length || (pathSpecific(row.pageUrl) && titleStrongMatch(row.name, row.main?.title));
  if (!branchSource) continue;
  if (!fields.includes('name')) fields.unshift('name');
  records.push({ googlePlaceId: row.googlePlaceId, name: row.name, pageUrl: row.pageUrl, fields, out });
}
records.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
const lines = [
  '// Auto-reviewed official-source enrichments generated from independently fetched official pages.',
  '// Current hours and cuisine require matching structured data; stale free-text announcements are not promoted.',
  '// Visible addresses require a full-page name match plus an Area1 address and a non-trivial canonical name.',
  '// Only exact production Place IDs are eligible; source-resolution conflicts are skipped.',
  'window.RESTAURANTS.push(',
  ...records.map((r, i) => {
    const props = [
      `id:${js('src-auto-official-' + r.googlePlaceId.slice(-12).replace(/[^A-Za-z0-9_-]/g, ''))}`,
      "profile:'TOKYO'",
      "area:'地区1️⃣'",
      `name:${js(r.name)}`,
      `googlePlaceId:${js(r.googlePlaceId)}`,
      "source:'official'",
      'sourceOnly:true'
    ];
    if (r.out.cuisine) props.push(`cuisine:${js(r.out.cuisine)}`, `tags:${js(r.out.tags)}`);
    if (r.out.address) props.push(`address:${js(r.out.address)}`);
    if (r.out.openingHoursRaw) props.push(`openingHoursRaw:${js(r.out.openingHoursRaw)}`, 'closedDays:[]', 'closedNote:null');
    props.push(`sourceRefs:[{provider:'official',url:${js(r.pageUrl)},checkedAt:${js(CHECKED_AT)},fields:${js(r.fields)}}]`);
    return `  { ${props.join(', ')} }${i === records.length - 1 ? '' : ','}`;
  }),
  ');',
  ''
];
fs.writeFileSync(OUTPUT, lines.join('\n'), 'utf8');
const summary = {
  records: records.length,
  address: records.filter((r) => r.out.address).length,
  hours: records.filter((r) => r.out.openingHoursRaw).length,
  cuisine: records.filter((r) => r.out.cuisine).length,
  nameOnly: records.filter((r) => r.fields.length === 1).length
};
console.log(JSON.stringify(summary));
