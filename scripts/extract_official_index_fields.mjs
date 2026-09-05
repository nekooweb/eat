#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const INDEX = process.argv[2] || path.join(ROOT, 'data', 'official_candidate_index.json');
const OUTPUT = process.argv[3] || path.join(ROOT, '_audit', 'official_index_field_candidates.json');
const CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.OFFICIAL_INDEX_CONCURRENCY || 5)));
const TIMEOUT_MS = Math.max(3000, Number(process.env.OFFICIAL_INDEX_TIMEOUT_MS || 15000));
const MENU_LIMIT = Math.max(0, Math.min(5, Number(process.env.OFFICIAL_INDEX_MENU_LIMIT || 3)));
const USER_AGENT = 'eat-data-maintenance/1.0 (+https://github.com/nekooweb/eat)';

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
function loadProduction() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read('data/production_area1.js'), sandbox, { filename: 'production_area1.js' });
  return sandbox.window.PRODUCTION_RESTAURANTS || [];
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
    .replace(/<(br|p|div|li|tr|th|td|h[1-6]|section|article|dt|dd)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[\t\r ]+/g, ' ').replace(/\n\s+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function titleFromHtml(html) {
  const m = String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripHtml(m[1]).slice(0, 220) : null;
}
function jsonLdFacts(html) {
  const facts = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of String(html).matchAll(re)) {
    let parsed;
    try { parsed = JSON.parse(decodeEntities(m[1]).trim()); } catch { continue; }
    const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (stack.length && facts.length < 20) {
      const node = stack.shift();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node['@graph'])) stack.push(...node['@graph']);
      const types = Array.isArray(node['@type']) ? node['@type'] : node['@type'] ? [node['@type']] : [];
      const address = typeof node.address === 'string' ? node.address : node.address && typeof node.address === 'object'
        ? [node.address.postalCode, node.address.addressRegion, node.address.addressLocality, node.address.streetAddress].filter(Boolean).join(' ') : null;
      const hours = Array.isArray(node.openingHours) ? [...node.openingHours] : node.openingHours ? [node.openingHours] : [];
      const specs = Array.isArray(node.openingHoursSpecification) ? node.openingHoursSpecification : node.openingHoursSpecification ? [node.openingHoursSpecification] : [];
      for (const spec of specs) {
        if (!spec || typeof spec !== 'object') continue;
        const day = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek.join(',') : spec.dayOfWeek;
        const range = [spec.opens, spec.closes].filter(Boolean).join('-');
        if (day || range) hours.push([day, range].filter(Boolean).join(' '));
      }
      if (node.name || address || hours.length || node.servesCuisine || node.priceRange) {
        facts.push({
          types: types.slice(0, 8),
          name: typeof node.name === 'string' ? node.name.slice(0, 220) : null,
          address: address ? String(address).slice(0, 300) : null,
          openingHours: hours.filter(Boolean).slice(0, 20),
          cuisine: Array.isArray(node.servesCuisine) ? node.servesCuisine.slice(0, 12) : node.servesCuisine || null,
          priceRange: typeof node.priceRange === 'string' ? node.priceRange.slice(0, 120) : null
        });
      }
    }
  }
  return facts;
}
function section(text, label, stops, max = 1000) {
  const start = text.indexOf(label);
  if (start < 0) return null;
  const from = start + label.length;
  let end = Math.min(text.length, from + max);
  for (const stop of stops) {
    const at = text.indexOf(stop, from);
    if (at >= 0 && at < end) end = at;
  }
  const value = text.slice(from, end).replace(/^[\s：:]+/, '').replace(/\s+/g, ' ').trim();
  return value || null;
}
function visibleAddress(text) {
  const patterns = [
    /(?:〒?\d{3}-?\d{4}\s*)?東京都\s*(?:千代田区|文京区)[^\n]{2,160}/u,
    /(?:〒?\d{3}-?\d{4}\s*)?(?:千代田区|文京区)[^\n]{2,160}/u
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0].replace(/\s+/g, ' ').trim().slice(0, 220);
  }
  return null;
}
function visibleHours(text) {
  const value = section(text, '営業時間', ['定休日', 'アクセス', '住所', 'ご予約', 'お問い合わせ', 'TEL', '電話'], 1000);
  if (!value || !/\d{1,2}:\d{2}/.test(value)) return null;
  return value.slice(0, 500);
}
function cuisineFromText(text) {
  const s = String(text || '');
  const rules = [
    [/カフェ|喫茶|コーヒー|珈琲/u, '咖啡'], [/居酒屋/u, '居酒屋'], [/ラーメン|中華そば/u, '拉面'],
    [/そば|蕎麦/u, '荞麦面'], [/うどん/u, '乌冬'], [/カレー|カリー/u, '咖喱'],
    [/中華|中国料理|四川|広東|餃子/u, '中华'], [/インド|ネパール|ビリヤニ/u, '印度菜'],
    [/イタリアン|パスタ|ピザ/u, '意大利菜'], [/韓国|サムギョプサル/u, '韩国菜'],
    [/焼肉|ホルモン/u, '烤肉'], [/寿司|鮨/u, '寿司'], [/焼き鳥|やきとり|鳥料理/u, '烤鸡'],
    [/とんかつ|豚カツ/u, '炸猪排'], [/ステーキ|ハンバーグ/u, '牛排'], [/天ぷら|天婦羅/u, '天妇罗'],
    [/バー|バル/u, '酒吧'], [/パン|ベーカリー/u, '面包・烘焙'], [/スイーツ|ケーキ|甘味/u, '甜品'],
    [/魚介|海鮮/u, '海鲜'], [/定食|食堂/u, '食堂'], [/洋食|フレンチ|ビストロ/u, '西餐'],
    [/日本料理|和食|割烹|懐石|おでん/u, '日式']
  ];
  for (const [re, value] of rules) if (re.test(s)) return value;
  return null;
}
function snippets(text, regex, max = 20) {
  const out = [];
  for (const m of text.matchAll(regex)) {
    const at = m.index || 0;
    const left = Math.max(0, at - 45);
    const value = text.slice(left, Math.min(text.length, at + 180)).replace(/\s+/g, ' ').trim();
    if (value && !out.includes(value)) out.push(value);
    if (out.length >= max) break;
  }
  return out;
}
async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': USER_AGENT, 'accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-language': 'ja,en;q=0.8' }, signal: controller.signal });
    const body = await response.text();
    const html = /<html\b/i.test(body) ? body : '';
    const text = html ? stripHtml(html) : '';
    const title = html ? titleFromHtml(html) : null;
    return {
      ok: response.ok, status: response.status, finalUrl: response.url,
      title,
      structuredFacts: html ? jsonLdFacts(html) : [],
      visibleAddress: text ? visibleAddress(text) : null,
      visibleHours: text ? visibleHours(text) : null,
      visibleCuisine: text ? cuisineFromText(`${title || ''} ${text.slice(0, 7000)}`) : null,
      recommendationSnippets: text ? snippets(text, /おすすめ|お勧め|人気|名物|看板|自慢|名物料理|看板メニュー/gi) : [],
      priceSnippets: text ? snippets(text, /(?:¥|￥)\s?\d[\d,]*|\d[\d,]*\s?円/g, 20) : [],
      error: null
    };
  } catch (error) {
    return { ok: false, status: null, finalUrl: null, title: null, structuredFacts: [], visibleAddress: null, visibleHours: null, visibleCuisine: null, recommendationSnippets: [], priceSnippets: [], error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error) };
  } finally { clearTimeout(timer); }
}
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length); let cursor = 0;
  async function runner() { while (true) { const i = cursor++; if (i >= items.length) return; results[i] = await worker(items[i]); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const production = loadProduction();
const productionById = new Map(production.map((row) => [row.googlePlaceId, row]));
const records = (index.records || []).filter((row) => productionById.has(row.googlePlaceId));
const results = await mapLimit(records, CONCURRENCY, async (row) => {
  const main = await fetchPage(row.pageUrl);
  const menuTargets = (row.menuUrls || []).slice(0, MENU_LIMIT);
  const menus = await mapLimit(menuTargets, Math.min(2, CONCURRENCY), fetchPage);
  const combinedSignals = [...main.recommendationSnippets, ...menus.flatMap((x) => x.recommendationSnippets || [])].slice(0, 30);
  const normName = normalize(row.name);
  const searchable = normalize(`${main.title || ''} ${main.structuredFacts.map((x) => x.name || '').join(' ')}`);
  const nameMatched = Boolean(normName && searchable.includes(normName));
  return { ...row, main, menus, nameMatched, recommendationSnippets: combinedSignals };
});
const summary = {
  records: records.length,
  mainFetchedOk: results.filter((r) => r.main.ok).length,
  mainNameMatched: results.filter((r) => r.main.ok && r.nameMatched).length,
  withStructuredFacts: results.filter((r) => r.main.structuredFacts.length).length,
  withVisibleAddress: results.filter((r) => r.main.visibleAddress).length,
  withVisibleHours: results.filter((r) => r.main.visibleHours).length,
  withCuisineSignal: results.filter((r) => r.main.visibleCuisine).length,
  withRecommendationSignals: results.filter((r) => r.recommendationSnippets.length).length,
  menuFetches: results.reduce((n, r) => n + r.menus.length, 0),
  menuFetchedOk: results.reduce((n, r) => n + r.menus.filter((x) => x.ok).length, 0)
};
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify({ summary, results }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary));
