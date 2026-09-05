#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { normalizeOpeningHours, validateOpeningHours } from './opening_hours.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const INPUT = process.argv[2] || path.join(ROOT, '_audit', 'official_index_field_candidates.json');
const OUTPUT = process.argv[3] || path.join(DATA, 'source_enrichment_autoofficial.js');
const CHECKED_AT = process.env.AUTO_OFFICIAL_CHECKED_AT || new Date().toISOString().slice(0, 10);
const FOOD_TYPES = new Set(['Restaurant','FoodEstablishment','CafeOrCoffeeShop','Bakery','BarOrPub','FastFoodRestaurant','Store','LocalBusiness']);
const TRUSTED_LOCATOR_HOSTS = new Set([
  'shop.tullys.co.jp',
  'store.starbucks.co.jp',
  'c-united.co.jp',
  'shop.doutor.co.jp',
  'map.torikizoku.co.jp',
  'locations.royalhost.jp',
  'stores.hanamaruudon.com',
  'tenpo.ichibanya.co.jp',
  'shop.saizeriya.co.jp',
  'shop.ufs.co.jp',
  'maps.nakau.co.jp',
  'maps.cocos-jpn.co.jp',
  'map.reins.co.jp',
  'shop.butayama.com',
  'shop.pronto.co.jp',
  'search.daisyo.co.jp',
  'shoplist.teke-teke.com',
  'skylark.co.jp',
  'yomenya-goemon.com',
  'tsukemen-tsujita.com',
  'ginza-renoir.co.jp',
  'stores.yoshinoya.com'
]);
const STALE_OR_EXCEPTION = /(?:臨時|営業時間変更|営業時間を変更|時短|短縮営業|新型コロナ|コロナ|年末年始|特別営業時間|休業のお知らせ|休館日|期間限定)/u;
const DATE_NOTICE = /(?:20(?:1\d|2[0-5])年\s*\d{1,2}月|20(?:1\d|2[0-5])[./-]\d{1,2}[./-]\d{1,2})/u;

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function loadProduction() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read('data/production_area1.js'), sandbox, { filename: 'production_area1.js' });
  return sandbox.window.PRODUCTION_RESTAURANTS || [];
}

function loadResolutions() {
  const files = fs.readdirSync(DATA).filter((f) => /^source_resolution(?:_[a-z0-9-]+)?\.js$/i.test(f)).sort();
  const sandbox = { window: { SOURCE_RESOLUTIONS: [] } };
  vm.createContext(sandbox);
  for (const f of files) vm.runInContext(read(`data/${f}`), sandbox, { filename: f });
  return sandbox.window.SOURCE_RESOLUTIONS || [];
}

function loadExistingAutoOfficial() {
  if (!fs.existsSync(OUTPUT)) return [];
  const sandbox = { window: { RESTAURANTS: [] } };
  vm.createContext(sandbox);
  try {
    vm.runInContext(fs.readFileSync(OUTPUT, 'utf8'), sandbox, { filename: path.basename(OUTPUT) });
    return sandbox.window.RESTAURANTS || [];
  } catch (error) {
    throw new Error(`Cannot load existing auto-official shard: ${error?.message || error}`);
  }
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

function pathSpecific(url) {
  try {
    const u = new URL(url);
    return Boolean(u.pathname.replace(/\/+$/, '').length > 1 || u.search);
  } catch { return false; }
}

function host(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}

function trustedLocatorPage(row) {
  const sourceUrl = row.pageUrl || row.main?.finalUrl;
  return Boolean(
    sourceUrl
    && TRUSTED_LOCATOR_HOSTS.has(host(sourceUrl))
    && pathSpecific(sourceUrl)
    && titleStrongMatch(row.name, row.main?.title)
  );
}

function plausibleAreaAddress(value) {
  const s = String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 140) return null;
  if (!(s.includes('千代田区') || s.includes('文京区'))) return null;
  if (!/\d/.test(s)) return null;
  if (/[。！？]/u.test(s)) return null;
  if (/(?:おすすめ|受賞|雰囲気|お客様|印象|こだわり|訪れる|レストランにも)/u.test(s)) return null;
  return s;
}

function safeHours(value) {
  const s = String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!s || !/\d{1,2}:\d{2}/.test(s) || s.length > 520) return null;
  if (STALE_OR_EXCEPTION.test(s) || DATE_NOTICE.test(s)) return null;
  return s;
}

function safeStructured(row) {
  return (row.main?.structuredFacts || []).filter((fact) =>
    (fact.types || []).some((type) => FOOD_TYPES.has(type)) && nameMatch(row.name, fact.name));
}

function pickStructuredAddress(row) {
  for (const fact of safeStructured(row)) {
    const address = plausibleAreaAddress(fact.address);
    if (address) return address;
  }
  return null;
}

function pickStructuredHours(row) {
  for (const fact of safeStructured(row)) {
    if (!plausibleAreaAddress(fact.address)) continue;
    if (!Array.isArray(fact.openingHours) || !fact.openingHours.length) continue;
    const hours = safeHours(fact.openingHours.join('; '));
    if (!hours) continue;
    const normalized = normalizeOpeningHours(hours, []);
    if (normalized && validateOpeningHours(normalized)) return hours;
  }
  return null;
}

function pickLocatorAddress(row) {
  if (!trustedLocatorPage(row)) return null;
  return plausibleAreaAddress(row.main?.visibleAddress);
}

function pickLocatorHours(row) {
  if (!trustedLocatorPage(row)) return null;
  const hours = safeHours(row.main?.visibleHours);
  if (!hours) return null;
  const normalized = normalizeOpeningHours(hours, []);
  return normalized && validateOpeningHours(normalized) ? hours : null;
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
  for (const fact of safeStructured(row)) {
    const value = cuisineFromStructured(fact.cuisine);
    if (value) return value;
  }
  return null;
}

function compactExisting(row) {
  const out = {
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    cuisine: typeof row.cuisine === 'string' ? row.cuisine : null,
    tags: Array.isArray(row.tags) ? row.tags.filter(Boolean).slice(0, 8) : [],
    address: plausibleAreaAddress(row.address),
    openingHoursRaw: safeHours(row.openingHoursRaw),
    sourceRefs: Array.isArray(row.sourceRefs) ? row.sourceRefs : []
  };
  if (!out.cuisine) out.tags = [];
  return out;
}

function cleanSourceRefs(refs, record) {
  const allowed = new Set(['name']);
  if (record.address) allowed.add('address');
  if (record.openingHoursRaw) allowed.add('hours');
  if (record.cuisine) allowed.add('cuisine');
  const output = [];
  for (const ref of refs || []) {
    if (!ref || ref.provider !== 'official' || typeof ref.url !== 'string') continue;
    const fields = [...new Set((ref.fields || []).filter((field) => allowed.has(field)))];
    if (!fields.length) continue;
    const normalized = { provider:'official', url:ref.url, checkedAt:ref.checkedAt || CHECKED_AT, fields };
    const key = `${normalized.url}|${fields.sort().join(',')}`;
    if (!output.some((item) => `${item.url}|${[...(item.fields || [])].sort().join(',')}` === key)) output.push(normalized);
  }
  return output;
}

function mergeOfficialRef(record, pageUrl, fields) {
  const keep = new Set(fields);
  record.sourceRefs = (record.sourceRefs || []).map((ref) => {
    if (ref.provider !== 'official' || ref.url !== pageUrl) return ref;
    return { ...ref, fields:(ref.fields || []).filter((field) => !keep.has(field)) };
  }).filter((ref) => (ref.fields || []).length);
  record.sourceRefs.push({ provider:'official', url:pageUrl, checkedAt:CHECKED_AT, fields:[...fields] });
}

function js(value) { return JSON.stringify(value).replace(/</g, '\\u003c'); }

const payload = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const production = loadProduction();
const productionById = new Map(production.map((row) => [row.googlePlaceId, row]));
const resolutionIds = new Set(loadResolutions().map((row) => row.googlePlaceId));
const existingRows = loadExistingAutoOfficial();
const existingById = new Map(existingRows.map((row) => [row.googlePlaceId, compactExisting(row)]));
const recordsById = new Map();

let invalidExistingAddressRemoved = 0;
for (const row of existingRows) {
  const compact = compactExisting(row);
  if (row.address && !compact.address) invalidExistingAddressRemoved += 1;
  compact.sourceRefs = cleanSourceRefs(compact.sourceRefs, compact);
  recordsById.set(row.googlePlaceId, compact);
}

let refreshed = 0;
let added = 0;
let preservedOnFetchFailure = 0;
let structuredAddressUpdates = 0;
let structuredHoursUpdates = 0;
let structuredCuisineUpdates = 0;
let locatorAddressUpdates = 0;
let locatorHoursUpdates = 0;

for (const row of payload.results || []) {
  const current = productionById.get(row.googlePlaceId);
  if (!current || resolutionIds.has(row.googlePlaceId)) continue;
  const existing = existingById.get(row.googlePlaceId);

  if (!row.main?.ok || !row.nameMatched) {
    if (existing) preservedOnFetchFailure += 1;
    continue;
  }

  const canOwnAddress = !current.address || Boolean(existing?.address);
  const canOwnHours = !current.openingHours || Boolean(existing?.openingHoursRaw);
  const canOwnCuisine = !current.cuisine || current.cuisine === '餐厅' || Boolean(existing?.cuisine);

  const structuredAddress = canOwnAddress ? pickStructuredAddress(row) : null;
  const locatorAddress = canOwnAddress && !structuredAddress ? pickLocatorAddress(row) : null;
  const address = structuredAddress || locatorAddress;
  const structuredHours = canOwnHours ? pickStructuredHours(row) : null;
  const locatorHours = canOwnHours && !structuredHours ? pickLocatorHours(row) : null;
  const hours = structuredHours || locatorHours;
  const cuisine = canOwnCuisine ? pickCuisine(row) : null;
  const autoFields = [];
  if (address) autoFields.push('address');
  if (hours) autoFields.push('hours');
  if (cuisine) autoFields.push('cuisine');

  const branchSource = autoFields.length || (pathSpecific(row.pageUrl) && titleStrongMatch(row.name, row.main?.title));
  if (!branchSource && !existing) continue;

  const record = recordsById.get(row.googlePlaceId) || {
    googlePlaceId:row.googlePlaceId,
    name:row.name,
    cuisine:null,
    tags:[],
    address:null,
    openingHoursRaw:null,
    sourceRefs:[]
  };
  const wasExisting = recordsById.has(row.googlePlaceId);
  record.name = row.name;

  if (address) {
    record.address = address;
    if (structuredAddress) structuredAddressUpdates += 1;
    else locatorAddressUpdates += 1;
  }
  if (hours) {
    record.openingHoursRaw = hours;
    if (structuredHours) structuredHoursUpdates += 1;
    else locatorHoursUpdates += 1;
  }
  if (cuisine) {
    record.cuisine = cuisine;
    record.tags = [cuisine];
    structuredCuisineUpdates += 1;
  }

  const refFields = ['name', ...autoFields];
  mergeOfficialRef(record, row.pageUrl, refFields);
  record.sourceRefs = cleanSourceRefs(record.sourceRefs, record);
  recordsById.set(row.googlePlaceId, record);
  if (wasExisting) refreshed += 1;
  else added += 1;
}

const records = [...recordsById.values()]
  .filter((row) => productionById.has(row.googlePlaceId) && !resolutionIds.has(row.googlePlaceId))
  .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

const lines = [
  '// Stable high-confidence official-source enrichments generated from independently fetched official pages.',
  '// Automatic promotion requires exact Place ID plus either matching structured data or a trusted branch locator.',
  '// Generic free-text evidence remains review-only. Temporary fetch failure preserves previous reviewed fields.',
  'window.RESTAURANTS.push(',
  ...records.map((record, index) => {
    const props = [
      `id:${js('src-auto-official-' + record.googlePlaceId.slice(-12).replace(/[^A-Za-z0-9_-]/g, ''))}`,
      "profile:'TOKYO'",
      "area:'地区1️⃣'",
      `name:${js(record.name)}`,
      `googlePlaceId:${js(record.googlePlaceId)}`,
      "source:'official'",
      'sourceOnly:true'
    ];
    if (record.cuisine) props.push(`cuisine:${js(record.cuisine)}`, `tags:${js(record.tags)}`);
    if (record.address) props.push(`address:${js(record.address)}`);
    if (record.openingHoursRaw) props.push(`openingHoursRaw:${js(record.openingHoursRaw)}`, 'closedDays:[]', 'closedNote:null');
    props.push(`sourceRefs:${js(record.sourceRefs)}`);
    return `  { ${props.join(', ')} }${index === records.length - 1 ? '' : ','}`;
  }),
  ');',
  ''
];

fs.writeFileSync(OUTPUT, lines.join('\n'), 'utf8');
const summary = {
  records: records.length,
  existingBefore: existingRows.length,
  added,
  refreshed,
  preservedOnFetchFailure,
  structuredAddressUpdates,
  locatorAddressUpdates,
  structuredHoursUpdates,
  locatorHoursUpdates,
  structuredCuisineUpdates,
  invalidExistingAddressRemoved,
  address: records.filter((row) => row.address).length,
  hours: records.filter((row) => row.openingHoursRaw).length,
  cuisine: records.filter((row) => row.cuisine).length,
  nameOnly: records.filter((row) => !row.address && !row.openingHoursRaw && !row.cuisine).length
};
console.log(JSON.stringify(summary));
