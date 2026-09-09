#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DISH_RULES } from './recommended_dish_extractor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(DATA, 'official_menu_image_text_evidence.json');
const SOURCE = path.join(DATA, 'reviewed_official_runtime_sources.json');
const CHECKED_AT = new Date().toISOString().slice(0, 10);
const TIMEOUT_MS = Math.max(8_000, Number(process.env.OFFICIAL_MENU_IMAGE_TEXT_TIMEOUT_MS || 12_000));
const WORKERS = Math.max(1, Math.min(16, Number(process.env.OFFICIAL_MENU_IMAGE_TEXT_WORKERS || 12)));
const USER_AGENT = 'eat-data-maintenance/2.1 (+https://github.com/nekooweb/eat)';
const MAX_HTML_CHARS = 1_200_000;
const NON_HTML_ASSET = /\.(?:pdf|jpe?g|png|gif|webp|avif|svg|css|js|mjs|xml)(?:$|[?#])/i;
const GENERIC_ONLY = /^(?:menu|menus|メニュー|料理|お品書き|御品書き|写真|画像|image|photo|商品|おすすめ|オススメ|no\s*image)$/i;

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlMenuUrl(value) {
  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol) || NON_HTML_ASSET.test(u.toString())) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function dishMatches(text, limit = 5) {
  const output = [];
  const seen = new Set();
  for (const [pattern, nameZh] of DISH_RULES) {
    const match = text.match(pattern);
    if (!match || seen.has(nameZh)) continue;
    seen.add(nameZh);
    output.push({ nameZh, nameOriginal: match[0], rule: pattern.source });
    if (output.length >= limit) break;
  }
  return output;
}

function extractImageAttributeDishes(html, sourceUrl) {
  const output = [];
  const seen = new Set();
  const imageRe = /<img\b[^>]*>/gi;
  let image;
  while ((image = imageRe.exec(String(html || '')))) {
    const tag = image[0];
    const values = [];
    const attrRe = /\b(?:alt|title)\s*=\s*(["'])(.*?)\1/gi;
    let attr;
    while ((attr = attrRe.exec(tag))) {
      const text = decodeEntities(attr[2]);
      if (text.length < 2 || text.length > 180 || GENERIC_ONLY.test(text)) continue;
      values.push(text);
    }
    for (const text of [...new Set(values)]) {
      for (const match of dishMatches(text, 5)) {
        const key = `${match.nameZh}|${sourceUrl}|${text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        output.push({
          nameZh: match.nameZh,
          nameJa: match.nameOriginal,
          provider: 'sourceWebsite',
          sourceUrl,
          checkedAt: CHECKED_AT,
          evidenceClass: 'source_menu_text',
          evidenceRule: `menu-image-accessible-text:${match.rule}`,
          evidenceSnippet: text.slice(0, 90)
        });
      }
    }
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
  const contentType = response.headers.get('content-type') || '';
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new Error(`non-html ${contentType}`);
  return { html: (await response.text()).slice(0, MAX_HTML_CHARS), finalUrl: response.url || url };
}

function dedupe(items, limit = 8) {
  const map = new Map();
  for (const item of items || []) {
    const key = `${item.nameZh}|${item.sourceUrl}|${item.evidenceSnippet}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()].slice(0, limit);
}

async function main() {
  const source = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  if (source.policy?.reviewedRowsOnly !== true || source.policy?.conflictRowsPublished !== false) {
    throw new Error('reviewed official source contract mismatch');
  }
  if (source.policy?.paidGoogleDataApiCalls !== 0 || source.summary?.catalogTotal !== 2804) {
    throw new Error('zero-paid/catalog source contract mismatch');
  }

  const tasks = [];
  for (const row of source.rows || []) {
    if (row.reviewState !== 'reviewed' || !row.googlePlaceId || !row.officialName) continue;
    for (const rawUrl of row.menuUrls || []) {
      const url = htmlMenuUrl(rawUrl);
      if (!url) continue;
      tasks.push({ googlePlaceId: row.googlePlaceId, name: row.officialName, url });
    }
  }

  let cursor = 0;
  const resultRows = [];
  const errors = [];
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= tasks.length) return;
      const task = tasks[index];
      try {
        const page = await fetchHtml(task.url);
        const featuredDishes = dedupe(extractImageAttributeDishes(page.html, page.finalUrl));
        resultRows.push({ ...task, finalUrl: page.finalUrl, featuredDishes });
      } catch (error) {
        errors.push({ ...task, error: String(error?.message || error).slice(0, 160) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(WORKERS, tasks.length || 1) }, () => worker()));

  const byPlace = new Map();
  for (const row of resultRows) {
    if (!row.featuredDishes.length) continue;
    const current = byPlace.get(row.googlePlaceId) || {
      googlePlaceId: row.googlePlaceId,
      name: row.name,
      recommendedDishes: [],
      featuredDishes: []
    };
    current.featuredDishes = dedupe([...current.featuredDishes, ...row.featuredDishes]);
    byPlace.set(row.googlePlaceId, current);
  }

  const rows = [...byPlace.values()].sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));
  const payload = {
    schemaVersion: 1,
    checkedAt: CHECKED_AT,
    policy: {
      catalogIdentityKey: 'frozen Place ID only',
      catalogTotal: 2804,
      reviewedOfficialMenuUrlsOnly: true,
      imageBinaryRead: false,
      ocrExecuted: false,
      accessibleHtmlAttributesOnly: ['img.alt', 'img.title'],
      recommendationPromotionAllowed: false,
      ordinaryAccessibleMenuTextIsFeaturedOnly: true,
      cuisineNameBrandInferenceAllowed: false,
      guessedMenuPathsAllowed: false,
      identityMutationAllowed: false,
      paidGoogleDataApiCalls: 0,
      rawHtmlPersisted: false
    },
    summary: {
      reviewedOfficialRows: Number(source.summary?.reviewedRows || 0),
      reviewedRowsWithMenuUrls: Number(source.summary?.reviewedRowsWithMenuUrls || 0),
      htmlMenuTasks: tasks.length,
      pagesFetched: resultRows.length,
      errors: errors.length,
      evidenceRestaurants: rows.length,
      featuredItems: rows.reduce((sum, row) => sum + row.featuredDishes.length, 0)
    },
    rows
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(payload.summary));
  if (errors.length) console.log('ERROR_SAMPLES=' + JSON.stringify(errors.slice(0, 12)));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
