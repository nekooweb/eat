#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(DATA, 'google_inventory_detail_evidence.json');
const TIMEOUT_MS = Number(process.env.INVENTORY_DETAIL_FETCH_TIMEOUT_MS || 7000);
const HOST_WORKERS = Math.max(1, Math.min(32, Number(process.env.INVENTORY_DETAIL_HOST_WORKERS || 20)));
const MAX_HTML_CHARS = 1_200_000;
const CHECKED_AT = new Date().toISOString().slice(0, 10);
const USER_AGENT = 'eat-data-maintenance/1.0 (+https://github.com/nekooweb/eat)';

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
if (runtimeRows.length !== 2804) throw new Error('Expected exact 2,804 Google inventory runtime');

const provenanceWindow = fs.existsSync(path.join(DATA, 'source_provenance.js'))
  ? loadWindowFile('source_provenance.js')
  : {};
const provenanceRows = provenanceWindow.SOURCE_PROVENANCE?.rows || [];
const provenanceById = new Map(provenanceRows.map((row) => [row.googlePlaceId, row]));
const hotPepperDoc = fs.existsSync(path.join(DATA, 'hotpepper_catalog_facts.json'))
  ? JSON.parse(fs.readFileSync(path.join(DATA, 'hotpepper_catalog_facts.json'), 'utf8'))
  : { rows: [] };
const hotPepperById = new Map((hotPepperDoc.rows || []).filter((row) => row.googlePlaceId).map((row) => [row.googlePlaceId, row]));

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
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
  if (/openstreetmap\.org$/.test(host)) return false;
  if (/hotpepper\.jp$/.test(host)) return false;
  if (/tabelog\.com$/.test(host)) return false;
  if (/(^|\.)google\./.test(host) || /googleusercontent\.com$/.test(host)) return false;
  if (/facebook\.com$|instagram\.com$|x\.com$|twitter\.com$|youtube\.com$|tiktok\.com$/.test(host)) return false;
  return true;
}

const SIGNATURE_MARKER = /おすすめ|オススメ|お勧め|名物|看板|自慢|人気|絶品|イチオシ|一押し|推し|こだわり|スペシャリテ|シグネチャー|signature|specialt(?:y|ies)|recommended|recommendation|popular|best[ -]?seller|must[ -]?try|featured/i;
const MENU_LINK_MARKER = /menu|food|dish|cuisine|lunch|dinner|料理|お品書|御品書|メニュー|食事|おすすめ|名物/i;

const DISH_RULES = [
  [/ビリヤニ|biryani/i, ['印度香饭', 'ビリヤニ']],
  [/焼き?鳥|やきとり|yakitori/i, ['烤鸡串', '焼き鳥']],
  [/串揚げ|串カツ|kushiage/i, ['炸串', '串揚げ']],
  [/唐揚げ|から揚げ|からあげ|karaage/i, ['炸鸡块', '唐揚げ']],
  [/チキン南蛮/i, ['南蛮鸡', 'チキン南蛮']],
  [/ラーメン|らーめん|ramen/i, ['拉面', 'ラーメン']],
  [/中華そば/i, ['中华拉面', '中華そば']],
  [/つけ麺|tsukemen/i, ['蘸面', 'つけ麺']],
  [/担々麺|担担麺|tantanmen/i, ['担担面', '担々麺']],
  [/油そば/i, ['油拌面', '油そば']],
  [/蕎麦|そば|soba/i, ['荞麦面', 'そば']],
  [/うどん|udon/i, ['乌冬面', 'うどん']],
  [/カレー|curry/i, ['咖喱', 'カレー']],
  [/ナン|naan/i, ['烤饼', 'ナン']],
  [/ステーキ|steak/i, ['牛排', 'ステーキ']],
  [/ハンバーグ|hamburg steak/i, ['汉堡排', 'ハンバーグ']],
  [/寿司|すし|鮨|sushi/i, ['寿司', '寿司']],
  [/刺身|お造り|sashimi/i, ['刺身', '刺身']],
  [/海鮮丼/i, ['海鲜丼', '海鮮丼']],
  [/うなぎ|鰻|unagi/i, ['鳗鱼', '鰻']],
  [/天ぷら|天麩羅|tempura/i, ['天妇罗', '天ぷら']],
  [/とんかつ|豚カツ|tonkatsu/i, ['炸猪排', 'とんかつ']],
  [/牛カツ/i, ['炸牛排', '牛カツ']],
  [/牛タン|gyutan/i, ['牛舌', '牛タン']],
  [/焼肉|yakiniku/i, ['烤肉', '焼肉']],
  [/ホルモン/i, ['烤内脏', 'ホルモン']],
  [/しゃぶしゃぶ|shabu.?shabu/i, ['涮涮锅', 'しゃぶしゃぶ']],
  [/すき焼き|すきやき|sukiyaki/i, ['寿喜烧', 'すき焼き']],
  [/もつ鍋/i, ['牛杂锅', 'もつ鍋']],
  [/餃子|gyoza/i, ['饺子', '餃子']],
  [/小籠包|xiaolongbao/i, ['小笼包', '小籠包']],
  [/麻婆豆腐|mapo/i, ['麻婆豆腐', '麻婆豆腐']],
  [/炒飯|チャーハン|fried rice/i, ['炒饭', '炒飯']],
  [/回鍋肉/i, ['回锅肉', '回鍋肉']],
  [/青椒肉絲/i, ['青椒肉丝', '青椒肉絲']],
  [/酢豚/i, ['糖醋猪肉', '酢豚']],
  [/パスタ|スパゲッティ|pasta|spaghetti/i, ['意大利面', 'パスタ']],
  [/ピザ|ピッツァ|pizza/i, ['披萨', 'ピザ']],
  [/オムライス|omelette rice|omurice/i, ['蛋包饭', 'オムライス']],
  [/ドリア/i, ['焗饭', 'ドリア']],
  [/グラタン|gratin/i, ['焗烤', 'グラタン']],
  [/サンドイッチ|サンド|sandwich/i, ['三明治', 'サンドイッチ']],
  [/ハンバーガー|バーガー|burger/i, ['汉堡', 'ハンバーガー']],
  [/タコス|tacos?/i, ['塔可', 'タコス']],
  [/ケバブ|kebab/i, ['烤肉卷', 'ケバブ']],
  [/フォー|pho\b/i, ['越南河粉', 'フォー']],
  [/ガパオ|gapao/i, ['打抛饭', 'ガパオ']],
  [/パッタイ|pad thai/i, ['泰式炒河粉', 'パッタイ']],
  [/サムギョプサル|samgyeopsal/i, ['韩式烤五花肉', 'サムギョプサル']],
  [/チヂミ|jeon\b/i, ['韩式煎饼', 'チヂミ']],
  [/冷麺/i, ['冷面', '冷麺']],
  [/ビビンバ|bibimbap/i, ['石锅拌饭', 'ビビンバ']],
  [/お好み焼き?|okonomiyaki/i, ['御好烧', 'お好み焼']],
  [/もんじゃ|monjayaki/i, ['文字烧', 'もんじゃ']],
  [/たこ焼き?|takoyaki/i, ['章鱼烧', 'たこ焼']],
  [/おでん|oden\b/i, ['关东煮', 'おでん']],
  [/親子丼|oyakodon/i, ['亲子丼', '親子丼']],
  [/牛丼|gyudon/i, ['牛肉饭', '牛丼']],
  [/天丼|tendon\b/i, ['天妇罗丼', '天丼']],
  [/カツ丼|katsudon/i, ['炸猪排丼', 'カツ丼']],
  [/ローストビーフ|roast beef/i, ['烤牛肉', 'ローストビーフ']],
  [/燻製|smoked/i, ['烟熏料理', '燻製']],
  [/クロワッサン|croissant/i, ['可颂', 'クロワッサン']],
  [/パンケーキ|pancake/i, ['松饼', 'パンケーキ']],
  [/フレンチトースト|french toast/i, ['法式吐司', 'フレンチトースト']],
  [/ケーキ|cake/i, ['蛋糕', 'ケーキ']],
  [/パフェ|parfait/i, ['芭菲', 'パフェ']],
  [/プリン|pudding|flan/i, ['布丁', 'プリン']],
  [/クレープ|crepe/i, ['可丽饼', 'クレープ']],
  [/ジェラート|gelato/i, ['意式冰淇淋', 'ジェラート']]
];

function dishMatches(value, sourceUrl, provider, requireMarker) {
  const pageText = normalizeWhitespace(value);
  if (!pageText) return [];
  const dishes = [];
  const seen = new Set();
  for (const [pattern, [nameZh, fallbackJa]] of DISH_RULES) {
    const flags = pattern.flags.includes('i') ? 'ig' : 'g';
    const matches = [...pageText.matchAll(new RegExp(pattern.source, flags))];
    for (const match of matches) {
      const start = Math.max(0, match.index - 110);
      const end = Math.min(pageText.length, match.index + match[0].length + 110);
      const nearby = pageText.slice(start, end);
      if (requireMarker && !SIGNATURE_MARKER.test(nearby)) continue;
      if (seen.has(nameZh)) break;
      seen.add(nameZh);
      dishes.push({
        nameZh,
        nameJa: /[\u3040-\u30ff\u3400-\u9fff]/.test(match[0]) ? match[0] : fallbackJa,
        provider,
        sourceUrl,
        checkedAt: CHECKED_AT,
        evidenceClass: requireMarker ? 'source_recommendation_text' : 'provider_promotional_dish_text',
        evidenceSnippet: nearby.slice(0, 90)
      });
      break;
    }
    if (dishes.length >= 2) break;
  }
  return dishes;
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
    const label = normalizeWhitespace(match[2]);
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
      // Ignore malformed links.
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

async function inspectWebsite(row, rootUrl) {
  const urls = [rootUrl];
  const errors = [];
  for (let index = 0; index < urls.length && index < 3; index += 1) {
    const url = urls[index];
    try {
      const html = await fetchHtml(url);
      const dishes = dishMatches(html, url, 'sourceWebsite', true);
      if (dishes.length) return { status: 'matched', dishes, checkedUrl: url };
      if (index === 0) urls.push(...menuLinks(html, url));
    } catch (error) {
      errors.push(`${url}: ${error?.message || error}`);
    }
  }
  return { status: errors.length ? 'no_match_with_errors' : 'no_match', dishes: [], errors: errors.slice(0, 2) };
}

function dedupeDishes(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.nameZh || ''}|${item.nameJa || ''}`;
    if (!item.nameZh || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

async function main() {
  const evidenceById = new Map();
  let hotPepperRecommendedRestaurants = 0;
  let hotPepperFeaturedRestaurants = 0;

  for (const row of runtimeRows) {
    if (!row.googlePlaceId) continue;
    const hp = hotPepperById.get(row.googlePlaceId);
    const facts = hp?.facts || {};
    const catchText = String(facts.catch || '').trim();
    if (!catchText) continue;
    const sourceUrl = facts.urls?.pc || facts.urls?.mobile || '';
    if (!/^https:\/\//.test(sourceUrl)) continue;
    const recommended = dishMatches(catchText, sourceUrl, 'Hot Pepper', true);
    const featured = recommended.length ? [] : dishMatches(catchText, sourceUrl, 'Hot Pepper', false);
    if (recommended.length) hotPepperRecommendedRestaurants += 1;
    if (featured.length) hotPepperFeaturedRestaurants += 1;
    if (recommended.length || featured.length) {
      evidenceById.set(row.googlePlaceId, {
        googlePlaceId: row.googlePlaceId,
        name: row.nameKnown === false ? null : row.name,
        recommendedDishes: recommended,
        featuredDishes: featured
      });
    }
  }

  const crawlTasks = [];
  for (const row of runtimeRows) {
    if (row.nameKnown === false || row.basicInfoState === 'google_place_id_only') continue;
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
        const result = await inspectWebsite(task.row, task.url);
        crawlResults.push({ googlePlaceId: task.row.googlePlaceId, name: task.row.name, rootUrl: task.url, ...result });
        if (result.status === 'matched') {
          const existing = evidenceById.get(task.row.googlePlaceId) || {
            googlePlaceId: task.row.googlePlaceId,
            name: task.row.name,
            recommendedDishes: [],
            featuredDishes: []
          };
          existing.recommendedDishes = dedupeDishes([...(existing.recommendedDishes || []), ...result.dishes]);
          evidenceById.set(task.row.googlePlaceId, existing);
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(HOST_WORKERS, hostEntries.length || 1) }, () => worker()));

  const rows = [...evidenceById.values()]
    .map((row) => ({
      ...row,
      recommendedDishes: dedupeDishes(row.recommendedDishes || []),
      featuredDishes: dedupeDishes(row.featuredDishes || [])
    }))
    .filter((row) => row.recommendedDishes.length || row.featuredDishes.length)
    .sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));

  const statusCounts = {};
  for (const result of crawlResults) statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
  const payload = {
    schemaVersion: 1,
    checkedAt: CHECKED_AT,
    policy: {
      googleIdentityKey: 'frozen Place ID only',
      paidGoogleDataApiCalls: 0,
      websiteEligibility: 'already-bound independent official/provider websites only; Google/Tabelog/Hot Pepper/social URLs excluded from direct crawl',
      strictRecommendationRule: 'concrete dish term within 110 characters of explicit recommendation/signature wording',
      maxSameHostMenuLinksFollowed: 2,
      maxEvidenceSnippetChars: 90
    },
    summary: {
      inventoryTotal: runtimeRows.length,
      hotPepperRowsAvailable: hotPepperById.size,
      hotPepperRecommendedRestaurants,
      hotPepperFeaturedRestaurants,
      websiteTasks: crawlTasks.length,
      websiteHosts: hostEntries.length,
      websiteMatchedRestaurants: new Set(crawlResults.filter((result) => result.status === 'matched').map((result) => result.googlePlaceId)).size,
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
