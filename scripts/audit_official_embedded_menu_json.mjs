#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DISH_RULES } from './recommended_dish_extractor.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..');
const DATA=path.join(ROOT,'data');
const OUTPUT=process.argv[2]||path.join(ROOT,'_audit','official_embedded_menu_json.json');
const TIMEOUT_MS=Math.max(8000,Number(process.env.OFFICIAL_EMBEDDED_JSON_TIMEOUT_MS||12000));
const WORKERS=Math.max(1,Math.min(8,Number(process.env.OFFICIAL_EMBEDDED_JSON_WORKERS||6)));
const USER_AGENT='eat-data-maintenance/2.4 (+https://github.com/nekooweb/eat)';
const NON_HTML=/\.(?:pdf|jpe?g|png|gif|webp|avif|svg)(?:$|[?#])/i;
const NAME_KEYS=new Set(['name','title','productname','itemname','menuname','displayname']);
const PRICE_KEYS=new Set(['price','pricevalue','amount','pricetext','displayprice','sellingprice','unitprice']);

function loadWindowFile(filename){
  const sandbox={window:{},console}; vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA,filename),'utf8'),sandbox,{filename});
  return sandbox.window;
}
function decodeEntities(v){return String(v||'').replace(/&quot;|&#34;/gi,'"').replace(/&amp;/gi,'&').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').trim();}
function htmlUrl(v){try{const u=new URL(v);if(!['http:','https:'].includes(u.protocol)||NON_HTML.test(u.toString())) return null;return u.toString();}catch{return null;}}
function dishMatches(text){
  const out=[],seen=new Set(),clean=String(text||'').normalize('NFKC').replace(/\s+/g,' ').trim();
  for(const [pattern,nameZh] of DISH_RULES){const m=clean.match(pattern);if(!m||seen.has(nameZh))continue;seen.add(nameZh);out.push({nameZh,nameOriginal:m[0],rule:pattern.source});if(out.length>=6)break;}
  return out;
}
function priceValue(obj){
  for(const [k,v] of Object.entries(obj||{})){
    if(!PRICE_KEYS.has(String(k).toLowerCase())) continue;
    if(typeof v==='number'&&Number.isFinite(v)&&v>0) return String(v);
    if(typeof v==='string'&&/(?:[¥￥]\s*)?[\d,]+(?:\s*円)?|税込|税抜/.test(v)) return v.slice(0,80);
  }
  return '';
}
function nameValues(obj){
  const out=[];
  for(const [k,v] of Object.entries(obj||{})) if(NAME_KEYS.has(String(k).toLowerCase())&&typeof v==='string'&&v.trim().length>=2&&v.trim().length<=140) out.push(v.trim());
  return [...new Set(out)];
}
function walk(value,visit,pathParts=[]){
  if(Array.isArray(value)){value.forEach((x,i)=>walk(x,visit,[...pathParts,String(i)]));return;}
  if(!value||typeof value!=='object')return;
  visit(value,pathParts);
  for(const [k,v] of Object.entries(value)) walk(v,visit,[...pathParts,k]);
}
function extractJsonScripts(html){
  const out=[];
  const re=/<script\b([^>]*)>([\s\S]*?)<\/script>/gi; let m;
  while((m=re.exec(String(html||'')))){
    const attrs=m[1]||'',body=decodeEntities(m[2]||'').trim();
    if(!body)continue;
    const type=(attrs.match(/\btype\s*=\s*['"]([^'"]+)['"]/i)||[])[1]||'';
    const id=(attrs.match(/\bid\s*=\s*['"]([^'"]+)['"]/i)||[])[1]||'';
    // JSON-LD MenuItem is already handled by the main collector; audit only other embedded JSON.
    if(/application\/ld\+json/i.test(type))continue;
    if(!/application\/json/i.test(type)&&id!=='__NEXT_DATA__'&&id!=='__NUXT_DATA__')continue;
    try{out.push({type,id,json:JSON.parse(body)});}catch{/* unusable embedded JSON is not evidence */}
  }
  return out;
}
async function fetchHtml(url){
  const r=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(TIMEOUT_MS),headers:{'user-agent':USER_AGENT,accept:'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1'}});
  if(!r.ok)throw new Error(`HTTP ${r.status}`);const ct=r.headers.get('content-type')||'';if(!/text\/html|application\/xhtml\+xml/i.test(ct))throw new Error(`non-html ${ct}`);return{html:(await r.text()).slice(0,2_000_000),finalUrl:r.url||url};
}
const runtimeW=loadWindowFile('google_inventory_runtime.js');
const runtime=runtimeW.GOOGLE_INVENTORY_RESTAURANTS||[],stats=runtimeW.GOOGLE_INVENTORY_STATS||{};
if(stats.catalogTotal!==2804||runtime.length+Number(stats.unpublishedPlaceIdOnly||0)!==2804)throw new Error('frozen catalog mismatch');
const noDishIds=new Set(runtime.filter(r=>!(r.recommendedDishes||[]).length&&!(r.featuredDishes||[]).length).map(r=>r.googlePlaceId));
const runtimeById=new Map(runtime.map(r=>[r.googlePlaceId,r]));
const official=JSON.parse(fs.readFileSync(path.join(DATA,'reviewed_official_runtime_sources.json'),'utf8'));
const tasks=[];
for(const r of official.rows||[]){if(r.reviewState!=='reviewed'||!noDishIds.has(r.googlePlaceId))continue;for(const raw of r.menuUrls||[]){const url=htmlUrl(raw);if(url)tasks.push({googlePlaceId:r.googlePlaceId,name:runtimeById.get(r.googlePlaceId)?.name||r.officialName,url});}}
let cursor=0;const results=[];
async function worker(){while(true){const i=cursor++;if(i>=tasks.length)return;const t=tasks[i];try{const page=await fetchHtml(t.url);const scripts=extractJsonScripts(page.html);const items=[];for(const s of scripts){walk(s.json,(obj,p)=>{const price=priceValue(obj);if(!price)return;for(const name of nameValues(obj)){for(const d of dishMatches(name))items.push({nameZh:d.nameZh,nameOriginal:d.nameOriginal,sourceName:name,price,rule:d.rule,jsonPath:p.slice(-8).join('.'),scriptType:s.type||null,scriptId:s.id||null});}});}const uniq=new Map();for(const x of items){const k=`${x.nameZh}|${x.sourceName}|${x.price}`;if(!uniq.has(k))uniq.set(k,x);}results.push({...t,finalUrl:page.finalUrl,jsonScripts:scripts.length,items:[...uniq.values()]});}catch(e){results.push({...t,error:String(e?.message||e),jsonScripts:0,items:[]});}}}
await Promise.all(Array.from({length:Math.min(WORKERS,tasks.length||1)},worker));
const evidenceRows=results.filter(r=>r.items.length);
const payload={schemaVersion:1,checkedAt:new Date().toISOString().slice(0,10),policy:{catalogTotal:2804,currentNoDishOnly:true,reviewedOfficialMenuUrlsOnly:true,embeddedJsonOnly:true,jsonLdExcluded:true,nameAndPriceSameObjectRequired:true,pageScriptsExecuted:false,networkApiCalls:0,paidGoogleDataApiCalls:0,recommendationPromotionAllowed:false,evidenceMutationAllowed:false},summary:{currentNoDish:noDishIds.size,htmlMenuTasks:tasks.length,pagesFetched:results.filter(r=>!r.error).length,errorPages:results.filter(r=>r.error).length,pagesWithEmbeddedJson:results.filter(r=>r.jsonScripts>0).length,evidenceRestaurants:new Set(evidenceRows.map(r=>r.googlePlaceId)).size,evidenceItems:evidenceRows.reduce((s,r)=>s+r.items.length,0)},rows:results};
fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});fs.writeFileSync(OUTPUT,JSON.stringify(payload,null,2)+'\n','utf8');console.log(JSON.stringify(payload.summary));if(evidenceRows.length)console.log('SAMPLES='+JSON.stringify(evidenceRows.slice(0,10)));
