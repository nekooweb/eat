#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { normalizeHotPepperFeaturedMenuHeading } from './hotpepper_featured_menu_normalizer.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(ROOT, '_audit', 'hotpepper_curated_featured_menu_evidence.json');
const CONCURRENCY = Math.max(1, Math.min(16, Number(process.env.HOTPEPPER_FEATURED_CONCURRENCY || 8)));
const TIMEOUT_MS = Math.max(5000, Number(process.env.HOTPEPPER_FEATURED_TIMEOUT_MS || 10000));
const LIMIT = Math.max(0, Number(process.env.HOTPEPPER_FEATURED_LIMIT || 0));
const CHECKED_AT = new Date().toISOString().slice(0, 10);
const MAX_HTML_CHARS = 1_600_000;
const USER_AGENT = 'eat-data-maintenance/2.4 (+https://github.com/nekooweb/eat)';
const HOTPEPPER_HOST = /^www\.hotpepper\.jp$/i;
const PRICEISH = /(?:[¥￥]\s*[\d,]+|[\d,]+\s*円|税込|税抜|各種|時価|要問合せ|お問い合わせ)/i;

function loadWindowFile(filename) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
  return sandbox.window;
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function pageText(html) {
  return decodeEntities(String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆!！?？.,，。:：/\\]+/g, '');
}

function titleFromHtml(html) {
  const match = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? pageText(match[1]).slice(0, 240) : '';
}

function safeHotPepperUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !HOTPEPPER_HOST.test(url.hostname)) return null;
    if (!/^\/strJ\d+\//i.test(url.pathname)) return null;
    url.protocol = 'https:';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function restaurantBase(value) {
  const url = safeHotPepperUrl(value);
  if (!url) return null;
  const match = url.pathname.match(/^(\/strJ\d+\/)/i);
  return match ? new URL(match[1], url.origin).toString() : null;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
      'accept-language': 'ja,en;q=0.8'
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const finalUrl = safeHotPepperUrl(response.url);
  if (!finalUrl) throw new Error(`redirected outside Hot Pepper restaurant scope: ${response.url}`);
  const contentType = response.headers.get('content-type') || '';
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new Error(`non-html ${contentType}`);
  return { html: (await response.text()).slice(0, MAX_HTML_CHARS), finalUrl: finalUrl.toString() };
}

function tagMatches(html, tagName) {
  const output = [];
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  let match;
  while ((match = pattern.exec(String(html || '')))) {
    output.push({ index: match.index, end: pattern.lastIndex, text: pageText(match[1]) });
  }
  return output;
}

function curatedPriceBackedItems(html, sourceUrl) {
  const h4s = tagMatches(html, 'h4');
  const output = [];
  const seen = new Set();
  for (let i = 0; i < h4s.length; i += 1) {
    const heading = h4s[i].text.replace(/^[【〖\[]|[】〗\]]$/g, '').trim();
    if (!heading || heading.length > 160) continue;
    const nextBoundary = h4s[i + 1]?.index ?? Math.min(String(html || '').length, h4s[i].end + 700);
    const neighborhood = pageText(String(html || '').slice(h4s[i].end, Math.min(nextBoundary, h4s[i].end + 700)));
    if (!PRICEISH.test(neighborhood)) continue;
    for (const match of normalizeHotPepperFeaturedMenuHeading(heading, 5)) {
      const key = `${match.nameZh}|${sourceUrl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push({
        nameZh: match.nameZh,
        nameJa: match.nameOriginal,
        provider: 'Hot Pepper',
        sourceUrl,
        checkedAt: CHECKED_AT,
        evidenceClass: 'hotpepper_menu_text',
        evidenceRule: `hotpepper-price-backed-h4:normalized-${match.rule}`,
        evidenceSnippet: `${heading} ${neighborhood}`.replace(/\s+/g, ' ').slice(0, 90)
      });
    }
  }
  return output;
}

function discoveredFoodLinks(html, rootUrl) {
  const base = restaurantBase(rootUrl);
  if (!base) return [];
  const root = new URL(base);
  const links = [];
  const seen = new Set();
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(String(html || '')))) {
    try {
      const url = new URL(match[1], root);
      url.hash = '';
      if (!HOTPEPPER_HOST.test(url.hostname) || !url.toString().startsWith(base)) continue;
      if (!/\/(?:food|menu)\/?$/i.test(url.pathname)) continue;
      if (seen.has(url.toString())) continue;
      seen.add(url.toString());
      links.push(url.toString());
      if (links.length >= 1) break;
    } catch {
      // malformed links ignored
    }
  }
  return links;
}

async function inspectTarget(target) {
  const result = {
    googlePlaceId: target.googlePlaceId,
    name: target.name,
    sourceName: target.sourceName,
    sourceUrl: target.sourceUrl,
    rootIdentityMatched: false,
    foodPagesFetched: 0,
    featuredDishes: [],
    errors: []
  };
  try {
    const root = await fetchHtml(target.sourceUrl);
    const identityText = normalize(`${titleFromHtml(root.html)} ${pageText(root.html).slice(0, 16000)}`);
    const names = [target.sourceName, target.name].map(normalize).filter((value) => value.length >= 2);
    result.rootIdentityMatched = names.some((name) => identityText.includes(name));
    if (!result.rootIdentityMatched) throw new Error('exact-bound page no longer contains retained/runtime restaurant name');
    for (const foodUrl of discoveredFoodLinks(root.html, root.finalUrl)) {
      try {
        const food = await fetchHtml(foodUrl);
        if (!food.finalUrl.startsWith(restaurantBase(root.finalUrl))) throw new Error('food redirect escaped restaurant scope');
        const foodIdentity = normalize(`${titleFromHtml(food.html)} ${pageText(food.html).slice(0, 8000)}`);
        if (!names.some((name) => foodIdentity.includes(name))) throw new Error('food page identity mismatch');
        result.foodPagesFetched += 1;
        result.featuredDishes.push(...curatedPriceBackedItems(food.html, food.finalUrl));
      } catch (error) {
        result.errors.push(`${foodUrl}: ${error?.message || error}`);
      }
    }
  } catch (error) {
    result.errors.push(`${target.sourceUrl}: ${error?.message || error}`);
  }
  const map = new Map();
  for (const item of result.featuredDishes) {
    const key = `${item.nameZh}|${item.sourceUrl}|${item.evidenceClass}`;
    if (!map.has(key)) map.set(key, item);
  }
  result.featuredDishes = [...map.values()].slice(0, 10);
  return result;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, runner));
  return results;
}

const runtimeWindow = loadWindowFile('google_inventory_runtime.js');
const runtimeRows = runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS || [];
const runtimeStats = runtimeWindow.GOOGLE_INVENTORY_STATS || {};
if (runtimeStats.catalogTotal !== 2804 || runtimeRows.length + Number(runtimeStats.unpublishedPlaceIdOnly || 0) !== 2804) {
  throw new Error('collector requires frozen 2,804 Place-ID baseline');
}
const runtimeById = new Map(runtimeRows.map((row) => [row.googlePlaceId, row]));
const facts = JSON.parse(fs.readFileSync(path.join(DATA, 'hotpepper_catalog_facts.json'), 'utf8'));
const targets = [];
for (const factRow of facts.rows || []) {
  const runtime = runtimeById.get(factRow.googlePlaceId);
  if (!runtime || !runtime.nameKnown || !String(runtime.name || '').trim()) continue;
  const hasRecommended = Array.isArray(runtime.recommendedDishes) && runtime.recommendedDishes.length > 0;
  const hasFeatured = Array.isArray(runtime.featuredDishes) && runtime.featuredDishes.length > 0;
  if (hasRecommended || hasFeatured) continue;
  const sourceUrl = safeHotPepperUrl(factRow.facts?.urls?.pc || factRow.facts?.urls?.mobile);
  if (!sourceUrl) continue;
  targets.push({
    googlePlaceId: runtime.googlePlaceId,
    name: runtime.name,
    sourceName: String(factRow.facts?.name || '').trim(),
    sourceUrl: sourceUrl.toString()
  });
}
targets.sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));
const selected = LIMIT > 0 ? targets.slice(0, LIMIT) : targets;
const results = await mapLimit(selected, CONCURRENCY, inspectTarget);
const rows = results
  .filter((row) => row.featuredDishes.length)
  .map((row) => ({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    recommendedDishes: [],
    featuredDishes: row.featuredDishes
  }))
  .sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));

const payload = {
  schemaVersion: 1,
  checkedAt: CHECKED_AT,
  policy: {
    catalogIdentityKey: 'frozen Place ID only',
    catalogTotal: 2804,
    publicNoDishRowsOnly: true,
    exactRetainedHotPepperUrlOnly: true,
    rootIdentityRevalidationRequired: true,
    foodPageIdentityRevalidationRequired: true,
    sameRestaurantFoodLinkRequired: true,
    guessedMenuPathsAllowed: false,
    priceBackedH4Required: true,
    curatedFoodRulesOnly: true,
    recommendationPromotionAllowed: false,
    cuisineNameBrandInferenceAllowed: false,
    paidGoogleDataApiCalls: 0,
    hotPepperWebServiceApiCalls: 0,
    rawHtmlPersisted: false,
    targetLanguage: 'zh-CN',
    preserveSourceOriginal: true
  },
  summary: {
    publicRuntimeTotal: runtimeRows.length,
    currentNoDishRows: runtimeRows.filter((row) => !(row.recommendedDishes || []).length && !(row.featuredDishes || []).length).length,
    exactHotPepperNoDishTargets: targets.length,
    targets: selected.length,
    rootIdentityMatched: results.filter((row) => row.rootIdentityMatched).length,
    foodPagesFetched: results.reduce((sum, row) => sum + row.foodPagesFetched, 0),
    evidenceRestaurants: rows.length,
    featuredItems: rows.reduce((sum, row) => sum + row.featuredDishes.length, 0),
    errorTargets: results.filter((row) => row.errors.length).length
  },
  rows,
  diagnostics: results.map((row) => ({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    rootIdentityMatched: row.rootIdentityMatched,
    foodPagesFetched: row.foodPagesFetched,
    featuredItems: row.featuredDishes.length,
    errors: row.errors.slice(0, 3)
  }))
};
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(payload.summary));
