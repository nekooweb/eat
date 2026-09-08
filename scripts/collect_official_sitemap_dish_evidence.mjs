#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  DISH_RULES,
  MENU_LINK_MARKER,
  extractStrictRecommendationsFromHtml,
  extractStructuredMenuItems,
  htmlToTextBlocks
} from './recommended_dish_extractor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(DATA, 'official_sitemap_dish_evidence.json');
const TIMEOUT_MS = Number(process.env.OFFICIAL_SITEMAP_FETCH_TIMEOUT_MS || 7000);
const WORKERS = Math.max(1, Math.min(24, Number(process.env.OFFICIAL_SITEMAP_WORKERS || 16)));
const CHILD_SITEMAP_LIMIT = Math.max(1, Math.min(4, Number(process.env.OFFICIAL_SITEMAP_CHILD_LIMIT || 3)));
const MENU_PAGE_LIMIT = Math.max(1, Math.min(4, Number(process.env.OFFICIAL_SITEMAP_MENU_PAGE_LIMIT || 3)));
const MAX_TEXT_CHARS = 1_500_000;
const CHECKED_AT = new Date().toISOString().slice(0, 10);
const USER_AGENT = 'eat-data-maintenance/2.2 (+https://github.com/nekooweb/eat)';
const NON_MENU_BLOCK = /営業時間|アクセス|店舗情報|会社概要|採用情報|プライバシ|予約(?:する|はこちら)?|電話番号|住所|copyright|instagram|facebook/i;
const SITEMAP_CHILD_HINT = /menu|food|dish|cuisine|shop|store|restaurant|page|post|product|料理|店舗/i;
const EXCLUDED_PAGE_HINT = /news|blog|column|recruit|privacy|company|about|access|contact|reservation|reserve|採用|会社|お知らせ|ブログ/i;

function loadWindowFile(filename) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
  return sandbox.window;
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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

function eligibleWebsite(value) {
  const url = safeUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (/openstreetmap\.org$|hotpepper\.jp$|tabelog\.com$/.test(host)) return false;
  if (/(^|\.)google\./.test(host) || /googleusercontent\.com$/.test(host)) return false;
  if (/facebook\.com$|instagram\.com$|x\.com$|twitter\.com$|youtube\.com$|tiktok\.com$/.test(host)) return false;
  return true;
}

function sourceItem(match, sourceUrl, evidenceClass, evidenceRule, snippet = '') {
  return {
    nameZh: match.nameZh,
    nameJa: cleanText(match.nameOriginal || match.nameJa || match.nameZh).slice(0, 80),
    provider: 'sourceWebsite',
    sourceUrl,
    checkedAt: CHECKED_AT,
    evidenceClass,
    evidenceRule,
    evidenceSnippet: cleanText(snippet || match.evidenceSnippet || match.nameOriginal).slice(0, 90)
  };
}

function featuredMatchesFromText(value, limit = 3) {
  const text = cleanText(value);
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
    const block = cleanText(rawBlock);
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

function dedupeDishes(items, limit = 8) {
  const map = new Map();
  for (const item of items || []) {
    if (!item?.nameZh || !item?.sourceUrl) continue;
    const key = `${item.nameZh}|${item.provider}|${item.sourceUrl}|${item.evidenceClass}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()].slice(0, limit);
}

function decodeXml(value) {
  return String(value || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function sitemapLocs(xml) {
  const output = [];
  const re = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi;
  let match;
  while ((match = re.exec(String(xml || '')))) {
    const value = decodeXml(match[1]).trim();
    if (value) output.push(value);
  }
  return output;
}

function scopePrefix(rootUrl) {
  const root = new URL(rootUrl);
  const parts = root.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return '/';
  if (root.pathname.endsWith('/')) return root.pathname;
  return `/${parts.slice(0, -1).join('/')}/`;
}

function scopedMenuUrl(value, rootUrl) {
  const url = safeUrl(value);
  const root = safeUrl(rootUrl);
  if (!url || !root || url.hostname !== root.hostname) return null;
  const combined = `${url.pathname} ${url.search}`;
  if (!MENU_LINK_MARKER.test(combined) || EXCLUDED_PAGE_HINT.test(combined)) return null;
  const prefix = scopePrefix(rootUrl);
  if (prefix !== '/' && !url.pathname.startsWith(prefix)) return null;
  return url.toString();
}

async function fetchText(url, accept) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': USER_AGENT, accept }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.text()).slice(0, MAX_TEXT_CHARS);
}

const sitemapCache = new Map();
async function fetchSitemap(url) {
  if (!sitemapCache.has(url)) {
    sitemapCache.set(url, fetchText(url, 'application/xml,text/xml,text/plain;q=0.9,*/*;q=0.1').catch(() => null));
  }
  return sitemapCache.get(url);
}

async function discoverMenuUrls(rootUrl) {
  const root = new URL(rootUrl);
  const sitemapCandidates = [
    `${root.origin}/sitemap.xml`,
    `${root.origin}/wp-sitemap.xml`
  ];
  const pageUrls = [];
  const seenPages = new Set();
  const fetchedSitemaps = [];
  const childCandidates = [];

  function collectLocs(xml, sitemapUrl) {
    if (!xml) return;
    fetchedSitemaps.push(sitemapUrl);
    for (const raw of sitemapLocs(xml)) {
      const url = safeUrl(raw);
      if (!url || url.hostname !== root.hostname) continue;
      if (/\.xml(?:$|\?)/i.test(url.pathname + url.search)) {
        childCandidates.push(url.toString());
        continue;
      }
      const scoped = scopedMenuUrl(url.toString(), rootUrl);
      if (scoped && !seenPages.has(scoped)) {
        seenPages.add(scoped);
        pageUrls.push(scoped);
      }
    }
  }

  for (const sitemapUrl of sitemapCandidates) collectLocs(await fetchSitemap(sitemapUrl), sitemapUrl);

  if (pageUrls.length < MENU_PAGE_LIMIT && childCandidates.length) {
    const uniqueChildren = [...new Set(childCandidates)];
    uniqueChildren.sort((a, b) => Number(SITEMAP_CHILD_HINT.test(b)) - Number(SITEMAP_CHILD_HINT.test(a)) || a.localeCompare(b));
    for (const childUrl of uniqueChildren.slice(0, CHILD_SITEMAP_LIMIT)) {
      collectLocs(await fetchSitemap(childUrl), childUrl);
      if (pageUrls.length >= MENU_PAGE_LIMIT) break;
    }
  }

  return {
    menuUrls: pageUrls.slice(0, MENU_PAGE_LIMIT),
    fetchedSitemaps: [...new Set(fetchedSitemaps)]
  };
}

async function inspectTarget(target) {
  const recommendedDishes = [];
  const featuredDishes = [];
  const menuPagesFetched = [];
  const errors = [];
  const discovered = new Set();
  let sitemapFilesFetched = 0;

  for (const rootUrl of target.roots) {
    try {
      const discovery = await discoverMenuUrls(rootUrl);
      sitemapFilesFetched += discovery.fetchedSitemaps.length;
      for (const url of discovery.menuUrls) discovered.add(url);
    } catch (error) {
      errors.push(`${rootUrl}: ${error?.message || error}`);
    }
  }

  for (const url of [...discovered].slice(0, MENU_PAGE_LIMIT)) {
    try {
      const html = await fetchText(url, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1');
      menuPagesFetched.push(url);
      for (const match of extractStrictRecommendationsFromHtml(html, 3)) {
        recommendedDishes.push(sourceItem(match, url, 'source_recommendation_text', `sitemap-menu-html:${match.rule}`));
      }
      for (const match of extractStructuredMenuItems(html, 6)) {
        featuredDishes.push(sourceItem(match, url, 'structured_menu_item', `sitemap-jsonld-menuitem:${match.rule}`));
      }
      for (const match of plainMenuMatchesFromHtml(html, 6)) {
        featuredDishes.push(sourceItem(match, url, 'source_menu_text', `sitemap-menu-text:${match.rule}`, match.evidenceSnippet));
      }
    } catch (error) {
      errors.push(`${url}: ${error?.message || error}`);
    }
  }

  const recommended = dedupeDishes(recommendedDishes, 4);
  const recommendedNames = new Set(recommended.map((item) => item.nameZh));
  const featured = dedupeDishes(featuredDishes, 8).filter((item) => !recommendedNames.has(item.nameZh)).slice(0, 6);
  return {
    ...target,
    recommendedDishes: recommended,
    featuredDishes: featured,
    sitemapFilesFetched,
    menuUrlsDiscovered: discovered.size,
    menuPagesFetched,
    errors: errors.slice(0, 3)
  };
}

async function main() {
  const runtimeWindow = loadWindowFile('google_inventory_runtime.js');
  const runtimeRows = Array.isArray(runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS)
    ? runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS
    : [];
  const runtimeStats = runtimeWindow.GOOGLE_INVENTORY_STATS || {};
  if (runtimeStats.catalogTotal !== 2804 || runtimeRows.length + Number(runtimeStats.unpublishedPlaceIdOnly || 0) !== 2804) {
    throw new Error('Frozen 2,804 catalog contract failed');
  }
  const runtimeById = new Map(runtimeRows.map((row) => [row.googlePlaceId, row]));

  const queue = JSON.parse(fs.readFileSync(path.join(DATA, 'google_inventory_detail_queue.json'), 'utf8'));
  const officialIds = new Set((queue.rows || [])
    .filter((row) => row.nextAction === 'collect_strict_recommended_dishes' || row.nextAction === 'collect_source_backed_featured_dishes')
    .map((row) => row.googlePlaceId));

  const provenanceWindow = fs.existsSync(path.join(DATA, 'source_provenance.js')) ? loadWindowFile('source_provenance.js') : {};
  const provenanceRows = provenanceWindow.SOURCE_PROVENANCE?.rows || [];
  const provenanceById = new Map(provenanceRows.map((row) => [row.googlePlaceId, row]));

  const targets = [];
  for (const googlePlaceId of officialIds) {
    const row = runtimeById.get(googlePlaceId);
    if (!row) continue;
    const roots = new Set();
    for (const raw of row.sourceWebsites || []) {
      if (eligibleWebsite(raw)) roots.add(safeUrl(raw).toString());
    }
    for (const link of provenanceById.get(googlePlaceId)?.sourceLinks || []) {
      if (cleanText(link?.provider).toLowerCase() !== 'official') continue;
      if (eligibleWebsite(link.url)) roots.add(safeUrl(link.url).toString());
    }
    if (roots.size) targets.push({ googlePlaceId, name: row.name, roots: [...roots] });
  }

  const results = new Array(targets.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= targets.length) return;
      results[index] = await inspectTarget(targets[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(WORKERS, targets.length || 1) }, () => worker()));

  const rows = results
    .filter((result) => result && (result.recommendedDishes.length || result.featuredDishes.length))
    .map((result) => ({
      googlePlaceId: result.googlePlaceId,
      name: result.name,
      recommendedDishes: result.recommendedDishes,
      featuredDishes: result.featuredDishes
    }))
    .sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));

  const summary = {
    catalogTotal: 2804,
    publicRuntimeTotal: runtimeRows.length,
    queueEligibleIds: officialIds.size,
    targets: targets.length,
    uniqueOrigins: new Set(targets.flatMap((target) => target.roots.map((root) => new URL(root).origin))).size,
    sitemapFilesFetched: results.reduce((sum, result) => sum + Number(result?.sitemapFilesFetched || 0), 0),
    menuUrlsDiscovered: results.reduce((sum, result) => sum + Number(result?.menuUrlsDiscovered || 0), 0),
    menuPagesFetched: results.reduce((sum, result) => sum + Number(result?.menuPagesFetched?.length || 0), 0),
    errorTargets: results.filter((result) => result?.errors?.length).length,
    evidenceRestaurants: rows.length,
    recommendationRestaurants: rows.filter((row) => row.recommendedDishes.length).length,
    featuredRestaurants: rows.filter((row) => row.featuredDishes.length).length,
    recommendationItems: rows.reduce((sum, row) => sum + row.recommendedDishes.length, 0),
    featuredItems: rows.reduce((sum, row) => sum + row.featuredDishes.length, 0)
  };

  const payload = {
    schemaVersion: 1,
    checkedAt: CHECKED_AT,
    policy: {
      source: 'already-bound independent official/source websites only',
      discovery: 'same-origin public sitemap.xml/wp-sitemap.xml with bounded child sitemap traversal',
      paidGoogleDataApiCalls: 0,
      maximumChildSitemaps: CHILD_SITEMAP_LIMIT,
      maximumMenuPagesPerRestaurant: MENU_PAGE_LIMIT,
      pathScopedForMultiSegmentRootUrls: true,
      crossOriginUrlsAllowed: false,
      excludedNewsBlogCompanyRecruitPages: true,
      recommendationRequiresExplicitMarker: true,
      ordinaryMenuItemsAreFeaturedOnly: true,
      cuisineNameBrandInferenceAllowed: false,
      rawHtmlPersisted: false
    },
    summary,
    rows
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
