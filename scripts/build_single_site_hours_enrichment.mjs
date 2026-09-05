#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { normalizeOpeningHours, validateOpeningHours } from './opening_hours.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const INDEX_PATH = process.argv[2] || path.join(DATA, 'official_candidate_index.json');
const OUTPUT_PATH = process.argv[3] || path.join(DATA, 'source_enrichment_zzzsinglehours.js');
const REVIEW_PATH = process.argv[4] || path.join(ROOT, '_audit', 'single-site-hours-review.json');
const CHECKED_AT = process.env.SINGLE_SITE_HOURS_CHECKED_AT || new Date().toISOString().slice(0, 10);
const CONCURRENCY = Math.max(1, Math.min(12, Number(process.env.SINGLE_SITE_HOURS_CONCURRENCY || 8)));
const TIMEOUT_MS = Math.max(3000, Number(process.env.SINGLE_SITE_HOURS_TIMEOUT_MS || 12000));
const USER_AGENT = 'eat-data-maintenance/1.0 (+https://github.com/nekooweb/eat)';

// Store locators are handled by build_locator_template_fields.mjs. Third-party
// restaurant/site-builder hosts stay review-only rather than being promoted here.
const LOCATOR_HOSTS = new Set([
  'shop.tullys.co.jp','store.starbucks.co.jp','c-united.co.jp','shop.doutor.co.jp',
  'map.torikizoku.co.jp','locations.royalhost.jp','stores.hanamaruudon.com',
  'tenpo.ichibanya.co.jp','shop.saizeriya.co.jp','shop.ufs.co.jp','maps.nakau.co.jp',
  'maps.cocos-jpn.co.jp','map.reins.co.jp','shop.butayama.com','shop.pronto.co.jp',
  'search.daisyo.co.jp','shoplist.teke-teke.com','skylark.co.jp','yomenya-goemon.com',
  'tsukemen-tsujita.com','ginza-renoir.co.jp','stores.yoshinoya.com'
]);
const PLATFORM_SUFFIXES = [
  '.owst.jp','.gorp.jp','.wixsite.com','.stores.jp','.goope.jp',
  'hotpepper.jp','tabelog.com','instagram.com','facebook.com','x.com','twitter.com',
  'linktr.ee','ameblo.jp','exblog.jp'
];
const STALE = /(?:臨時|営業時間変更|営業時間を変更|時短|短縮営業|新型コロナ|コロナ|年末年始|特別営業時間|期間限定|temporary|special hours)/iu;
const DATED = /(?:20\d{2}年\s*\d{1,2}月|20\d{2}[./-]\d{1,2}[./-]\d{1,2})/u;
const IRREGULAR = /(?:不定休|不定期|臨時休業|カレンダー|SNS|公式.*確認|予約時のみ)/u;
const DAY_TOKEN = '(?:毎日|全日|平日|土日祝(?:日)?|土[・･\\s]*日[・･\\s]*祝(?:日)?|[月火水木金土日](?:曜日|曜)?(?:\\s*[-~〜～–—―−]\\s*[月火水木金土日](?:曜日|曜)?)?)';

function loadWindowFile(file, key, initial) {
  const sandbox = { window: { [key]: initial } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename:path.basename(file) });
  return sandbox.window[key] || initial;
}
function loadProduction() {
  const file = path.join(DATA, 'production_area1.js');
  if (!fs.existsSync(file)) throw new Error('Run build_production_dataset.mjs first.');
  return loadWindowFile(file, 'PRODUCTION_RESTAURANTS', []);
}
function loadResolutionIds() {
  const files = fs.readdirSync(DATA).filter((name)=>/^source_resolution(?:_[a-z0-9-]+)?\.js$/i.test(name)).sort();
  const sandbox = { window: { SOURCE_RESOLUTIONS: [] } };
  vm.createContext(sandbox);
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(DATA,file),'utf8'),sandbox,{filename:file});
  return new Set((sandbox.window.SOURCE_RESOLUTIONS||[]).map((row)=>row.googlePlaceId).filter(Boolean));
}
function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/(?:公式|official|ホームページ|website|店舗情報|top|home)/gi,'')
    .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆!！?？.,，。:：/\\|｜]+/g,'');
}
function decode(text) {
  return String(text||'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
}
function htmlLines(html) {
  return decode(String(html||'')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,' ')
    .replace(/<(br|p|div|li|tr|th|td|h[1-6]|section|article|dt|dd)\b[^>]*>/gi,'\n')
    .replace(/<[^>]+>/g,' '))
    .split(/\r?\n/).map((x)=>x.normalize('NFKC').replace(/[\t ]+/g,' ').trim()).filter(Boolean);
}
function pageTitle(html) {
  const m=String(html||'').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m?decode(m[1]).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,240):null;
}
function hostname(url) { try{return new URL(url).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';} }
function isPlatformHost(host) { return PLATFORM_SUFFIXES.some((suffix)=>host===suffix.replace(/^\./,'')||host.endsWith(suffix)); }
function identityMatches(name,title) {
  const a=normalize(name), b=normalize(title);
  if (!a || a.length<4 || !b) return false;
  return b.includes(a) || a.includes(b);
}
function normalizeDashes(value){return String(value||'').normalize('NFKC').replace(/[~〜～–—―−]/g,'-');}
function sectionStart(line) {
  return /^(?:営業時間(?:・定休日|\/定休日|・休業日)?|営業日時|営業日・営業時間|OPEN\s*HOURS?|HOURS?)\s*[:：]?/iu.test(line);
}
function stopLine(line) {
  return /^(?:住所|所在地|アクセス|電話(?:番号)?|TEL|予約|メニュー|MENU|支払|決済|カード|席|設備|サービス|お知らせ|NEWS|INFORMATION|店舗情報|地図|MAP|お問い合わせ|CONTACT)\s*[:：]?/iu.test(line);
}
function extractHoursBlock(lines) {
  const start=lines.findIndex(sectionStart);
  if(start<0)return [];
  const out=[];
  const inline=lines[start].replace(/^(?:営業時間(?:・定休日|\/定休日|・休業日)?|営業日時|営業日・営業時間|OPEN\s*HOURS?|HOURS?)\s*[:：]?\s*/iu,'').trim();
  if(inline)out.push(inline);
  for(let i=start+1;i<lines.length&&out.length<50;i+=1){
    if(stopLine(lines[i]))break;
    out.push(lines[i]);
  }
  return out;
}
function closureHints(lines,block) {
  const candidates=[];
  const combined=[...block,...lines.slice(0,Math.min(lines.length,180))];
  for(let i=0;i<combined.length;i+=1){
    const line=normalizeDashes(combined[i]);
    if(/^定休日\s*[:：]?$/u.test(line)&&combined[i+1])candidates.push(combined[i+1]);
    const m=line.match(/^(?:定休日|休業日)\s*[:：]\s*(.+)$/u); if(m)candidates.push(m[1]);
  }
  return [...new Set(candidates.map((x)=>String(x).trim()).filter(Boolean))].slice(0,6);
}
function splitDaySegments(text) {
  return normalizeDashes(text)
    .replace(new RegExp(`\\s+(?=${DAY_TOKEN}\\s*[:：]?)`,'gu'),'\n')
    .split(/\n+/).map((x)=>x.trim()).filter(Boolean);
}
function buildNormalizedRaw(block) {
  const segments=[];
  const tokenRe=new RegExp(`^(${DAY_TOKEN})\\s*[:：]?\\s*(.*)$`,'u');
  for(const raw of splitDaySegments(block.join('\n'))){
    const line=normalizeDashes(raw);
    const m=line.match(tokenRe);
    if(m){
      const ranges=[...m[2].matchAll(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g)].map((x)=>`${x[1]}-${x[2]}`);
      if(ranges.length)segments.push(`${m[1]} ${ranges.join(', ')}`);
      continue;
    }
    const ranges=[...line.matchAll(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g)].map((x)=>`${x[1]}-${x[2]}`);
    if(ranges.length)segments.push(ranges.join(', '));
  }
  return segments.join('; ');
}
function parseSchedule(lines) {
  const block=extractHoursBlock(lines);
  if(!block.length)return {schedule:null,reason:'no_explicit_hours_section',block:[]};
  const text=block.join('\n');
  if(!/\d{1,2}:\d{2}/.test(text))return {schedule:null,reason:'no_clock_range',block};
  if(STALE.test(text)||DATED.test(text))return {schedule:null,reason:'temporary_or_dated',block};
  const closed=closureHints(lines,block);
  if(IRREGULAR.test(text)||closed.some((x)=>IRREGULAR.test(x)))return {schedule:null,reason:'irregular_closure',block};
  const raw=buildNormalizedRaw(block);
  if(!raw)return {schedule:null,reason:'no_parseable_intervals',block,closed};
  const schedule=normalizeOpeningHours(raw,closed);
  if(!schedule||!validateOpeningHours(schedule))return {schedule:null,reason:'normalization_failed',block,closed,raw};
  const knownDays=Object.keys(schedule.days||{}).length;
  if(knownDays<5)return {schedule:null,reason:'insufficient_day_coverage',block,closed,raw,knownDays};
  return {schedule,reason:null,block,closed,raw,knownDays};
}
async function fetchPage(url){
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try{
    const r=await fetch(url,{redirect:'follow',headers:{'user-agent':USER_AGENT,'accept':'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5','accept-language':'ja,en;q=0.8'},signal:controller.signal});
    const body=await r.text();
    if(!r.ok||!/<html\b/i.test(body))return{ok:false,status:r.status,finalUrl:r.url,title:null,lines:[],error:`http_${r.status}`};
    return{ok:true,status:r.status,finalUrl:r.url,title:pageTitle(body),lines:htmlLines(body),error:null};
  }catch(e){return{ok:false,status:null,finalUrl:null,title:null,lines:[],error:e?.name==='AbortError'?'timeout':String(e?.message||e)};}finally{clearTimeout(timer);}
}
async function mapLimit(items,limit,worker){const out=new Array(items.length);let cursor=0;async function runner(){while(true){const i=cursor++;if(i>=items.length)return;out[i]=await worker(items[i]);}}await Promise.all(Array.from({length:Math.min(limit,items.length)},runner));return out;}
function js(value){return JSON.stringify(value).replace(/</g,'\\u003c');}
function scheduleRaw(schedule){
  const label={mon:'月',tue:'火',wed:'水',thu:'木',fri:'金',sat:'土',sun:'日',holiday:'祝'};
  const parts=[]; const closed=[];
  for(const day of ['mon','tue','wed','thu','fri','sat','sun','holiday']){
    if(!Object.hasOwn(schedule.days,day))continue;
    const periods=schedule.days[day];
    if(!periods.length){closed.push(label[day]);continue;}
    parts.push(`${label[day]} ${periods.map(([a,b])=>`${a}-${b}`).join(', ')}`);
  }
  return {raw:parts.join('; '),closedDays:closed};
}

const index=JSON.parse(fs.readFileSync(INDEX_PATH,'utf8'));
const production=loadProduction();
const byId=new Map(production.map((row)=>[row.googlePlaceId,row]));
const resolutionIds=loadResolutionIds();
const targets=(index.records||[]).filter((row)=>{
  const current=byId.get(row.googlePlaceId); if(!current||current.openingHours)return false;
  if(resolutionIds.has(row.googlePlaceId))return false;
  const host=hostname(row.pageUrl); if(!host||LOCATOR_HOSTS.has(host)||isPlatformHost(host))return false;
  return true;
});
const results=await mapLimit(targets,CONCURRENCY,async(row)=>{
  const page=await fetchPage(row.pageUrl);
  const match=page.ok&&identityMatches(row.name,page.title);
  const parsed=match?parseSchedule(page.lines):{schedule:null,reason:page.ok?'identity_mismatch':'fetch_failed',block:[]};
  return {row,page,match,parsed};
});
const accepted=results.filter((x)=>x.match&&x.parsed.schedule).map((x)=>{
  const compact=scheduleRaw(x.parsed.schedule);
  return {googlePlaceId:x.row.googlePlaceId,name:x.row.name,sourceUrl:x.page.finalUrl||x.row.pageUrl,openingHoursRaw:compact.raw,closedDays:compact.closedDays,knownDays:x.parsed.knownDays};
});
const review=results.map((x)=>({
  googlePlaceId:x.row.googlePlaceId,name:x.row.name,host:hostname(x.row.pageUrl),pageUrl:x.row.pageUrl,
  finalUrl:x.page.finalUrl||null,fetchOk:x.page.ok,title:x.page.title||null,identityMatched:x.match,
  accepted:Boolean(x.parsed.schedule),reason:x.parsed.reason||null,knownDays:x.parsed.knownDays||0,
  hoursBlock:(x.parsed.block||[]).slice(0,20),closedDays:x.parsed.closed||[]
}));
fs.mkdirSync(path.dirname(REVIEW_PATH),{recursive:true});
fs.writeFileSync(REVIEW_PATH,`${JSON.stringify(review,null,2)}\n`,'utf8');

const output=[];
output.push('// Generated from current single-business official pages with explicit weekly hours.');
output.push('// Platform/aggregator hosts, locator chains, resolution identities and ambiguous schedules are excluded.');
output.push(`const SINGLE_SITE_HOURS_CHECKED_AT = ${js(CHECKED_AT)};`);
output.push(`const singleSiteHoursPatches = ${JSON.stringify(accepted,null,2)};`);
output.push('for (const patch of singleSiteHoursPatches) {');
output.push("  const ref={provider:'official',url:patch.sourceUrl,checkedAt:SINGLE_SITE_HOURS_CHECKED_AT,fields:['name','hours']};");
output.push("  let row=[...window.RESTAURANTS].reverse().find((item)=>item&&item.googlePlaceId===patch.googlePlaceId&&item.source==='official'&&item.sourceOnly);");
output.push("  if(!row){row={id:`src-single-hours-${patch.googlePlaceId.slice(-12).replace(/[^A-Za-z0-9_-]/g,'')}`,profile:'TOKYO',area:'地区1️⃣',name:patch.name,googlePlaceId:patch.googlePlaceId,source:'official',sourceOnly:true,sourceRefs:[]};window.RESTAURANTS.push(row);}");
output.push('  row.name=patch.name; row.openingHoursRaw=patch.openingHoursRaw; row.closedDays=patch.closedDays||[]; row.closedNote=null;');
output.push("  row.sourceRefs=Array.isArray(row.sourceRefs)?row.sourceRefs:[]; row.sourceRefs=row.sourceRefs.map((item)=>item&&item.provider==='official'?{...item,fields:(item.fields||[]).filter((field)=>field!=='hours')}:item).filter((item)=>item&&(item.provider!=='official'||(item.fields||[]).length)); row.sourceRefs.push(ref);");
output.push('}');
fs.writeFileSync(OUTPUT_PATH,`${output.join('\n')}\n`,'utf8');

const reasonCounts={}; for(const row of review)reasonCounts[row.reason||'accepted']=(reasonCounts[row.reason||'accepted']||0)+1;
console.log(JSON.stringify({
  currentHoursGap:production.filter((row)=>!row.openingHours).length,
  directOfficialTargets:targets.length,fetchedOk:results.filter((x)=>x.page.ok).length,
  identityMatched:results.filter((x)=>x.match).length,accepted:accepted.length,
  sevenPlusKnownDays:accepted.filter((x)=>x.knownDays>=7).length,
  reasonCounts,hosts:[...new Set(accepted.map((x)=>hostname(x.sourceUrl)))].sort()
}));
