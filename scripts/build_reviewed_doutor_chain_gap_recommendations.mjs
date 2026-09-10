#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { assertRuntimeCatalogContract } from './runtime_catalog_contract.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..');
const DATA=path.join(ROOT,'data');
const OUTPUT=process.argv[2]||'/tmp/reviewed-doutor-chain-gap-recommendations.json';
const CHECKED_AT='2026-09-10';
const SOURCE_URL='https://www.doutor.co.jp/dcs/menu/season.html';
const HOST_SUFFIX='doutor.co.jp';
const DISHES=[
  {nameJa:'ピーチ＆マンゴー ルイボス',nameZh:'桃芒果路易波士茶'},
  {nameJa:'ライチレモネードソーダ',nameZh:'荔枝柠檬汽水'}
];
const EVIDENCE='季節のおすすめ：ピーチ＆マンゴー ルイボス／ライチレモネードソーダ';

function loadWindowFile(filename){const sandbox={window:{},console};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(DATA,filename),'utf8'),sandbox,{filename});return sandbox.window;}
function hostOf(value){try{return new URL(String(value||'').trim()).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}}
function hostMatches(host,suffix){return host===suffix||host.endsWith(`.${suffix}`);}
function isDoutorName(name){return /^(?:ドトールコーヒーショップ|DOUTOR\b|Doutor\b)/u.test(String(name||'').trim());}

const runtime=loadWindowFile('google_inventory_runtime.js');
const {rows,stats}=assertRuntimeCatalogContract(runtime);
const official=JSON.parse(fs.readFileSync(path.join(DATA,'reviewed_official_runtime_sources.json'),'utf8'));
const officialById=new Map((official.rows||[]).map(row=>[row.googlePlaceId,row]));
const provenance=loadWindowFile('source_provenance.js').SOURCE_PROVENANCE||{rows:[]};
const provenanceById=new Map((provenance.rows||[]).map(row=>[row.googlePlaceId,row]));

function boundToOfficialDoutor(row){
  const reviewed=officialById.get(row.googlePlaceId);
  const reviewedUrls=[reviewed?.pageUrl,...(reviewed?.menuUrls||[]),...(reviewed?.sourceWebsites||[])].filter(Boolean);
  if(reviewedUrls.some(url=>hostMatches(hostOf(url),HOST_SUFFIX))) return true;
  return (provenanceById.get(row.googlePlaceId)?.sourceLinks||[]).some(link=>String(link?.provider||'').toLowerCase()==='official'&&hostMatches(hostOf(link?.url),HOST_SUFFIX));
}

const targets=rows.filter(row=>
  isDoutorName(row.name)
  && (!Array.isArray(row.recommendedDishes)||row.recommendedDishes.length===0)
  && boundToOfficialDoutor(row)
);
const outputRows=targets.map(row=>({
  googlePlaceId:row.googlePlaceId,
  name:row.name,
  recommendedDishes:DISHES.map(dish=>({
    ...dish,
    provider:'sourceWebsite',
    sourceUrl:SOURCE_URL,
    checkedAt:CHECKED_AT,
    evidenceClass:'source_recommendation_text',
    evidenceRule:'reviewed-doutor-current-season-chain-gap',
    evidenceSnippet:EVIDENCE
  })),
  featuredDishes:[]
})).sort((a,b)=>a.googlePlaceId.localeCompare(b.googlePlaceId));

const payload={
  schemaVersion:2,
  checkedAt:CHECKED_AT,
  policy:{
    source:'current official DOUTOR seasonal recommendation menu',
    networkRequests:0,
    paidGoogleDataApiCalls:0,
    catalogIdentityKey:'frozen Place ID only',
    publicRuntimeCountPolicy:'dynamic; validate runtime stats and public+unpublished catalog reconciliation instead of a fixed named-row count',
    toolIdentityNameSource:'runtime_catalog_name',
    identityMutationAllowed:false,
    targetNameMustBeDoutor:true,
    reviewedOfficialDoutorDomainRequired:true,
    existingStrictRecommendationMustBeAbsent:true,
    currentOfficialRecommendationSectionRequired:true,
    genericCuisinePromotionAllowed:false,
    automaticCrossBrandPromotionAllowed:false
  },
  summary:{
    catalogTotal:Number(stats.catalogTotal),
    publicRuntimeTotal:rows.length,
    doutorRuntimeRows:rows.filter(row=>isDoutorName(row.name)).length,
    reviewedOfficialDoutorRows:rows.filter(row=>isDoutorName(row.name)&&boundToOfficialDoutor(row)).length,
    alreadyRecommendedDoutorRows:rows.filter(row=>isDoutorName(row.name)&&Array.isArray(row.recommendedDishes)&&row.recommendedDishes.length>0).length,
    recommendationGapRestaurants:outputRows.length,
    recommendationItems:outputRows.reduce((sum,row)=>sum+row.recommendedDishes.length,0)
  },
  rows:outputRows
};
fs.mkdirSync(path.dirname(path.resolve(OUTPUT)),{recursive:true});
fs.writeFileSync(OUTPUT,JSON.stringify(payload,null,2)+'\n','utf8');
console.log(JSON.stringify(payload.summary));
for(const row of outputRows)console.log(JSON.stringify({googlePlaceId:row.googlePlaceId,name:row.name,dishes:row.recommendedDishes.map(x=>x.nameZh)}));
