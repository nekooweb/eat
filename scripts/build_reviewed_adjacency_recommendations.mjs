#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || '/tmp/reviewed-adjacency-recommendations.json';
const AUDIT_RUN_ID = '34372222834';
const CHECKED_AT = '2026-09-09';

const RULES = [
  {
    googlePlaceId: 'ChIJV92zNT6MGGAROru704vXOho',
    id: 'saintmarc-sweetpotato-premium-chococro-recommend',
    sourceUrl: 'https://www.saint-marc-hd.com/saintmarccafe/shop/491/menu/',
    sourceHostSuffix: 'saint-marc-hd.com',
    nameJa: '薫る蜜「芋」Premiumチョコクロ',
    nameZh: '蜜香红薯巧克力可颂',
    markerBlock: 'おすすめ商品',
    adjacentProductBlock: '【期間限定】薫る蜜「芋」Premiumチョコクロ',
    relation: 'recommendation heading immediately followed by exact product block'
  },
  {
    googlePlaceId: 'ChIJ72nZrlqNGGARuIt0IyoUDiU',
    id: 'coco-sweet-pork-curry-recommended-for-mild-kids',
    sourceUrl: 'https://www.ichibanya.co.jp/menu/detail.html?id=1294',
    sourceHostSuffix: 'ichibanya.co.jp',
    nameJa: '甘口ポークカレー',
    nameZh: '甜味猪肉咖喱',
    markerBlock: '辛さが苦手な方や、お子さまにもオススメ！',
    adjacentProductBlock: '甘口ポークカレー',
    relation: 'product-detail title identifies exact dish; recommendation sentence refers to that product'
  },
  {
    googlePlaceId: 'ChIJjy0wVWiMGGARjpbwtjgucmo',
    id: 'houraiya-kuri-yokan-pride',
    sourceUrl: 'https://wagashi.houraiya.co.jp/?page_id=75',
    sourceHostSuffix: 'houraiya.co.jp',
    nameJa: '栗羊羹',
    nameZh: '栗子羊羹',
    markerBlock: 'じっくり練り上げた羊羹の中に、ふんだんに栗が入った当店自慢の一品です。',
    adjacentProductBlock: '『栗羊羹』',
    relation: 'exact product heading immediately precedes same-item pride description'
  }
];

function loadWindowFile(filename) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
  return sandbox.window;
}
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function hostOf(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}
function hostMatchesSuffix(host, suffix) {
  return host === suffix || host.endsWith(`.${suffix}`);
}

const runtime = loadWindowFile('google_inventory_runtime.js');
const runtimeRows = runtime.GOOGLE_INVENTORY_RESTAURANTS || [];
const stats = runtime.GOOGLE_INVENTORY_STATS || {};
if (stats.catalogTotal !== 2804 || runtimeRows.length !== 1422) throw new Error('Unexpected public runtime baseline');
const runtimeById = new Map(runtimeRows.map((row) => [row.googlePlaceId, row]));
const provenance = loadWindowFile('source_provenance.js').SOURCE_PROVENANCE || { rows: [] };
const provenanceById = new Map((provenance.rows || []).map((row) => [row.googlePlaceId, row]));
const official = JSON.parse(fs.readFileSync(path.join(DATA, 'reviewed_official_runtime_sources.json'), 'utf8'));
const officialById = new Map((official.rows || []).map((row) => [row.googlePlaceId, row]));
const nativeOverlay = JSON.parse(fs.readFileSync(path.join(DATA, 'reviewed_native_contact_runtime_overlay.json'), 'utf8'));
const nativeById = new Map((nativeOverlay.rows || []).map((row) => [row.googlePlaceId, row]));

function boundHostsFor(pid, runtimeRow) {
  const hosts = new Set();
  for (const raw of runtimeRow.sourceWebsites || []) {
    const host = hostOf(raw); if (host) hosts.add(host);
  }
  for (const link of provenanceById.get(pid)?.sourceLinks || []) {
    const host = hostOf(link?.url); if (host) hosts.add(host);
  }
  const officialRow = officialById.get(pid);
  for (const raw of [officialRow?.pageUrl, ...(officialRow?.menuUrls || [])]) {
    const host = hostOf(raw); if (host) hosts.add(host);
  }
  const nativeRow = nativeById.get(pid);
  for (const raw of [nativeRow?.sourceUrl, ...(nativeRow?.sourceUrls || [])]) {
    const host = hostOf(raw); if (host) hosts.add(host);
  }
  return hosts;
}

const rows = [];
for (const rule of RULES) {
  const runtimeRow = runtimeById.get(rule.googlePlaceId);
  if (!runtimeRow) throw new Error(`Reviewed adjacency target missing runtime identity: ${rule.googlePlaceId}`);
  if (Array.isArray(runtimeRow.recommendedDishes) && runtimeRow.recommendedDishes.length) {
    throw new Error(`Reviewed adjacency target already has strict recommendations: ${rule.googlePlaceId}`);
  }
  const sourceHost = hostOf(rule.sourceUrl);
  const boundHosts = boundHostsFor(rule.googlePlaceId, runtimeRow);
  if (!sourceHost || !hostMatchesSuffix(sourceHost, rule.sourceHostSuffix)) {
    throw new Error(`Reviewed source URL host mismatch for ${rule.id}: ${sourceHost}`);
  }
  if (![...boundHosts].some((host) => hostMatchesSuffix(host, rule.sourceHostSuffix))) {
    throw new Error(`Reviewed source domain is no longer bound to target identity: ${rule.id}; bound=${[...boundHosts].join(',')}`);
  }
  if (!clean(rule.markerBlock) || !clean(rule.adjacentProductBlock) || !clean(rule.relation)) {
    throw new Error(`Incomplete reviewed adjacency fingerprint: ${rule.id}`);
  }
  rows.push({
    googlePlaceId: rule.googlePlaceId,
    name: runtimeRow.name,
    recommendedDishes: [{
      nameZh: rule.nameZh,
      nameJa: rule.nameJa,
      provider: 'sourceWebsite',
      sourceUrl: rule.sourceUrl,
      checkedAt: CHECKED_AT,
      evidenceClass: 'source_recommendation_text',
      evidenceRule: `reviewed-adjacency:${AUDIT_RUN_ID}:${rule.id}`,
      evidenceSnippet: `${rule.adjacentProductBlock} ｜ ${rule.markerBlock}`.slice(0, 90)
    }],
    featuredDishes: []
  });
}
rows.sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));

const payload = {
  schemaVersion: 1,
  checkedAt: CHECKED_AT,
  policy: {
    sourceAuditRunId: AUDIT_RUN_ID,
    source: 'reviewed bound source page structural adjacency evidence',
    networkRequests: 0,
    paidGoogleDataApiCalls: 0,
    catalogIdentityKey: 'frozen Place ID only',
    toolIdentityNameSource: 'runtime_catalog_name',
    identityMutationAllowed: false,
    sourceDomainMustAlreadyBeBoundToIdentity: true,
    reviewedStructuralAdjacencyRequired: true,
    exactSourceNativeProductRequired: true,
    explicitRecommendationOrPrideMarkerRequired: true,
    automaticAdjacencyPromotionAllowed: false,
    genericCuisinePromotionAllowed: false
  },
  summary: {
    catalogTotal: 2804,
    publicRuntimeTotal: runtimeRows.length,
    auditRunId: AUDIT_RUN_ID,
    reviewedRules: RULES.length,
    recommendationRestaurants: rows.length,
    recommendationItems: rows.length
  },
  rows
};

fs.mkdirSync(path.dirname(path.resolve(OUTPUT)), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(payload.summary));
for (const row of rows) console.log(JSON.stringify({ googlePlaceId: row.googlePlaceId, name: row.name, dish: row.recommendedDishes[0].nameZh }));
