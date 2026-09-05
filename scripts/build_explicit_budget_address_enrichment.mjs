#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const INDEX_PATH = process.argv[2] || path.join(DATA, 'official_candidate_index.json');
const OUTPUT_PATH = process.argv[3] || path.join(DATA, 'source_enrichment_zzzzexplicitfields.js');
const REVIEW_PATH = process.argv[4] || path.join(ROOT, '_audit', 'explicit-budget-address-review.json');
const CHECKED_AT = process.env.EXPLICIT_FIELDS_CHECKED_AT || new Date().toISOString().slice(0, 10);
const CONCURRENCY = Math.max(1, Math.min(12, Number(process.env.EXPLICIT_FIELDS_CONCURRENCY || 8)));
const TIMEOUT_MS = Math.max(3000, Number(process.env.EXPLICIT_FIELDS_TIMEOUT_MS || 12000));
const USER_AGENT = 'eat-data-maintenance/1.0 (+https://github.com/nekooweb/eat)';

const PLATFORM_SUFFIXES = [
  'tabelog.com','hotpepper.jp','instagram.com','facebook.com','x.com','twitter.com',
  'linktr.ee','ameblo.jp','exblog.jp','.wixsite.com','.stores.jp','.goope.jp','.gorp.jp','.owst.jp'
];
const LUNCH_LABEL = /(?:ランチ|昼).{0,10}(?:予算|平均)|(?:予算|平均).{0,10}(?:ランチ|昼)/u;
const DINNER_LABEL = /(?:ディナー|夜).{0,10}(?:予算|平均)|(?:予算|平均).{0,10}(?:ディナー|夜)/u;
const GENERIC_BUDGET_LABEL = /(?:平均予算|ご予算|予算)/u;

function loadWindow(file, key, initial) {
  const sandbox = { window: { [key]: initial } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename:path.basename(file) });
  return sandbox.window[key] || initial;
}
function loadProduction() {
  return loadWindow(path.join(DATA, 'production_area1.js'), 'PRODUCTION_RESTAURANTS', []);
}
function loadResolutionIds() {
  const files = fs.readdirSync(DATA).filter((name)=>/^source_resolution(?:_[a-z0-9-]+)?\.js$/i.test(name)).sort();
  const sandbox = { window: { SOURCE_RESOLUTIONS: [] } };
  vm.createContext(sandbox);
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(DATA,file),'utf8'),sandbox,{filename:file});
  return new Set((sandbox.window.SOURCE_RESOLUTIONS || []).map((row)=>row.googlePlaceId).filter(Boolean));
}
function loadExistingSourceIds() {
  const ids = new Set();
  for (const file of fs.readdirSync(DATA).filter((name)=>/^source_enrichment.*\.js$/i.test(name) && name !== path.basename(OUTPUT_PATH))) {
    const text = fs.readFileSync(path.join(DATA,file), 'utf8');
    for (const match of text.matchAll(/googlePlaceId\s*:\s*["']([^"']+)["']/g)) ids.add(match[1]);
  }
  return ids;
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
  return m ? decode(m[1]).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,240) : null;
}
function hostname(url) { try{return new URL(url).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';} }
function isPlatformHost(host) { return PLATFORM_SUFFIXES.some((suffix)=>suffix.startsWith('.')?host.endsWith(suffix):host===suffix||host.endsWith(`.${suffix}`)); }
function identityMatches(name,title) {
  const a=normalize(name), b=normalize(title);
  return Boolean(a.length>=4 && b && (a.includes(b)||b.includes(a)));
}
function plausibleAddress(value) {
  const s=String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().replace(/^〒\s*\d{3}-?\d{4}\s*/,'');
  if(!s||s.length>160||!/[0-9０-９]/.test(s))return null;
  if(!(s.includes('千代田区')||s.includes('文京区')))return null;
  if(/[。！？]/u.test(s))return null;
  if(/(?:おすすめ|メニュー|営業時間|電話|アクセス)/u.test(s))return null;
  return s;
}
function extractAddress(lines) {
  for(let i=0;i<lines.length;i+=1){
    const line=lines[i];
    const inline=line.match(/^(?:住所|所在地)\s*[:：]\s*(.+)$/u);
    if(inline){const hit=plausibleAddress(inline[1]);if(hit)return hit;}
    if(/^(?:住所|所在地)\s*[:：]?\s*$/u.test(line)){
      for(const next of lines.slice(i+1,i+4)){const hit=plausibleAddress(next);if(hit)return hit;}
    }
  }
  return null;
}
function parseNumber(value){const n=Number(String(value).replace(/[,，\s]/g,''));return Number.isFinite(n)?n:null;}
function validRange(a,b){return Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>=a&&b<=100000;}
function explicitRange(text) {
  const s=String(text||'').normalize('NFKC').replace(/[,，]/g,'').replace(/[~〜～–—―−]/g,'-');
  let m=s.match(/(?:¥|￥)?\s*(\d{2,6})\s*円?\s*-\s*(?:¥|￥)?\s*(\d{2,6})\s*円?/u);
  if(m){const a=parseNumber(m[1]),b=parseNumber(m[2]);return validRange(a,b)?[a,b]:null;}
  m=s.match(/(?:¥|￥)?\s*(\d{2,6})\s*円?\s*(?:以下|まで)/u);
  if(m){const b=parseNumber(m[1]);return validRange(0,b)?[0,b]:null;}
  m=s.match(/(?:～|〜|~|-)\s*(?:¥|￥)?\s*(\d{2,6})\s*円/u);
  if(m){const b=parseNumber(m[1]);return validRange(0,b)?[0,b]:null;}
  return null;
}
function findBudget(lines,labelRe,otherLabelRe){
  for(let i=0;i<lines.length;i+=1){
    if(!labelRe.test(lines[i]))continue;
    const candidates=[lines[i]];
    for(let j=i+1;j<Math.min(lines.length,i+3);j+=1){
      if(otherLabelRe.test(lines[j]))break;
      candidates.push(lines[j]);
    }
    for(const text of candidates){const range=explicitRange(text);if(range)return{range,evidence:candidates.join(' | ')};}
  }
  return null;
}
function genericBudgetEvidence(lines){return lines.filter((line)=>GENERIC_BUDGET_LABEL.test(line)&&/(?:¥|￥|円)/u.test(line)).slice(0,8);}
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

const index=JSON.parse(fs.readFileSync(INDEX_PATH,'utf8'));
const production=loadProduction();
const byId=new Map(production.map((row)=>[row.googlePlaceId,row]));
const resolutionIds=loadResolutionIds();
const existingSourceIds=loadExistingSourceIds();
const targets=(index.records||[]).filter((row)=>{
  const current=byId.get(row.googlePlaceId); if(!current)return false;
  const needsAddress=!current.address;
  const needsBudget=!Array.isArray(current.lunch)&&!Array.isArray(current.dinner);
  if(!needsAddress&&!needsBudget)return false;
  if(!existingSourceIds.has(row.googlePlaceId)||resolutionIds.has(row.googlePlaceId))return false;
  const host=hostname(row.pageUrl); return Boolean(host&&!isPlatformHost(host));
});
const results=await mapLimit(targets,CONCURRENCY,async(row)=>{
  const page=await fetchPage(row.pageUrl);
  const current=byId.get(row.googlePlaceId);
  const match=page.ok&&identityMatches(row.name,page.title);
  if(!match)return{row,current,page,match,address:null,lunch:null,dinner:null,genericBudget:[]};
  const address=current.address?null:extractAddress(page.lines);
  const lunch=current.lunch?null:findBudget(page.lines,LUNCH_LABEL,DINNER_LABEL);
  const dinner=current.dinner?null:findBudget(page.lines,DINNER_LABEL,LUNCH_LABEL);
  return{row,current,page,match,address,lunch,dinner,genericBudget:genericBudgetEvidence(page.lines)};
});
const patches=results.filter((x)=>x.match&&(x.address||x.lunch||x.dinner)).map((x)=>({
  googlePlaceId:x.row.googlePlaceId,name:x.row.name,sourceUrl:x.page.finalUrl||x.row.pageUrl,
  address:x.address||null,lunch:x.lunch?.range||null,dinner:x.dinner?.range||null,
  lunchEvidence:x.lunch?.evidence||null,dinnerEvidence:x.dinner?.evidence||null
}));
const review=results.map((x)=>({
  googlePlaceId:x.row.googlePlaceId,name:x.row.name,host:hostname(x.row.pageUrl),pageUrl:x.row.pageUrl,
  fetchOk:x.page.ok,title:x.page.title||null,identityMatched:x.match,
  addressCandidate:x.address||null,lunchCandidate:x.lunch?.range||null,dinnerCandidate:x.dinner?.range||null,
  lunchEvidence:x.lunch?.evidence||null,dinnerEvidence:x.dinner?.evidence||null,genericBudgetEvidence:x.genericBudget
}));
fs.mkdirSync(path.dirname(REVIEW_PATH),{recursive:true});
fs.writeFileSync(REVIEW_PATH,`${JSON.stringify(review,null,2)}\n`,'utf8');

const output=[];
output.push('// Generated only from explicit labelled fields on current direct official pages.');
output.push('// Menu-item prices are never converted into restaurant budget ranges.');
output.push(`const EXPLICIT_FIELDS_CHECKED_AT = ${js(CHECKED_AT)};`);
output.push(`const explicitFieldPatches = ${JSON.stringify(patches,null,2)};`);
output.push('for (const patch of explicitFieldPatches) {');
output.push("  const fields=['name']; if(patch.address)fields.push('address'); if(patch.lunch||patch.dinner)fields.push('budget');");
output.push("  const ref={provider:'official',url:patch.sourceUrl,checkedAt:EXPLICIT_FIELDS_CHECKED_AT,fields};");
output.push("  let row=[...window.RESTAURANTS].reverse().find((item)=>item&&item.googlePlaceId===patch.googlePlaceId&&item.source==='official'&&item.sourceOnly);");
output.push("  if(!row){row={id:`src-explicit-${patch.googlePlaceId.slice(-12).replace(/[^A-Za-z0-9_-]/g,'')}`,profile:'TOKYO',area:'地区1️⃣',name:patch.name,googlePlaceId:patch.googlePlaceId,source:'official',sourceOnly:true,sourceRefs:[]};window.RESTAURANTS.push(row);}");
output.push('  row.name=patch.name; if(patch.address)row.address=patch.address; if(patch.lunch)row.lunch=patch.lunch; if(patch.dinner)row.dinner=patch.dinner;');
output.push("  row.sourceRefs=Array.isArray(row.sourceRefs)?row.sourceRefs:[]; const owned=new Set(fields); row.sourceRefs=row.sourceRefs.map((item)=>item&&item.provider==='official'?{...item,fields:(item.fields||[]).filter((field)=>!owned.has(field))}:item).filter((item)=>item&&(item.provider!=='official'||(item.fields||[]).length)); row.sourceRefs.push(ref);");
output.push('}');
fs.writeFileSync(OUTPUT_PATH,`${output.join('\n')}\n`,'utf8');

console.log(JSON.stringify({
  targets:targets.length,fetchedOk:results.filter((x)=>x.page.ok).length,identityMatched:results.filter((x)=>x.match).length,
  patches:patches.length,addressPatches:patches.filter((x)=>x.address).length,
  budgetPatches:patches.filter((x)=>x.lunch||x.dinner).length,lunchPatches:patches.filter((x)=>x.lunch).length,dinnerPatches:patches.filter((x)=>x.dinner).length,
  genericBudgetReviewSignals:results.filter((x)=>x.genericBudget.length).length,
  hosts:[...new Set(patches.map((x)=>hostname(x.sourceUrl)))].sort()
}));
