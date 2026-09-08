#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const INPUT = process.argv[2] || path.join(DATA, 'independent_dish_source_candidates.json');
const OUTPUT = process.argv[3] || path.join(DATA, 'reviewed_independent_dish_sources.json');
const TIMEOUT_MS = Math.max(2000, Math.min(15000, Number(process.env.INDEPENDENT_SOURCE_REVIEW_TIMEOUT_MS || 7000)));
const CONCURRENCY = Math.max(1, Math.min(12, Number(process.env.INDEPENDENT_SOURCE_REVIEW_CONCURRENCY || 6)));
const FIRST_LEVEL_LIMIT = Math.max(0, Math.min(6, Number(process.env.INDEPENDENT_SOURCE_REVIEW_SUBPAGE_LIMIT || 4)));
const SECOND_LEVEL_TOTAL_LIMIT = Math.max(0, Math.min(12, Number(process.env.INDEPENDENT_SOURCE_REVIEW_SECOND_LEVEL_LIMIT || 6)));
const SECOND_LEVEL_PER_PAGE_LIMIT = Math.max(0, Math.min(4, Number(process.env.INDEPENDENT_SOURCE_REVIEW_SECOND_LEVEL_PER_PAGE_LIMIT || 2)));
const MAX_HTML_CHARS = 1_200_000;
const LOCATION_DISTANCE_M = 120;
const CHECKED_AT = new Date().toISOString().slice(0, 10);
const USER_AGENT = 'eat-independent-source-review/3.0 (+https://github.com/nekooweb/eat)';
const FOOD_TYPES = new Set(['restaurant','foodestablishment','cafeorcoffeeshop','bakery','barorpub','fastfoodrestaurant','localbusiness']);
const BANNED_HOST = /(?:^|\.)(?:facebook\.com|instagram\.com|x\.com|twitter\.com|youtube\.com|tiktok\.com|tabelog\.com|hotpepper\.jp|google\.[a-z.]+|googleusercontent\.com|gnavi\.co\.jp|retty\.me|foursquare\.com|autoreserve\.com|ekiten\.jp)$/i;
const LOCATION_LINK_RE = /(?:店舗|店舖|店舗情報|アクセス|所在地|地図|行き方|本店|支店|location|locations|shop|shops|store|stores|access|map|branch)(?:\b|\W|$)/i;
const ASSET_RE = /\.(?:jpe?g|png|gif|webp|svg|ico|css|js|pdf|xml|zip)(?:$|[?#])/i;

function loadWindowFile(filename) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
  return sandbox.window;
}
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function normalizeName(value) {
  return clean(value).normalize('NFKC').toLowerCase()
    .replace(/株式会社|有限会社|合同会社/g, '')
    .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆!！?？.,，。:：/\\]+/g, '');
}
function nameSimilarity(a, b) {
  const x = normalizeName(a), y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) {
    const short = Math.min(x.length, y.length), long = Math.max(x.length, y.length);
    if (short >= 4) return Math.max(0.86, short / long);
  }
  const grams = (text) => text.length < 2 ? [text] : Array.from({length:text.length-1}, (_,i)=>text.slice(i,i+2));
  const left = grams(x), right = grams(y), counts = new Map();
  for (const token of left) counts.set(token, (counts.get(token)||0)+1);
  let overlap = 0;
  for (const token of right) {
    const count = counts.get(token)||0;
    if (!count) continue;
    overlap += 1; counts.set(token, count-1);
  }
  return (2*overlap)/(left.length+right.length);
}
function fullNormalizedNameInTitle(name, title) {
  const target = normalizeName(name), page = normalizeName(title);
  return target.length >= 4 && page.includes(target);
}
function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:','https:'].includes(url.protocol)) return null;
    url.hash = '';
    if (BANNED_HOST.test(url.hostname.toLowerCase().replace(/^www\./,''))) return null;
    return url;
  } catch { return null; }
}
function hostKey(value) {
  const url = value instanceof URL ? value : safeUrl(value);
  return url ? url.hostname.toLowerCase().replace(/^www\./,'') : '';
}
function hostCompatible(a,b) {
  const x=hostKey(a), y=hostKey(b);
  return Boolean(x && y && (x===y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`)));
}
function pathSpecific(value) {
  const url = value instanceof URL ? value : safeUrl(value);
  if (!url) return false;
  const p=url.pathname.replace(/\/+$/,'');
  return Boolean(p && p!=='/index.html' && p!=='/index.htm');
}
function decodeEntities(value) {
  return String(value||'').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;|&#34;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,n)=>{ const code=Number(n); return Number.isFinite(code)&&code>0&&code<=0x10ffff?String.fromCodePoint(code):' '; });
}
function htmlText(html) {
  return decodeEntities(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
}
function pageTitle(html) {
  const title=String(html||'').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'';
  const og=String(html||'').match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1]
    ||String(html||'').match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["'][^>]*>/i)?.[1]||'';
  return clean(decodeEntities(og||title).replace(/<[^>]+>/g,' '));
}
function walkJson(value, visit) {
  if (Array.isArray(value)) { for (const item of value) walkJson(item,visit); return; }
  if (!value || typeof value!=='object') return;
  visit(value); for (const item of Object.values(value)) walkJson(item,visit);
}
function objectAddress(value) {
  if (!value) return '';
  if (typeof value==='string') return clean(value);
  if (typeof value!=='object') return '';
  return clean([value.postalCode,value.addressRegion,value.addressLocality,value.streetAddress,value.name].filter(Boolean).join(' '));
}
function structuredFacts(html) {
  const facts=[]; const re=/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi; let match;
  while ((match=re.exec(String(html||'')))) {
    try {
      const data=JSON.parse(decodeEntities(match[1]).trim());
      walkJson(data,(obj)=>{
        const types=(Array.isArray(obj['@type'])?obj['@type']:[obj['@type']]).map((v)=>clean(v).toLowerCase());
        if (!types.some((type)=>FOOD_TYPES.has(type))) return;
        const geo=obj.geo&&typeof obj.geo==='object'?obj.geo:{}; const lat=Number(geo.latitude), lng=Number(geo.longitude);
        facts.push({name:clean(obj.name),address:objectAddress(obj.address),lat:Number.isFinite(lat)?lat:null,lng:Number.isFinite(lng)?lng:null,url:clean(obj.url||obj['@id'])});
      });
    } catch { /* malformed JSON-LD is not evidence */ }
  }
  return facts;
}
function normalizeAddress(value) {
  return clean(value).normalize('NFKC').toLowerCase().replace(/東京都|tokyo|〒\s*\d{3}[-ー－]?\d{4}/gi,'')
    .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆!！?？.,，。:：/\\]+/g,'');
}
function addressAgreement(a,b) {
  const x=normalizeAddress(a), y=normalizeAddress(b); if(!x||!y) return false;
  if(x.length>=8&&y.includes(x)) return true; if(y.length>=8&&x.includes(y)) return true;
  const max=Math.min(x.length,y.length,18);
  for(let size=max;size>=8;size-=1) for(let i=0;i<=x.length-size;i+=1) if(y.includes(x.slice(i,i+size))) return true;
  return false;
}
function haversine(lat1,lng1,lat2,lng2) {
  const r=6371000,p1=lat1*Math.PI/180,p2=lat2*Math.PI/180,dlat=(lat2-lat1)*Math.PI/180,dlng=(lng2-lng1)*Math.PI/180;
  const v=Math.sin(dlat/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dlng/2)**2;
  return r*2*Math.atan2(Math.sqrt(v),Math.sqrt(Math.max(0,1-v)));
}
function plausibleLatLng(lat,lng){return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=20&&lat<=50&&lng>=120&&lng<=155;}
function pageMapCoordinates(html) {
  const text=decodeEntities(String(html||'')).replace(/%2C/gi,',').replace(/%3A/gi,':'); const points=[],seen=new Set();
  const add=(a,b,rule)=>{const lat=Number(a),lng=Number(b);if(!plausibleLatLng(lat,lng))return;const key=`${lat.toFixed(6)},${lng.toFixed(6)}`;if(seen.has(key))return;seen.add(key);points.push({lat,lng,rule});};
  let m; const patterns=[[/!3d(-?\d{2,3}\.\d+)!4d(-?\d{2,3}\.\d+)/g,'google_maps_3d4d'],[/@(-?\d{2,3}\.\d+),(-?\d{2,3}\.\d+)/g,'map_at_latlng'],[/[?&](?:q|ll|center)=(-?\d{2,3}\.\d+),(-?\d{2,3}\.\d+)/gi,'map_query_latlng']];
  for(const [re,rule] of patterns) while((m=re.exec(text))) add(m[1],m[2],rule);
  return points.slice(0,20);
}
function discoverLinks(html,baseUrl,runtimeName,{level=1,limit=4}={}) {
  const base=safeUrl(baseUrl); if(!base||limit<=0)return[]; const target=normalizeName(runtimeName),rows=[]; const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi; let m;
  while((m=re.exec(String(html||'')))){
    let url; try{url=new URL(decodeEntities(m[1]).trim(),base);}catch{continue;}
    if(!['http:','https:'].includes(url.protocol)||!hostCompatible(base,url)||ASSET_RE.test(url.pathname))continue;
    url.hash=''; const label=clean(decodeEntities(m[2]).replace(/<[^>]+>/g,' ')); const searchable=`${url.pathname} ${url.search} ${label}`;
    const labelNorm=normalizeName(label), exactName=target.length>=4&&labelNorm.includes(target), similarity=nameSimilarity(runtimeName,label), location=LOCATION_LINK_RE.test(searchable);
    const eligible=level===1 ? (exactName||location) : (exactName||similarity>=0.62||location);
    if(!eligible)continue;
    const score=Number(exactName)*120+Number(similarity>=0.8)*80+Number(similarity>=0.62)*35+Number(location)*25+Number(pathSpecific(url))*10;
    rows.push({url:url.toString(),label:label.slice(0,120),score,level,nameSimilarity:Number(similarity.toFixed(3))});
  }
  const dedup=new Map(); for(const row of rows.sort((a,b)=>b.score-a.score||a.url.localeCompare(b.url))) if(!dedup.has(row.url))dedup.set(row.url,row);
  return [...dedup.values()].slice(0,limit);
}
function loadResolutionBlocks(){
  const blocks=new Map();
  for(const filename of fs.readdirSync(DATA).filter((n)=>/^source_resolution_outer\d+\.js$/.test(n))){
    const sandbox={window:{SOURCE_RESOLUTIONS:[]},console};vm.createContext(sandbox);try{vm.runInContext(fs.readFileSync(path.join(DATA,filename),'utf8'),sandbox,{filename});}catch{continue;}
    for(const row of sandbox.window.SOURCE_RESOLUTIONS||[]){const status=clean(row.status).toLowerCase();if(!row.googlePlaceId||!/(ambiguous|conflict|hold|closed|branch|mismatch)/i.test(status))continue;blocks.set(row.googlePlaceId,{status,source:filename,reason:clean(row.reason)});}
  }
  return blocks;
}
function rootVariants(raw){
  const url=safeUrl(raw); if(!url)return[]; const out=[];
  if(url.protocol==='http:'){const https=new URL(url);https.protocol='https:';out.push(https.toString());}
  out.push(url.toString()); return [...new Set(out)];
}
async function fetchHtml(rawUrl,anchorUrl){
  const source=safeUrl(rawUrl),anchor=safeUrl(anchorUrl||rawUrl);if(!source||!anchor)throw new Error('invalid source URL');
  const response=await fetch(source,{redirect:'follow',signal:AbortSignal.timeout(TIMEOUT_MS),headers:{'user-agent':USER_AGENT,accept:'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1'}});
  if(!response.ok)throw new Error(`HTTP ${response.status}`); const finalUrl=safeUrl(response.url); if(!finalUrl||!hostCompatible(anchor,finalUrl))throw new Error('cross-site redirect');
  const contentType=response.headers.get('content-type')||''; if(!/text\/html|application\/xhtml\+xml/i.test(contentType))throw new Error(`non-html ${contentType}`);
  const bytes=new Uint8Array(await response.arrayBuffer());const charset=/charset\s*=\s*([^;\s]+)/i.exec(contentType)?.[1]?.replace(/["']/g,'').toLowerCase()||'utf-8';let html;
  try{html=new TextDecoder(charset).decode(bytes);}catch{html=new TextDecoder('utf-8').decode(bytes);}return{finalUrl:finalUrl.toString(),html:html.slice(0,MAX_HTML_CHARS)};
}
function reviewPage(proposal,runtime,fetched,discoveryKind='candidate'){
  const title=pageTitle(fetched.html),text=htmlText(fetched.html).slice(0,260000),facts=structuredFacts(fetched.html),mapPoints=pageMapCoordinates(fetched.html);
  const titleSim=nameSimilarity(runtime.name,title),exactTitle=fullNormalizedNameInTitle(runtime.name,title),bestFact=facts.map((fact)=>({fact,similarity:nameSimilarity(runtime.name,fact.name)})).sort((a,b)=>b.similarity-a.similarity)[0]||null;
  const structuredSim=Number(bestFact?.similarity||0),nameEvidence=structuredSim>=0.92||titleSim>=0.92||exactTitle,locationSignals=[];
  if(Number.isFinite(runtime.lat)&&Number.isFinite(runtime.lng)){
    for(const fact of facts)if(Number.isFinite(fact.lat)&&Number.isFinite(fact.lng)){const d=haversine(runtime.lat,runtime.lng,fact.lat,fact.lng);if(d<=LOCATION_DISTANCE_M)locationSignals.push(`structured_geo_${Math.round(d)}m`);}
    for(const point of mapPoints){const d=haversine(runtime.lat,runtime.lng,point.lat,point.lng);if(d<=LOCATION_DISTANCE_M)locationSignals.push(`${point.rule}_${Math.round(d)}m`);}
  }
  for(const fact of facts)if(addressAgreement(runtime.address,fact.address))locationSignals.push('structured_address_agreement');if(runtime.address&&addressAgreement(runtime.address,text))locationSignals.push('visible_address_agreement');
  const specific=pathSpecific(fetched.finalUrl),proposalDistance=Number(proposal.candidateDistanceMeters),proposalNameSim=Number(proposal.nameSimilarity||0),locationEvidence=locationSignals.length>0;
  const exactSpecificStructured=specific&&structuredSim>=0.97&&Number.isFinite(proposalDistance)&&proposalDistance<=20&&proposalNameSim>=0.98;
  const approved=fetched.finalUrl.startsWith('https://')&&nameEvidence&&(locationEvidence||exactSpecificStructured);const signals=[];
  if(structuredSim>=0.92)signals.push(`structured_name_similarity_${structuredSim.toFixed(3)}`);if(titleSim>=0.92)signals.push(`title_name_similarity_${titleSim.toFixed(3)}`);if(exactTitle)signals.push('full_normalized_runtime_name_in_title');if(specific)signals.push('path_specific_page');
  if(discoveryKind==='same_origin_subpage')signals.push('bounded_same_origin_subpage');if(discoveryKind==='same_origin_second_level')signals.push('bounded_same_origin_second_level');signals.push(...locationSignals);if(exactSpecificStructured)signals.push('exact_specific_structured_exception');
  let reason='approved';if(!fetched.finalUrl.startsWith('https://'))reason='non_https_final_url';else if(!nameEvidence)reason='no_strong_page_name_evidence';else if(!locationEvidence&&!exactSpecificStructured)reason=specific?'specific_page_missing_location_or_exact_structured_confirmation':'generic_root_missing_location_confirmation';
  return{approved,reason,finalUrl:fetched.finalUrl,title:title.slice(0,180),structuredFacts:facts.length,mapCoordinateCandidates:mapPoints.length,titleNameSimilarity:Number(titleSim.toFixed(3)),structuredNameSimilarity:Number(structuredSim.toFixed(3)),exactTitleContainment:exactTitle,locationSignals:[...new Set(locationSignals)],reviewSignals:[...new Set(signals)]};
}
function loadExistingApprovals(runtimeById,resolutionBlocks){
  if(!fs.existsSync(OUTPUT))return[];let x;try{x=JSON.parse(fs.readFileSync(OUTPUT,'utf8'));}catch{return[];}
  const kept=[];
  for(const row of x.rows||[]){
    if(row.reviewState!=='strict_auto'||!row.googlePlaceId||!runtimeById.has(row.googlePlaceId)||resolutionBlocks.has(row.googlePlaceId)||!Array.isArray(row.sourceWebsites)||!row.sourceWebsites.length)continue;
    const urls=row.sourceWebsites.map(safeUrl);if(urls.some((u)=>!u||u.protocol!=='https:'))continue;
    kept.push({...row,sourceWebsites:urls.map((u)=>u.toString()),preservedFromPreviousReview:true});
  }
  return kept;
}
async function main(){
  const candidates=JSON.parse(fs.readFileSync(INPUT,'utf8')),runtimeWindow=loadWindowFile('google_inventory_runtime.js'),runtimeRows=Array.isArray(runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS)?runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS:[],runtimeStats=runtimeWindow.GOOGLE_INVENTORY_STATS||{};
  if(runtimeStats.catalogTotal!==2804||runtimeStats.inventoryTotal!==runtimeRows.length||candidates.summary?.publicRuntimeTotal!==runtimeRows.length||runtimeRows.length<3||new Set(runtimeRows.map((r)=>r.googlePlaceId)).size!==runtimeRows.length)throw new Error('Strict review requires candidate plan and current runtime from the same catalog build');
  if(candidates.policy?.proposalOnly!==true||candidates.policy?.identityBindingChanges!==0)throw new Error('Candidate input is not proposal-only');
  const resolutionBlocks=loadResolutionBlocks(),runtimeById=new Map(runtimeRows.map((row)=>[row.googlePlaceId,row])),preserved=loadExistingApprovals(runtimeById,resolutionBlocks),preservedIds=new Set(preserved.map((r)=>r.googlePlaceId));
  const targets=(candidates.rows||[]).filter((row)=>row.proposalState==='review_high_confidence_overture_website_candidate'&&row.candidateProvider==='Overture Maps'&&runtimeById.has(row.googlePlaceId)&&!preservedIds.has(row.googlePlaceId));
  let index=0;const reviews=[];
  async function worker(){
    while(true){const current=index++;if(current>=targets.length)return;const proposal=targets[current],runtime=runtimeById.get(proposal.googlePlaceId),blocked=resolutionBlocks.get(proposal.googlePlaceId);
      if(blocked){reviews.push({googlePlaceId:proposal.googlePlaceId,name:runtime.name,proposalState:proposal.proposalState,candidateProvider:proposal.candidateProvider,candidateProviderId:proposal.candidateProviderId,proposalPageUrl:proposal.pageUrl,proposalNameSimilarity:proposal.nameSimilarity,proposalDistanceMeters:proposal.candidateDistanceMeters,proposalScore:proposal.proposalScore,approved:false,reason:`blocked_by_source_resolution_${blocked.status}`,finalUrl:null,title:null,structuredFacts:0,mapCoordinateCandidates:0,titleNameSimilarity:0,structuredNameSimilarity:0,exactTitleContainment:false,locationSignals:[],reviewSignals:['existing_source_resolution_guard'],discoveredSubpages:[],errors:[],sourceResolution:blocked});continue;}
      const roots=[...new Set([...(proposal.candidateUrls||[]),proposal.pageUrl].filter(Boolean))].slice(0,2),errors=[],discovered=[],visited=new Set();let best=null,secondLevelUsed=0;
      outer:for(const rootRaw of roots){const anchor=safeUrl(rootRaw);if(!anchor)continue;for(const variant of rootVariants(rootRaw)){try{const fetched=await fetchHtml(variant,anchor.toString());if(visited.has(fetched.finalUrl))continue;visited.add(fetched.finalUrl);let review=reviewPage(proposal,runtime,fetched,'candidate');if(!best||Number(review.approved)>Number(best.approved)||review.reviewSignals.length>best.reviewSignals.length)best=review;if(review.approved)break outer;
            const first=discoverLinks(fetched.html,fetched.finalUrl,runtime.name,{level:1,limit:FIRST_LEVEL_LIMIT});
            for(const sub of first){if(visited.has(sub.url))continue;visited.add(sub.url);discovered.push(sub);try{const page=await fetchHtml(sub.url,fetched.finalUrl);review=reviewPage(proposal,runtime,page,'same_origin_subpage');if(!best||Number(review.approved)>Number(best.approved)||review.reviewSignals.length>best.reviewSignals.length)best=review;if(review.approved)break outer;
                if(secondLevelUsed<SECOND_LEVEL_TOTAL_LIMIT){const children=discoverLinks(page.html,page.finalUrl,runtime.name,{level:2,limit:Math.min(SECOND_LEVEL_PER_PAGE_LIMIT,SECOND_LEVEL_TOTAL_LIMIT-secondLevelUsed)});for(const child of children){if(visited.has(child.url))continue;visited.add(child.url);secondLevelUsed+=1;discovered.push(child);try{const childPage=await fetchHtml(child.url,fetched.finalUrl);const childReview=reviewPage(proposal,runtime,childPage,'same_origin_second_level');if(!best||Number(childReview.approved)>Number(best.approved)||childReview.reviewSignals.length>best.reviewSignals.length)best=childReview;if(childReview.approved)break outer;}catch(error){errors.push(`${child.url}: ${error?.message||error}`);}}}
              }catch(error){errors.push(`${sub.url}: ${error?.message||error}`);}}
          }catch(error){errors.push(`${variant}: ${error?.message||error}`);}}
      }
      reviews.push({googlePlaceId:proposal.googlePlaceId,name:runtime.name,proposalState:proposal.proposalState,candidateProvider:proposal.candidateProvider,candidateProviderId:proposal.candidateProviderId,proposalPageUrl:proposal.pageUrl,proposalNameSimilarity:proposal.nameSimilarity,proposalDistanceMeters:proposal.candidateDistanceMeters,proposalScore:proposal.proposalScore,approved:Boolean(best?.approved),reason:best?.reason||'fetch_failed',finalUrl:best?.finalUrl||null,title:best?.title||null,structuredFacts:best?.structuredFacts||0,mapCoordinateCandidates:best?.mapCoordinateCandidates||0,titleNameSimilarity:best?.titleNameSimilarity||0,structuredNameSimilarity:best?.structuredNameSimilarity||0,exactTitleContainment:Boolean(best?.exactTitleContainment),locationSignals:best?.locationSignals||[],reviewSignals:best?.reviewSignals||[],discoveredSubpages:discovered.slice(0,FIRST_LEVEL_LIMIT+SECOND_LEVEL_TOTAL_LIMIT),errors:errors.slice(0,8),sourceResolution:null});
    }
  }
  await Promise.all(Array.from({length:Math.min(CONCURRENCY,Math.max(1,targets.length))},()=>worker()));reviews.sort((a,b)=>a.googlePlaceId.localeCompare(b.googlePlaceId));
  const newApproved=reviews.filter((r)=>r.approved&&r.finalUrl).map((r)=>({googlePlaceId:r.googlePlaceId,name:r.name,reviewState:'strict_auto',sourceWebsites:[r.finalUrl],checkedAt:CHECKED_AT,candidateProvider:r.candidateProvider,candidateProviderId:r.candidateProviderId,reviewSignals:r.reviewSignals,proposalDistanceMeters:r.proposalDistanceMeters,proposalNameSimilarity:r.proposalNameSimilarity,pageTitle:r.title}));
  const merged=new Map();for(const row of preserved)merged.set(row.googlePlaceId,row);for(const row of newApproved)merged.set(row.googlePlaceId,row);const approvedRows=[...merged.values()].sort((a,b)=>a.googlePlaceId.localeCompare(b.googlePlaceId));
  const reasonCounts={};for(const row of reviews)reasonCounts[row.reason]=(reasonCounts[row.reason]||0)+1;
  const summary={catalogTotal:2804,publicRuntimeTotal:runtimeRows.length,proposalRows:Number(candidates.summary?.proposalRows||0),existingApprovedRows:preserved.length,preservedApprovedRows:preserved.length,highConfidenceInputRows:targets.length,reviewedRows:reviews.length,newApprovedRows:newApproved.length,approvedRows:approvedRows.length,rejectedRows:reviews.length-newApproved.length,sourceResolutionBlockedRows:reviews.filter((r)=>r.sourceResolution).length,rowsWithDiscoveredSubpages:reviews.filter((r)=>r.discoveredSubpages.length).length,discoveredSubpages:reviews.reduce((s,r)=>s+r.discoveredSubpages.length,0),secondLevelSubpages:reviews.reduce((s,r)=>s+r.discoveredSubpages.filter((x)=>x.level===2).length,0),rowsWithMapCoordinateCandidates:reviews.filter((r)=>r.mapCoordinateCandidates>0).length,rowsWithAcceptedLocationSignals:reviews.filter((r)=>r.locationSignals.length).length,fetchErrorRows:reviews.filter((r)=>r.errors.length).length,reasonCounts};
  const payload={schemaVersion:3,checkedAt:CHECKED_AT,policy:{strictAutoOnly:true,sourceOverlayOnly:true,candidateProvider:'Overture Maps retained snapshot',liveNetworkRequests:true,monotonicApprovedSourceRetention:true,httpsUpgradeAttemptedBeforeHttp:true,boundedSameOriginSubpageDiscovery:true,boundedSecondLevelSameOriginDiscovery:true,maximumSameOriginSubpagesPerRoot:FIRST_LEVEL_LIMIT,maximumSecondLevelSubpagesTotalPerCandidate:SECOND_LEVEL_TOTAL_LIMIT,pageMapCoordinateIdentityEvidenceAllowed:true,pageMapCoordinateMaximumDistanceMeters:LOCATION_DISTANCE_M,paidGoogleDataApiCalls:0,googleDisplayPayloadUsed:false,identityBindingChanges:0,runtimeNameMutationAllowed:false,runtimeCoordinateMutationAllowed:false,runtimeIdentityMutationAllowed:false,dishEvidenceCreatedByReview:false,genericBrandHomepageAloneAccepted:false,strongPageNameEvidenceRequired:true,explicitLocationEvidenceRequiredUnlessExactSpecificStructured:true,existingSourceResolutionConflictGuardsHonored:true,crossSiteRedirectAllowed:false,httpsFinalUrlRequired:true,onlyHighConfidenceProposalStateReviewed:true},summary,rows:approvedRows,audit:reviews};
  fs.writeFileSync(OUTPUT,JSON.stringify(payload,null,2)+'\n','utf8');console.log(JSON.stringify(summary));
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
