#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DISH_RULES,
  MENU_LINK_MARKER,
  RECOMMENDATION_MARKER,
  extractStrictRecommendationsFromText,
  htmlToTextBlocks
} from './recommended_dish_extractor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(DATA, 'official_pdf_dish_evidence.json');
const CHECKED_AT = new Date().toISOString().slice(0, 10);
const TIMEOUT_MS = Math.max(2000, Math.min(15000, Number(process.env.OFFICIAL_PDF_FETCH_TIMEOUT_MS || 8000)));
const HOST_WORKERS = Math.max(1, Math.min(16, Number(process.env.OFFICIAL_PDF_HOST_WORKERS || 8)));
const PDF_LINK_LIMIT = Math.max(1, Math.min(8, Number(process.env.OFFICIAL_PDF_LINK_LIMIT || 4)));
const MAX_PDF_BYTES = Math.max(1_000_000, Math.min(25_000_000, Number(process.env.OFFICIAL_PDF_MAX_BYTES || 15_000_000)));
const MAX_TEXT_CHARS = 1_000_000;
const USER_AGENT = 'eat-official-pdf-dish/1.0 (+https://github.com/nekooweb/eat)';
const PDF_RE = /\.pdf(?:$|[?#])/i;
const BANNED_HOST = /(?:^|\.)(?:facebook\.com|instagram\.com|x\.com|twitter\.com|youtube\.com|tiktok\.com|tabelog\.com|hotpepper\.jp|google\.[a-z.]+|googleusercontent\.com|gnavi\.co\.jp|retty\.me|foursquare\.com|autoreserve\.com|ekiten\.jp)$/i;

function loadWindowFile(filename) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
  return sandbox.window;
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (BANNED_HOST.test(host)) return null;
    return url;
  } catch {
    return null;
  }
}

function hostKey(value) {
  const url = value instanceof URL ? value : safeUrl(value);
  return url ? url.hostname.toLowerCase().replace(/^www\./, '') : '';
}

function sameOriginFamily(a, b) {
  const x = hostKey(a);
  const y = hostKey(b);
  return Boolean(x && y && (x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`)));
}

function isEligibleSource(value) {
  const url = safeUrl(value);
  if (!url) return false;
  const host = hostKey(url);
  if (/openstreetmap\.org$/.test(host)) return false;
  return !BANNED_HOST.test(host);
}

function sourceItem(match, sourceUrl, evidenceClass, evidenceRule, snippet = '') {
  return {
    nameZh: match.nameZh,
    nameJa: String(match.nameOriginal || match.nameJa || match.nameZh).slice(0, 80),
    provider: 'sourceWebsite',
    sourceUrl,
    checkedAt: CHECKED_AT,
    evidenceClass,
    evidenceRule,
    evidenceSnippet: clean(snippet || match.evidenceSnippet || match.nameOriginal || '').slice(0, 120)
  };
}

function dedupe(items, limit = 6) {
  const map = new Map();
  for (const item of items || []) {
    if (!item?.nameZh || !item?.sourceUrl) continue;
    const key = `${item.nameZh}|${item.provider}|${item.sourceUrl}|${item.evidenceClass}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()].slice(0, limit);
}

function pdfLinksFromHtml(html, baseUrl) {
  const base = safeUrl(baseUrl);
  if (!base) return [];
  const output = [];
  const seen = new Set();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || '')))) {
    let url;
    try { url = new URL(match[1], base); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol) || !sameOriginFamily(base, url) || !PDF_RE.test(url.toString())) continue;
    const label = htmlToTextBlocks(match[2]).join(' ');
    if (!MENU_LINK_MARKER.test(`${url.pathname} ${url.search} ${label}`)) continue;
    url.hash = '';
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(key);
    if (output.length >= PDF_LINK_LIMIT) break;
  }
  return output;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const finalUrl = safeUrl(response.url);
  if (!finalUrl || !sameOriginFamily(url, finalUrl)) throw new Error('cross-origin redirect');
  const type = response.headers.get('content-type') || '';
  if (!/text\/html|application\/xhtml\+xml/i.test(type)) throw new Error(`non-html ${type}`);
  return { finalUrl: finalUrl.toString(), html: (await response.text()).slice(0, 1_200_000) };
}

async function fetchPdf(rawUrl, anchorUrl) {
  const source = safeUrl(rawUrl);
  const anchor = safeUrl(anchorUrl || rawUrl);
  if (!source || !anchor) throw new Error('invalid PDF URL');
  const response = await fetch(source, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': USER_AGENT, accept: 'application/pdf,*/*;q=0.1' }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const finalUrl = safeUrl(response.url);
  if (!finalUrl || !sameOriginFamily(anchor, finalUrl)) throw new Error('cross-origin PDF redirect');
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_PDF_BYTES) throw new Error(`PDF too large: ${length}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES) throw new Error(`PDF too large after fetch: ${bytes.length}`);
  const magic = Buffer.from(bytes.slice(0, 5)).toString('ascii');
  const type = response.headers.get('content-type') || '';
  if (magic !== '%PDF-' && !/application\/pdf/i.test(type)) throw new Error(`not a PDF: ${type}`);
  return { finalUrl: finalUrl.toString(), bytes };
}

function pdfToText(bytes, hint = 'menu') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eat-pdf-'));
  const input = path.join(dir, `${String(hint).replace(/[^a-z0-9_-]+/gi, '_').slice(0, 50) || 'menu'}.pdf`);
  try {
    fs.writeFileSync(input, Buffer.from(bytes));
    const result = spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', input, '-'], {
      encoding: 'utf8',
      maxBuffer: 12 * 1024 * 1024,
      timeout: 20_000
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(clean(result.stderr).slice(0, 300) || `pdftotext exit ${result.status}`);
    return String(result.stdout || '').slice(0, MAX_TEXT_CHARS);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function textLines(text) {
  return String(text || '').replace(/\r/g, '\n').split(/\n+/)
    .map((line) => clean(line)).filter((line) => line.length >= 2 && line.length <= 500);
}

function recommendationMatches(lines, limit = 6) {
  const out = [];
  const seen = new Set();
  for (const line of lines) {
    if (!RECOMMENDATION_MARKER.test(line)) continue;
    for (const match of extractStrictRecommendationsFromText(line, 4)) {
      if (!match?.nameZh || seen.has(match.nameZh)) continue;
      seen.add(match.nameZh);
      out.push({ ...match, evidenceSnippet: line.slice(0, 120) });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function featuredMatches(lines, limit = 12) {
  const out = [];
  const seen = new Set();
  for (const line of lines) {
    for (const [pattern, nameZh] of DISH_RULES) {
      const match = line.match(pattern);
      if (!match || seen.has(nameZh)) continue;
      seen.add(nameZh);
      out.push({ nameZh, nameOriginal: match[0], rule: pattern.source, evidenceSnippet: line.slice(0, 120) });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

async function main() {
  const pdftotext = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' });
  if (pdftotext.error?.code === 'ENOENT') throw new Error('pdftotext is required for official PDF menu extraction');

  const runtimeWindow = loadWindowFile('google_inventory_runtime.js');
  const runtimeRows = Array.isArray(runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS) ? runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS : [];
  const runtimeStats = runtimeWindow.GOOGLE_INVENTORY_STATS || {};
  const queue = JSON.parse(fs.readFileSync(path.join(DATA, 'google_inventory_detail_queue.json'), 'utf8'));
  if (runtimeStats.catalogTotal !== 2804 || runtimeStats.inventoryTotal !== runtimeRows.length || runtimeRows.length + Number(runtimeStats.unpublishedPlaceIdOnly || 0) !== 2804) {
    throw new Error('PDF collector requires the complete frozen catalog runtime');
  }
  if (queue.summary?.publicRuntimeTotal !== runtimeRows.length) throw new Error('PDF collector queue/runtime mismatch');

  const provenanceWindow = fs.existsSync(path.join(DATA, 'source_provenance.js')) ? loadWindowFile('source_provenance.js') : {};
  const provenanceRows = provenanceWindow.SOURCE_PROVENANCE?.rows || [];
  const provenanceById = new Map(provenanceRows.map((row) => [row.googlePlaceId, row]));
  const runtimeById = new Map(runtimeRows.map((row) => [row.googlePlaceId, row]));
  const eligibleActions = new Set(['collect_strict_recommended_dishes', 'collect_source_backed_featured_dishes']);
  const targets = (queue.rows || []).filter((row) => eligibleActions.has(row.nextAction) && runtimeById.has(row.googlePlaceId));

  let rootHtmlFetched = 0;
  let rootHtmlErrors = 0;
  let directPdfUrls = 0;
  let discoveredPdfUrls = 0;
  const tasks = [];
  for (const target of targets) {
    const runtime = runtimeById.get(target.googlePlaceId);
    const roots = new Set();
    const direct = new Set();
    for (const raw of runtime.sourceWebsites || []) {
      if (!isEligibleSource(raw)) continue;
      const url = safeUrl(raw);
      if (PDF_RE.test(url.toString())) direct.add(url.toString());
      else roots.add(url.toString());
    }
    const prov = provenanceById.get(target.googlePlaceId);
    for (const link of prov?.sourceLinks || []) {
      if (String(link?.provider || '').toLowerCase() !== 'official' || !isEligibleSource(link.url)) continue;
      const url = safeUrl(link.url);
      if (PDF_RE.test(url.toString())) direct.add(url.toString());
      else roots.add(url.toString());
    }
    directPdfUrls += direct.size;
    const pdfs = new Map([...direct].map((url) => [url, { url, anchor: url, discovery: 'direct_bound_pdf' }]));
    for (const root of [...roots].slice(0, 4)) {
      try {
        const fetched = await fetchHtml(root);
        rootHtmlFetched += 1;
        for (const pdfUrl of pdfLinksFromHtml(fetched.html, fetched.finalUrl)) {
          if (!pdfs.has(pdfUrl)) {
            pdfs.set(pdfUrl, { url: pdfUrl, anchor: fetched.finalUrl, discovery: 'same_origin_menu_pdf_link' });
            discoveredPdfUrls += 1;
          }
        }
      } catch {
        rootHtmlErrors += 1;
      }
    }
    for (const task of [...pdfs.values()].slice(0, PDF_LINK_LIMIT)) tasks.push({ ...task, googlePlaceId: target.googlePlaceId, name: runtime.name });
  }

  const byId = new Map();
  const errors = [];
  let index = 0;
  let pdfFetched = 0;
  let pdfTextExtracted = 0;
  let pdfRecommendationPages = 0;
  let pdfFeaturedPages = 0;
  async function worker() {
    while (true) {
      const current = index++;
      if (current >= tasks.length) return;
      const task = tasks[current];
      try {
        const pdf = await fetchPdf(task.url, task.anchor);
        pdfFetched += 1;
        const text = pdfToText(pdf.bytes, task.googlePlaceId);
        if (!clean(text)) throw new Error('PDF has no extractable text');
        pdfTextExtracted += 1;
        const lines = textLines(text);
        const rec = recommendationMatches(lines, 6).map((match) => sourceItem(
          match, pdf.finalUrl, 'source_pdf_recommendation_text', `pdf-line:${match.rule}`, match.evidenceSnippet
        ));
        const featured = featuredMatches(lines, 12).map((match) => sourceItem(
          match, pdf.finalUrl, 'source_pdf_menu_text', `pdf-menu-line:${match.rule}`, match.evidenceSnippet
        ));
        if (rec.length) pdfRecommendationPages += 1;
        if (featured.length) pdfFeaturedPages += 1;
        if (!rec.length && !featured.length) continue;
        const old = byId.get(task.googlePlaceId) || { googlePlaceId: task.googlePlaceId, name: task.name, recommendedDishes: [], featuredDishes: [] };
        old.recommendedDishes = dedupe([...old.recommendedDishes, ...rec], 6);
        old.featuredDishes = dedupe([...old.featuredDishes, ...featured], 6);
        byId.set(task.googlePlaceId, old);
      } catch (error) {
        errors.push({ googlePlaceId: task.googlePlaceId, url: task.url, error: clean(error?.message || error).slice(0, 300) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(HOST_WORKERS, Math.max(1, tasks.length)) }, () => worker()));

  const rows = [...byId.values()].sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));
  const summary = {
    catalogTotal: 2804,
    publicRuntimeTotal: runtimeRows.length,
    queueTargetRows: targets.length,
    rootHtmlFetched,
    rootHtmlErrors,
    directPdfUrls,
    discoveredPdfUrls,
    pdfTasks: tasks.length,
    pdfFetched,
    pdfTextExtracted,
    pdfErrorRows: errors.length,
    pdfRecommendationPages,
    pdfFeaturedPages,
    evidenceRestaurants: rows.length,
    recommendationRestaurants: rows.filter((row) => row.recommendedDishes.length).length,
    featuredRestaurants: rows.filter((row) => row.featuredDishes.length).length,
    recommendationItems: rows.reduce((n, row) => n + row.recommendedDishes.length, 0),
    featuredItems: rows.reduce((n, row) => n + row.featuredDishes.length, 0)
  };
  const payload = {
    schemaVersion: 1,
    checkedAt: CHECKED_AT,
    policy: {
      paidGoogleDataApiCalls: 0,
      source: 'already-bound independent official/source websites only',
      pdfDiscovery: 'direct bound PDF or same-origin menu-labelled PDF link from an already-bound source page',
      crossOriginPdfUrlsAllowed: false,
      maximumPdfLinksPerRestaurant: PDF_LINK_LIMIT,
      maximumPdfBytes: MAX_PDF_BYTES,
      recommendationRequiresExplicitMarkerOnSameExtractedPdfLine: true,
      ordinaryPdfMenuItemsAreFeaturedOnly: true,
      cuisineNameBrandInferenceAllowed: false,
      genericFallbackAllowed: false,
      rawPdfPersisted: false,
      rawExtractedTextPersisted: false,
      identityChanges: 0,
      sourceLanguageMayBeJapanese: true,
      targetLanguage: 'zh-CN',
      extractor: 'pdftotext + source-native DISH_RULES'
    },
    summary,
    rows,
    errors: errors.slice(0, 100)
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
