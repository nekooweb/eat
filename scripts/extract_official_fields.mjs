#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(ROOT, '_audit', 'official_extraction_candidates.json');
const CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.OFFICIAL_FETCH_CONCURRENCY || 4)));
const TIMEOUT_MS = Math.max(3000, Number(process.env.OFFICIAL_FETCH_TIMEOUT_MS || 15000));
const USER_AGENT = 'eat-data-maintenance/1.0 (+https://github.com/nekooweb/eat)';

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function loadProduction() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read('data/production_area1.js'), sandbox, { filename: 'production_area1.js' });
  return sandbox.window.PRODUCTION_RESTAURANTS || [];
}

function loadEnrichments() {
  const files = fs.readdirSync(DATA)
    .filter((filename) => /^source_enrichment(?:_[a-z0-9-]+)?\.js$/i.test(filename))
    .sort();
  const sandbox = { window: { RESTAURANTS: [] } };
  vm.createContext(sandbox);
  for (const filename of files) {
    vm.runInContext(read(`data/${filename}`), sandbox, { filename });
  }
  return sandbox.window.RESTAURANTS || [];
}

const production = loadProduction();
const productionById = new Map(production.map((row) => [row.googlePlaceId, row]));
const enrichments = loadEnrichments();

function gaps(row) {
  const missing = [];
  if (!Array.isArray(row?.recommendedDishes) || !row.recommendedDishes.length) missing.push('recommendedDishes');
  if (!row?.hoursReference) missing.push('hoursReference');
  if (!Array.isArray(row?.lunch) && !Array.isArray(row?.dinner)) missing.push('budget');
  if (!row?.address) missing.push('address');
  if (!row?.cuisine || row.cuisine === '餐厅') missing.push('cuisine');
  return missing;
}

const targets = [];
const seen = new Set();
for (const row of enrichments) {
  const productionRow = productionById.get(row.googlePlaceId);
  if (!productionRow) continue;
  for (const ref of row.sourceRefs || []) {
    if (ref.provider !== 'official') continue;
    const key = `${row.googlePlaceId}|${ref.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({
      googlePlaceId: row.googlePlaceId,
      name: productionRow.name,
      sourceUrl: ref.url,
      existingGaps: gaps(productionRow)
    });
  }
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

function stripHtml(html) {
  return decodeEntities(String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(br|p|div|li|tr|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[\t\r ]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function titleFromHtml(html) {
  const match = String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]).slice(0, 200) : null;
}

function jsonLdBlocks(html) {
  const blocks = [];
  const regex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of String(html).matchAll(regex)) {
    const raw = decodeEntities(match[1]).trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch (_) {
      // Invalid JSON-LD is common; keep extraction conservative.
    }
  }
  return blocks;
}

function flattenJsonLd(value, out = []) {
  if (!value) return out;
  if (Array.isArray(value)) {
    for (const item of value) flattenJsonLd(item, out);
    return out;
  }
  if (typeof value !== 'object') return out;
  out.push(value);
  if (Array.isArray(value['@graph'])) flattenJsonLd(value['@graph'], out);
  return out;
}

const FOOD_TYPES = new Set([
  'Restaurant', 'FoodEstablishment', 'CafeOrCoffeeShop', 'Bakery', 'BarOrPub',
  'FastFoodRestaurant', 'IceCreamShop', 'Winery'
]);

function typesOf(node) {
  const value = node?.['@type'];
  return Array.isArray(value) ? value : value ? [value] : [];
}

function flattenAddress(address) {
  if (!address) return null;
  if (typeof address === 'string') return address.trim() || null;
  const parts = [
    address.postalCode,
    address.addressRegion,
    address.addressLocality,
    address.streetAddress
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

function normalizeOpeningSpec(spec) {
  const rows = Array.isArray(spec) ? spec : spec ? [spec] : [];
  const output = [];
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const day = Array.isArray(item.dayOfWeek) ? item.dayOfWeek.join(',') : item.dayOfWeek;
    const opens = item.opens || '';
    const closes = item.closes || '';
    if (day || opens || closes) output.push([day, [opens, closes].filter(Boolean).join('-')].filter(Boolean).join(' '));
  }
  return output;
}

function structuredFacts(html) {
  const nodes = jsonLdBlocks(html).flatMap((block) => flattenJsonLd(block));
  const foodNodes = nodes.filter((node) => typesOf(node).some((type) => FOOD_TYPES.has(type)));
  const selected = foodNodes.length ? foodNodes : nodes.filter((node) => node?.name && (node?.address || node?.openingHours || node?.openingHoursSpecification));
  const facts = [];
  for (const node of selected.slice(0, 10)) {
    const openingHours = Array.isArray(node.openingHours)
      ? node.openingHours
      : node.openingHours ? [node.openingHours] : [];
    const openingSpecs = normalizeOpeningSpec(node.openingHoursSpecification);
    const menu = node.hasMenu || node.menu || null;
    facts.push({
      types: typesOf(node).slice(0, 6),
      name: typeof node.name === 'string' ? node.name.slice(0, 200) : null,
      address: flattenAddress(node.address),
      openingHours: [...openingHours, ...openingSpecs].filter(Boolean).slice(0, 14),
      cuisine: Array.isArray(node.servesCuisine) ? node.servesCuisine.slice(0, 12) : node.servesCuisine || null,
      priceRange: typeof node.priceRange === 'string' ? node.priceRange.slice(0, 120) : null,
      menu: typeof menu === 'string' ? menu.slice(0, 500) : menu?.url || null
    });
  }
  return facts;
}

function compactSnippet(text, start, length = 160) {
  const left = Math.max(0, start - Math.floor(length / 3));
  return text.slice(left, Math.min(text.length, left + length)).replace(/\s+/g, ' ').trim();
}

function keywordSnippets(text) {
  const regex = /おすすめ|お勧め|人気|名物|看板|定番|自慢|おすすめメニュー/gi;
  const snippets = [];
  for (const match of text.matchAll(regex)) {
    const snippet = compactSnippet(text, match.index || 0, 190);
    if (snippet && !snippets.includes(snippet)) snippets.push(snippet);
    if (snippets.length >= 20) break;
  }
  return snippets;
}

function priceSnippets(text) {
  const regex = /(?:¥|￥)\s?\d[\d,]*|\d[\d,]*\s?円/g;
  const snippets = [];
  for (const match of text.matchAll(regex)) {
    const snippet = compactSnippet(text, match.index || 0, 150);
    if (snippet && !snippets.includes(snippet)) snippets.push(snippet);
    if (snippets.length >= 30) break;
  }
  return snippets;
}

function menuLinks(html, baseUrl) {
  const candidates = [];
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html).matchAll(regex)) {
    const href = match[1];
    const label = stripHtml(match[2]).slice(0, 120);
    if (!/(menu|メニュー|料理|お品書き|food|drink)/i.test(`${href} ${label}`)) continue;
    try {
      const url = new URL(href, baseUrl).href;
      if (!candidates.some((item) => item.url === url)) candidates.push({ label, url });
    } catch (_) {
      // Ignore invalid links.
    }
    if (candidates.length >= 20) break;
  }
  return candidates;
}

async function fetchTarget(target) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(target.sourceUrl, {
      redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
        'accept': 'text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5',
        'accept-language': 'ja,en;q=0.8'
      },
      signal: controller.signal
    });
    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();
    const html = /html|xhtml/i.test(contentType) || /<html\b/i.test(body) ? body : '';
    const text = html ? stripHtml(html) : body.replace(/\s+/g, ' ').trim();
    return {
      ...target,
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      contentType: contentType.slice(0, 160),
      fetchedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      title: html ? titleFromHtml(html) : null,
      structuredFacts: html ? structuredFacts(html) : [],
      recommendationSnippets: html ? keywordSnippets(text) : [],
      priceSnippets: html ? priceSnippets(text) : [],
      menuLinks: html ? menuLinks(html, response.url) : [],
      error: null
    };
  } catch (error) {
    return {
      ...target,
      ok: false,
      status: null,
      finalUrl: null,
      contentType: null,
      fetchedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      title: null,
      structuredFacts: [],
      recommendationSnippets: [],
      priceSnippets: [],
      menuLinks: [],
      error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error)
    };
  } finally {
    clearTimeout(timer);
  }
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
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

const results = await mapLimit(targets, CONCURRENCY, fetchTarget);
const summary = {
  targetCount: targets.length,
  fetchedOk: results.filter((row) => row.ok).length,
  fetchedFailed: results.filter((row) => !row.ok).length,
  withStructuredFacts: results.filter((row) => row.structuredFacts.length).length,
  withRecommendationSignals: results.filter((row) => row.recommendationSnippets.length).length,
  withPriceSignals: results.filter((row) => row.priceSnippets.length).length,
  withMenuLinks: results.filter((row) => row.menuLinks.length).length,
  hosts: [...new Set(results.map((row) => {
    try { return new URL(row.finalUrl || row.sourceUrl).hostname.replace(/^www\./, ''); } catch (_) { return null; }
  }).filter(Boolean))].sort()
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify({ summary, results }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary));
