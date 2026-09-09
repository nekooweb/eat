#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  DISH_RULES,
  MENU_LINK_MARKER,
  extractStrictRecommendationsFromHtml,
  extractStrictRecommendationsFromText,
  extractStructuredMenuItems,
  htmlToTextBlocks
} from './recommended_dish_extractor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(DATA, 'google_inventory_detail_evidence.json');
const DIAGNOSTICS_OUTPUT = String(process.env.INVENTORY_DETAIL_DIAGNOSTICS_OUTPUT || '').trim();
const TIMEOUT_MS = Number(process.env.INVENTORY_DETAIL_FETCH_TIMEOUT_MS || 7000);
const HOST_WORKERS = Math.max(1, Math.min(32, Number(process.env.INVENTORY_DETAIL_HOST_WORKERS || 20)));
const SITE_PAGE_LIMIT = Math.max(2, Math.min(6, Number(process.env.INVENTORY_DETAIL_SITE_PAGE_LIMIT || 5)));
const MENU_LINK_LIMIT = Math.max(1, Math.min(5, Number(process.env.INVENTORY_DETAIL_MENU_LINK_LIMIT || 4)));
const MAX_HTML_CHARS = 1_200_000;
const CHECKED_AT = new Date().toISOString().slice(0, 10);
const USER_AGENT = 'eat-data-maintenance/2.1 (+https://github.com/nekooweb/eat)';
const NON_MENU_BLOCK = /営業時間|アクセス|店舗情報|会社概要|採用情報|プライバシ|予約(?:する|はこちら)?|電話番号|住所|copyright|instagram|facebook/i;
const NON_HTML_MENU_ASSET = /\.(?:jpe?g|png|gif|webp|avif|svg|css|js|mjs|pdf|xml)(?:$|[?#])/i;

function loadWindowFile(filename) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
  return sandbox.window;
}

const runtimeWindow = loadWindowFile('google_inventory_runtime.js');
const runtimeRows = Array.isArray(runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS)
  ? runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS
  : [];
const runtimeStats = runtimeWindow.GOOGLE_INVENTORY_STATS || {};
if (runtimeStats.catalogTotal !== 2804) throw new Error(`Frozen catalog mismatch: ${runtimeStats.catalogTotal}`);
if (runtimeStats.inventoryTotal !== runtimeRows.length) throw new Error('Published runtime/stat count mismatch');
if (runtimeRows.length + Number(runtimeStats.unpublishedPlaceIdOnly || 0) !== 2804) {
  throw new Error('Published + unpublished Place-ID-only rows must reconcile to 2,804');
}
if (runtimeRows.some((row) => !row.googlePlaceId || !row.nameKnown || !String(row.name || '').trim())) {
  throw new Error('Recommendation collector may only crawl named/publishable rows');
}

const provenanceWindow = fs.existsSync(path.join(DATA, 'source_provenance.js'))
  ? loadWindowFile('source_provenance.js')
  : {};
const provenanceRows = provenanceWindow.SOURCE_PROVENANCE?.rows || [];
const provenanceById = new Map(provenanceRows.map((row) => [row.googlePlaceId, row]));
const hotPepperDoc = fs.existsSync(path.join(DATA, 'hotpepper_catalog_facts.json'))
  ? JSON.parse(fs.readFileSync(path.join(DATA, 'hotpepper_catalog_facts.json'), 'utf8'))
  : { rows: [] };
const hotPepperById = new Map((hotPepperDoc.rows || []).filter((row) => row.googlePlaceId).map((row) => [row.googlePlaceId, row]));

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
  if (/openstreetmap\.org$/.test(host)) return false;
  if (/hotpepper\.jp$/.test(host)) return false;
  if (/tabelog\.com$/.test(host)) return false;
  if (/(^|\.)google\./.test(host) || /googleusercontent\.com$/.test(host)) return false;
  if (/facebook\.com$|instagram\.com$|x\.com$|twitter\.com$|youtube\.com$|tiktok\.com$/.test(host)) return false;
  return true;
}

function sourceItem(match, sourceUrl, provider, evidenceClass, evidenceRule, snippet = '') {
  return {
    nameZh: match.nameZh,
    nameJa: String(match.nameOriginal || match.nameJa || match.nameZh).slice(0, 80),
    provider,
    sourceUrl,
    checkedAt: CHECKED_AT,
    evidenceClass,
    evidenceRule,
    evidenceSnippet: String(snippet || match.evidenceSnippet || match.nameOriginal || '').replace(/\s+/g, ' ').trim().slice(0, 90)
  };
}

function featuredMatchesFromText(value, limit = 3) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const output = [];
  const seen = new Set();
  for (const [pattern, nameZh] of DISH_RULES) {
    const match = text.match(pattern);
    if (!match || seen.has(nameZh)) continue;
    seen.add(nameZh);
    output.push({ nameZh, nameOriginal: match[0], rule: pattern.source, evidenceSnippet: text.slice(0, 90) });
    if (output.length >= limit) break;
  }
  return output;
}

function plainMenuMatchesFromHtml(html, limit = 6) {
  const output = [];
  const seen = new Set();
  for (const rawBlock of htmlToTextBlocks(html)) {
    const block = String(rawBlock || '').replace(/\s+/g, ' ').trim();
    if (block.length < 2 || block.length > 180 || NON_MENU_BLOCK.test(block)) continue;
    for (const match of featuredMatchesFromText(block, 3)) {
      if (seen.has(match.nameZh)) continue;
      seen.add(match.nameZh);
      output.push({ ...match, evidenceSnippet: block.slice(0, 90) });
      if (output.length >= limit) return output;
    }
  }
  return output;
}

function candidateUrls(row) {
  const urls = new Set();
  for (const raw of row.sourceWebsites || []) {
    if (eligibleWebsite(raw)) urls.add(safeUrl(raw).toString());
  }
  const prov = provenanceById.get(row.googlePlaceId);
  for (const link of prov?.sourceLinks || []) {
    if (String(link?.provider || '').toLowerCase() !== 'official') continue;
    if (eligibleWebsite(link.url)) urls.add(safeUrl(link.url).toString());
  }
  return [...urls];
}

function menuLinks(html, baseUrl, limit = MENU_LINK_LIMIT) {
  if (limit <= 0) return [];
  const output = [];
  const seen = new Set();
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(html))) {
    const label = htmlToTextBlocks(match[2]).join(' ');
    if (!MENU_LINK_MARKER.test(`${match[1]} ${label}`)) continue;
    try {
      const url = new URL(match[1], baseUrl);
      const base = new URL(baseUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== base.hostname) continue;
      url.hash = '';
      const key = url.toString();
      if (seen.has(key) || key === baseUrl) continue;
      seen.add(key);
      output.push(key);
      if (output.length >= limit) break;
    } catch {
      // malformed links are not evidence
    }
  }
  return output;
}

function walkJson(value, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, visit);
    return;
  }
  if (!value || typeof value !== 'object') return;
  visit(value);
  for (const item of Object.values(value)) walkJson(item, visit);
}

function structuredMenuLinks(html, baseUrl, limit = MENU_LINK_LIMIT) {
  if (limit <= 0) return [];
  const output = [];
  const seen = new Set();
  const candidates = [];
  const scriptRe = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  function collectMenuReference(value) {
    if (Array.isArray(value)) {
      for (const item of value) collectMenuReference(item);
      return;
    }
    if (typeof value === 'string') {
      candidates.push(value);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const key of ['url', '@id']) {
      if (typeof value[key] === 'string') candidates.push(value[key]);
    }
  }

  while ((match = scriptRe.exec(String(html || '')))) {
    try {
      const data = JSON.parse(match[1].trim());
      walkJson(data, (obj) => {
        for (const key of ['hasMenu', 'menu']) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) collectMenuReference(obj[key]);
        }
      });
    } catch {
      // Invalid JSON-LD is ignored; it is not a usable structured menu relation.
    }
  }

  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  for (const raw of candidates) {
    try {
      const url = new URL(raw, baseUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== base.hostname) continue;
      url.hash = '';
      const key = url.toString();
      if (key === baseUrl || NON_HTML_MENU_ASSET.test(key) || seen.has(key)) continue;
      seen.add(key);
      output.push(key);
      if (output.length >= limit) break;
    } catch {
      // malformed structured menu references are ignored
    }
  }
  return output;
}

function isMenuContextPage(url, index) {
  if (index > 0) return true;
  try {
    const parsed = new URL(url);
    return MENU_LINK_MARKER.test(`${parsed.pathname} ${parsed.search}`);
  } catch {
    return false;
  }
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1'
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new Error(`non-html ${contentType}`);
  return (await response.text()).slice(0, MAX_HTML_CHARS);
}

function dedupeDishes(items, limit = 6) {
  const map = new Map();
  for (const item of items || []) {
    if (!item?.nameZh || !item?.sourceUrl) continue;
    const key = `${item.nameZh}|${item.provider}|${item.sourceUrl}|${item.evidenceClass}`;
    const old = map.get(key);
    if (!old || String(item.checkedAt || '') >= String(old.checkedAt || '')) map.set(key, item);
  }
  return [...map.values()].slice(0, limit);
}

async function inspectWebsite(rootUrl) {
  const urls = [rootUrl];
  const errors = [];
  const recommendedDishes = [];
  const featuredDishes = [];
  const visited = new Set();
  let plainMenuItemCount = 0;
  let structuredMenuLinksDiscovered = 0;
  for (let index = 0; index < urls.length && index < SITE_PAGE_LIMIT; index += 1) {
    const url = urls[index];
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      const html = await fetchHtml(url);
      for (const match of extractStrictRecommendationsFromHtml(html, 3)) {
        recommendedDishes.push(sourceItem(match, url, 'sourceWebsite', 'source_recommendation_text', `html-block:${match.rule}`));
      }
      for (const match of extractStructuredMenuItems(html, 6)) {
        featuredDishes.push(sourceItem(match, url, 'sourceWebsite', 'structured_menu_item', `jsonld-menuitem:${match.rule}`));
      }
      if (isMenuContextPage(url, index)) {
        const plain = plainMenuMatchesFromHtml(html, 6);
        plainMenuItemCount += plain.length;
        for (const match of plain) {
          featuredDishes.push(sourceItem(match, url, 'sourceWebsite', 'source_menu_text', `menu-page-text:${match.rule}`, match.evidenceSnippet));
        }
      }
      if (index === 0) {
        const structured = structuredMenuLinks(html, url, MENU_LINK_LIMIT);
        structuredMenuLinksDiscovered += structured.length;
        const remaining = Math.max(0, MENU_LINK_LIMIT - structured.length);
        const anchors = menuLinks(html, url, remaining).filter((candidate) => !structured.includes(candidate));
        urls.push(...structured, ...anchors);
      }
    } catch (error) {
      errors.push(`${url}: ${error?.message || error}`);
    }
  }
  const recommended = dedupeDishes(recommendedDishes, 3);
  const recommendedNames = new Set(recommended.map((item) => item.nameZh));
  const featured = dedupeDishes(featuredDishes, 8).filter((item) => !recommendedNames.has(item.nameZh)).slice(0, 6);
  return {
    status: recommended.length ? 'recommended_match' : featured.length ? 'menu_match' : errors.length ? 'no_match_with_errors' : 'no_match',
    recommendedDishes: recommended,
    featuredDishes: featured,
    plainMenuItemCount,
    structuredMenuLinksDiscovered,
    errors: errors.slice(0, 2),
    visitedUrls: [...visited].slice(0, SITE_PAGE_LIMIT)
  };
}

async function main() {
  const evidenceById = new Map();
  let hotPepperRecommendedRestaurants = 0;
  let hotPepperFeaturedRestaurants = 0;

  // Hot Pepper is consumed from the already-retained provider artifact. No live
  // Hot Pepper request is made here. Catch copy with explicit recommendation
  // wording becomes recommended; otherwise concrete dish mentions are featured.
  for (const row of runtimeRows) {
    const hp = hotPepperById.get(row.googlePlaceId);
    const facts = hp?.facts || {};
    const catchText = String(facts.catch || '').trim();
    if (!catchText) continue;
    const sourceUrl = facts.urls?.pc || facts.urls?.mobile || '';
    if (!/^https:\/\//.test(sourceUrl)) continue;
    const strict = extractStrictRecommendationsFromText(catchText, 3)
      .map((match) => sourceItem(match, sourceUrl, 'Hot Pepper', 'source_recommendation_text', `hotpepper-catch:${match.rule}`, catchText));
    const featured = strict.length ? [] : featuredMatchesFromText(catchText, 3)
      .map((match) => sourceItem(match, sourceUrl, 'Hot Pepper', 'provider_promotional_dish_text', `hotpepper-catch-menu:${match.rule}`, catchText));
    if (strict.length) hotPepperRecommendedRestaurants += 1;
    if (featured.length) hotPepperFeaturedRestaurants += 1;
    if (strict.length || featured.length) {
      evidenceById.set(row.googlePlaceId, {
        googlePlaceId: row.googlePlaceId,
        name: row.name,
        recommendedDishes: strict,
        featuredDishes: featured
      });
    }
  }

  // Official pages are crawled for named public rows missing either strict
  // recommendations or source-backed featured/menu dishes. Tabelog/Hot Pepper/
  // social/Google pages are not fetched here; retained provider artifacts remain
  // the only path for those sources.
  const crawlTasks = [];
  for (const row of runtimeRows) {
    const hasRecommended = Array.isArray(row.recommendedDishes) && row.recommendedDishes.length > 0;
    const hasFeatured = Array.isArray(row.featuredDishes) && row.featuredDishes.length > 0;
    if (hasRecommended && hasFeatured) continue;
    for (const url of candidateUrls(row)) crawlTasks.push({ row, url });
  }

  const byHost = new Map();
  for (const task of crawlTasks) {
    const host = safeUrl(task.url)?.hostname?.toLowerCase();
    if (!host) continue;
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(task);
  }
  const hostEntries = [...byHost.entries()];
  let hostIndex = 0;
  const crawlResults = [];

  async function worker() {
    while (true) {
      const index = hostIndex++;
      if (index >= hostEntries.length) return;
      const [, tasks] = hostEntries[index];
      const seenPlaceIds = new Set();
      for (const task of tasks) {
        if (seenPlaceIds.has(task.row.googlePlaceId)) continue;
        seenPlaceIds.add(task.row.googlePlaceId);
        const result = await inspectWebsite(task.url);
        crawlResults.push({ googlePlaceId: task.row.googlePlaceId, name: task.row.name, rootUrl: task.url, ...result });
        if (!result.recommendedDishes.length && !result.featuredDishes.length) continue;
        const existing = evidenceById.get(task.row.googlePlaceId) || {
          googlePlaceId: task.row.googlePlaceId,
          name: task.row.name,
          recommendedDishes: [],
          featuredDishes: []
        };
        existing.recommendedDishes = dedupeDishes([...(existing.recommendedDishes || []), ...result.recommendedDishes], 6);
        existing.featuredDishes = dedupeDishes([...(existing.featuredDishes || []), ...result.featuredDishes], 6);
        evidenceById.set(task.row.googlePlaceId, existing);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(HOST_WORKERS, hostEntries.length || 1) }, () => worker()));

  const rows = [...evidenceById.values()]
    .map((row) => ({
      ...row,
      recommendedDishes: dedupeDishes(row.recommendedDishes || [], 6),
      featuredDishes: dedupeDishes(row.featuredDishes || [], 6)
    }))
    .filter((row) => row.recommendedDishes.length || row.featuredDishes.length)
    .sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));

  const statusCounts = {};
  for (const result of crawlResults) statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
  const websiteFeaturedResults = crawlResults.filter((result) => result.featuredDishes.length);
  const payload = {
    schemaVersion: 4,
    checkedAt: CHECKED_AT,
    policy: {
      catalogIdentityKey: 'frozen Place ID only',
      catalogTotal: 2804,
      publicNamedRuntimeOnly: true,
      paidGoogleDataApiCalls: 0,
      websiteEligibility: 'already-bound independent official/provider websites only; Google/Tabelog/Hot Pepper/social URLs excluded from direct crawl',
      structuredMenuDiscoveryRule: 'homepage schema.org hasMenu/menu URL only; same-origin http(s), bounded by existing menu-link and site-page limits; no guessed menu paths',
      strictRecommendationRule: 'concrete dish term in a local HTML/text block carrying explicit recommendation/signature wording',
      featuredRule: 'retained Hot Pepper promotional text, schema.org MenuItem, or concrete dish text on an already-bound same-origin menu page; never promoted to recommended without recommendation wording',
      plainMenuTextRule: 'only menu-context pages discovered from the bound source; source-native text is normalized to zh-CN while original text and URL remain evidence',
      cuisineNameBrandInferenceAllowed: false,
      maxSameHostMenuLinksFollowed: MENU_LINK_LIMIT,
      maxSitePagesVisited: SITE_PAGE_LIMIT,
      maxEvidenceSnippetChars: 90
    },
    summary: {
      catalogTotal: 2804,
      publicRuntimeTotal: runtimeRows.length,
      hotPepperRowsAvailable: hotPepperById.size,
      hotPepperRecommendedRestaurants,
      hotPepperFeaturedRestaurants,
      websiteTasks: crawlTasks.length,
      websiteHosts: hostEntries.length,
      websitePagesVisited: crawlResults.reduce((sum, result) => sum + result.visitedUrls.length, 0),
      websiteStructuredMenuLinksDiscovered: crawlResults.reduce((sum, result) => sum + Number(result.structuredMenuLinksDiscovered || 0), 0),
      websiteStructuredMenuLinkRestaurants: new Set(crawlResults.filter((result) => Number(result.structuredMenuLinksDiscovered || 0) > 0).map((result) => result.googlePlaceId)).size,
      websiteRecommendedRestaurants: new Set(crawlResults.filter((result) => result.recommendedDishes.length).map((result) => result.googlePlaceId)).size,
      websiteFeaturedMenuRestaurants: new Set(websiteFeaturedResults.map((result) => result.googlePlaceId)).size,
      websiteStructuredMenuRestaurants: new Set(websiteFeaturedResults.filter((result) => result.featuredDishes.some((item) => item.evidenceClass === 'structured_menu_item')).map((result) => result.googlePlaceId)).size,
      websitePlainMenuRestaurants: new Set(websiteFeaturedResults.filter((result) => result.featuredDishes.some((item) => item.evidenceClass === 'source_menu_text')).map((result) => result.googlePlaceId)).size,
      websitePlainMenuItems: websiteFeaturedResults.reduce((sum, result) => sum + result.featuredDishes.filter((item) => item.evidenceClass === 'source_menu_text').length, 0),
      sourceBackedRecommendationRestaurants: rows.filter((row) => row.recommendedDishes.length).length,
      sourceBackedFeaturedOnlyRestaurants: rows.filter((row) => !row.recommendedDishes.length && row.featuredDishes.length).length,
      recommendationItems: rows.reduce((sum, row) => sum + row.recommendedDishes.length, 0),
      featuredItems: rows.reduce((sum, row) => sum + row.featuredDishes.length, 0),
      statusCounts
    },
    rows
  };

  if (DIAGNOSTICS_OUTPUT) {
    const diagnosticRows = crawlResults
      .map((result) => ({
        googlePlaceId: result.googlePlaceId,
        name: result.name,
        rootUrl: result.rootUrl,
        status: result.status,
        errors: result.errors || [],
        visitedUrls: result.visitedUrls || [],
        structuredMenuLinksDiscovered: Number(result.structuredMenuLinksDiscovered || 0),
        recommendedDishCount: (result.recommendedDishes || []).length,
        featuredDishCount: (result.featuredDishes || []).length
      }))
      .sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId) || a.rootUrl.localeCompare(b.rootUrl));
    const diagnostics = {
      schemaVersion: 1,
      checkedAt: CHECKED_AT,
      policy: {
        diagnosticOnly: true,
        rawHtmlPersisted: false,
        paidGoogleDataApiCalls: 0,
        identityMutationAllowed: false,
        dishEvidenceMutationAllowed: false
      },
      summary: {
        publicRuntimeTotal: runtimeRows.length,
        crawlResultRows: diagnosticRows.length,
        statusCounts
      },
      rows: diagnosticRows
    };
    fs.mkdirSync(path.dirname(path.resolve(DIAGNOSTICS_OUTPUT)), { recursive: true });
    fs.writeFileSync(DIAGNOSTICS_OUTPUT, JSON.stringify(diagnostics, null, 2) + '\n', 'utf8');
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(payload.summary));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
