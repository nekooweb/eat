#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { extractStrictRecommendationsFromText } from './recommended_dish_extractor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || '/tmp/hotpepper-unmatched-recommendation-markers.json';

const RECOMMENDATION_MARKER_RE = /おすすめ|オススメ|お勧め|名物|看板|自慢|一押し|イチオシ|推し|人気(?:メニュー|料理|商品|No\.?1|NO\.?1|ナンバー1)?|一番人気|売れ筋|必食|スペシャリテ|シグネチャー|signature|specialty|recommended|best[- ]?seller|must[- ]?try|most[- ]?popular|house[- ]?special|chef'?s[- ]?recommend/iu;

function loadWindowFile(filename) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
  return sandbox.window;
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hotPepperUrl(value) {
  const text = clean(value);
  return /^https:\/\/www\.hotpepper\.jp\/strJ\d+/iu.test(text) ? text : '';
}

function markerContext(text, radius = 90) {
  const normalized = clean(text);
  const match = normalized.match(RECOMMENDATION_MARKER_RE);
  if (!match) return '';
  const start = Math.max(0, Number(match.index || 0) - radius);
  const end = Math.min(normalized.length, Number(match.index || 0) + match[0].length + radius);
  return normalized.slice(start, end);
}

const runtime = loadWindowFile('google_inventory_runtime.js');
const runtimeRows = runtime.GOOGLE_INVENTORY_RESTAURANTS || [];
const runtimeStats = runtime.GOOGLE_INVENTORY_STATS || {};
if (runtimeStats.catalogTotal !== 2804 || runtimeRows.length !== 1422) throw new Error('Unexpected public runtime baseline');
const recommendationGap = new Map(
  runtimeRows
    .filter((row) => !Array.isArray(row.recommendedDishes) || row.recommendedDishes.length === 0)
    .map((row) => [row.googlePlaceId, row])
);

const catalog = JSON.parse(fs.readFileSync(path.join(DATA, 'hotpepper_catalog_facts.json'), 'utf8'));
const catalogRows = Array.isArray(catalog.rows) ? catalog.rows : [];
const rich = loadWindowFile('hotpepper_rich_metadata.js').HOTPEPPER_RICH_METADATA || {};
const richRows = Array.isArray(rich.rows) ? rich.rows : [];
const candidates = [];
const seen = new Set();
let textsScanned = 0;
let markerTexts = 0;
let markerAlreadyRecognized = 0;

function inspect(googlePlaceId, sourceUrl, field, value, reviewMode = null) {
  const row = recommendationGap.get(clean(googlePlaceId));
  const text = clean(value);
  if (!row || !sourceUrl || !text) return;
  const key = `${row.googlePlaceId}|${sourceUrl}|${text}`;
  if (seen.has(key)) return;
  seen.add(key);
  textsScanned += 1;
  if (!RECOMMENDATION_MARKER_RE.test(text)) return;
  markerTexts += 1;
  const strict = extractStrictRecommendationsFromText(text, 6);
  if (strict.length) {
    markerAlreadyRecognized += 1;
    return;
  }
  candidates.push({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    cuisine: row.cuisine || null,
    field,
    reviewMode,
    sourceUrl,
    markerContext: markerContext(text),
    sourceText: text.slice(0, 320)
  });
}

for (const row of catalogRows) {
  const pid = clean(row.googlePlaceId);
  if (!recommendationGap.has(pid)) continue;
  const sourceUrl = hotPepperUrl(row.facts?.urls?.pc || row.facts?.urls?.mobile);
  if (!sourceUrl) continue;
  inspect(pid, sourceUrl, 'facts.catch', row.facts?.catch);
  inspect(pid, sourceUrl, 'facts.genre.catch', row.facts?.genre?.catch);
  inspect(pid, sourceUrl, 'facts.freeFood', row.facts?.freeFood);
}

for (const row of richRows) {
  const pid = clean(row.googlePlaceId);
  if (!recommendationGap.has(pid)) continue;
  const reviewMode = clean(row.hotpepperReviewMode);
  if (!['strict_auto', 'manual_exact'].includes(reviewMode)) continue;
  const sourceUrl = hotPepperUrl(row.hotpepperUrl);
  if (!sourceUrl) continue;
  inspect(pid, sourceUrl, 'sourceCatch', row.sourceCatch, reviewMode);
  inspect(pid, sourceUrl, 'sourceServiceText.allYouCanEat', row.sourceServiceText?.allYouCanEat, reviewMode);
  for (const feature of row.specialFeatures || []) {
    inspect(pid, sourceUrl, 'specialFeatures.title', feature?.title, reviewMode);
  }
}

candidates.sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId) || a.field.localeCompare(b.field));
const restaurants = new Set(candidates.map((row) => row.googlePlaceId));
const fieldCounts = {};
for (const row of candidates) fieldCounts[row.field] = (fieldCounts[row.field] || 0) + 1;

const payload = {
  schemaVersion: 1,
  policy: {
    auditOnly: true,
    networkRequests: 0,
    paidGoogleDataApiCalls: 0,
    identityMutationAllowed: false,
    dishEvidenceMutationAllowed: false,
    targetRows: 'current public runtime rows with zero strict recommendations',
    candidateRule: 'explicit recommendation/signature/popularity marker present, but current strict dish vocabulary extracts zero dishes',
    automaticPromotionAllowed: false
  },
  summary: {
    catalogTotal: 2804,
    publicRuntimeTotal: runtimeRows.length,
    recommendationGapRows: recommendationGap.size,
    retainedTextsScanned: textsScanned,
    markerTexts,
    markerAlreadyRecognized,
    unmatchedMarkerTexts: candidates.length,
    unmatchedRestaurants: restaurants.size,
    fieldCounts
  },
  rows: candidates
};

fs.mkdirSync(path.dirname(path.resolve(OUTPUT)), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(payload.summary));
for (const row of candidates.slice(0, 120)) {
  console.log(`CANDIDATE\t${row.googlePlaceId}\t${row.name}\t${row.field}\t${row.markerContext}`);
}
