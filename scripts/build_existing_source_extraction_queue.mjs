#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';

function loadJs(path) {
  const sandbox={window:{},console};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path,'utf8'),sandbox,{filename:path});
  return sandbox.window;
}

const production=loadJs('data/production_area1.js').PRODUCTION_RESTAURANTS||[];
const provenancePayload=loadJs('data/source_provenance.js').SOURCE_PROVENANCE||{rows:[]};
const provenanceById=new Map((provenancePayload.rows||[]).map((row)=>[row.googlePlaceId,row]));
const OUT='data/existing_source_extraction_queue.json';

const isPrice=(value)=>Array.isArray(value)&&value.length===2&&value.every(Number.isFinite)&&value[0]<=value[1];
const hasAddress=(row)=>Boolean(String(row.address||'').trim());
const hasCuisine=(row)=>Boolean(row.cuisine&&row.cuisine!=='餐厅');
const hasHours=(row)=>Boolean(row.openingHours?.days);
const hasFeatured=(row)=>Array.isArray(row.featuredDishes)&&row.featuredDishes.length>0;
const hasRecommended=(row)=>Array.isArray(row.recommendedDishes)&&row.recommendedDishes.length>0;

function hostname(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./,''); }
  catch { return null; }
}

function missingFields(row) {
  const fields=[];
  if(!hasAddress(row)) fields.push('address');
  if(!hasCuisine(row)) fields.push('cuisine');
  if(!isPrice(row.lunch)) fields.push('lunchBudget');
  if(!isPrice(row.dinner)) fields.push('dinnerBudget');
  if(!hasHours(row)) fields.push('openingHours');
  if(!hasFeatured(row)) fields.push('featuredDishes');
  if(!hasRecommended(row)) fields.push('strictRecommendations');
  return fields;
}

const FIELD_WEIGHT={
  lunchBudget:100,
  openingHours:75,
  address:65,
  dinnerBudget:55,
  cuisine:45,
  featuredDishes:30,
  strictRecommendations:10
};
const PROVIDER_WEIGHT={official:35,Tabelog:25,'Hot Pepper':20};

const rows=[];
for(const row of production){
  const prov=provenanceById.get(row.googlePlaceId);
  const refs=prov?.sourceLinks||[];
  const missing=missingFields(row);
  if(!missing.length||!refs.length) continue;
  const usableRefs=[];
  const seen=new Set();
  for(const ref of refs){
    if(!ref?.url||!/^https:\/\//.test(ref.url)) continue;
    const domain=hostname(ref.url);
    if(!domain) continue;
    const key=`${ref.provider}|${ref.url}`;
    if(seen.has(key)) continue;
    seen.add(key);
    usableRefs.push({
      provider:ref.provider||'unknown',
      url:ref.url,
      domain,
      claimedFields:Array.isArray(ref.fields)?ref.fields:[],
      checkedAt:ref.checkedAt||null
    });
  }
  if(!usableRefs.length) continue;
  const priorityScore=missing.reduce((sum,field)=>sum+(FIELD_WEIGHT[field]||0),0)
    + Math.max(...usableRefs.map((ref)=>PROVIDER_WEIGHT[ref.provider]||0));
  rows.push({
    googlePlaceId:row.googlePlaceId,
    name:row.name,
    identityAdmission:row.identityAdmission||null,
    missingFields:missing,
    priorityScore,
    sourceRefs:usableRefs
  });
}

rows.sort((a,b)=>b.priorityScore-a.priorityScore||a.name.localeCompare(b.name,'ja'));

const groupMap=new Map();
for(const row of rows){
  for(const ref of row.sourceRefs){
    const key=`${ref.provider}|${ref.domain}`;
    if(!groupMap.has(key)) groupMap.set(key,{
      provider:ref.provider,
      domain:ref.domain,
      restaurantIds:new Set(),
      urls:new Set(),
      fieldRestaurantIds:new Map(),
      totalPriority:0
    });
    const group=groupMap.get(key);
    group.restaurantIds.add(row.googlePlaceId);
    group.urls.add(ref.url);
    group.totalPriority+=row.priorityScore;
    for(const field of row.missingFields){
      if(!group.fieldRestaurantIds.has(field)) group.fieldRestaurantIds.set(field,new Set());
      group.fieldRestaurantIds.get(field).add(row.googlePlaceId);
    }
  }
}

const groups=[...groupMap.values()].map((group)=>({
  provider:group.provider,
  domain:group.domain,
  restaurants:group.restaurantIds.size,
  urls:group.urls.size,
  fieldGaps:Object.fromEntries([...group.fieldRestaurantIds.entries()]
    .map(([field,ids])=>[field,ids.size])
    .sort((a,b)=>(FIELD_WEIGHT[b[0]]||0)-(FIELD_WEIGHT[a[0]]||0))),
  yieldScore:group.totalPriority,
  sampleUrls:[...group.urls].slice(0,5)
})).sort((a,b)=>
  b.restaurants-a.restaurants
  || (b.fieldGaps.lunchBudget||0)-(a.fieldGaps.lunchBudget||0)
  || b.yieldScore-a.yieldScore
  || a.domain.localeCompare(b.domain)
);

const fieldTotals={};
for(const field of Object.keys(FIELD_WEIGHT)) fieldTotals[field]=rows.filter((row)=>row.missingFields.includes(field)).length;
const providerCounts={};
for(const row of rows){
  const providers=new Set(row.sourceRefs.map((ref)=>ref.provider));
  for(const provider of providers) providerCounts[provider]=(providerCounts[provider]||0)+1;
}

const payload={
  schemaVersion:1,
  checkedAt:new Date().toISOString().slice(0,10),
  summary:{
    productionEntities:production.length,
    rowsWithExistingSourceAndRemainingGaps:rows.length,
    fieldGapRows:fieldTotals,
    providerReach:providerCounts,
    domainGroups:groups.length,
    topDomainGroups:groups.slice(0,25)
  },
  policy:{
    exactExistingSourceUrlsOnly:true,
    sourceExtractionBeforeBroadDiscovery:true,
    groupedByProviderAndDomain:true,
    noExternalRequests:true,
    searchSnippetsAreNotDurableEvidence:true,
    pricesStillRequireExplicitOrReviewedEvidence:true
  },
  groups,
  rows
};
fs.writeFileSync(OUT,`${JSON.stringify(payload,null,2)}\n`,'utf8');
console.log(JSON.stringify(payload.summary));
