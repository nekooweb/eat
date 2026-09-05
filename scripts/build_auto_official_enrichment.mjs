#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const INPUT = process.argv[2] || path.join(ROOT, '_audit', 'official_index_field_candidates.json');
const OUTPUT = process.argv[3] || path.join(DATA, 'source_enrichment_auto_official.js');
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
  return areaAddress(row.main?.visibleAddress);
}
function pickHours(row, address) {
  for (const f of safeStructured(row)) {
    if (Array.isArray(f.openingHours) && f.openingHours.length && (areaAddress(f.address) || pathSpecific(row.pageUrl))) {
      return f.openingHours.join('; ').slice(0, 520);
    }
  }
  if (row.main?.visibleHours && (address || pathSpecific(row.pageUrl))) return String(row.main.visibleHours).slice(0, 520);
  return null;
}
function pickCuisine(row, address) {
  const value = row.main?.visibleCuisine || null;
  if (!value) return null;
  if (address || safeStructured(row).length) return value;
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
  const hours = !current.hoursReference ? pickHours(row, address) : null;
  if (hours) { out.openingHoursRaw = hours; fields.push('hours'); }
  const cuisine = (!current.cuisine || current.cuisine === '餐厅') ? pickCuisine(row, address) : null;
  if (cuisine) { out.cuisine = cuisine; out.tags = [cuisine]; fields.push('cuisine'); }
  const branchSource = fields.length || (pathSpecific(row.pageUrl) && normalize(row.main.title || '').includes(normalize(row.name)));
  if (!branchSource) continue;
  if (!fields.includes('name')) fields.unshift('name');
  records.push({ googlePlaceId: row.googlePlaceId, name: row.name, pageUrl: row.pageUrl, fields, out });
}
records.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
const lines = [
  '// Auto-reviewed official-source enrichments generated from independently fetched official pages.',
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
