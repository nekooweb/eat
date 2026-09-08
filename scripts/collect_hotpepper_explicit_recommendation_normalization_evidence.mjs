#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { normalizeExplicitHotPepperRecommendationHeading } from './hotpepper_explicit_recommendation_normalizer.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(ROOT, '_audit', 'hotpepper_explicit_recommendation_normalization_evidence.json');
const CONCURRENCY = Math.max(1, Math.min(16, Number(process.env.HOTPEPPER_EXPLICIT_CONCURRENCY || 8)));
const TIMEOUT_MS = Math.max(3000, Number(process.env.HOTPEPPER_EXPLICIT_TIMEOUT_MS || 8000));
const LIMIT = Math.max(0, Number(process.env.HOTPEPPER_EXPLICIT_LIMIT || 0));
const CHECKED_AT = new Date().toISOString().slice(0, 10);
const USER_AGENT = 'eat-data-maintenance/2.5 (+https://github.com/nekooweb/eat)';
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
  const output = [];
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
      output.push(url.toString());
      if (output.length >= 1) break;
    } catch {
      // malformed links are ignored
    }
  }
  return output;
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

function sourceItem(match, sourceUrl, heading) {
  return {
    nameZh: match.nameZh,
    nameJa: String(match.nameOriginal || match.nameZh).slice(0, 80),
    provider: 'Hot Pepper',
    sourceUrl,
    checkedAt: CHECKED_AT,
    evidenceClass: 'source_recommendation_text',
    evidenceRule: `hotpepper-explicit-recommended-h3:normalized-${match.rule}`,
    evidenceSnippet: String(heading || match.evidenceSnippet || '').replace(/\s+/g, ' ').trim().slice(0, 90)
  };
}

function dedupe(items, limit = 8) {
  const map = new Map();
  for (const item of items || []) {
    const key = `${item.nameZh}|${item.provider}|${item.sourceUrl}|${item.evidenceClass}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()].slice(0, limit);
}

async function inspectTarget(target) {
  const output = {
    googlePlaceId: target.googlePlaceId,
    name: target.name,
    sourceName: target.sourceName,
    sourceUrl: target.sourceUrl,
    rootIdentityMatched: false,
    foodPageFetched: false,
    explicitHeadings: 0,
    matchedHeadings: 0,
    recommendedDishes: [],
    unmatchedHeadings: [],
    errors: []
  };
  try {
    const root = await fetchHtml(target.sourceUrl);
    const names = [target.sourceName, target.name].map(normalizeIdentity).filter((value) => value.length >= 2);
    const rootIdentity = normalizeIdentity(`${titleFromHtml(root.html)} ${pageText(root.html).slice(0, 16000)}`);
    if (!names.some((name) => rootIdentity.includes(name))) throw new Error('root identity mismatch');
    output.rootIdentityMatched = true;
    for (const foodUrl of discoveredFoodLinks(root.html, root.finalUrl)) {
      try {
        const food = await fetchHtml(foodUrl);
        if (!food.finalUrl.startsWith(restaurantBase(root.finalUrl))) throw new Error('food page escaped restaurant scope');
        const foodIdentity = normalizeIdentity(`${titleFromHtml(food.html)} ${pageText(food.html).slice(0, 8000)}`);
        if (!names.some((name) => foodIdentity.includes(name))) throw new Error('food identity mismatch');
        output.foodPageFetched = true;
        for (const heading of explicitRecommendationHeadings(food.html)) {
          output.explicitHeadings += 1;
          const matches = normalizeExplicitHotPepperRecommendationHeading(heading, 5);
          if (!matches.length) {
            output.unmatchedHeadings.push(heading);
            continue;
          }
          output.matchedHeadings += 1;
          for (const match of matches) output.recommendedDishes.push(sourceItem(match, food.finalUrl, heading));
        }
      } catch (error) {
        output.errors.push(`${foodUrl}: ${error?.message || error}`);
      }
    }
  } catch (error) {
    output.errors.push(`${target.sourceUrl}: ${error?.message || error}`);
  }
  output.recommendedDishes = dedupe(output.recommendedDishes, 8);
  output.unmatchedHeadings = [...new Set(output.unmatchedHeadings)].slice(0, 12);
  return output;
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
  throw new Error('Explicit Hot Pepper normalization collector requires frozen 2,804 Place-ID baseline');
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
    name: runtime.name,
    sourceName: String(factRow.facts?.name || '').trim(),
    sourceUrl: sourceUrl.toString()
  });
}
targets.sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));
const selected = LIMIT > 0 ? targets.slice(0, LIMIT) : targets;
const results = await mapLimit(selected, CONCURRENCY, inspectTarget);
const rows = results
  .filter((row) => row.recommendedDishes.length)
  .map((row) => ({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    recommendedDishes: row.recommendedDishes,
    featuredDishes: []
  }))
  .sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));

const payload = {
  schemaVersion: 1,
  checkedAt: CHECKED_AT,
  policy: {
    catalogIdentityKey: 'frozen Place ID only',
    catalogTotal: 2804,
    paidGoogleDataApiCalls: 0,
    hotPepperWebServiceApiCalls: 0,
    networkSource: 'exact already-retained Hot Pepper restaurant public web URL only',
    rootIdentityRevalidationRequired: true,
    foodPageIdentityRevalidationRequired: true,
    restaurantScopedSameOriginLinksOnly: true,
    guessedMenuPathsAllowed: false,
    recommendationScope: 'curated concrete-dish normalization of h3 headings inside explicit Hot Pepper h2 おすすめ料理 section only',
    genericPageTextAllowed: false,
    courseOrDrinkInferenceAllowed: false,
    cuisineNameBrandInferenceAllowed: false,
    automaticTranslationOutsideCuratedRulesAllowed: false,
    targetLanguage: 'zh-CN',
    preserveSourceOriginal: true,
    rawHtmlPersisted: false
  },
  summary: {
    eligibleTargets: targets.length,
    targets: selected.length,
    rootIdentityMatched: results.filter((row) => row.rootIdentityMatched).length,
    foodPagesFetched: results.filter((row) => row.foodPageFetched).length,
    explicitRecommendationHeadings: results.reduce((sum, row) => sum + row.explicitHeadings, 0),
    matchedHeadings: results.reduce((sum, row) => sum + row.matchedHeadings, 0),
    unmatchedHeadings: results.reduce((sum, row) => sum + row.unmatchedHeadings.length, 0),
    evidenceRestaurants: rows.length,
    recommendationItems: rows.reduce((sum, row) => sum + row.recommendedDishes.length, 0),
    errorTargets: results.filter((row) => row.errors.length).length
  },
  rows,
  diagnostics: results.map((row) => ({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    rootIdentityMatched: row.rootIdentityMatched,
    foodPageFetched: row.foodPageFetched,
    explicitHeadings: row.explicitHeadings,
    matchedHeadings: row.matchedHeadings,
    recommendationItems: row.recommendedDishes.length,
    unmatchedHeadings: row.unmatchedHeadings,
    errors: row.errors
  }))
};
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(payload.summary));
console.log(JSON.stringify({sampleRows: rows.slice(0, 40)}));
