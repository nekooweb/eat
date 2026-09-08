#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  DISH_RULES,
  MENU_LINK_MARKER,
  extractStrictRecommendationsFromHtml,
  htmlToTextBlocks
} from './recommended_dish_extractor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(ROOT, '_audit', 'hotpepper_web_dish_evidence.json');
const SHARD_INDEX = Number(process.argv[3] || process.env.HOTPEPPER_WEB_SHARD_INDEX || 0);
const SHARD_COUNT = Number(process.argv[4] || process.env.HOTPEPPER_WEB_SHARD_COUNT || 1);
const CONCURRENCY = Math.max(1, Math.min(16, Number(process.env.HOTPEPPER_WEB_CONCURRENCY || 8)));
const TIMEOUT_MS = Math.max(3000, Number(process.env.HOTPEPPER_WEB_TIMEOUT_MS || 8000));
const LIMIT = Math.max(0, Number(process.env.HOTPEPPER_WEB_LIMIT || 0));
const MENU_PAGE_LIMIT = Math.max(1, Math.min(5, Number(process.env.HOTPEPPER_WEB_MENU_PAGE_LIMIT || 4)));
const MAX_HTML_CHARS = 1_500_000;
const CHECKED_AT = new Date().toISOString().slice(0, 10);
const USER_AGENT = 'eat-data-maintenance/2.2 (+https://github.com/nekooweb/eat)';
const HOTPEPPER_HOST = /^www\.hotpepper\.jp$/i;
const NON_MENU_BLOCK = /営業時間|アクセス|店舗情報|予約|電話番号|住所|口コミ|レビュー|写真|地図|copyright|instagram|facebook|空席|クーポン/i;

if (!Number.isInteger(SHARD_INDEX) || !Number.isInteger(SHARD_COUNT) || SHARD_COUNT < 1 || SHARD_COUNT > 32 || SHARD_INDEX < 0 || SHARD_INDEX >= SHARD_COUNT) {
  throw new Error(`Invalid shard ${SHARD_INDEX}/${SHARD_COUNT}`);
}

function loadWindowFile(filename) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
  return sandbox.window;
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value || '')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function normalize(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆!！?？.,，。:：/\\]+/g, '');
}

function safeHotPepperUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !HOTPEPPER_HOST.test(url.hostname)) return null;
    const match = url.pathname.match(/^\/strJ\d+\//i);
    if (!match) return null;
    url.protocol = 'https:';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function restaurantBase(urlValue) {
  const url = safeHotPepperUrl(urlValue);
  if (!url) return null;
  const match = url.pathname.match(/^(\/strJ\d+\/)/i);
  if (!match) return null;
  return new URL(match[1], url.origin).toString();
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

function sourceItem(match, sourceUrl, evidenceClass, rule, snippet = '') {
  return {
    nameZh: String(match.nameZh || '').trim(),
    nameJa: String(match.nameOriginal || match.nameJa || match.nameZh || '').trim().slice(0, 80),
    provider: 'Hot Pepper',
    sourceUrl,
    checkedAt: CHECKED_AT,
    evidenceClass,
    evidenceRule: rule,
    evidenceSnippet: String(snippet || match.evidenceSnippet || match.nameOriginal || '').replace(/\s+/g, ' ').trim().slice(0, 90)
  };
}

function featuredMatchesFromMenuHtml(html, limit = 12) {
  const output = [];
  const seen = new Set();
  for (const rawBlock of htmlToTextBlocks(html)) {
    const block = String(rawBlock || '').replace(/\s+/g, ' ').trim();
    if (block.length < 2 || block.length > 220 || NON_MENU_BLOCK.test(block)) continue;
    for (const [pattern, nameZh] of DISH_RULES) {
      const match = block.match(pattern);
      if (!match || seen.has(nameZh)) continue;
      seen.add(nameZh);
      output.push({ nameZh, nameOriginal: match[0], rule: pattern.source, evidenceSnippet: block.slice(0, 90) });
      if (output.length >= limit) return output;
    }
  }
  return output;
}

function menuLinks(html, rootUrl, limit = MENU_PAGE_LIMIT) {
  const base = restaurantBase(rootUrl);
  if (!base) return [];
  const root = new URL(base);
  const output = [];
  const seen = new Set();
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(String(html || '')))) {
    const label = pageText(match[2]);
    if (!MENU_LINK_MARKER.test(`${match[1]} ${label}`) && !/(?:\/food\/|\/course\/|\/menu\/)/i.test(match[1])) continue;
    try {
      const url = new URL(match[1], root);
      url.hash = '';
      if (!HOTPEPPER_HOST.test(url.hostname) || !url.toString().startsWith(base)) continue;
      if (/\/(?:photo|review|map|coupon|report)\//i.test(url.pathname)) continue;
      if (!/(?:\/food\/|\/course\/|\/menu\/)|料理|メニュー|コース/i.test(`${url.pathname} ${label}`)) continue;
      const key = url.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(key);
      if (output.length >= limit) break;
    } catch {
      // malformed links are ignored
    }
  }
  return output;
}

function dedupe(items, limit = 12) {
  const map = new Map();
  for (const item of items || []) {
    if (!item?.nameZh || !item?.sourceUrl) continue;
    const key = `${item.nameZh}|${item.provider}|${item.sourceUrl}|${item.evidenceClass}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()].slice(0, limit);
}

async function inspectTarget(target) {
  const started = Date.now();
  const recommended = [];
  const featured = [];
  const errors = [];
  let rootTitle = '';
  let nameMatched = false;
  let menuPagesAttempted = 0;
  let menuPagesFetched = 0;
  let discoveredMenuUrls = [];
  let finalRootUrl = target.sourceUrl;

  try {
    const fetched = await fetchHtml(target.sourceUrl);
    finalRootUrl = fetched.finalUrl;
    rootTitle = titleFromHtml(fetched.html);
    const identityText = normalize(`${rootTitle} ${pageText(fetched.html).slice(0, 16000)}`);
    const candidateNames = [target.sourceName, target.name].map(normalize).filter((name) => name.length >= 2);
    nameMatched = candidateNames.some((name) => identityText.includes(name));
    if (!nameMatched) throw new Error('exact-bound page no longer contains retained/runtime restaurant name');

    for (const match of extractStrictRecommendationsFromHtml(fetched.html, 4)) {
      recommended.push(sourceItem(match, finalRootUrl, 'source_recommendation_text', `hotpepper-root-recommendation:${match.rule}`));
    }
    discoveredMenuUrls = menuLinks(fetched.html, finalRootUrl, MENU_PAGE_LIMIT);
  } catch (error) {
    errors.push(`${target.sourceUrl}: ${error?.message || error}`);
  }

  if (nameMatched) {
    for (const menuUrl of discoveredMenuUrls) {
      menuPagesAttempted += 1;
      try {
        const fetched = await fetchHtml(menuUrl);
        if (!fetched.finalUrl.startsWith(restaurantBase(finalRootUrl))) throw new Error('menu redirect escaped restaurant scope');
        menuPagesFetched += 1;
        for (const match of extractStrictRecommendationsFromHtml(fetched.html, 5)) {
          recommended.push(sourceItem(match, fetched.finalUrl, 'source_recommendation_text', `hotpepper-menu-recommendation:${match.rule}`));
        }
        for (const match of featuredMatchesFromMenuHtml(fetched.html, 14)) {
          featured.push(sourceItem(match, fetched.finalUrl, 'hotpepper_menu_text', `hotpepper-menu-text:${match.rule}`, match.evidenceSnippet));
        }
      } catch (error) {
        errors.push(`${menuUrl}: ${error?.message || error}`);
      }
    }
  }

  const rec = dedupe(recommended, 8);
  const recNames = new Set(rec.map((item) => item.nameZh));
  const feat = dedupe(featured, 14).filter((item) => !recNames.has(item.nameZh)).slice(0, 10);
  return {
    googlePlaceId: target.googlePlaceId,
    name: target.name,
    sourceName: target.sourceName,
    sourceUrl: target.sourceUrl,
    finalRootUrl,
    rootTitle,
    nameMatched,
    menuPagesDiscovered: discoveredMenuUrls.length,
    menuPagesAttempted,
    menuPagesFetched,
    recommendedDishes: rec,
    featuredDishes: feat,
    errors: errors.slice(0, 4),
    elapsedMs: Date.now() - started
  };
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
  throw new Error('Hot Pepper web collector requires frozen 2,804 Place-ID baseline');
}
const runtimeById = new Map(runtimeRows.map((row) => [row.googlePlaceId, row]));
const factsPayload = JSON.parse(fs.readFileSync(path.join(DATA, 'hotpepper_catalog_facts.json'), 'utf8'));
const targets = [];
for (const factRow of factsPayload.rows || []) {
  const runtime = runtimeById.get(factRow.googlePlaceId);
  if (!runtime || !runtime.nameKnown || !String(runtime.name || '').trim()) continue;
  const hasRecommended = Array.isArray(runtime.recommendedDishes) && runtime.recommendedDishes.length > 0;
  const hasFeatured = Array.isArray(runtime.featuredDishes) && runtime.featuredDishes.length > 0;
  if (hasRecommended && hasFeatured) continue;
  if (fnv1a(runtime.googlePlaceId) % SHARD_COUNT !== SHARD_INDEX) continue;
  const sourceUrl = safeHotPepperUrl(factRow.facts?.urls?.pc || factRow.facts?.urls?.mobile);
  if (!sourceUrl) continue;
  targets.push({
    googlePlaceId: runtime.googlePlaceId,
    name: runtime.name,
    sourceName: String(factRow.facts?.name || '').trim(),
    sourceUrl: sourceUrl.toString(),
    hadRecommended: hasRecommended,
    hadFeatured: hasFeatured
  });
}
targets.sort((a, b) => Number(a.hadFeatured) - Number(b.hadFeatured) || Number(a.hadRecommended) - Number(b.hadRecommended) || a.googlePlaceId.localeCompare(b.googlePlaceId));
const selected = LIMIT > 0 ? targets.slice(0, LIMIT) : targets;
const results = await mapLimit(selected, CONCURRENCY, inspectTarget);
const rows = results
  .filter((row) => row.recommendedDishes.length || row.featuredDishes.length)
  .map((row) => ({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    recommendedDishes: row.recommendedDishes,
    featuredDishes: row.featuredDishes
  }))
  .sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));

const payload = {
  schemaVersion: 1,
  checkedAt: CHECKED_AT,
  policy: {
    catalogIdentityKey: 'frozen Place ID only',
    catalogTotal: 2804,
    sourceLanguageMayBeJapanese: true,
    targetLanguage: 'zh-CN',
    paidGoogleDataApiCalls: 0,
    networkSource: 'exact already-retained Hot Pepper restaurant web URL only',
    hotPepperWebServiceApiCalls: 0,
    rootIdentityRevalidationRequired: true,
    restaurantScopedSameOriginLinksOnly: true,
    guessedMenuPathsAllowed: false,
    reviewsAsDishEvidenceAllowed: false,
    cuisineNameBrandInferenceAllowed: false,
    recommendationRequiresExplicitRecommendationSemantics: true,
    ordinaryMenuDishBecomesFeaturedOnly: true,
    rawHtmlPersisted: false,
    shardIndex: SHARD_INDEX,
    shardCount: SHARD_COUNT
  },
  summary: {
    shardIndex: SHARD_INDEX,
    shardCount: SHARD_COUNT,
    eligibleTargetsBeforeLimit: targets.length,
    targets: selected.length,
    successfulIdentityPages: results.filter((row) => row.nameMatched).length,
    menuPagesDiscovered: results.reduce((sum, row) => sum + row.menuPagesDiscovered, 0),
    menuPagesAttempted: results.reduce((sum, row) => sum + row.menuPagesAttempted, 0),
    menuPagesFetched: results.reduce((sum, row) => sum + row.menuPagesFetched, 0),
    evidenceRestaurants: rows.length,
    recommendationRestaurants: rows.filter((row) => row.recommendedDishes.length).length,
    featuredRestaurants: rows.filter((row) => row.featuredDishes.length).length,
    recommendationItems: rows.reduce((sum, row) => sum + row.recommendedDishes.length, 0),
    featuredItems: rows.reduce((sum, row) => sum + row.featuredDishes.length, 0),
    errorTargets: results.filter((row) => row.errors.length).length,
    identityRejected: results.filter((row) => !row.nameMatched && row.errors.some((error) => error.includes('restaurant name'))).length,
    statusCounts: results.reduce((acc, row) => {
      const status = row.nameMatched
        ? (row.recommendedDishes.length ? 'recommended_match' : row.featuredDishes.length ? 'menu_match' : 'identity_only')
        : 'identity_or_fetch_failed';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {})
  },
  diagnostics: results.map((row) => ({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    finalRootUrl: row.finalRootUrl,
    rootTitle: row.rootTitle,
    nameMatched: row.nameMatched,
    menuPagesDiscovered: row.menuPagesDiscovered,
    menuPagesFetched: row.menuPagesFetched,
    recommendationItems: row.recommendedDishes.length,
    featuredItems: row.featuredDishes.length,
    errors: row.errors,
    elapsedMs: row.elapsedMs
  })),
  rows
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(payload.summary));
