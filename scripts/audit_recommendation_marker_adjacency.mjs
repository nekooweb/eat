#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  DISH_RULES,
  RECOMMENDATION_MARKER,
  extractStrictRecommendationsFromText
} from './recommended_dish_extractor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const INPUT = process.argv[2];
const OUTPUT = process.argv[3] || '/tmp/recommendation-marker-adjacency.json';
if (!INPUT) throw new Error('Usage: node audit_recommendation_marker_adjacency.mjs <previous-marker-audit.json> [output.json]');

const TIMEOUT_MS = Math.max(5_000, Math.min(15_000, Number(process.env.RECOMMENDATION_ADJACENCY_FETCH_TIMEOUT_MS || 10_000)));
const WORKERS = Math.max(1, Math.min(16, Number(process.env.RECOMMENDATION_ADJACENCY_WORKERS || 8)));
const USER_AGENT = 'eat-recommendation-adjacency-audit/1.0 (+https://github.com/nekooweb/eat)';
const MAX_HTML_CHARS = 1_200_000;

function loadWindowFile(filename) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
  return sandbox.window;
}
function clean(value) {
  return String(value || '')
    .replace(/&nbsp;|&#160;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;|&#34;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}
async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (!/text\/html|application\/xhtml\+xml/iu.test(type)) throw new Error(`non-html ${type}`);
  return (await response.text()).slice(0, MAX_HTML_CHARS);
}
function titleOf(html) {
  const match = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu);
  return match ? clean(match[1]) : '';
}
function blocksOf(html) {
  const source = String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/giu, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/giu, ' ');
  const blocks = [];
  const re = /<(h[1-6]|p|li|dt|dd|figcaption|th|td|caption)\b[^>]*>([\s\S]*?)<\/\1>/giu;
  for (const match of source.matchAll(re)) {
    const text = clean(match[2]);
    if (text.length < 2 || text.length > 600) continue;
    if (blocks.length && blocks[blocks.length - 1].text === text) continue;
    blocks.push({ tag: match[1].toLowerCase(), text });
  }
  return blocks;
}
function knownDishes(text) {
  const out = [];
  for (const [pattern, nameZh] of DISH_RULES) {
    pattern.lastIndex = 0;
    if (pattern.test(text) && !out.includes(nameZh)) out.push(nameZh);
    if (out.length >= 8) break;
  }
  return out;
}
function sourceNativeCandidate(block) {
  const text = clean(block?.text);
  if (!text || text.length > 90) return '';
  if (/^(おすすめ|オススメ|お勧め|人気|名物|看板|自慢|メニュー|料理|商品|詳細|一覧|more|menu)$/iu.test(text)) return '';
  if (/予約|求人|採用|ランキング|記事|ニュース|お知らせ|アクセス|営業時間|電話|住所|店舗|会社|個人情報|プライバシー/iu.test(text)) return '';
  if (/^[\d\s¥￥,.，、()（）:+\-–—~〜～/]+$/u.test(text)) return '';
  return text;
}
function markerNeighborhood(blocks, index, title) {
  const before2 = index >= 2 ? blocks[index - 2] : null;
  const before1 = index >= 1 ? blocks[index - 1] : null;
  const current = blocks[index];
  const after1 = index + 1 < blocks.length ? blocks[index + 1] : null;
  const after2 = index + 2 < blocks.length ? blocks[index + 2] : null;
  const neighborhood = [before2, before1, current, after1, after2].filter(Boolean);
  const combined = [title, ...neighborhood.map((x) => x.text)].filter(Boolean).join(' | ');
  const strict = extractStrictRecommendationsFromText(combined, 8).map((item) => item.nameZh);
  const known = knownDishes(combined);
  const nativeCandidates = [
    { position: 'title', text: sourceNativeCandidate({ text: title }) },
    { position: 'before2', text: sourceNativeCandidate(before2) },
    { position: 'before1', text: sourceNativeCandidate(before1) },
    { position: 'current', text: sourceNativeCandidate(current) },
    { position: 'after1', text: sourceNativeCandidate(after1) },
    { position: 'after2', text: sourceNativeCandidate(after2) }
  ].filter((row) => row.text);
  return {
    title,
    before2: before2?.text || null,
    before1: before1?.text || null,
    markerBlock: current?.text || '',
    after1: after1?.text || null,
    after2: after2?.text || null,
    knownDishLabelsAcrossNeighborhood: known,
    strictDishesAcrossNeighborhood: strict,
    sourceNativeCandidates: nativeCandidates
  };
}

const previous = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const runtimeWindow = loadWindowFile('google_inventory_runtime.js');
const runtimeRows = runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS || [];
const stats = runtimeWindow.GOOGLE_INVENTORY_STATS || {};
if (stats.catalogTotal !== 2804 || runtimeRows.length !== 1422) throw new Error('Unexpected runtime baseline');
const runtimeById = new Map(runtimeRows.map((row) => [row.googlePlaceId, row]));

const tasks = [];
const taskKeys = new Set();
for (const row of previous.rows || []) {
  const runtimeRow = runtimeById.get(row.googlePlaceId);
  if (!runtimeRow || (Array.isArray(runtimeRow.recommendedDishes) && runtimeRow.recommendedDishes.length)) continue;
  for (const miss of row.markerMisses || []) {
    const url = safeUrl(miss.pageUrl);
    if (!url) continue;
    const key = `${row.googlePlaceId}|${url.toString()}`;
    if (taskKeys.has(key)) continue;
    taskKeys.add(key);
    tasks.push({ googlePlaceId: row.googlePlaceId, name: runtimeRow.name, url: url.toString() });
  }
}

let index = 0;
const results = [];
async function worker() {
  while (true) {
    const currentIndex = index++;
    if (currentIndex >= tasks.length) return;
    const task = tasks[currentIndex];
    try {
      const html = await fetchHtml(task.url);
      const title = titleOf(html);
      const blocks = blocksOf(html);
      const neighborhoods = [];
      for (let i = 0; i < blocks.length; i += 1) {
        RECOMMENDATION_MARKER.lastIndex = 0;
        const marker = RECOMMENDATION_MARKER.exec(blocks[i].text);
        if (!marker) continue;
        const neighborhood = markerNeighborhood(blocks, i, title);
        neighborhoods.push({ marker: marker[0], ...neighborhood });
        if (neighborhoods.length >= 16) break;
      }
      if (neighborhoods.length) results.push({ ...task, neighborhoods });
    } catch (error) {
      results.push({ ...task, neighborhoods: [], error: error?.message || String(error) });
    }
  }
}
await Promise.all(Array.from({ length: Math.min(WORKERS, tasks.length || 1) }, () => worker()));

const withKnown = results.filter((row) => row.neighborhoods?.some((n) => n.knownDishLabelsAcrossNeighborhood.length));
const withStrict = results.filter((row) => row.neighborhoods?.some((n) => n.strictDishesAcrossNeighborhood.length));
const withNative = results.filter((row) => row.neighborhoods?.some((n) => n.sourceNativeCandidates.length));
const payload = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString().slice(0, 10),
  policy: {
    auditOnly: true,
    inputRun: '34371635502',
    targetScope: 'only prior marker-miss pages whose restaurant still has zero strict recommendations',
    pageTitleAndAdjacentBlocksOnly: true,
    adjacencyWindow: 2,
    rawHtmlPersisted: false,
    paidGoogleDataApiCalls: 0,
    identityMutationAllowed: false,
    dishEvidenceMutationAllowed: false,
    automaticPromotionAllowed: false
  },
  summary: {
    catalogTotal: 2804,
    publicRuntimeTotal: runtimeRows.length,
    priorMarkerMissRestaurants: new Set((previous.rows || []).map((row) => row.googlePlaceId)).size,
    remainingTargetRestaurants: new Set(tasks.map((task) => task.googlePlaceId)).size,
    targetPages: tasks.length,
    pagesWithMarkerNeighborhoods: results.filter((row) => row.neighborhoods?.length).length,
    pagesWithKnownDishAcrossNeighborhood: withKnown.length,
    pagesWithStrictDishAcrossNeighborhood: withStrict.length,
    pagesWithSourceNativeCandidates: withNative.length,
    errorPages: results.filter((row) => row.error).length
  },
  rows: results.filter((row) => row.neighborhoods?.length)
};
fs.mkdirSync(path.dirname(path.resolve(OUTPUT)), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(payload.summary));
for (const row of payload.rows) {
  for (const n of row.neighborhoods) {
    const known = n.knownDishLabelsAcrossNeighborhood.join('|');
    const strict = n.strictDishesAcrossNeighborhood.join('|');
    const native = n.sourceNativeCandidates.map((x) => `${x.position}:${x.text}`).join(' || ');
    console.log(`ADJ\t${row.googlePlaceId}\t${row.name}\t${n.marker}\tKNOWN=${known}\tSTRICT=${strict}\tNATIVE=${native}\tURL=${row.url}`);
  }
}
