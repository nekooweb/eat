#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(ROOT, '_audit', 'google_official_site_candidates.json');
const API_KEY = String(process.env.GOOGLE_MAP_API || '').trim();
const LIMIT = Number(process.env.GOOGLE_OFFICIAL_SITE_LIMIT || 0);
const CONCURRENCY = Math.max(1, Math.min(12, Number(process.env.GOOGLE_OFFICIAL_SITE_CONCURRENCY || 6)));
const TIMEOUT_MS = Math.max(3000, Number(process.env.GOOGLE_OFFICIAL_SITE_TIMEOUT_MS || 12000));
const USER_AGENT = 'eat-data-maintenance/1.0 (+https://github.com/nekooweb/eat)';

if (!API_KEY) throw new Error('GOOGLE_MAP_API is required');

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
  for (const filename of files) vm.runInContext(read(`data/${filename}`), sandbox, { filename });
  return sandbox.window.RESTAURANTS || [];
}

function normalize(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆!！?？.,，。:：/\\]+/g, '');
}

function gaps(row) {
  const missing = [];
  if (!Array.isArray(row.recommendedDishes) || !row.recommendedDishes.length) missing.push('recommendedDishes');
  if (!row.hoursReference) missing.push('hoursReference');
  if (!Array.isArray(row.lunch) && !Array.isArray(row.dinner)) missing.push('budget');
  if (!row.address) missing.push('address');
  if (!row.cuisine || row.cuisine === '餐厅') missing.push('cuisine');
  return missing;
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
  return match ? stripHtml(match[1]).slice(0, 220) : null;
}

function jsonLdFacts(html) {
  const facts = [];
  const regex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of String(html).matchAll(regex)) {
    let parsed;
    try { parsed = JSON.parse(decodeEntities(match[1]).trim()); } catch (_) { continue; }
    const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (stack.length && facts.length < 12) {
      const node = stack.shift();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node['@graph'])) stack.push(...node['@graph']);
      const type = Array.isArray(node['@type']) ? node['@type'] : node['@type'] ? [node['@type']] : [];
      const address = typeof node.address === 'string'
        ? node.address
        : node.address && typeof node.address === 'object'
          ? [node.address.postalCode, node.address.addressRegion, node.address.addressLocality, node.address.streetAddress].filter(Boolean).join(' ')
          : null;
      const hours = Array.isArray(node.openingHours) ? node.openingHours : node.openingHours ? [node.openingHours] : [];
      const specs = Array.isArray(node.openingHoursSpecification)
        ? node.openingHoursSpecification
        : node.openingHoursSpecification ? [node.openingHoursSpecification] : [];
      for (const spec of specs) {
        if (!spec || typeof spec !== 'object') continue;
        const day = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek.join(',') : spec.dayOfWeek;
        const range = [spec.opens, spec.closes].filter(Boolean).join('-');
        if (day || range) hours.push([day, range].filter(Boolean).join(' '));
      }
      if (node.name || address || hours.length || node.servesCuisine || node.priceRange) {
        facts.push({
          types: type.slice(0, 6),
          name: typeof node.name === 'string' ? node.name.slice(0, 220) : null,
          address: address ? String(address).slice(0, 300) : null,
          openingHours: hours.filter(Boolean).slice(0, 14),
          cuisine: Array.isArray(node.servesCuisine) ? node.servesCuisine.slice(0, 12) : node.servesCuisine || null,
          priceRange: typeof node.priceRange === 'string' ? node.priceRange.slice(0, 100) : null
        });
      }
    }
  }
  return facts;
}

function compactSnippet(text, index, length = 180) {
  const left = Math.max(0, index - Math.floor(length / 3));
  return text.slice(left, Math.min(text.length, left + length)).replace(/\s+/g, ' ').trim();
}

function snippets(text, regex, max = 16) {
  const output = [];
  for (const match of text.matchAll(regex)) {
    const item = compactSnippet(text, match.index || 0);
    if (item && !output.includes(item)) output.push(item);
    if (output.length >= max) break;
  }
  return output;
}

function menuLinks(html, baseUrl) {
  const output = [];
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html).matchAll(regex)) {
    const label = stripHtml(match[2]).slice(0, 120);
    if (!/(menu|メニュー|料理|お品書き|food|drink|商品)/i.test(`${match[1]} ${label}`)) continue;
    try {
      const url = new URL(match[1], baseUrl).href;
      if (!output.some((item) => item.url === url)) output.push({ label, url });
    } catch (_) {}
    if (output.length >= 20) break;
  }
  return output;
}

const AGGREGATOR_HOSTS = [
  'tabelog.com', 'hotpepper.jp', 'gnavi.co.jp', 'retty.me', 'tripadvisor.', 'yelp.',
  'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'maps.google.', 'google.com/maps'
];

function hostClass(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (AGGREGATOR_HOSTS.some((needle) => `${host}${new URL(url).pathname}`.includes(needle))) return 'platform-or-social';
    return 'candidate-official';
  } catch (_) {
    return 'invalid';
  }
}

async function placeWebsite(placeId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'websiteUri',
        'accept': 'application/json'
      },
      signal: controller.signal
    });
    if (!response.ok) return { ok: false, status: response.status, uri: null, error: `places_http_${response.status}` };
    const body = await response.json();
    return { ok: true, status: response.status, uri: typeof body.websiteUri === 'string' ? body.websiteUri : null, error: null };
  } catch (error) {
    return { ok: false, status: null, uri: null, error: error?.name === 'AbortError' ? 'places_timeout' : String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWebsite(uri, restaurantName) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(uri, {
      redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
        'accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'accept-language': 'ja,en;q=0.8'
      },
      signal: controller.signal
    });
    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();
    const html = /html|xhtml/i.test(contentType) || /<html\b/i.test(body) ? body : '';
    const text = html ? stripHtml(html) : '';
    const title = html ? titleFromHtml(html) : null;
    const normName = normalize(restaurantName);
    const searchable = normalize(`${title || ''} ${text.slice(0, 12000)}`);
    const nameMatched = Boolean(normName && searchable.includes(normName));
    return {
      ok: response.ok,
      status: response.status,
      verifiedUrl: response.url,
      hostClass: hostClass(response.url),
      contentType: contentType.slice(0, 120),
      title,
      nameMatched,
      structuredFacts: html ? jsonLdFacts(html) : [],
      recommendationSnippets: html ? snippets(text, /おすすめ|お勧め|人気|名物|看板|定番|自慢|おすすめメニュー/gi, 16) : [],
      priceSnippets: html ? snippets(text, /(?:¥|￥)\s?\d[\d,]*|\d[\d,]*\s?円/g, 20) : [],
      menuLinks: html ? menuLinks(html, response.url) : [],
      elapsedMs: Date.now() - started,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      verifiedUrl: null,
      hostClass: 'invalid',
      contentType: null,
      title: null,
      nameMatched: false,
      structuredFacts: [],
      recommendationSnippets: [],
      priceSnippets: [],
      menuLinks: [],
      elapsedMs: Date.now() - started,
      error: error?.name === 'AbortError' ? 'website_timeout' : String(error?.message || error)
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

const production = loadProduction();
const enrichments = loadEnrichments();
const withOfficial = new Set();
for (const row of enrichments) {
  if ((row.sourceRefs || []).some((ref) => ref.provider === 'official')) withOfficial.add(row.googlePlaceId);
}

let targets = production
  .filter((row) => !withOfficial.has(row.googlePlaceId))
  .map((row) => ({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    distanceMeters: row.distanceMeters,
    existingGaps: gaps(row)
  }))
  .sort((a, b) => a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name, 'ja'));
if (LIMIT > 0) targets = targets.slice(0, LIMIT);

const results = await mapLimit(targets, CONCURRENCY, async (target) => {
  const google = await placeWebsite(target.googlePlaceId);
  if (!google.ok || !google.uri) {
    return {
      ...target,
      discoveryStatus: google.ok ? 'no_website' : 'google_error',
      googleStatusCode: google.status,
      page: null,
      error: google.error
    };
  }
  const page = await fetchWebsite(google.uri, target.name);
  // Do not persist the Google-returned websiteUri. The retained URL below is
  // the final URL independently returned by the fetched website itself.
  return {
    ...target,
    discoveryStatus: page.ok ? 'fetched' : 'website_error',
    googleStatusCode: google.status,
    page,
    error: page.error
  };
});

const fetched = results.filter((row) => row.page?.ok);
const summary = {
  targetCount: targets.length,
  googleLookupOk: results.filter((row) => row.googleStatusCode === 200).length,
  websiteFound: results.filter((row) => row.discoveryStatus !== 'no_website' && row.googleStatusCode === 200).length,
  websiteFetchedOk: fetched.length,
  nameMatched: fetched.filter((row) => row.page.nameMatched).length,
  candidateOfficialHost: fetched.filter((row) => row.page.hostClass === 'candidate-official').length,
  withStructuredFacts: fetched.filter((row) => row.page.structuredFacts.length).length,
  withRecommendationSignals: fetched.filter((row) => row.page.recommendationSnippets.length).length,
  withPriceSignals: fetched.filter((row) => row.page.priceSnippets.length).length,
  withMenuLinks: fetched.filter((row) => row.page.menuLinks.length).length,
  noWebsite: results.filter((row) => row.discoveryStatus === 'no_website').length,
  googleErrors: results.filter((row) => row.discoveryStatus === 'google_error').length,
  websiteErrors: results.filter((row) => row.discoveryStatus === 'website_error').length
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify({ summary, results }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary));
