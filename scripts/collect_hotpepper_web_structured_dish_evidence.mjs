#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DISH_RULES } from './recommended_dish_extractor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(ROOT, '_audit', 'hotpepper_web_structured_dish_evidence.json');
const SHARD_INDEX = Number(process.argv[3] || process.env.HOTPEPPER_WEB_SHARD_INDEX || 0);
const SHARD_COUNT = Number(process.argv[4] || process.env.HOTPEPPER_WEB_SHARD_COUNT || 1);
const CONCURRENCY = Math.max(1, Math.min(16, Number(process.env.HOTPEPPER_WEB_CONCURRENCY || 8)));
const TIMEOUT_MS = Math.max(3000, Number(process.env.HOTPEPPER_WEB_TIMEOUT_MS || 8000));
const LIMIT = Math.max(0, Number(process.env.HOTPEPPER_WEB_LIMIT || 0));
const FOOD_PAGE_LIMIT = Math.max(1, Math.min(2, Number(process.env.HOTPEPPER_WEB_FOOD_PAGE_LIMIT || 1)));
const MAX_HTML_CHARS = 1_600_000;
const CHECKED_AT = new Date().toISOString().slice(0, 10);
const USER_AGENT = 'eat-data-maintenance/2.3 (+https://github.com/nekooweb/eat)';
const HOTPEPPER_HOST = /^www\.hotpepper\.jp$/i;
const PRICEISH = /(?:[¥￥]\s*[\d,]+|[\d,]+\s*円|税込|税抜|各種|時価|要問合せ|お問い合わせ)/i;

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
  return {
    html: (await response.text()).slice(0, MAX_HTML_CHARS),
    finalUrl: finalUrl.toString()
  };
}

function tagMatches(html, tagName) {
  const output = [];
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  let match;
  while ((match = pattern.exec(String(html || '')))) {
    output.push({
      index: match.index,
      end: pattern.lastIndex,
      raw: match[0],
      inner: match[1],
      text: pageText(match[1])
    });
  }
  return output;
}

function dishMatchesFromText(text, limit = 6) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const output = [];
  const seen = new Set();
  const hasMeatSushi = /肉寿司/i.test(clean);
  const hasYakisoba = /鉄板焼(?:き)?そば|焼きそば|焼そば/i.test(clean);

  if (hasMeatSushi) {
    seen.add('肉寿司');
    output.push({ nameZh: '肉寿司', nameOriginal: '肉寿司', rule: 'hotpepper-specific:肉寿司' });
  }
  if (hasYakisoba) {
    const match = clean.match(/鉄板焼(?:き)?そば|焼きそば|焼そば/i);
    seen.add('炒面');
    output.push({ nameZh: '炒面', nameOriginal: match?.[0] || '焼きそば', rule: 'hotpepper-specific:焼きそば' });
  }

  for (const [pattern, nameZh] of DISH_RULES) {
    if (hasMeatSushi && nameZh === '寿司') continue;
    if (hasYakisoba && nameZh === '荞麦面') continue;
    const match = clean.match(pattern);
    if (!match || seen.has(nameZh)) continue;
    seen.add(nameZh);
    output.push({ nameZh, nameOriginal: match[0], rule: pattern.source });
    if (output.length >= limit) break;
  }
  return output;
}

function sourceItem(match, sourceUrl, evidenceClass, evidenceRule, snippet) {
  return {
    nameZh: String(match.nameZh || '').trim(),
    nameJa: String(match.nameOriginal || match.nameZh || '').trim().slice(0, 80),
    provider: 'Hot Pepper',
    sourceUrl,
    checkedAt: CHECKED_AT,
    evidenceClass,
    evidenceRule,
    evidenceSnippet: String(snippet || '').replace(/\s+/g, ' ').trim().slice(0, 90)
  };
}

function explicitRecommendedHeadingMatches(html, sourceUrl) {
  const h2s = tagMatches(html, 'h2');
  const output = [];
  for (let i = 0; i < h2s.length; i += 1) {
    if (!/おすすめ料理/.test(h2s[i].text)) continue;
    const start = h2s[i].end;
    const end = h2s[i + 1]?.index ?? String(html || '').length;
    const section = String(html || '').slice(start, end);
    for (const h3 of tagMatches(section, 'h3')) {
      const heading = h3.text.replace(/^[【〖\[]|[】〗\]]$/g, '').trim();
      if (!heading || heading.length > 180) continue;
      for (const match of dishMatchesFromText(heading, 4)) {
        output.push(sourceItem(
          match,
          sourceUrl,
          'source_recommendation_text',
          `hotpepper-explicit-recommended-h3:${match.rule}`,
          heading
        ));
      }
    }
  }
  return output;
}

function priceBackedFoodHeadingMatches(html, sourceUrl) {
  const h4s = tagMatches(html, 'h4');
  const output = [];
  for (let i = 0; i < h4s.length; i += 1) {
    const heading = h4s[i].text.replace(/^[【〖\[]|[】〗\]]$/g, '').trim();
    if (!heading || heading.length > 160) continue;
    const nextBoundary = h4s[i + 1]?.index ?? Math.min(String(html || '').length, h4s[i].end + 700);
    const neighborhood = pageText(String(html || '').slice(h4s[i].end, Math.min(nextBoundary, h4s[i].end + 700)));
    if (!PRICEISH.test(neighborhood)) continue;
    for (const match of dishMatchesFromText(heading, 4)) {
      output.push(sourceItem(
        match,
        sourceUrl,
        'hotpepper_menu_text',
        `hotpepper-price-backed-h4:${match.rule}`,
        `${heading} ${neighborhood}`
      ));
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
      if (links.length >= FOOD_PAGE_LIMIT) break;
    } catch {
      // malformed links are ignored
    }
  }
  return links;
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
  const errors = [];
  const recommended = [];
  const featured = [];
  let rootTitle = '';
  let nameMatched = false;
  let foodPagesDiscovered = 0;
  let foodPagesFetched = 0;

  try {
    const root = await fetchHtml(target.sourceUrl);
    rootTitle = titleFromHtml(root.html);
    const identityText = normalize(`${rootTitle} ${pageText(root.html).slice(0, 16000)}`);
    const candidateNames = [target.sourceName, target.name].map(normalize).filter((value) => value.length >= 2);
    nameMatched = candidateNames.some((name) => identityText.includes(name));
    if (!nameMatched) throw new Error('exact-bound page no longer contains retained/runtime restaurant name');

    const foodLinks = discoveredFoodLinks(root.html, root.finalUrl);
    foodPagesDiscovered = foodLinks.length;
    for (const foodUrl of foodLinks) {
      try {
        const food = await fetchHtml(foodUrl);
        if (!food.finalUrl.startsWith(restaurantBase(root.finalUrl))) throw new Error('food redirect escaped restaurant scope');
        const foodIdentity = normalize(`${titleFromHtml(food.html)} ${pageText(food.html).slice(0, 8000)}`);
        if (!candidateNames.some((name) => foodIdentity.includes(name))) throw new Error('food page identity mismatch');
        foodPagesFetched += 1;
        recommended.push(...explicitRecommendedHeadingMatches(food.html, food.finalUrl));
        featured.push(...priceBackedFoodHeadingMatches(food.html, food.finalUrl));
      } catch (error) {
        errors.push(`${foodUrl}: ${error?.message || error}`);
      }
    }
  } catch (error) {
    errors.push(`${target.sourceUrl}: ${error?.message || error}`);
  }

  const rec = dedupe(recommended, 6);
  const recNames = new Set(rec.map((item) => item.nameZh));
  const feat = dedupe(featured, 14).filter((item) => !recNames.has(item.nameZh)).slice(0, 10);
  return {
    googlePlaceId: target.googlePlaceId,
    name: target.name,
    sourceName: target.sourceName,
    sourceUrl: target.sourceUrl,
    rootTitle,
    nameMatched,
    foodPagesDiscovered,
    foodPagesFetched,
    recommendedDishes: rec,
    featuredDishes: feat,
    errors: errors.slice(0, 4)
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
  throw new Error('Hot Pepper structured web collector requires frozen 2,804 Place-ID baseline');
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
  schemaVersion: 2,
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
    reviewTextAllowed: false,
    relatedKeywordFooterAllowed: false,
    coursePageOrdinaryDishExtractionAllowed: false,
    recommendationScope: 'h3 dish title inside explicit Hot Pepper h2 おすすめ料理 section on /food/ page only',
    featuredScope: 'price-backed h4 menu-item title on exact restaurant /food/ or /menu/ page only',
    recommendationRequiresExplicitRecommendationSemantics: true,
    ordinaryMenuDishBecomesFeaturedOnly: true,
    cuisineNameBrandInferenceAllowed: false,
    rawHtmlPersisted: false,
    targetLanguage: 'zh-CN',
    preserveSourceOriginal: true,
    shardIndex: SHARD_INDEX,
    shardCount: SHARD_COUNT
  },
  summary: {
    shardIndex: SHARD_INDEX,
    shardCount: SHARD_COUNT,
    eligibleTargetsBeforeLimit: targets.length,
    targets: selected.length,
    successfulIdentityPages: results.filter((row) => row.nameMatched).length,
    foodPagesDiscovered: results.reduce((sum, row) => sum + row.foodPagesDiscovered, 0),
    foodPagesFetched: results.reduce((sum, row) => sum + row.foodPagesFetched, 0),
    evidenceRestaurants: rows.length,
    recommendationRestaurants: rows.filter((row) => row.recommendedDishes.length).length,
    featuredRestaurants: rows.filter((row) => row.featuredDishes.length).length,
    recommendationItems: rows.reduce((sum, row) => sum + row.recommendedDishes.length, 0),
    featuredItems: rows.reduce((sum, row) => sum + row.featuredDishes.length, 0),
    errorTargets: results.filter((row) => row.errors.length).length,
    identityRejected: results.filter((row) => !row.nameMatched).length
  },
  diagnostics: results.map((row) => ({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    rootTitle: row.rootTitle,
    nameMatched: row.nameMatched,
    foodPagesDiscovered: row.foodPagesDiscovered,
    foodPagesFetched: row.foodPagesFetched,
    recommendationItems: row.recommendedDishes.length,
    featuredItems: row.featuredDishes.length,
    errors: row.errors
  })),
  rows
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(payload.summary));
