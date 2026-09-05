#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { normalizeOpeningHours, validateOpeningHours } from './opening_hours.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const INDEX = process.argv[2] || path.join(ROOT, 'data', 'official_candidate_index.json');
const OUTPUT = process.argv[3] || path.join(ROOT, 'data', 'source_enrichment_zzlocatorauto.js');
const CHECKED_AT = process.env.LOCATOR_TEMPLATE_CHECKED_AT || new Date().toISOString().slice(0, 10);
const CONCURRENCY = Math.max(1, Math.min(12, Number(process.env.LOCATOR_TEMPLATE_CONCURRENCY || 8)));
const TIMEOUT_MS = Math.max(3000, Number(process.env.LOCATOR_TEMPLATE_TIMEOUT_MS || 12000));
const USER_AGENT = 'eat-data-maintenance/1.0 (+https://github.com/nekooweb/eat)';

const TRUSTED_LOCATOR_HOSTS = new Set([
  'shop.tullys.co.jp',
  'store.starbucks.co.jp',
  'c-united.co.jp',
  'shop.doutor.co.jp',
  'map.torikizoku.co.jp',
  'locations.royalhost.jp',
  'stores.hanamaruudon.com',
  'tenpo.ichibanya.co.jp',
  'shop.saizeriya.co.jp',
  'shop.ufs.co.jp',
  'maps.nakau.co.jp',
  'maps.cocos-jpn.co.jp',
  'map.reins.co.jp',
  'shop.butayama.com',
  'shop.pronto.co.jp',
  'search.daisyo.co.jp',
  'shoplist.teke-teke.com',
  'skylark.co.jp',
  'yomenya-goemon.com',
  'tsukemen-tsujita.com',
  'ginza-renoir.co.jp',
  'stores.yoshinoya.com'
]);

const DAY_LABELS = {
  mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土', sun: '日', holiday: '祝'
};
const SPECIAL_OR_STALE = /(?:臨時|営業時間変更|営業時間を変更|時短|短縮営業|新型コロナ|コロナ|年末年始|特別営業時間|期間限定)/u;
const DATED_NOTICE = /(?:20\d{2}年\s*\d{1,2}月|20\d{2}[./-]\d{1,2}[./-]\d{1,2})/u;
const IRREGULAR_CLOSURE = /(?:不定休|不定期|臨時休業|施設休館日に準ずる)/u;

function loadProduction() {
  const file = path.join(ROOT, 'data', 'production_area1.js');
  if (!fs.existsSync(file)) throw new Error('data/production_area1.js is missing; run build_production_dataset.mjs first');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: 'production_area1.js' });
  return sandbox.window.PRODUCTION_RESTAURANTS || [];
}

function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
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

function htmlToLines(html) {
  const text = decodeEntities(String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(br|p|div|li|tr|th|td|h[1-6]|section|article|dt|dd)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '));
  return text.split(/\r?\n/)
    .map((line) => line.normalize('NFKC').replace(/[\t ]+/g, ' ').trim())
    .filter(Boolean);
}

function titleFromHtml(html) {
  const m = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220) : null;
}

function host(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}

function pathSpecific(url) {
  try {
    const u = new URL(url);
    return Boolean(u.pathname.replace(/\/+$/, '').length > 1 || u.search);
  } catch { return false; }
}

function identityMatch(name, title) {
  const a = normalize(name);
  const b = normalize(title);
  return Boolean(a.length >= 4 && b && (b.includes(a) || a.includes(b)));
}

function sectionLines(lines, label, stopLabels) {
  const start = lines.findIndex((line) => line === label || line.startsWith(`${label}:`) || line.startsWith(`${label}:`));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length && out.length < 60; i += 1) {
    const line = lines[i];
    if (stopLabels.some((stop) => line === stop || line.startsWith(`${stop}:`) || line.startsWith(`${stop}:`))) break;
    out.push(line);
  }
  return out;
}

function plausibleAddress(value) {
  const s = String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 160) return null;
  if (!(s.includes('千代田区') || s.includes('文京区'))) return null;
  if (!/\d/.test(s)) return null;
  if (/[。！？]/u.test(s)) return null;
  return s;
}

function extractAddress(lines) {
  const block = sectionLines(lines, '住所', ['電話番号', '営業時間', 'アクセス', 'お知らせ', '設備', '近隣店舗']);
  for (const line of block) {
    const value = plausibleAddress(line.replace(/^〒\s*\d{3}-?\d{4}\s*/, ''));
    if (value) return value;
  }
  return null;
}

function normalizeDashes(value) {
  return String(value || '').normalize('NFKC').replace(/[~〜～–—―−]/g, '-');
}

function dayTokenFromLine(line) {
  const s = normalizeDashes(line).trim();
  const m = s.match(/^(毎日|全日|平日|土日祝(?:日)?|土[・･\s]*日[・･\s]*祝(?:日)?|(?:月|火|水|木|金|土|日)(?:曜日|曜)?(?:\s*-\s*(?:月|火|水|木|金|土|日)(?:曜日|曜)?)?|(?:月|火|水|木|金|土|日)(?:曜日|曜)?)/u);
  return m ? m[1] : null;
}

function expandDayToken(token) {
  const t = normalizeDashes(token).replace(/曜日|曜/g, '').replace(/祝日/g, '祝').replace(/[・･\s]/g, '');
  const order = ['月', '火', '水', '木', '金', '土', '日'];
  const map = { 月:'mon', 火:'tue', 水:'wed', 木:'thu', 金:'fri', 土:'sat', 日:'sun', 祝:'holiday' };
  if (t === '毎日' || t === '全日') return [...order.map((x) => map[x]), 'holiday'];
  if (t === '平日') return order.slice(0, 5).map((x) => map[x]);
  if (t === '土日祝') return ['sat', 'sun', 'holiday'];
  const range = t.match(/^([月火水木金土日])-([月火水木金土日])$/u);
  if (range) {
    const a = order.indexOf(range[1]);
    const b = order.indexOf(range[2]);
    if (a >= 0 && b >= 0) return (a <= b ? order.slice(a, b + 1) : [...order.slice(a), ...order.slice(0, b + 1)]).map((x) => map[x]);
  }
  if (/^[月火水木金土日祝]+$/u.test(t)) return [...new Set([...t].map((x) => map[x]).filter(Boolean))];
  return map[t] ? [map[t]] : [];
}

function insertInlineDayBoundaries(value) {
  return normalizeDashes(value)
    .replace(/\s+(?=(?:毎日|全日|平日|土日祝(?:日)?|土[・･\s]*日[・･\s]*祝(?:日)?|[月火水木金土日](?:曜日|曜)?(?:\s*-\s*[月火水木金土日](?:曜日|曜)?)?)\s*[:：]?)/gu, '\n');
}

function closureHints(lines) {
  const hints = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === '定休日' && lines[i + 1]) hints.push(lines[i + 1]);
    if (/^定休日[:：]/u.test(line)) hints.push(line.replace(/^定休日[:：]\s*/u, ''));
    const token = dayTokenFromLine(line);
    if (token && /定休日|休業|休み/u.test(line) && !/\d{1,2}:\d{2}/.test(line)) {
      for (const day of expandDayToken(token)) hints.push(DAY_LABELS[day]);
    }
  }
  return [...new Set(hints.filter(Boolean))];
}

function compactSchedule(schedule) {
  if (!validateOpeningHours(schedule)) return null;
  const raw = [];
  const closedDays = [];
  for (const day of Object.keys(DAY_LABELS)) {
    if (!Object.hasOwn(schedule.days, day)) continue;
    const periods = schedule.days[day];
    if (!periods.length) {
      closedDays.push(DAY_LABELS[day]);
      continue;
    }
    raw.push(`${DAY_LABELS[day]} ${periods.map(([open, close]) => `${open}-${close}`).join(', ')}`);
  }
  if (!raw.length) return null;
  return { openingHoursRaw: raw.join('; '), closedDays };
}

function extractHours(lines) {
  const block = sectionLines(lines, '営業時間', [
    'お知らせ', '住所', '電話番号', '電子マネー', 'クレジットカード', 'QRコード決済',
    '決済方法', 'メニュー', '設備', 'その他サービス', '近隣店舗', 'アクセス', '備考'
  ]);
  if (!block.length) return null;
  const text = block.join('\n');
  if (!/\d{1,2}:\d{2}/.test(text)) return null;
  if (SPECIAL_OR_STALE.test(text) || DATED_NOTICE.test(text) || IRREGULAR_CLOSURE.test(text)) return null;
  const closed = closureHints(block);
  let schedule = normalizeOpeningHours(text, closed);
  if (!schedule || !validateOpeningHours(schedule)) {
    const repaired = insertInlineDayBoundaries(text);
    schedule = normalizeOpeningHours(repaired, closed);
  }
  return compactSchedule(schedule);
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
        'accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'accept-language': 'ja,en;q=0.8'
      },
      signal: controller.signal
    });
    const body = await response.text();
    if (!response.ok || !/<html\b/i.test(body)) {
      return { ok:false, status:response.status, finalUrl:response.url, title:null, lines:[], error:`http_${response.status}` };
    }
    return { ok:true, status:response.status, finalUrl:response.url, title:titleFromHtml(body), lines:htmlToLines(body), error:null };
  } catch (error) {
    return { ok:false, status:null, finalUrl:null, title:null, lines:[], error:error?.name === 'AbortError' ? 'timeout' : String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return output;
}

function runSelfTests() {
  const allWeek = extractHours(['営業時間','月曜日 07:30-20:00','火曜日 08:00-19:00','水曜日 07:30-20:00','木曜日 07:30-20:00','金曜日 07:30-20:00','土曜日 08:00-19:00','日曜日 08:00-19:00','お知らせ']);
  if (!allWeek || !/月 07:30-20:00/.test(allWeek.openingHoursRaw) || !/日 08:00-19:00/.test(allWeek.openingHoursRaw)) throw new Error('locator parser self-test failed: seven-day schedule');
  const closed = extractHours(['営業時間','月曜日 定休日','火曜日 定休日','水曜日 定休日','木曜日 07:00-21:00','金曜日 07:00-21:00','土曜日 定休日','日曜日 定休日','お知らせ']);
  if (!closed || closed.closedDays.length !== 5 || !closed.closedDays.includes('月') || !/木 07:00-21:00/.test(closed.openingHoursRaw)) throw new Error('locator parser self-test failed: closed days');
  const inline = extractHours(['営業時間','日曜日 09:00-21:00 月曜日 09:00-21:00 火曜日 09:00-21:00 水曜日 09:00-21:00 木曜日 09:00-21:00 金曜日 09:00-21:00 土曜日 09:00-21:00','お知らせ']);
  if (!inline || (inline.openingHoursRaw.match(/09:00-21:00/g) || []).length !== 7) throw new Error('locator parser self-test failed: inline schedule');
  const irregular = extractHours(['営業時間','10:00-22:00','定休日','不定休','お知らせ']);
  if (irregular) throw new Error('locator parser self-test failed: irregular closure must stay unknown');
}

function js(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

runSelfTests();
const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const production = loadProduction();
const productionById = new Map(production.map((row) => [row.googlePlaceId, row]));
const targets = (index.records || []).filter((row) => {
  if (!productionById.has(row.googlePlaceId)) return false;
  const h = host(row.pageUrl);
  return TRUSTED_LOCATOR_HOSTS.has(h) && pathSpecific(row.pageUrl);
});

const fetched = await mapLimit(targets, CONCURRENCY, async (row) => {
  const page = await fetchPage(row.pageUrl);
  if (!page.ok || !identityMatch(row.name, page.title)) return { row, page, matched:false, address:null, hours:null };
  const current = productionById.get(row.googlePlaceId);
  const address = current?.address ? null : extractAddress(page.lines);
  const hours = extractHours(page.lines);
  return { row, page, matched:true, address, hours };
});

const patches = fetched.filter((item) => item.matched && (item.address || item.hours)).map((item) => ({
  googlePlaceId: item.row.googlePlaceId,
  name: item.row.name,
  sourceUrl: item.page.finalUrl || item.row.pageUrl,
  address: item.address || null,
  openingHoursRaw: item.hours?.openingHoursRaw || null,
  closedDays: item.hours?.closedDays || []
}));

const lines = [];
lines.push('// Generated from trusted official branch/store locator templates.');
lines.push('// Exact Place-ID + official-page identity agreement is required before a patch is emitted.');
lines.push('// Hours are rewritten to one explicit day per segment so the canonical parser cannot conflate weekly periods.');
lines.push(`const LOCATOR_TEMPLATE_CHECKED_AT = ${js(CHECKED_AT)};`);
lines.push(`const locatorTemplatePatches = ${JSON.stringify(patches, null, 2)};`);
lines.push('');
lines.push('for (const patch of locatorTemplatePatches) {');
lines.push("  const fields = ['name'];");
lines.push("  if (patch.address) fields.push('address');");
lines.push("  if (patch.openingHoursRaw) fields.push('hours');");
lines.push("  const ref = { provider:'official', url:patch.sourceUrl, checkedAt:LOCATOR_TEMPLATE_CHECKED_AT, fields }; ");
lines.push("  let row = [...window.RESTAURANTS].reverse().find((item) => item && item.googlePlaceId === patch.googlePlaceId && item.source === 'official' && item.sourceOnly);");
lines.push('  if (row) {');
lines.push('    row.name = patch.name;');
lines.push('    if (patch.address) row.address = patch.address;');
lines.push('    if (patch.openingHoursRaw) {');
lines.push('      row.openingHoursRaw = patch.openingHoursRaw;');
lines.push('      row.closedDays = Array.isArray(patch.closedDays) ? patch.closedDays : [];');
lines.push('      row.closedNote = null;');
lines.push('    }');
lines.push('    row.sourceRefs = Array.isArray(row.sourceRefs) ? row.sourceRefs : [];');
lines.push("    const owned = new Set(fields.filter((field) => field !== 'name')); ");
lines.push("    row.sourceRefs = row.sourceRefs.map((item) => item && item.provider === 'official' ? { ...item, fields:(item.fields || []).filter((field) => !owned.has(field)) } : item).filter((item) => item && (item.provider !== 'official' || (item.fields || []).length));");
lines.push('    row.sourceRefs.push(ref);');
lines.push('  } else {');
lines.push("    const record = { id:`src-locator-template-${patch.googlePlaceId.slice(-12).replace(/[^A-Za-z0-9_-]/g,'')}`, profile:'TOKYO', area:'地区1️⃣', name:patch.name, googlePlaceId:patch.googlePlaceId, source:'official', sourceOnly:true, sourceRefs:[ref] };");
lines.push('    if (patch.address) record.address = patch.address;');
lines.push('    if (patch.openingHoursRaw) { record.openingHoursRaw = patch.openingHoursRaw; record.closedDays = Array.isArray(patch.closedDays) ? patch.closedDays : []; record.closedNote = null; }');
lines.push('    window.RESTAURANTS.push(record);');
lines.push('  }');
lines.push('}');
lines.push('');

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');

const summary = {
  trustedLocatorTargets: targets.length,
  fetchedOk: fetched.filter((x) => x.page.ok).length,
  identityMatched: fetched.filter((x) => x.matched).length,
  patches: patches.length,
  addressPatches: patches.filter((x) => x.address).length,
  hoursPatches: patches.filter((x) => x.openingHoursRaw).length,
  fullWeekHours: patches.filter((x) => x.openingHoursRaw && x.openingHoursRaw.split(';').length >= 7).length,
  fetchFailures: fetched.filter((x) => !x.page.ok).length,
  identityFailures: fetched.filter((x) => x.page.ok && !x.matched).length,
  hosts: [...new Set(patches.map((x) => host(x.sourceUrl)))].sort()
};
console.log(JSON.stringify(summary));
