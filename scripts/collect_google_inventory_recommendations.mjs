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
const TIMEOUT_MS = Number(process.env.INVENTORY_DETAIL_FETCH_TIMEOUT_MS || 7000);
const HOST_WORKERS = Math.max(1, Math.min(32, Number(process.env.INVENTORY_DETAIL_HOST_WORKERS || 20)));
const MAX_HTML_CHARS = 1_200_000;
const CHECKED_AT = new Date().toISOString().slice(0, 10);
const USER_AGENT = 'eat-data-maintenance/2.0 (+https://github.com/nekooweb/eat)';

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

function menuLinks(html, baseUrl) {
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
      if (output.length >= 2) break;
    } catch {
      // malformed links are not evidence
    }
  }
  return output;
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
  for (let index = 0; index < urls.length && index < 3; index += 1) {
    const url = urls[index];
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      const html = await fetchHtml(url);
      for (const match of extractStrictRecommendationsFromHtml(html, 3)) {
        recommendedDishes.push(sourceItem(match, url, 'sourceWebsite', 'source_recommendation_text', `html-block:${match.rule}`));
      }
      for (const match of extractStructuredMenuItems(html, 3)) {
        featuredDishes.push(sourceItem(match, url, 'sourceWebsite', 'structured_menu_item', `jsonld-menuitem:${match.rule}`));
      }
      if (index === 0) urls.push(...menuLinks(html, url));
      if (dedupeDishes(recommendedDishes, 3).length >= 3) break;
    } catch (error) {
      errors.push(`${url}: ${error?.message || error}`);
    }
  }
  const recommended = dedupeDishes(recommendedDishes, 3);
  const featured = dedupeDishes(featuredDishes, 3);
  return {
    status: recommended.length ? 'recommended_match' : featured.length ? 'menu_match' : errors.length ? 'no_match_with_errors' : 'no_match',
    recommendedDishes: recommended,
    featuredDishes: featured,
    errors: errors.slice(0, 2),
    visitedUrls: [...visited].slice(0, 3)
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

  // Official pages are crawled only for named public rows that still lack a
  // retained recommendation. Tabelog/Hot Pepper/social/Google pages are not
  // fetched here; Tabelog is retained-evidence-only because live access is restricted.
  const crawlTasks = [];
  for (const row of runtimeRows) {
    if (Array.isArray(row.recommendedDishes) && row.recommendedDishes.length) continue;
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
  const payload = {
    schemaVersion: 3,
    checkedAt: CHECKED_AT,
    policy: {
      catalogIdentityKey: 'frozen Place ID only',
      catalogTotal: 2804,
      publicNamedRuntimeOnly: true,
      paidGoogleDataApiCalls: 0,
      websiteEligibility: 'already-bound independent official/provider websites only; Google/Tabelog/Hot Pepper/social URLs excluded from direct crawl',
      strictRecommendationRule: 'concrete dish term in a local HTML/text block carrying explicit recommendation/signature wording',
      featuredRule: 'retained Hot Pepper promotional dish text or schema.org MenuItem; never promoted to recommended without recommendation wording',
      cuisineNameBrandInferenceAllowed: false,
      maxSameHostMenuLinksFollowed: 2,
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
      websiteRecommendedRestaurants: new Set(crawlResults.filter((result) => result.recommendedDishes.length).map((result) => result.googlePlaceId)).size,
      websiteStructuredMenuRestaurants: new Set(crawlResults.filter((result) => result.featuredDishes.length).map((result) => result.googlePlaceId)).size,
      sourceBackedRecommendationRestaurants: rows.filter((row) => row.recommendedDishes.length).length,
      sourceBackedFeaturedOnlyRestaurants: rows.filter((row) => !row.recommendedDishes.length && row.featuredDishes.length).length,
      recommendationItems: rows.reduce((sum, row) => sum + row.recommendedDishes.length, 0),
      featuredItems: rows.reduce((sum, row) => sum + row.featuredDishes.length, 0),
      statusCounts
    },
    rows
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(payload.summary));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
