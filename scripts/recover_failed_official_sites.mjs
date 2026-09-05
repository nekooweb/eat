#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const INPUT = process.argv[2] || path.join(ROOT, '_seed', 'google_official_site_candidates.json');
const INDEX = process.argv[3] || path.join(DATA, 'official_candidate_index.json');
const API_KEY = String(process.env.GOOGLE_MAP_API || '').trim();
const MAX_GOOGLE_CALLS = Math.min(100, Math.max(0, Number(process.env.RECOVERY_GOOGLE_LIMIT || 100)));
const CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.RECOVERY_CONCURRENCY || 5)));
const TIMEOUT_MS = Math.max(3000, Number(process.env.RECOVERY_TIMEOUT_MS || 15000));
const USER_AGENT = 'eat-data-maintenance/1.0 (+https://github.com/nekooweb/eat)';
const CHECKED_AT = process.env.RECOVERY_CHECKED_AT || '2026-09-06';

if (!API_KEY && MAX_GOOGLE_CALLS > 0) throw new Error('GOOGLE_MAP_API is required for missing-URL recovery');

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
function loadProduction() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read('data/production_area1.js'), sandbox, { filename: 'production_area1.js' });
  return sandbox.window.PRODUCTION_RESTAURANTS || [];
}
function loadEnrichments() {
  const files = fs.readdirSync(DATA).filter((f) => /^source_enrichment(?:_[a-z0-9-]+)?\.js$/i.test(f)).sort();
  const sandbox = { window: { RESTAURANTS: [] } };
  vm.createContext(sandbox);
  for (const f of files) vm.runInContext(read(`data/${f}`), sandbox, { filename: f });
  return sandbox.window.RESTAURANTS || [];
}
function loadResolutions() {
  const files = fs.readdirSync(DATA).filter((f) => /^source_resolution(?:_[a-z0-9-]+)?\.js$/i.test(f)).sort();
  const sandbox = { window: { SOURCE_RESOLUTIONS: [] } };
  vm.createContext(sandbox);
  for (const f of files) vm.runInContext(read(`data/${f}`), sandbox, { filename: f });
  return sandbox.window.SOURCE_RESOLUTIONS || [];
}
function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆!！?？.,，。:：/\\]+/g, '');
}
function decodeEntities(text) {
  return String(text || '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}
function stripHtml(html) {
  return decodeEntities(String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(br|p|div|li|tr|h[1-6]|section|article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[\t\r ]+/g, ' ').replace(/\n\s+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function titleFromHtml(html) {
  const match = String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]).slice(0, 220) : null;
}
function menuLinks(html, baseUrl) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html).matchAll(re)) {
    const label = stripHtml(match[2]).slice(0, 120);
    if (!/(menu|メニュー|料理|お品書き|food|drink|商品)/i.test(`${match[1]} ${label}`)) continue;
    try {
      const url = new URL(match[1], baseUrl).href;
      if (!out.some((x) => x.url === url)) out.push({ label, url });
    } catch {}
    if (out.length >= 12) break;
  }
  return out;
}
const BLOCKED_HOSTS = ['tabelog.com','hotpepper.jp','gnavi.co.jp','retty.me','tripadvisor.','yelp.','facebook.com','instagram.com','x.com','twitter.com','maps.google.','google.com','pokepara.jp'];
function validOfficialUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return u.protocol === 'https:' && !BLOCKED_HOSTS.some((needle) => host.includes(needle));
  } catch { return false; }
}
async function placeWebsite(placeId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: { 'X-Goog-Api-Key': API_KEY, 'X-Goog-FieldMask': 'websiteUri', accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) return { ok: false, status: response.status, uri: null, error: `places_http_${response.status}` };
    const body = await response.json();
    return { ok: true, status: response.status, uri: typeof body.websiteUri === 'string' ? body.websiteUri : null, error: null };
  } catch (error) {
    return { ok: false, status: null, uri: null, error: error?.name === 'AbortError' ? 'places_timeout' : String(error?.message || error) };
  } finally { clearTimeout(timer); }
}
async function fetchWebsite(uri, restaurantName) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(uri, { redirect: 'follow', headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-language': 'ja,en;q=0.8' }, signal: controller.signal });
    const body = await response.text();
    const html = /<html\b/i.test(body) ? body : '';
    const text = html ? stripHtml(html) : '';
    const title = html ? titleFromHtml(html) : null;
    const normName = normalize(restaurantName);
    const searchable = normalize(`${title || ''} ${text.slice(0, 12000)}`);
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      title,
      nameMatched: Boolean(normName && searchable.includes(normName)),
      menuLinks: html ? menuLinks(html, response.url) : [],
      error: null
    };
  } catch (error) {
    return { ok: false, status: null, finalUrl: null, title: null, nameMatched: false, menuLinks: [], error: error?.name === 'AbortError' ? 'website_timeout' : String(error?.message || error) };
  } finally { clearTimeout(timer); }
}
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length); let cursor = 0;
  async function runner() { while (true) { const i = cursor++; if (i >= items.length) return; results[i] = await worker(items[i]); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

const prior = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const production = loadProduction();
const productionById = new Map(production.map((r) => [r.googlePlaceId, r]));
const enrichmentIds = new Set(loadEnrichments().filter((r) => (r.sourceRefs || []).length).map((r) => r.googlePlaceId));
const resolutionIds = new Set(loadResolutions().map((r) => r.googlePlaceId));
const unresolvedIds = new Set(production.filter((r) => !enrichmentIds.has(r.googlePlaceId) && !resolutionIds.has(r.googlePlaceId)).map((r) => r.googlePlaceId));
const existing = fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, 'utf8')) : { records: [] };
const existingIds = new Set((existing.records || []).map((r) => r.googlePlaceId));

const errors = (prior.results || []).filter((r) => r.discoveryStatus === 'website_error' && productionById.has(r.googlePlaceId) && !existingIds.has(r.googlePlaceId));
const freeTargets = errors.filter((r) => validOfficialUrl(r.page?.verifiedUrl));
const needsGoogle = errors.filter((r) => !validOfficialUrl(r.page?.verifiedUrl))
  .sort((a, b) => Number(unresolvedIds.has(b.googlePlaceId)) - Number(unresolvedIds.has(a.googlePlaceId)) || (b.existingGaps?.length || 0) - (a.existingGaps?.length || 0) || a.distanceMeters - b.distanceMeters)
  .slice(0, MAX_GOOGLE_CALLS);

const freeResults = await mapLimit(freeTargets, CONCURRENCY, async (row) => ({ row, googleCalled: false, page: await fetchWebsite(row.page.verifiedUrl, row.name) }));
let googleCalls = 0;
const paidResults = await mapLimit(needsGoogle, Math.min(5, CONCURRENCY), async (row) => {
  googleCalls += 1;
  const google = await placeWebsite(row.googlePlaceId);
  if (!google.ok || !google.uri) return { row, googleCalled: true, google, page: null };
  return { row, googleCalled: true, google: { ok: google.ok, status: google.status, uri: null, error: google.error }, page: await fetchWebsite(google.uri, row.name) };
});
const recovered = [];
for (const item of [...freeResults, ...paidResults]) {
  const page = item.page;
  if (!page?.ok || !page.nameMatched || !validOfficialUrl(page.finalUrl)) continue;
  let host;
  try { host = new URL(page.finalUrl).hostname.toLowerCase().replace(/^www\./, ''); } catch { continue; }
  const menuUrls = [];
  for (const link of page.menuLinks || []) {
    try {
      const u = new URL(link.url);
      if (u.protocol !== 'https:' || u.hostname.toLowerCase().replace(/^www\./, '') !== host) continue;
      if (!menuUrls.includes(u.href)) menuUrls.push(u.href);
      if (menuUrls.length >= 8) break;
    } catch {}
  }
  recovered.push({ googlePlaceId: item.row.googlePlaceId, name: item.row.name, distanceMeters: item.row.distanceMeters, pageUrl: page.finalUrl, menuUrls, checkedAt: CHECKED_AT });
}
const merged = new Map((existing.records || []).map((r) => [r.googlePlaceId, r]));
for (const row of recovered) merged.set(row.googlePlaceId, row);
const records = [...merged.values()].sort((a, b) => a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name, 'ja'));
fs.writeFileSync(INDEX, JSON.stringify({ generatedFrom: 'independently fetched official pages after transient Google discovery/recovery', checkedAt: CHECKED_AT, records }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  priorWebsiteErrors: errors.length,
  freeRetryTargets: freeTargets.length,
  missingUrlTargets: needsGoogle.length,
  googleCalls,
  worstCaseEnterpriseCostUsdAt20Per1000: Number((googleCalls * 0.02).toFixed(2)),
  recovered: recovered.length,
  recoveredUnresolved: recovered.filter((r) => unresolvedIds.has(r.googlePlaceId)).length,
  indexRecords: records.length
}));
