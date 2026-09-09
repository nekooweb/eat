#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(ROOT, '_audit', 'legacy-pr16-gap-batch.json');

const legacy = [
  { id:'ChIJu7qJqhyMGGARbJMAT8uPgtY', name:'トラットリア リトルマルコ', urls:['https://daiwa-j.com/brands/trattorialittlemarco/','https://page.line.me/zgq3900x'], claims:['cuisine','address','budget','dishes','hours','closure'], dishes:['US産サーロインステーキ'] },
  { id:'ChIJJ1RwYAOMGGARr5m-pugtpzE', name:'神田 旬菜 ちょいす', urls:['https://choice.foodre.jp/'], claims:['cuisine','address','hours','closure'], dishes:[] },
  { id:'ChIJ9zuhtByMGGARx4--ZNpSWJc', name:'ぼたん', urls:['https://www.sukiyaki-botan.jp/honten','https://sukiyaki-botan.owst.jp/'], claims:['cuisine','address','budget','dishes'], dishes:['鳥すきやき'] },
  { id:'ChIJT9HCuRyMGGARqIt735A6L1k', name:'東京豆花工房', urls:['https://visit-chiyoda.tokyo/app/spot/detail/908'], claims:['cuisine','address','dishes','hours','closure'], dishes:['原味豆花','東京豆花'] },
  { id:'ChIJQ3MESwOMGGARX99d47o0V6k', name:'神田まつや', urls:['https://visit-chiyoda.tokyo/app/spot/detail/359'], claims:['cuisine','address','dishes','hours','closure'], dishes:['もりそば','かしわ南蛮そば'] },
  { id:'ChIJX-yVohyMGGARUTdpnpXyQNQ', name:'かんだやぶそば', urls:['https://visit-chiyoda.tokyo/app/spot/detail/382'], claims:['cuisine','address','dishes','hours','closure'], dishes:['そばとろ','鴨せいろうそば'] },
  { id:'ChIJa-BaVhuMGGARouYQYPE4Zfo', name:'神田志乃多寿司', urls:['https://visit-chiyoda.tokyo/app/spot/detail/365'], claims:['cuisine','address','dishes','hours','closure'], dishes:['稲荷寿司','のり巻'] },
  { id:'ChIJo5orgxyMGGARW6EJMAe0WOE', name:'博多もつ鍋やまや 御茶ノ水ワテラス店', urls:['https://www.restaurant-yamaya.com/brand/motsu/restaurant/ochanomizu_w'], claims:['cuisine','address','dishes','hours','closure'], dishes:['博多もつ鍋','名物 ごまさば'] },
  { id:'ChIJjX2UEKaNGGARqhp9myAPFiw', name:'RESTAURANT MOROCCO TOKYO', urls:['https://visit-chiyoda.tokyo/app/spot/detail/789'], claims:['cuisine','address','dishes','hours','closure'], dishes:['タジン鍋','クスクス'] },
  { id:'ChIJ34CgHASMGGARG5poMVhiB1w', name:'塩生姜らー麺専門店 MANNISH 淡路町本店', urls:['https://tabelog.com/tokyo/A1310/A131002/13231004/','https://tokyoramenoftheyear.com/ja/shop/shop-00300'], claims:['cuisine','address','budget','dishes','hours','closure'], dishes:['塩生姜らー麺'] },
  { id:'ChIJC69wrxyMGGARRfwOxHOPJUc', name:'松榮亭', urls:['https://tabelog.com/tokyo/A1310/A131002/13000349/'], claims:['cuisine','address','budget','hours','closure'], dishes:[] },
  { id:'ChIJib0TiByMGGARoxZpQdO40dM', name:'エル・チャテオ・デル・プエンテ', urls:['https://tabelog.com/tokyo/A1310/A131002/13040507/'], claims:['cuisine','address','budget','hours','closure'], dishes:[] },
  { id:'ChIJH45U0y2NGGARFO8F9X8I1nA', name:'海上菜館', urls:['https://kaijyousaikan.foodre.jp/'], claims:['cuisine','address','dishes','hours','closure'], dishes:['焼き餃子','パーコー麺'] },
  { id:'ChIJZW-28RuMGGARyK-E3vgwKic', name:'泡貝', urls:['https://awashell.com/'], claims:['cuisine','address','dishes','hours','closure'], dishes:['シェルアンドチップス','生牡蠣'] },
  { id:'ChIJlZV_LwqNGGARYv0gSCBaRi4', name:'BAR ANAMI', urls:['https://bar-navi.suntory.co.jp/shop/S000007547/'], claims:['cuisine','address','budget'], dishes:[] },
  { id:'ChIJ62feckGMGGARv9xYxwMWrnU', name:'ファリーヌ キムラヤ', urls:['https://tabelog.com/tokyo/A1309/A130905/13033057/'], claims:['cuisine','address','budget','hours','closure'], dishes:[] },
  { id:'ChIJ0W7HkgOMGGARSdJEu-NnDB4', name:'八ツ手屋', urls:['https://tabelog.com/tokyo/A1310/A131002/13000382/'], claims:['cuisine','address','budget','hours','closure'], dishes:[] }
];

function loadWindowFile(file) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: path.basename(file) });
  return sandbox.window;
}

function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function urlKey(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    return `${url.hostname.toLowerCase().replace(/^www\./,'')}${url.pathname.replace(/\/+$/,'') || '/'}`;
  } catch { return clean(value); }
}
function isRange(value) { return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite); }
function hasHours(row) {
  return Boolean(clean(row?.openingHours) || clean(row?.openingHoursRaw) || clean(row?.hoursRaw)
    || (Array.isArray(row?.openingHours) && row.openingHours.length)
    || (Array.isArray(row?.schedule) && row.schedule.length));
}
function currentDishStrings(row) {
  const out = [];
  for (const value of row?.recommendedDishes || []) if (clean(value)) out.push(clean(value));
  for (const value of row?.featuredDishes || []) {
    if (typeof value === 'string' && clean(value)) out.push(clean(value));
    else if (value && typeof value === 'object') {
      for (const key of ['nameJa','nameOriginal','nameZh','name']) if (clean(value[key])) out.push(clean(value[key]));
    }
  }
  return [...new Set(out)];
}

const runtimeWindow = loadWindowFile(path.join(DATA, 'google_inventory_runtime.js'));
const runtimeRows = Array.isArray(runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS) ? runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS : [];
const runtimeStats = runtimeWindow.GOOGLE_INVENTORY_STATS || {};
const provenanceWindow = loadWindowFile(path.join(DATA, 'source_provenance.js'));
const provenanceRows = Array.isArray(provenanceWindow.SOURCE_PROVENANCE?.rows) ? provenanceWindow.SOURCE_PROVENANCE.rows : [];
const reviewedOfficial = JSON.parse(fs.readFileSync(path.join(DATA, 'reviewed_official_runtime_sources.json'), 'utf8'));
const officialIndex = JSON.parse(fs.readFileSync(path.join(DATA, 'official_candidate_index.json'), 'utf8'));

if (runtimeStats.catalogTotal !== 2804 || runtimeStats.inventoryTotal !== runtimeRows.length || runtimeRows.length < 3) {
  throw new Error('Legacy PR16 audit requires current complete public runtime');
}

const runtimeById = new Map(runtimeRows.map((row) => [row.googlePlaceId, row]));
const provenanceById = new Map(provenanceRows.map((row) => [row.googlePlaceId, row]));
const reviewedById = new Map((reviewedOfficial.rows || []).map((row) => [row.googlePlaceId, row]));
const indexById = new Map((officialIndex.records || []).map((row) => [row.googlePlaceId, row]));

const rows = [];
for (const old of legacy) {
  const current = runtimeById.get(old.id) || null;
  const provenance = provenanceById.get(old.id) || null;
  const reviewed = reviewedById.get(old.id) || null;
  const index = indexById.get(old.id) || null;
  const currentUrls = new Set();
  for (const raw of current?.sourceWebsites || []) currentUrls.add(urlKey(raw));
  for (const link of provenance?.sourceLinks || []) currentUrls.add(urlKey(link.url));
  for (const raw of reviewed?.sourceWebsites || []) currentUrls.add(urlKey(raw));
  for (const raw of reviewed?.menuUrls || []) currentUrls.add(urlKey(raw));
  if (reviewed?.pageUrl) currentUrls.add(urlKey(reviewed.pageUrl));
  if (index?.pageUrl) currentUrls.add(urlKey(index.pageUrl));
  for (const raw of index?.menuUrls || []) currentUrls.add(urlKey(raw));

  const sourceRetention = old.urls.map((url) => ({ url, retained: currentUrls.has(urlKey(url)) }));
  const claimed = new Set(provenance?.sourceClaimedFields || []);
  const dishes = currentDishStrings(current || {});
  const fieldState = {
    cuisine: Boolean(clean(current?.cuisine)) || claimed.has('cuisine'),
    address: Boolean(clean(current?.address)) || claimed.has('address'),
    budget: isRange(current?.lunch) || isRange(current?.dinner) || claimed.has('budget') || claimed.has('lunchBudget') || claimed.has('dinnerBudget'),
    dishes: dishes.length > 0 || claimed.has('dishes'),
    hours: hasHours(current) || claimed.has('hours'),
    closure: claimed.has('closure') || Boolean(clean(current?.closedNote)) || (Array.isArray(current?.closedDays) && current.closedDays.length > 0)
  };
  const missingClaims = old.claims.filter((field) => !fieldState[field]);
  const missingLegacyUrls = sourceRetention.filter((item) => !item.retained).map((item) => item.url);

  rows.push({
    googlePlaceId: old.id,
    legacyName: old.name,
    currentName: current?.name || null,
    published: Boolean(current),
    basicInfoState: current?.basicInfoState || null,
    currentFields: {
      cuisine: current?.cuisine ?? null,
      address: current?.address ?? null,
      lunch: current?.lunch ?? null,
      dinner: current?.dinner ?? null,
      openingHours: current?.openingHours ?? current?.openingHoursRaw ?? current?.hoursRaw ?? null,
      closedDays: current?.closedDays ?? null,
      recommendedDishes: current?.recommendedDishes ?? [],
      featuredDishes: current?.featuredDishes ?? []
    },
    sourceClaimedFields: provenance?.sourceClaimedFields || [],
    currentSourceLinks: (provenance?.sourceLinks || []).map((link) => ({ provider: link.provider, url: link.url, fields: link.fields || [] })),
    reviewedOfficialSource: reviewed ? { officialName: reviewed.officialName, pageUrl: reviewed.pageUrl, sourceWebsites: reviewed.sourceWebsites || [], menuUrls: reviewed.menuUrls || [] } : null,
    officialCandidate: index ? { name: index.name, pageUrl: index.pageUrl, menuUrls: index.menuUrls || [] } : null,
    legacyClaims: old.claims,
    legacyDishes: old.dishes,
    sourceRetention,
    missingLegacyUrls,
    missingClaims,
    migrationCandidate: !current || missingLegacyUrls.length > 0 || missingClaims.length > 0
  });
}

const migrationCandidates = rows.filter((row) => row.migrationCandidate);
const payload = {
  schemaVersion: 1,
  auditedAt: new Date().toISOString(),
  policy: {
    auditOnly: true,
    runtimeMutations: 0,
    identityMutations: 0,
    dishMutations: 0,
    paidGoogleDataApiCalls: 0,
    legacyBranchMayNotBeMergedDirectly: true
  },
  summary: {
    catalogTotal: runtimeStats.catalogTotal,
    publicRuntimeTotal: runtimeRows.length,
    legacyRows: legacy.length,
    publishedLegacyRows: rows.filter((row) => row.published).length,
    rowsWithAllLegacyUrlsRetained: rows.filter((row) => row.sourceRetention.every((item) => item.retained)).length,
    rowsWithMissingLegacyUrls: rows.filter((row) => row.missingLegacyUrls.length).length,
    rowsWithMissingClaims: rows.filter((row) => row.missingClaims.length).length,
    migrationCandidateRows: migrationCandidates.length
  },
  rows,
  migrationCandidates
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(payload.summary));
console.log('MIGRATION_CANDIDATES=' + JSON.stringify(migrationCandidates.map((row) => ({
  googlePlaceId: row.googlePlaceId,
  currentName: row.currentName,
  missingLegacyUrls: row.missingLegacyUrls,
  missingClaims: row.missingClaims,
  currentSourceLinks: row.currentSourceLinks,
  currentDishes: [...(row.currentFields.recommendedDishes || []), ...(row.currentFields.featuredDishes || [])]
})), null, 2));
