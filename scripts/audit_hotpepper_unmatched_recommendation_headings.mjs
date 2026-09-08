#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DISH_RULES } from './recommended_dish_extractor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(ROOT, '_audit', 'hotpepper_unmatched_recommendation_headings.json');
const CONCURRENCY = Math.max(1, Math.min(16, Number(process.env.HOTPEPPER_AUDIT_CONCURRENCY || 8)));
const TIMEOUT_MS = Math.max(3000, Number(process.env.HOTPEPPER_AUDIT_TIMEOUT_MS || 8000));
const LIMIT = Math.max(0, Number(process.env.HOTPEPPER_AUDIT_LIMIT || 0));
const CHECKED_AT = new Date().toISOString().slice(0, 10);
const USER_AGENT = 'eat-data-maintenance/2.4 (+https://github.com/nekooweb/eat)';
const HOTPEPPER_HOST = /^www\.hotpepper\.jp$/i;

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

function titleFromHtml(html) {
  const match = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? pageText(match[1]).slice(0, 240) : '';
}

function normalizeIdentity(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆!！?？.,，。:：/\\]+/g, '');
}

function normalizeHeading(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .replace(/^[\s【〖\[「『]+|[\s】〗\]」』]+$/g, '')
    .replace(/(?:税込|税抜)?\s*[¥￥]?\s*[\d,]+\s*円?\s*$/i, '')
    .trim();
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
  return { html: (await response.text()).slice(0, 1_600_000), finalUrl: finalUrl.toString() };
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
      // Ignore malformed links.
    }
  }
  return links;
}

function explicitRecommendationHeadings(html) {
  const h2s = tagMatches(html, 'h2');
  const output = [];
  for (let i = 0; i < h2s.length; i += 1) {
    if (!/おすすめ料理/.test(h2s[i].text)) continue;
    const start = h2s[i].end;
    const end = h2s[i + 1]?.index ?? String(html || '').length;
    const section = String(html || '').slice(start, end);
    for (const h3 of tagMatches(section, 'h3')) {
      const heading = normalizeHeading(h3.text);
      if (heading && heading.length <= 220) output.push(heading);
    }
  }
  return [...new Set(output)];
}

function rawKnownMatches(heading) {
  const output = [];
  for (const [pattern, nameZh] of DISH_RULES) {
    const match = heading.match(pattern);
    if (!match) continue;
    output.push({ nameZh, source: match[0], rule: pattern.source });
  }
  return output;
}

async function inspectTarget(target) {
  const result = {
    googlePlaceId: target.googlePlaceId,
    restaurantName: target.restaurantName,
    sourceName: target.sourceName,
    sourceUrl: target.sourceUrl,
    rootIdentityMatched: false,
    foodPageFetched: false,
    headings: [],
    errors: []
  };
  try {
    const root = await fetchHtml(target.sourceUrl);
    const identityText = normalizeIdentity(`${titleFromHtml(root.html)} ${pageText(root.html).slice(0, 16000)}`);
    const names = [target.sourceName, target.restaurantName].map(normalizeIdentity).filter((x) => x.length >= 2);
    if (!names.some((name) => identityText.includes(name))) throw new Error('root identity mismatch');
    result.rootIdentityMatched = true;
    const links = discoveredFoodLinks(root.html, root.finalUrl);
    for (const foodUrl of links) {
      try {
        const food = await fetchHtml(foodUrl);
        if (!food.finalUrl.startsWith(restaurantBase(root.finalUrl))) throw new Error('food page escaped restaurant scope');
        const foodIdentity = normalizeIdentity(`${titleFromHtml(food.html)} ${pageText(food.html).slice(0, 8000)}`);
        if (!names.some((name) => foodIdentity.includes(name))) throw new Error('food identity mismatch');
        result.foodPageFetched = true;
        result.foodUrl = food.finalUrl;
        result.headings = explicitRecommendationHeadings(food.html).map((heading) => ({
          heading,
          knownMatches: rawKnownMatches(heading)
        }));
      } catch (error) {
        result.errors.push(`${foodUrl}: ${error?.message || error}`);
      }
    }
  } catch (error) {
    result.errors.push(`${target.sourceUrl}: ${error?.message || error}`);
  }
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
  throw new Error('Audit requires frozen 2,804 Place-ID baseline');
}
const runtimeById = new Map(runtimeRows.map((row) => [row.googlePlaceId, row]));
const factsPayload = JSON.parse(fs.readFileSync(path.join(DATA, 'hotpepper_catalog_facts.json'), 'utf8'));
const targets = [];
for (const factRow of factsPayload.rows || []) {
  const runtime = runtimeById.get(factRow.googlePlaceId);
  if (!runtime?.nameKnown || !String(runtime.name || '').trim()) continue;
  if (Array.isArray(runtime.recommendedDishes) && runtime.recommendedDishes.length) continue;
  const sourceUrl = safeHotPepperUrl(factRow.facts?.urls?.pc || factRow.facts?.urls?.mobile);
  if (!sourceUrl) continue;
  targets.push({
    googlePlaceId: runtime.googlePlaceId,
    restaurantName: runtime.name,
    sourceName: String(factRow.facts?.name || '').trim(),
    sourceUrl: sourceUrl.toString()
  });
}
targets.sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));
const selected = LIMIT > 0 ? targets.slice(0, LIMIT) : targets;
const results = await mapLimit(selected, CONCURRENCY, inspectTarget);

const unmatchedRows = [];
const frequency = new Map();
let explicitHeadings = 0;
let knownHeadings = 0;
for (const row of results) {
  for (const heading of row.headings || []) {
    explicitHeadings += 1;
    if (heading.knownMatches.length) {
      knownHeadings += 1;
      continue;
    }
    const item = {
      googlePlaceId: row.googlePlaceId,
      restaurantName: row.restaurantName,
      sourceName: heading.heading,
      sourceLanguageHint: 'ja',
      targetField: 'recommendedDishes',
      sourceField: 'Hot Pepper おすすめ料理 h3',
      evidenceClass: 'source_recommendation_text',
      provider: 'Hot Pepper',
      sourceUrl: row.foodUrl || row.sourceUrl,
      checkedAt: CHECKED_AT,
      status: 'needs_zh_normalization',
      reason: 'explicit Hot Pepper recommendation heading exists but current deterministic dish dictionary has no match'
    };
    unmatchedRows.push(item);
    const key = heading.heading;
    if (!frequency.has(key)) frequency.set(key, { sourceName: key, count: 0, restaurants: [], sourceUrls: [] });
    const agg = frequency.get(key);
    agg.count += 1;
    if (agg.restaurants.length < 6) agg.restaurants.push(row.restaurantName);
    if (agg.sourceUrls.length < 3 && !agg.sourceUrls.includes(item.sourceUrl)) agg.sourceUrls.push(item.sourceUrl);
  }
}

const repeated = [...frequency.values()]
  .sort((a, b) => b.count - a.count || a.sourceName.localeCompare(b.sourceName, 'ja'));
const payload = {
  schemaVersion: 1,
  checkedAt: CHECKED_AT,
  policy: {
    sourceBackedOnly: true,
    targetLanguage: 'zh-CN',
    paidGoogleDataApiCalls: 0,
    hotPepperWebServiceApiCalls: 0,
    rootIdentityRevalidationRequired: true,
    foodPageIdentityRevalidationRequired: true,
    guessedMenuPathsAllowed: false,
    recommendationScope: 'unmatched h3 heading inside explicit Hot Pepper h2 おすすめ料理 section only',
    automaticCanonicalizationPerformed: false,
    cuisineNameBrandInferenceAllowed: false
  },
  summary: {
    eligibleTargets: targets.length,
    targets: selected.length,
    rootIdentityMatched: results.filter((row) => row.rootIdentityMatched).length,
    foodPagesFetched: results.filter((row) => row.foodPageFetched).length,
    explicitRecommendationHeadings: explicitHeadings,
    alreadyRecognizedHeadings: knownHeadings,
    unmatchedHeadingItems: unmatchedRows.length,
    unmatchedRestaurants: new Set(unmatchedRows.map((row) => row.googlePlaceId)).size,
    uniqueUnmatchedHeadings: repeated.length,
    repeatedUnmatchedHeadings: repeated.filter((row) => row.count > 1).length,
    errorTargets: results.filter((row) => row.errors.length).length
  },
  repeatedUnmatchedHeadings: repeated,
  rows: unmatchedRows,
  diagnostics: results.map((row) => ({
    googlePlaceId: row.googlePlaceId,
    restaurantName: row.restaurantName,
    rootIdentityMatched: row.rootIdentityMatched,
    foodPageFetched: row.foodPageFetched,
    explicitHeadings: row.headings.length,
    errors: row.errors
  }))
};
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(payload.summary));
console.log(JSON.stringify({ topUnmatched: repeated.slice(0, 80) }));
