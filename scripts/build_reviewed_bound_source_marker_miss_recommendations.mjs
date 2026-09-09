#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || '/tmp/reviewed-bound-source-marker-miss-recommendations.json';
const AUDIT_RUN_ID = '34371635502';
const CHECKED_AT = '2026-09-09';

const RULES = [
  {
    googlePlaceId: 'ChIJ3wcsHh2MGGAR-BCRlpETRq0',
    id: 'menya-musashi-chashu-bacon-pride',
    sourceUrl: 'https://menya634.co.jp/storelist/akihabara2/',
    marker: '自慢',
    nameJa: 'チャーシューベーコン',
    nameZh: '叉烧培根',
    evidenceSnippet: '特製のチャーシューダレに豚バラ肉を数日漬け込み、絶妙な火加減でスモークします。チャーシューでもない、ベーコンでもない、それがチャーシューベーコンです。自慢のチャーシューベーコン、是非お楽しみ下さい'
  },
  {
    googlePlaceId: 'ChIJz8qC-w2MGGARG3sp7CYG-ko',
    id: 'myojinmaru-waraya-katsuo-specialty',
    sourceUrl: 'https://shop.myojinmaru.jp/shop/takebashi/',
    marker: '名物',
    nameJa: 'わら焼き鰹たたき',
    nameZh: '稻草炙烤鲣鱼',
    evidenceSnippet: '明神丸名物のわら焼き鰹たたきや、高知産の食材を使用した土佐料理などお楽しみいただけます。'
  },
  {
    googlePlaceId: 'ChIJs1M2cgCNGGARriJT0eDqUkg',
    id: 'miyakoshi-european-blend-monthly-recommendation',
    sourceUrl: 'https://www.miyakoshiya-coffee.co.jp/news/archives/207',
    marker: 'おすすめ',
    nameJa: 'ヨーロピアンブレンド',
    nameZh: '欧式拼配咖啡',
    evidenceSnippet: '9月のおすすめ豆は、ヨーロピアンブレンドです。'
  },
  {
    googlePlaceId: 'ChIJ4V7HsByMGGAR3-Klt48CI28',
    id: 'ginban-daily-omakase-most-popular',
    sourceUrl: 'https://ginban.gorp.jp/',
    marker: 'イチバン人気',
    nameJa: '日替わりおまかせ料理コース',
    nameZh: '每日主厨精选料理套餐',
    evidenceSnippet: '天然クエや豪華な白身魚を！イチバン人気！豊洲市場仕入れ次第！日替わりおまかせ料理コース 13,200円'
  },
  {
    googlePlaceId: 'ChIJ44VsmjyMGGARJVL9gwj7Afc',
    id: 'shanghai-kitchen-hotpot-pride',
    sourceUrl: 'https://zuienshanghichubo.gorp.jp/',
    marker: '自慢',
    nameJa: '火鍋',
    nameZh: '火锅',
    evidenceSnippet: '美味しい自慢の火鍋!!'
  },
  {
    googlePlaceId: 'ChIJE0-B9UOMGGARGby_5OE_Fdo',
    id: 'kamadoka-kamameshi-specialty',
    sourceUrl: 'https://www.kamadoka.com/menulist/',
    marker: '名物',
    nameJa: '釜めし',
    nameZh: '日式釜饭',
    evidenceSnippet: '【名物】釜めし'
  },
  {
    googlePlaceId: 'ChIJfy1MgfyNGGARPtRC8Q1Dymg',
    id: 'tachinomi-table-shichirin-two-item-specialty',
    sourceUrl: 'https://jp.sake-times.com/special/press/p_tachinomi-5',
    marker: '名物',
    nameJa: '1人用卓上七輪炙り2種盛り',
    nameZh: '单人桌上七轮炙烤双拼',
    evidenceSnippet: 'フードメニューは、名物「1人用卓上七輪炙り2種盛り」400円、花陽浴の奈良漬け、鏡山のクリームチーズ300円、日本酒に合う肴200円などをお楽しみください。'
  }
];

function loadWindowFile(filename) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
  return sandbox.window;
}
function hostOf(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }

const runtime = loadWindowFile('google_inventory_runtime.js');
const runtimeRows = runtime.GOOGLE_INVENTORY_RESTAURANTS || [];
const stats = runtime.GOOGLE_INVENTORY_STATS || {};
if (stats.catalogTotal !== 2804 || runtimeRows.length !== 1422) throw new Error('Unexpected public runtime baseline');
const runtimeById = new Map(runtimeRows.map((row) => [row.googlePlaceId, row]));
const provenance = loadWindowFile('source_provenance.js').SOURCE_PROVENANCE || { rows: [] };
const provenanceById = new Map((provenance.rows || []).map((row) => [row.googlePlaceId, row]));
const rows = [];

for (const rule of RULES) {
  const runtimeRow = runtimeById.get(rule.googlePlaceId);
  if (!runtimeRow) throw new Error(`Reviewed recommendation target missing runtime identity: ${rule.googlePlaceId}`);
  if (Array.isArray(runtimeRow.recommendedDishes) && runtimeRow.recommendedDishes.length) {
    throw new Error(`Reviewed recommendation target already has strict recommendations: ${rule.googlePlaceId}`);
  }
  if (!rule.evidenceSnippet.includes(rule.marker) || !rule.evidenceSnippet.includes(rule.nameJa)) {
    throw new Error(`Reviewed rule lacks same-snippet marker/dish evidence: ${rule.id}`);
  }
  const targetHost = hostOf(rule.sourceUrl);
  const boundHosts = new Set();
  for (const value of runtimeRow.sourceWebsites || []) {
    const host = hostOf(value);
    if (host) boundHosts.add(host);
  }
  for (const link of provenanceById.get(rule.googlePlaceId)?.sourceLinks || []) {
    const host = hostOf(link?.url);
    if (host) boundHosts.add(host);
  }
  if (!targetHost || !boundHosts.has(targetHost)) {
    throw new Error(`Reviewed recommendation source host is no longer bound to target identity: ${rule.id}: ${targetHost}`);
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
      evidenceRule: `reviewed-bound-source-marker-miss:${AUDIT_RUN_ID}:${rule.id}`,
      evidenceSnippet: rule.evidenceSnippet.slice(0, 90)
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
    source: 'already-bound merchant/official pages reviewed from recommendation-marker miss audit',
    networkRequests: 0,
    paidGoogleDataApiCalls: 0,
    catalogIdentityKey: 'frozen Place ID only',
    toolIdentityNameSource: 'runtime_catalog_name',
    identityMutationAllowed: false,
    sourceHostMustRemainBoundToIdentity: true,
    explicitRecommendationMarkerInSameSnippetRequired: true,
    concreteSourceNativeDishInSameSnippetRequired: true,
    reviewedRuleWhitelistRequired: true,
    genericCuisinePromotionAllowed: false,
    alcoholOnlyPromotionAllowed: false
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
