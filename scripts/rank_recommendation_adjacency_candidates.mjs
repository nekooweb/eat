#!/usr/bin/env node
import fs from 'node:fs';

const INPUT = process.argv[2];
const OUTPUT = process.argv[3] || '/tmp/recommendation-adjacency-ranked.json';
if (!INPUT) throw new Error('Usage: node rank_recommendation_adjacency_candidates.mjs <adjacency.json> [output.json]');

const doc = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const STRONG_MARKER = /名物|看板|自慢|一番人気|人気(?:No\.?1|NO\.?1|ナンバー1|メニュー|商品)?|イチオシ|一押し|おすすめ(?:商品|メニュー|料理|の一品|の逸品)?|オススメ(?:商品|メニュー|料理)?/iu;
const WEAK_OR_AMBIGUOUS = /カスタマイズ|トッピング|ドレッシング|パン|フェア|キャンペーン|ランキング|求人|採用|お知らせ|ニュース|記事|ブログ|ギフト|贈答|通販|オンライン|物販|グッズ|豆知識|おすすめスポット|おすすめ記事/iu;
const ALCOHOL_ONLY = /ビール|ワイン|日本酒|焼酎|サワー|ハイボール|カクテル|シャンパン|ウイスキー|酒$/iu;
const NAVIGATION = /^(ホーム|HOME|TOP|メニュー|MENU|料理|商品|一覧|詳細|MORE|NEXT|PREV|店舗|アクセス|予約|お問い合わせ)$/iu;

function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function candidateBlocks(n) {
  return [
    ['before1', n.before1],
    ['after1', n.after1],
    ['before2', n.before2],
    ['after2', n.after2],
    ['title', n.title]
  ].map(([position, text]) => ({ position, text: clean(text) })).filter((row) => row.text);
}
function distanceWeight(position) {
  if (position === 'before1' || position === 'after1') return 4;
  if (position === 'before2' || position === 'after2') return 2;
  return 1;
}
function scoreNeighborhood(n) {
  const markerBlock = clean(n.markerBlock);
  const marker = clean(n.marker);
  if (!STRONG_MARKER.test(`${marker} ${markerBlock}`)) return null;
  if (WEAK_OR_AMBIGUOUS.test(markerBlock)) return null;
  const known = Array.isArray(n.knownDishLabelsAcrossNeighborhood) ? n.knownDishLabelsAcrossNeighborhood : [];
  if (!known.length) return null;
  const strict = Array.isArray(n.strictDishesAcrossNeighborhood) ? n.strictDishesAcrossNeighborhood : [];
  const blocks = candidateBlocks(n);
  const evidenceBlocks = blocks.filter((row) => {
    if (NAVIGATION.test(row.text) || WEAK_OR_AMBIGUOUS.test(row.text) || ALCOHOL_ONLY.test(row.text)) return false;
    return row.text.length <= 140;
  });
  if (!evidenceBlocks.length) return null;
  let score = 0;
  if (markerBlock.length <= 40) score += 4;
  if (/^(おすすめ(?:商品|メニュー|料理)?|オススメ(?:商品|メニュー|料理)?|名物|看板(?:料理|商品)?|一番人気|人気(?:No\.?1|NO\.?1|ナンバー1)?|イチオシ|一押し)$/iu.test(markerBlock)) score += 6;
  if (/当店自慢|自慢の|名物|看板|一番人気|イチオシ|一押し/iu.test(markerBlock)) score += 3;
  score += Math.max(...evidenceBlocks.map((row) => distanceWeight(row.position)));
  if (strict.length) score += 2;
  return { score, marker, markerBlock, knownDishLabels: known, strictDishLabels: strict, evidenceBlocks };
}

const rows = [];
for (const page of doc.rows || []) {
  for (const n of page.neighborhoods || []) {
    const ranked = scoreNeighborhood(n);
    if (!ranked) continue;
    rows.push({
      googlePlaceId: page.googlePlaceId,
      name: page.name,
      url: page.url,
      ...ranked
    });
  }
}
rows.sort((a, b) => b.score - a.score || a.googlePlaceId.localeCompare(b.googlePlaceId) || a.url.localeCompare(b.url));
const payload = {
  schemaVersion: 1,
  policy: {
    auditOnly: true,
    networkRequests: 0,
    paidGoogleDataApiCalls: 0,
    identityMutationAllowed: false,
    dishEvidenceMutationAllowed: false,
    automaticPromotionAllowed: false,
    requiresExistingDishVocabularyHit: true,
    excludesCustomizationCampaignNavigationAndAlcoholOnlyContexts: true
  },
  summary: {
    catalogTotal: 2804,
    inputPages: (doc.rows || []).length,
    rankedContexts: rows.length,
    rankedRestaurants: new Set(rows.map((row) => row.googlePlaceId)).size,
    highConfidenceContexts: rows.filter((row) => row.score >= 10).length,
    highConfidenceRestaurants: new Set(rows.filter((row) => row.score >= 10).map((row) => row.googlePlaceId)).size
  },
  rows
};
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(payload.summary));
for (const row of rows.slice(0, 80)) {
  console.log(`RANK\t${row.score}\t${row.googlePlaceId}\t${row.name}\t${row.marker}\t${row.knownDishLabels.join('|')}\t${row.evidenceBlocks.map((x) => `${x.position}:${x.text}`).join(' || ')}\t${row.url}`);
}
