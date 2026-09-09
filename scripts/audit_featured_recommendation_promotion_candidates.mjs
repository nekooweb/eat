#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { RECOMMENDATION_MARKER } from './recommended_dish_extractor.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..');
const DATA=path.join(ROOT,'data');
const OUTPUT=process.argv[2]||'/tmp/featured-recommendation-promotion-candidates.json';

function loadWindowFile(filename){
  const sandbox={window:{},console}; vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA,filename),'utf8'),sandbox,{filename});
  return sandbox.window;
}
function clean(value){return String(value||'').replace(/\s+/g,' ').trim();}
function normalize(value){return clean(value).normalize('NFKC').toLowerCase();}
function markerIndex(text){
  RECOMMENDATION_MARKER.lastIndex=0;
  const match=RECOMMENDATION_MARKER.exec(text);
  return match?{index:match.index,text:match[0]}:null;
}
function nearestDistance(text, dish){
  const hay=normalize(text); const needle=normalize(dish);
  if(!needle) return null;
  const dishPos=hay.indexOf(needle);
  if(dishPos<0) return null;
  const marker=markerIndex(text);
  if(!marker) return null;
  return Math.abs(dishPos-marker.index);
}

const runtime=loadWindowFile('google_inventory_runtime.js');
const runtimeRows=runtime.GOOGLE_INVENTORY_RESTAURANTS||[];
const stats=runtime.GOOGLE_INVENTORY_STATS||{};
if(stats.catalogTotal!==2804||runtimeRows.length!==1422) throw new Error('Unexpected runtime baseline');
const gaps=new Map(runtimeRows
  .filter(row=>!Array.isArray(row.recommendedDishes)||row.recommendedDishes.length===0)
  .map(row=>[row.googlePlaceId,row]));
const evidence=JSON.parse(fs.readFileSync(path.join(DATA,'google_inventory_detail_evidence.json'),'utf8'));
const rows=[];
let featuredScanned=0, withMarker=0, withSourceDishInSnippet=0;
const classCounts={}, providerCounts={};

for(const evidenceRow of evidence.rows||[]){
  const runtimeRow=gaps.get(evidenceRow.googlePlaceId);
  if(!runtimeRow) continue;
  for(const item of evidenceRow.featuredDishes||[]){
    featuredScanned+=1;
    const snippet=clean(item.evidenceSnippet);
    const marker=markerIndex(snippet);
    if(!marker) continue;
    withMarker+=1;
    const sourceDish=clean(item.nameJa||item.nameOriginal);
    const distance=nearestDistance(snippet,sourceDish);
    if(distance==null||distance>45) continue;
    withSourceDishInSnippet+=1;
    const candidate={
      googlePlaceId:evidenceRow.googlePlaceId,
      name:runtimeRow.name,
      nameZh:item.nameZh,
      nameJa:sourceDish,
      provider:item.provider,
      sourceUrl:item.sourceUrl,
      checkedAt:item.checkedAt,
      evidenceClass:item.evidenceClass,
      evidenceRule:item.evidenceRule,
      marker:marker.text,
      markerDishDistance:distance,
      evidenceSnippet:snippet
    };
    rows.push(candidate);
    classCounts[item.evidenceClass||'unspecified']=(classCounts[item.evidenceClass||'unspecified']||0)+1;
    providerCounts[item.provider||'unknown']=(providerCounts[item.provider||'unknown']||0)+1;
  }
}

rows.sort((a,b)=>a.markerDishDistance-b.markerDishDistance||a.googlePlaceId.localeCompare(b.googlePlaceId));
const payload={
  schemaVersion:1,
  policy:{
    auditOnly:true,
    networkRequests:0,
    paidGoogleDataApiCalls:0,
    identityMutationAllowed:false,
    dishEvidenceMutationAllowed:false,
    recommendationGapOnly:true,
    recommendationMarkerRequiredInSameRetainedSnippet:true,
    sourceNativeDishNameRequiredInSameSnippet:true,
    maxMarkerDishDistance:45,
    automaticPromotionAllowed:false
  },
  summary:{
    catalogTotal:2804,
    publicRuntimeTotal:runtimeRows.length,
    recommendationGapRows:gaps.size,
    featuredItemsScanned:featuredScanned,
    featuredItemsWithRecommendationMarker:withMarker,
    featuredItemsWithMarkerAndSourceDishInSnippet:withSourceDishInSnippet,
    candidateItems:rows.length,
    candidateRestaurants:new Set(rows.map(row=>row.googlePlaceId)).size,
    classCounts,
    providerCounts
  },
  rows
};
fs.mkdirSync(path.dirname(path.resolve(OUTPUT)),{recursive:true});
fs.writeFileSync(OUTPUT,JSON.stringify(payload,null,2)+'\n','utf8');
console.log(JSON.stringify(payload.summary));
for(const row of rows.slice(0,160)) console.log(`PROMOTE\t${row.googlePlaceId}\t${row.name}\t${row.nameZh}\t${row.provider}\t${row.evidenceClass}\td=${row.markerDishDistance}\t${row.evidenceSnippet}`);
