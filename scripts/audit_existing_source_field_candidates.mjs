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
const factsPayload=loadJs('data/source_facts.js').SOURCE_FACTS||{rows:[]};
const provenancePayload=loadJs('data/source_provenance.js').SOURCE_PROVENANCE||{rows:[]};
const factsById=new Map((factsPayload.rows||[]).map((row)=>[row.googlePlaceId,row.sourceFacts||[]]));
const provenanceById=new Map((provenancePayload.rows||[]).map((row)=>[row.googlePlaceId,row]));

const isPrice=(value)=>Array.isArray(value)&&value.length===2&&value.every(Number.isFinite)&&value[0]<=value[1];
const hasCuisine=(row)=>Boolean(row.cuisine&&row.cuisine!=='餐厅');
const hasAddress=(row)=>Boolean(String(row.address||'').trim());
const hasHours=(row)=>Boolean(row.openingHours?.days);
const hasFeatured=(row)=>Array.isArray(row.featuredDishes)&&row.featuredDishes.length>0;

const candidateRows=[];
const fieldCounts={address:0,cuisine:0,lunchBudget:0,dinnerBudget:0,openingHoursRaw:0,dishes:0,sourceEvidence:0};
const providerFieldCounts={};

function addProviderField(provider,field){
  if(!providerFieldCounts[provider]) providerFieldCounts[provider]={};
  providerFieldCounts[provider][field]=(providerFieldCounts[provider][field]||0)+1;
}

for(const row of production){
  const facts=factsById.get(row.googlePlaceId)||[];
  const prov=provenanceById.get(row.googlePlaceId)||null;
  const available=[];
  for(const fact of facts){
    const provider=fact.provider||'unknown';
    if(!hasAddress(row)&&String(fact.address||'').trim()) {
      available.push({field:'address',provider,value:fact.address,claimedFields:fact.claimedFields||[]});
      fieldCounts.address+=1; addProviderField(provider,'address');
    }
    if(!hasCuisine(row)&&fact.cuisine&&fact.cuisine!=='餐厅') {
      available.push({field:'cuisine',provider,value:fact.cuisine,claimedFields:fact.claimedFields||[]});
      fieldCounts.cuisine+=1; addProviderField(provider,'cuisine');
    }
    if(!isPrice(row.lunch)&&isPrice(fact.lunch)) {
      available.push({field:'lunchBudget',provider,value:fact.lunch,claimedFields:fact.claimedFields||[]});
      fieldCounts.lunchBudget+=1; addProviderField(provider,'lunchBudget');
    }
    if(!isPrice(row.dinner)&&isPrice(fact.dinner)) {
      available.push({field:'dinnerBudget',provider,value:fact.dinner,claimedFields:fact.claimedFields||[]});
      fieldCounts.dinnerBudget+=1; addProviderField(provider,'dinnerBudget');
    }
    if(!hasHours(row)&&String(fact.openingHoursRaw||'').trim()) {
      available.push({field:'openingHoursRaw',provider,value:fact.openingHoursRaw,closedDays:fact.closedDays||[],closedNote:fact.closedNote||null,claimedFields:fact.claimedFields||[]});
      fieldCounts.openingHoursRaw+=1; addProviderField(provider,'openingHoursRaw');
    }
    if(!hasFeatured(row)&&Array.isArray(fact.dishes)&&fact.dishes.length) {
      available.push({field:'dishes',provider,value:fact.dishes,claimedFields:fact.claimedFields||[]});
      fieldCounts.dishes+=1; addProviderField(provider,'dishes');
    }
  }
  if(!(prov?.sourceLinks?.length)&&facts.length){
    available.push({field:'sourceEvidence',provider:null,value:facts.map((fact)=>fact.provider)});
    fieldCounts.sourceEvidence+=1;
  }
  if(available.length){
    const uniqueFields=[...new Set(available.map((item)=>item.field))];
    candidateRows.push({
      googlePlaceId:row.googlePlaceId,
      name:row.name,
      identityAdmission:row.identityAdmission||null,
      missing:{
        address:!hasAddress(row),
        cuisine:!hasCuisine(row),
        lunchBudget:!isPrice(row.lunch),
        dinnerBudget:!isPrice(row.dinner),
        openingHours:!hasHours(row),
        featuredDishes:!hasFeatured(row),
        publicSourceEvidence:!(prov?.sourceLinks?.length)
      },
      candidateFields:uniqueFields,
      facts:available
    });
  }
}

const rowsByField={};
for(const field of Object.keys(fieldCounts)) rowsByField[field]=candidateRows.filter((row)=>row.candidateFields.includes(field)).length;

console.log(JSON.stringify({
  production:production.length,
  rowsWithAnyExistingSourceCandidate:candidateRows.length,
  rowsByField,
  rawFactCandidateOccurrences:fieldCounts,
  providerFieldCounts,
  policy:{
    auditOnly:true,
    noExternalRequests:true,
    storedFactDoesNotAutomaticallyEqualCanonicalClaim:true,
    pricesStillRequireExplicitProvenance:true,
    dishesStillRequireFeaturedOrRecommendationReview:true
  },
  rows:candidateRows
},null,2));
