#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DISH_RULES } from './recommended_dish_extractor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(DATA, 'official_menu_image_text_evidence.json');
const SOURCE = path.join(DATA, 'reviewed_official_runtime_sources.json');
const RUNTIME = path.join(DATA, 'google_inventory_runtime.js');
const CHECKED_AT = new Date().toISOString().slice(0, 10);
const TIMEOUT_MS = Math.max(8_000, Number(process.env.OFFICIAL_MENU_IMAGE_TEXT_TIMEOUT_MS || 12_000));
const WORKERS = Math.max(1, Math.min(16, Number(process.env.OFFICIAL_MENU_IMAGE_TEXT_WORKERS || 12)));
const USER_AGENT = 'eat-data-maintenance/2.2 (+https://github.com/nekooweb/eat)';
const MAX_HTML_CHARS = 1_200_000;
const NON_HTML_ASSET = /\.(?:pdf|jpe?g|png|gif|webp|avif|svg|css|js|mjs|xml)(?:$|[?#])/i;
const MENU_URL_CONTEXT = /(?:menu|menus|food|foods|lunch|dinner|takeout|takeouts|system|campaign|料理|お品書|御品書|メニュー|フード|商品|グランド)/i;
const GENERIC_ONLY = /^(?:menu|menus|メニュー|料理|お品書き|御品書き|写真|画像|image|photo|商品|おすすめ|オススメ|no\s*image)$/i;
const NON_DISH_ACCESSIBLE_TEXT = /(?:ロゴ|\blogo\b|外観|内観|instagram|facebook|twitter|youtube|店舗写真|店内写真|スタッフ|採用|会社概要|バナー|banner)/i;
const NON_DISH_IMAGE_SRC = /(?:logo|brand|shop|store|staff|company|banner|bnr|instagram|facebook|twitter)/i;

function loadRuntime() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(RUNTIME, 'utf8'), sandbox, { filename: 'google_inventory_runtime.js' });
  const rows = Array.isArray(sandbox.window.GOOGLE_INVENTORY_RESTAURANTS) ? sandbox.window.GOOGLE_INVENTORY_RESTAURANTS : [];
  const stats = sandbox.window.GOOGLE_INVENTORY_STATS || {};
  if (stats.catalogTotal !== 2804 || stats.inventoryTotal !== rows.length) throw new Error('runtime catalog/inventory contract mismatch');
  return rows;
}

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

function normalizedIdentityText(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

function textLooksLikeRestaurantIdentity(text, restaurantNames) {
  const textKey = normalizedIdentityText(text);
  if (!textKey) return false;
  const names = Array.isArray(restaurantNames) ? restaurantNames : [restaurantNames];
  for (const restaurantName of names) {
    const nameKey = normalizedIdentityText(restaurantName);
    if (nameKey.length >= 4 && textKey.includes(nameKey)) return true;
  }
  return false;
}

function htmlMenuUrl(value) {
  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol) || NON_HTML_ASSET.test(u.toString())) return null;
    const context = `${u.pathname} ${u.search} ${u.hash}`;
    if (!MENU_URL_CONTEXT.test(context)) return null;
    return u.toString();
  } catch {
    return null;
  }
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

function dishMatches(text, limit = 5) {
  const output = [];
  const seen = new Set();
  for (const [pattern, nameZh] of DISH_RULES) {
    const match = text.match(pattern);
    if (!match || asciiSubstringFalsePositive(text, match) || seen.has(nameZh)) continue;
    seen.add(nameZh);
    output.push({ nameZh, nameOriginal: match[0], rule: pattern.source });
    if (output.length >= limit) break;
  }
  return output;
}

function extractImageAttributeDishes(html, sourceUrl, restaurantNames) {
  const output = [];
  const seen = new Set();
  const imageRe = /<img\b[^>]*>/gi;
  let image;
  while ((image = imageRe.exec(String(html || '')))) {
    const tag = image[0];
    const srcMatch = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i);
    const src = decodeEntities(srcMatch?.[2] || '');
    if (src && NON_DISH_IMAGE_SRC.test(src)) continue;
    const values = [];
    const attrRe = /\b(?:alt|title)\s*=\s*(["'])(.*?)\1/gi;
    let attr;
    while ((attr = attrRe.exec(tag))) {
      const text = decodeEntities(attr[2]);
      if (
        text.length < 2 || text.length > 60 || GENERIC_ONLY.test(text) ||
        NON_DISH_ACCESSIBLE_TEXT.test(text) || textLooksLikeRestaurantIdentity(text, restaurantNames)
      ) continue;
      values.push(text);
    }
    for (const text of [...new Set(values)]) {
      for (const match of dishMatches(text, 5)) {
        const key = `${match.nameZh}|${sourceUrl}`;
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
          evidenceSnippet: text.slice(0, 60)
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
    const key = `${item.nameZh}|${item.provider}|${item.sourceUrl}|${item.evidenceClass}`;
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
  const runtimeRows = loadRuntime();
  const runtimeById = new Map(runtimeRows.map((row) => [row.googlePlaceId, row]));

  const tasks = [];
  let skippedNonMenuContext = 0;
  let skippedAlreadyFeatured = 0;
  let skippedMissingRuntimeIdentityName = 0;
  let sourceAliasDiffers = 0;
  for (const row of source.rows || []) {
    if (row.reviewState !== 'reviewed' || !row.googlePlaceId) continue;
    const runtime = runtimeById.get(row.googlePlaceId);
    const identityName = String(runtime?.name || '').trim();
    if (!runtime || runtime.nameKnown !== true || !identityName) {
      skippedMissingRuntimeIdentityName += 1;
      continue;
    }
    const sourceOfficialName = String(row.officialName || '').trim();
    if (sourceOfficialName && normalizedIdentityText(sourceOfficialName) !== normalizedIdentityText(identityName)) {
      sourceAliasDiffers += 1;
    }
    if (Array.isArray(runtime.featuredDishes) && runtime.featuredDishes.length > 0) {
      skippedAlreadyFeatured += 1;
      continue;
    }
    for (const rawUrl of row.menuUrls || []) {
      const url = htmlMenuUrl(rawUrl);
      if (!url) {
        if (!NON_HTML_ASSET.test(String(rawUrl || ''))) skippedNonMenuContext += 1;
        continue;
      }
      tasks.push({
        googlePlaceId: row.googlePlaceId,
        name: identityName,
        sourceOfficialName: sourceOfficialName || null,
        url
      });
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
        const identityAliases = [task.name, task.sourceOfficialName].filter(Boolean);
        const featuredDishes = dedupe(extractImageAttributeDishes(page.html, page.finalUrl, identityAliases));
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
      sourceOfficialName: row.sourceOfficialName || null,
      recommendedDishes: [],
      featuredDishes: []
    };
    current.featuredDishes = dedupe([...current.featuredDishes, ...row.featuredDishes]);
    byPlace.set(row.googlePlaceId, current);
  }

  const rows = [...byPlace.values()].sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));
  const payload = {
    schemaVersion: 4,
    checkedAt: CHECKED_AT,
    policy: {
      catalogIdentityKey: 'frozen Place ID only',
      catalogTotal: 2804,
      reviewedOfficialMenuUrlsOnly: true,
      currentFeaturedDishGapOnly: true,
      toolIdentityNameSource: 'runtime_catalog_name',
      sourceOfficialNameRole: 'source_alias_only',
      sourceOfficialNameMayReplaceToolIdentity: false,
      explicitMenuUrlContextRequired: true,
      restaurantIdentityTextRejected: true,
      sourceAliasIdentityTextRejected: true,
      imageBinaryRead: false,
      ocrExecuted: false,
      accessibleHtmlAttributesOnly: ['img.alt', 'img.title'],
      asciiSubstringBoundaryGuard: true,
      nonDishAccessibleTextFiltered: true,
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
      publicRuntimeTotal: runtimeRows.length,
      sourceAliasDiffers,
      skippedMissingRuntimeIdentityName,
      skippedAlreadyFeatured,
      htmlMenuTasks: tasks.length,
      skippedNonMenuContext,
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
