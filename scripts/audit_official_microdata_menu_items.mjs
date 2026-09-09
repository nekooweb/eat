#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DISH_RULES } from './recommended_dish_extractor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(ROOT, '_audit', 'official-microdata-menu-items.json');
const TIMEOUT_MS = Math.max(6_000, Math.min(20_000, Number(process.env.OFFICIAL_MICRODATA_TIMEOUT_MS || 10_000)));
const WORKERS = Math.max(1, Math.min(12, Number(process.env.OFFICIAL_MICRODATA_WORKERS || 8)));
const URL_LIMIT = Math.max(1, Math.min(6, Number(process.env.OFFICIAL_MICRODATA_URL_LIMIT || 4)));
const USER_AGENT = 'eat-data-maintenance/2.5 (+https://github.com/nekooweb/eat)';
const NON_HTML = /\.(?:pdf|jpe?g|png|gif|webp|avif|svg|css|js|mjs|xml|zip)(?:$|[?#])/i;
const MENU_ITEM_TYPE = /(?:https?:\/\/)?(?:www\.)?schema\.org\/MenuItem\b/i;
const PRODUCT_TYPE = /(?:https?:\/\/)?(?:www\.)?schema\.org\/Product\b/i;

function clean(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    });
}
function stripTags(value) {
  return clean(decodeEntities(String(value ?? '').replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')));
}
function loadRuntime() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, 'google_inventory_runtime.js'), 'utf8'), sandbox, { filename: 'google_inventory_runtime.js' });
  return {
    rows: Array.isArray(sandbox.window.GOOGLE_INVENTORY_RESTAURANTS) ? sandbox.window.GOOGLE_INVENTORY_RESTAURANTS : [],
    stats: sandbox.window.GOOGLE_INVENTORY_STATS || {}
  };
}
function safeReviewedHtmlUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || NON_HTML.test(url.toString())) return null;
    url.hash = '';
    return url.toString();
  } catch { return null; }
}
function normalizedHost(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}
function sameHostFamily(a, b) {
  const x = normalizedHost(a), y = normalizedHost(b);
  return Boolean(x && y && (x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`)));
}
function attrValue(attrs, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i');
  return decodeEntities((String(attrs || '').match(re) || [])[2] || '');
}
function hasItemProp(attrs, token) {
  const value = attrValue(attrs, 'itemprop');
  return value.split(/\s+/).some((part) => part.toLowerCase() === token.toLowerCase());
}
function asciiSubstringFalsePositive(text, match) {
  const token = String(match?.[0] || '');
  if (!/^[A-Za-z][A-Za-z .'-]*$/.test(token)) return false;
  const start = Number(match?.index ?? -1);
  if (start < 0) return false;
  const end = start + token.length;
  const before = start > 0 ? text[start - 1] : '';
  const after = end < text.length ? text[end] : '';
  return /[A-Za-z]/.test(before) || /[A-Za-z]/.test(after);
}
function dishMatches(text, limit = 8) {
  const value = clean(text);
  const output = [];
  const seen = new Set();
  for (const [pattern, nameZh] of DISH_RULES) {
    const match = value.match(pattern);
    if (!match || asciiSubstringFalsePositive(value, match) || seen.has(nameZh)) continue;
    seen.add(nameZh);
    output.push({ nameZh, nameOriginal: match[0], rule: pattern.source });
    if (output.length >= limit) break;
  }
  return output;
}
function microdataNameValues(block) {
  const output = [];
  const seen = new Set();
  const tagRe = /<([a-z][a-z0-9:-]*)\b([^>]*)>([\s\S]*?)<\/\1\s*>|<(meta|link)\b([^>]*)\/?>/gi;
  let match;
  while ((match = tagRe.exec(block))) {
    const attrs = match[2] ?? match[5] ?? '';
    if (!hasItemProp(attrs, 'name')) continue;
    let value = '';
    if (match[4]) value = attrValue(attrs, 'content') || attrValue(attrs, 'value');
    else value = attrValue(attrs, 'content') || stripTags(match[3]);
    value = clean(value);
    if (value.length < 2 || value.length > 160 || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}
function extractMenuItemMicrodata(html) {
  const text = String(html || '');
  const openings = [];
  const openTagRe = /<([a-z][a-z0-9:-]*)\b([^>]*)>/gi;
  let tag;
  while ((tag = openTagRe.exec(text))) {
    const attrs = tag[2] || '';
    if (!/\bitemscope\b/i.test(attrs)) continue;
    const type = attrValue(attrs, 'itemtype');
    if (!MENU_ITEM_TYPE.test(type) || PRODUCT_TYPE.test(type)) continue;
    openings.push({ tagName: tag[1], attrs, start: openTagRe.lastIndex, openIndex: tag.index, type });
  }
  const rows = [];
  for (let i = 0; i < openings.length; i += 1) {
    const current = openings[i];
    const nextOpen = openings[i + 1]?.openIndex ?? text.length;
    const closeRe = new RegExp(`<\\/${current.tagName}\\s*>`, 'ig');
    closeRe.lastIndex = current.start;
    const close = closeRe.exec(text);
    const end = Math.min(close ? close.index : current.start + 12_000, nextOpen > current.start ? nextOpen : text.length, current.start + 12_000);
    const block = text.slice(current.start, Math.max(current.start, end));
    for (const name of microdataNameValues(block)) rows.push({ name, itemtype: current.type });
  }
  const dedupe = new Map();
  for (const row of rows) {
    const key = clean(row.name).toLowerCase();
    if (!dedupe.has(key)) dedupe.set(key, row);
  }
  return [...dedupe.values()];
}
async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new Error(`non-html ${contentType}`);
  const finalUrl = response.url || url;
  if (!sameHostFamily(url, finalUrl)) throw new Error(`cross-host redirect ${normalizedHost(url)} -> ${normalizedHost(finalUrl)}`);
  return { finalUrl, html: (await response.text()).slice(0, 2_000_000) };
}

const runtime = loadRuntime();
const noDishRows = runtime.rows.filter((row) => !(row.recommendedDishes || []).length && !(row.featuredDishes || []).length);
const noDishIds = new Set(noDishRows.map((row) => row.googlePlaceId));
if (runtime.stats?.catalogTotal !== 2804 || runtime.stats?.inventoryTotal !== runtime.rows.length) throw new Error('runtime contract mismatch');
const official = JSON.parse(fs.readFileSync(path.join(DATA, 'reviewed_official_runtime_sources.json'), 'utf8'));
if (official.policy?.reviewedRowsOnly !== true || official.policy?.conflictRowsPublished !== false || official.policy?.paidGoogleDataApiCalls !== 0) {
  throw new Error('reviewed official source contract mismatch');
}

const tasks = [];
let reviewedOfficialNoDishRows = 0;
let skippedNonHttpsOrNonHtml = 0;
for (const row of official.rows || []) {
  if (row.reviewState !== 'reviewed' || !noDishIds.has(row.googlePlaceId)) continue;
  reviewedOfficialNoDishRows += 1;
  const rawUrls = [...(row.menuUrls || []), row.pageUrl, ...(row.sourceWebsites || [])].filter(Boolean);
  const urls = [];
  const seen = new Set();
  for (const raw of rawUrls) {
    const url = safeReviewedHtmlUrl(raw);
    if (!url) { skippedNonHttpsOrNonHtml += 1; continue; }
    if (seen.has(url)) continue;
    seen.add(url); urls.push(url);
    if (urls.length >= URL_LIMIT) break;
  }
  for (const url of urls) tasks.push({
    googlePlaceId: row.googlePlaceId,
    name: runtime.rows.find((item) => item.googlePlaceId === row.googlePlaceId)?.name || '',
    sourceOfficialName: row.officialName || null,
    url
  });
}

let cursor = 0;
const results = [];
async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= tasks.length) return;
    const task = tasks[index];
    try {
      const page = await fetchHtml(task.url);
      const scopes = extractMenuItemMicrodata(page.html);
      const featuredDishes = [];
      const seen = new Set();
      for (const scope of scopes) {
        for (const match of dishMatches(scope.name, 6)) {
          const key = `${match.nameZh}|${scope.name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          featuredDishes.push({
            nameZh: match.nameZh,
            nameJa: match.nameOriginal,
            provider: 'sourceWebsite',
            sourceUrl: page.finalUrl,
            checkedAt: new Date().toISOString().slice(0, 10),
            evidenceClass: 'source_menu_text',
            evidenceRule: `microdata-menuitem:${match.rule}`,
            evidenceSnippet: scope.name.slice(0, 120)
          });
        }
      }
      results.push({ ...task, finalUrl: page.finalUrl, microdataMenuItemScopes: scopes.length, featuredDishes: featuredDishes.slice(0, 8) });
    } catch (error) {
      results.push({ ...task, error: String(error?.message || error).slice(0, 180), microdataMenuItemScopes: 0, featuredDishes: [] });
    }
  }
}
await Promise.all(Array.from({ length: Math.min(WORKERS, tasks.length || 1) }, () => worker()));

const byPlace = new Map();
for (const result of results) {
  if (!result.featuredDishes.length) continue;
  const current = byPlace.get(result.googlePlaceId) || {
    googlePlaceId: result.googlePlaceId,
    name: result.name,
    sourceOfficialName: result.sourceOfficialName,
    recommendedDishes: [],
    featuredDishes: []
  };
  for (const item of result.featuredDishes) {
    if (!current.featuredDishes.some((x) => x.nameZh === item.nameZh && x.sourceUrl === item.sourceUrl)) current.featuredDishes.push(item);
  }
  byPlace.set(result.googlePlaceId, current);
}
const evidenceRows = [...byPlace.values()].sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));
const payload = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString().slice(0, 10),
  policy: {
    auditOnly: true,
    currentNoDishOnly: true,
    reviewedOfficialBindingsOnly: true,
    reviewedOfficialUrlsOnly: true,
    httpsOnly: true,
    sameHostFamilyFinalUrlRequired: true,
    explicitSchemaOrgMenuItemMicrodataOnly: true,
    schemaOrgProductAccepted: false,
    jsonLdHandledByExistingCollector: true,
    guessedMenuPathsAllowed: false,
    arbitraryVisibleTextAccepted: false,
    recommendationPromotionAllowed: false,
    ordinaryMenuItemIsFeaturedOnly: true,
    identityMutationAllowed: false,
    catalogNameMutationAllowed: false,
    sourceOfficialNameRole: 'source_alias_only',
    pageScriptsExecuted: false,
    rawHtmlPersisted: false,
    paidGoogleDataApiCalls: 0
  },
  summary: {
    catalogTotal: 2804,
    publicRuntimeTotal: runtime.rows.length,
    currentNoDish: noDishRows.length,
    reviewedOfficialNoDishRows,
    htmlTasks: tasks.length,
    skippedNonHttpsOrNonHtml,
    pagesFetched: results.filter((row) => !row.error).length,
    errorPages: results.filter((row) => row.error).length,
    pagesWithMicrodataMenuItem: results.filter((row) => row.microdataMenuItemScopes > 0).length,
    microdataMenuItemScopes: results.reduce((sum, row) => sum + row.microdataMenuItemScopes, 0),
    evidenceRestaurants: evidenceRows.length,
    featuredItems: evidenceRows.reduce((sum, row) => sum + row.featuredDishes.length, 0)
  },
  rows: evidenceRows,
  diagnostics: results.map((row) => ({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    url: row.url,
    finalUrl: row.finalUrl || null,
    microdataMenuItemScopes: row.microdataMenuItemScopes,
    featuredItems: row.featuredDishes.length,
    error: row.error || null
  }))
};
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(payload.summary));
if (evidenceRows.length) console.log('MICRODATA_EVIDENCE_SAMPLES=' + JSON.stringify(evidenceRows.slice(0, 20)));
