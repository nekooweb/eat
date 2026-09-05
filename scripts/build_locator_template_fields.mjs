#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { normalizeOpeningHours, validateOpeningHours } from './opening_hours.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = process.argv[2] || path.join(ROOT, 'data', 'official_candidate_index.json');
const OUTPUT = process.argv[3] || path.join(ROOT, 'data', 'source_enrichment_zzlocatorauto.js');
const CHECKED_AT = process.env.LOCATOR_TEMPLATE_CHECKED_AT || new Date().toISOString().slice(0, 10);
const CONCURRENCY = Math.max(1, Math.min(12, Number(process.env.LOCATOR_TEMPLATE_CONCURRENCY || 8)));
const TIMEOUT_MS = Math.max(3000, Number(process.env.LOCATOR_TEMPLATE_TIMEOUT_MS || 12000));
const USER_AGENT = 'eat-data-maintenance/1.0 (+https://github.com/nekooweb/eat)';

const TRUSTED_HOSTS = new Set([
  'shop.tullys.co.jp','store.starbucks.co.jp','c-united.co.jp','shop.doutor.co.jp',
  'map.torikizoku.co.jp','locations.royalhost.jp','stores.hanamaruudon.com',
  'tenpo.ichibanya.co.jp','shop.saizeriya.co.jp','shop.ufs.co.jp','maps.nakau.co.jp',
  'maps.cocos-jpn.co.jp','map.reins.co.jp','shop.butayama.com','shop.pronto.co.jp',
  'search.daisyo.co.jp','shoplist.teke-teke.com','skylark.co.jp','yomenya-goemon.com',
  'tsukemen-tsujita.com','ginza-renoir.co.jp','stores.yoshinoya.com'
]);
const DAY_TOKEN = '(?:毎日|全日|平日|土日祝(?:日)?|土[・･\\s]*日[・･\\s]*祝(?:日)?|[月火水木金土日](?:曜日|曜)?(?:\\s*-\\s*[月火水木金土日](?:曜日|曜)?)?)';
const STALE = /(?:臨時|営業時間変更|時短|短縮営業|新型コロナ|コロナ|年末年始|特別営業時間|期間限定)/u;
const DATED = /(?:20\d{2}年\s*\d{1,2}月|20\d{2}[./-]\d{1,2}[./-]\d{1,2})/u;
const IRREGULAR = /(?:不定休|不定期|臨時休業|施設休館日に準ずる)/u;

function loadProduction() {
  const file = path.join(ROOT, 'data', 'production_area1.js');
  if (!fs.existsSync(file)) throw new Error('Run build_production_dataset.mjs before locator extraction.');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename:'production_area1.js' });
  return sandbox.window.PRODUCTION_RESTAURANTS || [];
}
function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆!！?？.,，。:：/\\]+/g, '');
}
function decode(text) {
  return String(text || '').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
}
function htmlLines(html) {
  return decode(String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,' ')
    .replace(/<(br|p|div|li|tr|th|td|h[1-6]|section|article|dt|dd)\b[^>]*>/gi,'\n')
    .replace(/<[^>]+>/g,' '))
    .split(/\r?\n/).map((x)=>x.normalize('NFKC').replace(/[\t ]+/g,' ').trim()).filter(Boolean);
}
function title(html) {
  const m = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(m[1]).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,220) : null;
}
function hostname(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./,''); } catch { return ''; }
}
function branchUrl(url) {
  try { const u = new URL(url); return u.pathname.replace(/\/+$/,'').length > 1 || Boolean(u.search); } catch { return false; }
}
function identityMatches(name, pageTitle) {
  const a = normalize(name), b = normalize(pageTitle);
  return Boolean(a.length >= 4 && b && (a.includes(b) || b.includes(a)));
}
function section(lines, label, stops) {
  const i = lines.findIndex((line)=>line === label || line.startsWith(`${label}:`) || line.startsWith(`${label}：`));
  if (i < 0) return [];
  const out = [];
  const inline = lines[i].slice(label.length).replace(/^\s*[:：]\s*/,'').trim();
  if (inline) out.push(inline);
  for (let j=i+1; j<lines.length && out.length<60; j+=1) {
    if (stops.some((stop)=>lines[j] === stop || lines[j].startsWith(`${stop}:`) || lines[j].startsWith(`${stop}：`) || lines[j].startsWith(`${stop} `))) break;
    out.push(lines[j]);
  }
  return out;
}
function areaAddress(value) {
  const s = String(value || '').normalize('NFKC').replace(/\s+/g,' ').trim();
  if (!s || s.length > 160 || !/\d/.test(s)) return null;
  if (!(s.includes('千代田区') || s.includes('文京区'))) return null;
  if (/[。！？]/u.test(s)) return null;
  return s.replace(/^〒\s*\d{3}-?\d{4}\s*/,'');
}
function extractAddress(lines) {
  for (const line of section(lines,'住所',['電話番号','営業時間','アクセス','お知らせ','設備','近隣店舗','定休日'])) {
    const address = areaAddress(line);
    if (address) return address;
  }
  return null;
}
function normalizeDashes(value) { return String(value || '').normalize('NFKC').replace(/[~〜～–—―−]/g,'-'); }
function closureHints(lines) {
  const hints = [];
  for (let i=0;i<lines.length;i+=1) {
    const line = normalizeDashes(lines[i]);
    if (line === '定休日' && lines[i+1]) hints.push(lines[i+1]);
    if (/^定休日[:：]/u.test(line)) hints.push(line.replace(/^定休日[:：]\s*/u,''));
  }
  return [...new Set(hints.map((x)=>String(x).trim()).filter(Boolean))];
}
function splitDaySegments(text) {
  const repaired = normalizeDashes(text).replace(new RegExp(`\\s+(?=${DAY_TOKEN}\\s*[:：]?)`,'gu'),'\n');
  return repaired.split(/\n+/).map((x)=>x.trim()).filter(Boolean);
}
function scheduleFromLines(lines) {
  const block = section(lines,'営業時間',['お知らせ','住所','電話番号','電子マネー','クレジットカード','QRコード決済','決済方法','メニュー','設備','その他サービス','近隣店舗','アクセス','備考','定休日']);
  if (!block.length) return null;
  const text = block.join('\n');
  if (!/\d{1,2}:\d{2}/.test(text) || STALE.test(text) || DATED.test(text) || IRREGULAR.test(text)) return null;
  const closures = closureHints(lines);
  if (closures.some((x)=>IRREGULAR.test(x))) return null;
  const normalizedSegments = [];
  const closed = [...closures];
  const tokenRe = new RegExp(`^(${DAY_TOKEN})\\s*[:：]?\\s*(.*)$`,'u');
  for (const raw of splitDaySegments(text)) {
    const m = raw.match(tokenRe);
    if (!m) {
      if (/\d{1,2}:\d{2}/.test(raw)) normalizedSegments.push(raw);
      continue;
    }
    const token = m[1];
    const rest = m[2].trim();
    if (/定休日|休業|休み/u.test(rest) && !/\d{1,2}:\d{2}/.test(rest)) {
      closed.push(token.replace(/曜日|曜/g,''));
      continue;
    }
    const ranges = [...rest.matchAll(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g)].map((x)=>`${x[1]}-${x[2]}`);
    if (ranges.length) normalizedSegments.push(`${token} ${ranges.join(', ')}`);
  }
  if (!normalizedSegments.length) return null;
  const raw = normalizedSegments.join('; ');
  const schedule = normalizeOpeningHours(raw, [...new Set(closed)]);
  if (!schedule || !validateOpeningHours(schedule)) return null;
  const knownDays = Object.keys(schedule.days).length;
  if (knownDays < 5) return null;
  return { raw, closedDays:[...new Set(closed)], schedule, knownDays };
}
async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try {
    const r = await fetch(url,{redirect:'follow',headers:{'user-agent':USER_AGENT,'accept':'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5','accept-language':'ja,en;q=0.8'},signal:controller.signal});
    const body = await r.text();
    if (!r.ok || !/<html\b/i.test(body)) return {ok:false,status:r.status,finalUrl:r.url,title:null,lines:[],error:`http_${r.status}`};
    return {ok:true,status:r.status,finalUrl:r.url,title:title(body),lines:htmlLines(body),error:null};
  } catch (e) {
    return {ok:false,status:null,finalUrl:null,title:null,lines:[],error:e?.name==='AbortError'?'timeout':String(e?.message||e)};
  } finally { clearTimeout(timer); }
}
async function mapLimit(items, limit, worker) {
  const out = new Array(items.length); let cursor=0;
  async function runner(){ while(true){ const i=cursor++; if(i>=items.length)return; out[i]=await worker(items[i]); } }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},runner));
  return out;
}
function knownDays(schedule) { return schedule?.days && typeof schedule.days==='object' ? Object.keys(schedule.days).length : 0; }
function js(value) { return JSON.stringify(value).replace(/</g,'\\u003c'); }
function selfTest() {
  const inline = scheduleFromLines(['営業時間','日曜日 09:00-21:00 月曜日 09:00-21:00 火曜日 09:00-21:00 水曜日 09:00-21:00 木曜日 09:00-21:00 金曜日 09:00-21:00 土曜日 09:00-21:00','お知らせ']);
  if (!inline || inline.knownDays !== 7 || Object.values(inline.schedule.days).some((periods)=>periods.length!==1)) throw new Error('inline seven-day locator self-test failed');
  const closed = scheduleFromLines(['営業時間','月曜日 定休日','火曜日 定休日','水曜日 定休日','木曜日 07:00-21:00','金曜日 07:00-21:00','土曜日 定休日','日曜日 定休日','定休日','月・火・水・土・日']);
  if (!closed || closed.knownDays !== 7 || closed.schedule.days.mon.length!==0 || closed.schedule.days.thu.length!==1) throw new Error('closed-day locator self-test failed');
  const range = scheduleFromLines(['営業時間','月-日 11:00-21:30','お知らせ']);
  if (!range || range.knownDays !== 7) throw new Error('range locator self-test failed');
  const irregular = scheduleFromLines(['営業時間','10:00-22:00','定休日','不定休']);
  if (irregular) throw new Error('irregular locator self-test failed');
}

selfTest();
const index = JSON.parse(fs.readFileSync(INDEX,'utf8'));
const production = loadProduction();
const byId = new Map(production.map((row)=>[row.googlePlaceId,row]));
const targets = (index.records||[]).filter((row)=>byId.has(row.googlePlaceId) && TRUSTED_HOSTS.has(hostname(row.pageUrl)) && branchUrl(row.pageUrl));
const fetched = await mapLimit(targets,CONCURRENCY,async(row)=>{
  const page = await fetchPage(row.pageUrl);
  if (!page.ok || !identityMatches(row.name,page.title)) return {row,page,matched:false,address:null,hours:null};
  const current = byId.get(row.googlePlaceId);
  const address = current?.address ? null : extractAddress(page.lines);
  const candidate = scheduleFromLines(page.lines);
  const currentDays = knownDays(current?.openingHours);
  const hours = candidate && candidate.knownDays >= currentDays ? candidate : null;
  return {row,page,matched:true,address,hours,currentDays};
});
const patches = fetched.filter((x)=>x.matched&&(x.address||x.hours)).map((x)=>({
  googlePlaceId:x.row.googlePlaceId,name:x.row.name,sourceUrl:x.page.finalUrl||x.row.pageUrl,
  address:x.address||null,openingHoursRaw:x.hours?.raw||null,closedDays:x.hours?.closedDays||[],
  knownDays:x.hours?.knownDays||0,currentKnownDays:x.currentDays||0
}));

const output = [];
output.push('// Generated from trusted official store/branch locator templates.');
output.push('// Exact Place-ID + official-page identity agreement is required; ambiguous schedules are omitted.');
output.push(`const LOCATOR_TEMPLATE_CHECKED_AT = ${js(CHECKED_AT)};`);
output.push(`const locatorTemplatePatches = ${JSON.stringify(patches,null,2)};`);
output.push('for (const patch of locatorTemplatePatches) {');
output.push("  const fields=['name']; if(patch.address)fields.push('address'); if(patch.openingHoursRaw)fields.push('hours');");
output.push("  const ref={provider:'official',url:patch.sourceUrl,checkedAt:LOCATOR_TEMPLATE_CHECKED_AT,fields};");
output.push("  let row=[...window.RESTAURANTS].reverse().find((item)=>item&&item.googlePlaceId===patch.googlePlaceId&&item.source==='official'&&item.sourceOnly);");
output.push("  if(!row){row={id:`src-locator-template-${patch.googlePlaceId.slice(-12).replace(/[^A-Za-z0-9_-]/g,'')}`,profile:'TOKYO',area:'地区1️⃣',name:patch.name,googlePlaceId:patch.googlePlaceId,source:'official',sourceOnly:true,sourceRefs:[]};window.RESTAURANTS.push(row);}");
output.push('  row.name=patch.name; if(patch.address)row.address=patch.address;');
output.push('  if(patch.openingHoursRaw){row.openingHoursRaw=patch.openingHoursRaw;row.closedDays=patch.closedDays||[];row.closedNote=null;}');
output.push("  row.sourceRefs=Array.isArray(row.sourceRefs)?row.sourceRefs:[]; const owned=new Set(fields); row.sourceRefs=row.sourceRefs.map((item)=>item&&item.provider==='official'?{...item,fields:(item.fields||[]).filter((field)=>!owned.has(field))}:item).filter((item)=>item&&(item.provider!=='official'||(item.fields||[]).length)); row.sourceRefs.push(ref);");
output.push('}');
fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
fs.writeFileSync(OUTPUT,`${output.join('\n')}\n`,'utf8');

console.log(JSON.stringify({
  trustedLocatorTargets:targets.length,fetchedOk:fetched.filter((x)=>x.page.ok).length,
  identityMatched:fetched.filter((x)=>x.matched).length,patches:patches.length,
  addressPatches:patches.filter((x)=>x.address).length,hoursPatches:patches.filter((x)=>x.openingHoursRaw).length,
  newHours:patches.filter((x)=>x.openingHoursRaw&&x.currentKnownDays===0).length,
  correctedOrRefreshedHours:patches.filter((x)=>x.openingHoursRaw&&x.currentKnownDays>0).length,
  sevenDaySchedules:patches.filter((x)=>x.knownDays===7).length,
  fetchFailures:fetched.filter((x)=>!x.page.ok).length,identityFailures:fetched.filter((x)=>x.page.ok&&!x.matched).length,
  hosts:[...new Set(patches.map((x)=>hostname(x.sourceUrl)))].sort()
}));
