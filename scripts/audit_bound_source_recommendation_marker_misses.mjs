#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  DISH_RULES,
  MENU_LINK_MARKER,
  RECOMMENDATION_MARKER,
  extractStrictRecommendationsFromHtml,
  extractStrictRecommendationsFromText,
  htmlToTextBlocks
} from './recommended_dish_extractor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || '/tmp/bound-source-recommendation-marker-misses.json';
const TIMEOUT_MS = Math.max(5_000, Math.min(15_000, Number(process.env.RECOMMENDATION_MISS_FETCH_TIMEOUT_MS || 10_000)));
const HOST_WORKERS = Math.max(1, Math.min(16, Number(process.env.RECOMMENDATION_MISS_HOST_WORKERS || 8)));
const SITE_PAGE_LIMIT = Math.max(1, Math.min(5, Number(process.env.RECOMMENDATION_MISS_SITE_PAGE_LIMIT || 4)));
const MENU_LINK_LIMIT = Math.max(1, Math.min(4, Number(process.env.RECOMMENDATION_MISS_MENU_LINK_LIMIT || 3)));
const MAX_HTML_CHARS = 1_200_000;
const USER_AGENT = 'eat-recommendation-gap-audit/1.0 (+https://github.com/nekooweb/eat)';

function loadWindowFile(filename) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
  return sandbox.window;
}
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
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
function eligibleWebsite(value) {
  const url = safeUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (/openstreetmap\.org$|hotpepper\.jp$|tabelog\.com$/u.test(host)) return false;
  if (/(^|\.)google\./u.test(host) || /googleusercontent\.com$/u.test(host)) return false;
  if (/facebook\.com$|instagram\.com$|x\.com$|twitter\.com$|youtube\.com$|tiktok\.com$/u.test(host)) return false;
  return true;
}
function menuLinks(html, baseUrl) {
  const output = [];
  const seen = new Set();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu;
  let match;
  while ((match = re.exec(String(html || '')))) {
    const label = htmlToTextBlocks(match[2]).join(' ');
    if (!MENU_LINK_MARKER.test(`${match[1]} ${label}`)) continue;
    try {
      const url = new URL(match[1], baseUrl);
      const base = new URL(baseUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== base.hostname) continue;
      url.hash = '';
      const key = url.toString();
      if (key === baseUrl || seen.has(key) || /\.(?:jpe?g|png|gif|webp|avif|svg|css|js|mjs|pdf|xml)(?:$|[?#])/iu.test(key)) continue;
      seen.add(key);
      output.push(key);
      if (output.length >= MENU_LINK_LIMIT) break;
    } catch {
      // malformed links are diagnostic noise, not evidence
    }
  }
  return output;
}
async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!/text\/html|application\/xhtml\+xml/iu.test(contentType)) throw new Error(`non-html ${contentType}`);
  return (await response.text()).slice(0, MAX_HTML_CHARS);
}
function markerContexts(html, limit = 8) {
  const rows = [];
  const seen = new Set();
  for (const raw of htmlToTextBlocks(html)) {
    const block = clean(raw);
    if (block.length < 4 || block.length > 420) continue;
    RECOMMENDATION_MARKER.lastIndex = 0;
    const marker = RECOMMENDATION_MARKER.exec(block);
    if (!marker) continue;
    const strict = extractStrictRecommendationsFromText(block, 4);
    const known = [];
    for (const [pattern, nameZh] of DISH_RULES) {
      if (pattern.test(block) && !known.includes(nameZh)) known.push(nameZh);
      if (known.length >= 6) break;
    }
    const start = Math.max(0, marker.index - 100);
    const end = Math.min(block.length, marker.index + marker[0].length + 180);
    const context = block.slice(start, end);
    const key = `${marker[0]}|${context}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      marker: marker[0],
      context,
      knownDishLabels: known,
      strictDishesFromSameBlock: strict.map((item) => item.nameZh)
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

const runtimeWindow = loadWindowFile('google_inventory_runtime.js');
const runtimeRows = runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS || [];
const runtimeStats = runtimeWindow.GOOGLE_INVENTORY_STATS || {};
if (runtimeStats.catalogTotal !== 2804 || runtimeStats.inventoryTotal !== runtimeRows.length) throw new Error('Runtime identity contract failed');
const provenanceWindow = fs.existsSync(path.join(DATA, 'source_provenance.js')) ? loadWindowFile('source_provenance.js') : {};
const provenanceById = new Map((provenanceWindow.SOURCE_PROVENANCE?.rows || []).map((row) => [row.googlePlaceId, row]));

function candidateUrls(row) {
  const urls = new Set();
  for (const raw of row.sourceWebsites || []) if (eligibleWebsite(raw)) urls.add(safeUrl(raw).toString());
  for (const link of provenanceById.get(row.googlePlaceId)?.sourceLinks || []) {
    if (String(link?.provider || '').toLowerCase() !== 'official') continue;
    if (eligibleWebsite(link.url)) urls.add(safeUrl(link.url).toString());
  }
  return [...urls];
}

const targets = runtimeRows.filter((row) => !Array.isArray(row.recommendedDishes) || row.recommendedDishes.length === 0);
const tasks = [];
for (const row of targets) for (const url of candidateUrls(row)) tasks.push({ row, url });
const byHost = new Map();
for (const task of tasks) {
  const host = safeUrl(task.url)?.hostname?.toLowerCase();
  if (!host) continue;
  if (!byHost.has(host)) byHost.set(host, []);
  byHost.get(host).push(task);
}
const hostEntries = [...byHost.entries()];
let hostIndex = 0;
const results = [];

async function inspect(task) {
  const urls = [task.url];
  const visited = new Set();
  const misses = [];
  const strictFound = [];
  const errors = [];
  for (let index = 0; index < urls.length && index < SITE_PAGE_LIMIT; index += 1) {
    const url = urls[index];
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      const html = await fetchHtml(url);
      const strict = extractStrictRecommendationsFromHtml(html, 4).map((item) => item.nameZh);
      for (const dish of strict) if (!strictFound.includes(dish)) strictFound.push(dish);
      if (!strict.length) {
        for (const row of markerContexts(html, 8)) misses.push({ pageUrl: url, ...row });
      }
      if (index === 0) urls.push(...menuLinks(html, url));
    } catch (error) {
      errors.push(`${url}: ${error?.message || error}`);
    }
  }
  return {
    googlePlaceId: task.row.googlePlaceId,
    name: task.row.name,
    rootUrl: task.url,
    visitedUrls: [...visited],
    strictDishesFoundOnPage: strictFound,
    markerMisses: misses,
    errors: errors.slice(0, 2)
  };
}
async function worker() {
  while (true) {
    const index = hostIndex++;
    if (index >= hostEntries.length) return;
    const [, hostTasks] = hostEntries[index];
    const seen = new Set();
    for (const task of hostTasks) {
      if (seen.has(task.row.googlePlaceId)) continue;
      seen.add(task.row.googlePlaceId);
      results.push(await inspect(task));
    }
  }
}
await Promise.all(Array.from({ length: Math.min(HOST_WORKERS, hostEntries.length || 1) }, () => worker()));

const markerRows = results.filter((row) => row.markerMisses.length > 0);
const strictRows = results.filter((row) => row.strictDishesFoundOnPage.length > 0);
const highValueMisses = markerRows.filter((row) => row.markerMisses.some((miss) => miss.knownDishLabels.length > 0));
const payload = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString().slice(0, 10),
  policy: {
    auditOnly: true,
    sourceScope: 'already-bound merchant/official websites only',
    targetScope: 'current runtime rows with zero strict recommendations',
    rawHtmlPersisted: false,
    maxContextChars: 300,
    paidGoogleDataApiCalls: 0,
    identityMutationAllowed: false,
    dishEvidenceMutationAllowed: false,
    automaticPromotionAllowed: false
  },
  summary: {
    catalogTotal: 2804,
    publicRuntimeTotal: runtimeRows.length,
    targetRows: targets.length,
    websiteTasks: tasks.length,
    websiteHosts: hostEntries.length,
    inspectedRows: results.length,
    pagesVisited: results.reduce((sum, row) => sum + row.visitedUrls.length, 0),
    pagesWithStrictRecommendationExtraction: strictRows.length,
    markerMissRestaurants: markerRows.length,
    markerMissContexts: markerRows.reduce((sum, row) => sum + row.markerMisses.length, 0),
    highValueKnownDishMissRestaurants: highValueMisses.length,
    errorRows: results.filter((row) => row.errors.length).length
  },
  rows: markerRows.sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId) || a.rootUrl.localeCompare(b.rootUrl))
};
fs.mkdirSync(path.dirname(path.resolve(OUTPUT)), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(payload.summary));
for (const row of payload.rows.slice(0, 160)) {
  for (const miss of row.markerMisses.slice(0, 6)) {
    console.log(`MISS\t${row.googlePlaceId}\t${row.name}\t${miss.marker}\t${miss.knownDishLabels.join('|')}\t${miss.pageUrl}\t${miss.context}`);
  }
}
