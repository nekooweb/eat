#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(ROOT, '_audit', 'tabelog_field_candidates.json');
const LIMIT = Number(process.env.TABELOG_LIMIT || 0);
const CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.TABELOG_CONCURRENCY || 4)));
const TIMEOUT_MS = Math.max(3000, Number(process.env.TABELOG_TIMEOUT_MS || 15000));
const USER_AGENT = 'eat-data-maintenance/1.0 (+https://github.com/nekooweb/eat)';

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
    .replace(/<(br|p|div|li|tr|th|td|h[1-6]|section|article|dt|dd)\b[^>]*>/gi, '\n')
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

function gaps(row) {
  const missing = [];
  if (!row.hoursReference) missing.push('hoursReference');
  if (!Array.isArray(row.lunch) && !Array.isArray(row.dinner)) missing.push('budget');
  if (!row.address) missing.push('address');
  if (!row.cuisine || row.cuisine === '餐厅') missing.push('cuisine');
  return missing;
}

function section(text, label, stopLabels, maxLength = 900) {
  const start = text.indexOf(label);
  if (start < 0) return null;
  const from = start + label.length;
  let end = Math.min(text.length, from + maxLength);
  for (const stop of stopLabels) {
    const idx = text.indexOf(stop, from);
    if (idx >= 0 && idx < end) end = idx;
  }
  const value = text.slice(from, end)
    .replace(/^[\s：:]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return value || null;
}

function extractAddress(text) {
  const detailAt = text.indexOf('店舗基本情報');
  const scoped = detailAt >= 0 ? text.slice(detailAt) : text;
  let value = section(scoped, '住所', ['交通手段', '営業時間', '予算', '支払い方法'], 500);
  if (!value) return null;
  value = value
    .replace(/大きな地図を見る.*$/u, '')
    .replace(/周辺のお店を探す.*$/u, '')
    .replace(/地図を見る.*$/u, '')
    .trim();
  const hit = value.match(/(?:〒?\d{3}-?\d{4}\s*)?(?:東京都)?(?:千代田区|文京区)[^\n]{2,180}/u);
  return (hit ? hit[0] : value).replace(/\s+/g, ' ').trim().slice(0, 240) || null;
}

function extractGenres(text) {
  const detailAt = text.indexOf('店舗基本情報');
  const scoped = detailAt >= 0 ? text.slice(detailAt) : text;
  const value = section(scoped, 'ジャンル', ['予約・', 'お問い合わせ', '予約可否', '住所'], 280);
  return value ? value.slice(0, 240) : null;
}

function cuisineFromGenres(raw) {
  const s = String(raw || '');
  const rules = [
    [/カフェ|喫茶|コーヒー|珈琲/u, '咖啡'],
    [/居酒屋/u, '居酒屋'],
    [/ラーメン|中華そば/u, '拉面'],
    [/そば|蕎麦/u, '荞麦面'],
    [/うどん/u, '乌冬'],
    [/カレー|カリー/u, '咖喱'],
    [/中華|中国料理|四川|広東|餃子/u, '中华'],
    [/インド|ネパール|ビリヤニ/u, '印度菜'],
    [/イタリアン|パスタ|ピザ/u, '意大利菜'],
    [/韓国|サムギョプサル/u, '韩国菜'],
    [/焼肉|ホルモン/u, '烤肉'],
    [/寿司|鮨/u, '寿司'],
    [/焼き鳥|やきとり|鳥料理/u, '烤鸡'],
    [/とんかつ|豚カツ/u, '炸猪排'],
    [/ステーキ|ハンバーグ/u, '牛排'],
    [/天ぷら|天婦羅/u, '天妇罗'],
    [/バー|バル/u, '酒吧'],
    [/パン|ベーカリー/u, '面包・烘焙'],
    [/スイーツ|ケーキ|甘味/u, '甜品'],
    [/魚介|海鮮/u, '海鲜'],
    [/定食|食堂/u, '食堂'],
    [/洋食|フレンチ|ビストロ/u, '西餐'],
    [/日本料理|和食|割烹|懐石|おでん/u, '日式']
  ];
  for (const [re, value] of rules) if (re.test(s)) return value;
  return null;
}

function parsePriceRange(token) {
  const compact = String(token || '').replace(/[\s,]/g, '').replace(/¥/g, '￥');
  let m = compact.match(/^～￥(\d+)$/u);
  if (m) return [0, Number(m[1])];
  m = compact.match(/^￥(\d+)～￥(\d+)$/u);
  if (m) return [Number(m[1]), Number(m[2])];
  return null;
}

function extractBudget(text) {
  const detailAt = text.indexOf('店舗基本情報');
  const scoped = detailAt >= 0 ? text.slice(detailAt) : text;
  const value = section(scoped, '予算', ['予算（口コミ集計）', '支払い方法', 'サービス料', '席・設備'], 420);
  if (!value) return { lunch: null, dinner: null, tokens: [] };
  const tokens = [...value.matchAll(/(?:￥\s?\d[\d,]*\s?～\s?￥\s?\d[\d,]*|～\s?￥\s?\d[\d,]*)/gu)]
    .map((m) => m[0])
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 2);
  const parsed = tokens.map(parsePriceRange).filter(Boolean);
  if (!parsed.length) return { lunch: null, dinner: null, tokens };
  if (parsed.length >= 2) return { dinner: parsed[0], lunch: parsed[1], tokens };
  return { dinner: parsed[0], lunch: null, tokens };
}

function extractHours(text) {
  const detailAt = text.indexOf('店舗基本情報');
  const scoped = detailAt >= 0 ? text.slice(detailAt) : text;
  let value = section(scoped, '営業時間', ['予算', '支払い方法', '席・設備', '予算（口コミ集計）'], 1400);
  if (!value) return null;
  value = value
    .replace(/営業時間・定休日は変更となる場合がございます.*$/u, '')
    .replace(/ご来店前に店舗にご確認ください。?.*$/u, '')
    .replace(/詳しくはこちら.*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  return value ? value.slice(0, 520) : null;
}

function extractClosedNote(text) {
  const first = section(text, '定休日', ['口コミ', '店舗情報', '写真', '席・設備'], 180);
  if (!first) return null;
  const clean = first.replace(/\s+/g, ' ').trim();
  return clean && clean.length <= 160 ? clean : null;
}

async function fetchTarget(target) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(target.sourceUrl, {
      redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
        'accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'accept-language': 'ja,en;q=0.8'
      },
      signal: controller.signal
    });
    const body = await response.text();
    const html = /<html\b/i.test(body) ? body : '';
    const text = html ? stripHtml(html) : '';
    const title = html ? titleFromHtml(html) : null;
    const normName = normalize(target.name);
    const nameMatched = Boolean(normName && normalize(`${title || ''} ${text.slice(0, 12000)}`).includes(normName));
    const rawGenres = nameMatched ? extractGenres(text) : null;
    const budget = nameMatched ? extractBudget(text) : { lunch: null, dinner: null, tokens: [] };
    const candidate = {};
    if (target.existingGaps.includes('address')) candidate.address = nameMatched ? extractAddress(text) : null;
    if (target.existingGaps.includes('hoursReference')) {
      candidate.openingHoursRaw = nameMatched ? extractHours(text) : null;
      candidate.closedNote = nameMatched ? extractClosedNote(text) : null;
    }
    if (target.existingGaps.includes('budget')) {
      candidate.lunch = budget.lunch;
      candidate.dinner = budget.dinner;
    }
    if (target.existingGaps.includes('cuisine')) candidate.cuisine = cuisineFromGenres(rawGenres);
    return {
      ...target,
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      title,
      nameMatched,
      rawGenres,
      budgetTokens: budget.tokens,
      candidate,
      elapsedMs: Date.now() - started,
      error: null
    };
  } catch (error) {
    return {
      ...target,
      ok: false,
      status: null,
      finalUrl: null,
      title: null,
      nameMatched: false,
      rawGenres: null,
      budgetTokens: [],
      candidate: {},
      elapsedMs: Date.now() - started,
      error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error)
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
const productionById = new Map(production.map((row) => [row.googlePlaceId, row]));
const enrichments = loadEnrichments();
const targetMap = new Map();
for (const row of enrichments) {
  const productionRow = productionById.get(row.googlePlaceId);
  if (!productionRow) continue;
  const missing = gaps(productionRow);
  if (!missing.length) continue;
  for (const ref of row.sourceRefs || []) {
    if (ref.provider !== 'Tabelog' || !/^https:\/\/tabelog\.com\//i.test(ref.url || '')) continue;
    const key = `${row.googlePlaceId}|${ref.url}`;
    if (!targetMap.has(key)) {
      targetMap.set(key, {
        googlePlaceId: row.googlePlaceId,
        name: productionRow.name,
        distanceMeters: productionRow.distanceMeters,
        sourceUrl: ref.url,
        existingGaps: missing
      });
    }
  }
}

let targets = [...targetMap.values()]
  .sort((a, b) => a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name, 'ja'));
if (LIMIT > 0) targets = targets.slice(0, LIMIT);

const results = await mapLimit(targets, CONCURRENCY, fetchTarget);
const accepted = results.filter((row) => row.ok && row.nameMatched && Object.values(row.candidate).some(Boolean));
const fieldCounts = {};
for (const row of accepted) {
  for (const [key, value] of Object.entries(row.candidate)) {
    const present = Array.isArray(value) ? value.length > 0 : Boolean(value);
    if (present) fieldCounts[key] = (fieldCounts[key] || 0) + 1;
  }
}
const summary = {
  targetCount: targets.length,
  fetchedOk: results.filter((row) => row.ok).length,
  fetchedFailed: results.filter((row) => !row.ok).length,
  nameMatched: results.filter((row) => row.ok && row.nameMatched).length,
  candidatesWithFields: accepted.length,
  fieldCounts
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify({ summary, results }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary));
