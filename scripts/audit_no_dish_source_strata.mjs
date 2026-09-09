#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(ROOT, '_audit', 'no_dish_source_strata.json');

function loadWindowFile(filename) {
  const sandbox={window:{},console};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA,filename),'utf8'),sandbox,{filename});
  return sandbox.window;
}

function kind(url) {
  const value=String(url||'');
  if (/\.pdf(?:$|[?#])/i.test(value)) return 'pdf';
  if (/\.(?:jpe?g|png|gif|webp|avif|svg)(?:$|[?#])/i.test(value)) return 'image';
  return 'html';
}

const runtimeWindow=loadWindowFile('google_inventory_runtime.js');
const runtime=runtimeWindow.GOOGLE_INVENTORY_RESTAURANTS||[];
const stats=runtimeWindow.GOOGLE_INVENTORY_STATS||{};
if(stats.catalogTotal!==2804||runtime.length+Number(stats.unpublishedPlaceIdOnly||0)!==2804) throw new Error('frozen catalog contract mismatch');
const noDish=runtime.filter(r=>!(r.recommendedDishes||[]).length&&!(r.featuredDishes||[]).length);
const official=JSON.parse(fs.readFileSync(path.join(DATA,'reviewed_official_runtime_sources.json'),'utf8'));
const officialById=new Map((official.rows||[]).map(r=>[r.googlePlaceId,r]));
const hp=JSON.parse(fs.readFileSync(path.join(DATA,'hotpepper_catalog_facts.json'),'utf8'));
const hpById=new Map((hp.rows||[]).map(r=>[r.googlePlaceId,r]));
const queue=JSON.parse(fs.readFileSync(path.join(DATA,'google_inventory_detail_queue.json'),'utf8'));
const queueById=new Map((queue.rows||[]).map(r=>[r.googlePlaceId,r]));

const rows=[];
const counts={
  noDish:noDish.length,
  reviewedOfficial:0,
  reviewedOfficialWithMenuUrl:0,
  reviewedOfficialHtmlMenu:0,
  reviewedOfficialPdfMenu:0,
  reviewedOfficialImageMenu:0,
  exactHotPepper:0,
  crawlableOfficial:0,
  retainedThirdPartyOnly:0,
  independentSourceNeeded:0,
  noKnownSourceUrl:0
};
for(const r of noDish){
  const o=officialById.get(r.googlePlaceId);
  const q=queueById.get(r.googlePlaceId)||{};
  const hpRow=hpById.get(r.googlePlaceId);
  const menuUrls=(o?.menuUrls||[]).filter(Boolean);
  const menuKinds=[...new Set(menuUrls.map(kind))];
  if(o){
    counts.reviewedOfficial++;
    if(menuUrls.length) counts.reviewedOfficialWithMenuUrl++;
    if(menuKinds.includes('html')) counts.reviewedOfficialHtmlMenu++;
    if(menuKinds.includes('pdf')) counts.reviewedOfficialPdfMenu++;
    if(menuKinds.includes('image')) counts.reviewedOfficialImageMenu++;
  }
  if(hpRow) counts.exactHotPepper++;
  if(Number(q.crawlableOfficialUrlCount||0)>0) counts.crawlableOfficial++;
  if(Number(q.retainedThirdPartyUrlCount||0)>0&&Number(q.crawlableOfficialUrlCount||0)===0) counts.retainedThirdPartyOnly++;
  if(q.nextAction==='find_independent_dish_source') counts.independentSourceNeeded++;
  if(Number(q.sourceUrlCount||0)===0) counts.noKnownSourceUrl++;
  rows.push({
    googlePlaceId:r.googlePlaceId,
    name:r.name,
    cuisine:r.cuisine,
    nextAction:q.nextAction||null,
    sourceUrlCount:Number(q.sourceUrlCount||0),
    crawlableOfficialUrlCount:Number(q.crawlableOfficialUrlCount||0),
    retainedThirdPartyUrlCount:Number(q.retainedThirdPartyUrlCount||0),
    reviewedOfficial:Boolean(o),
    officialMenuUrls:menuUrls,
    officialMenuKinds:menuKinds,
    exactHotPepper:Boolean(hpRow)
  });
}
rows.sort((a,b)=>a.nextAction?.localeCompare(b.nextAction||'')||b.officialMenuUrls.length-a.officialMenuUrls.length||a.name.localeCompare(b.name,'ja'));
const payload={
  schemaVersion:1,
  checkedAt:new Date().toISOString().slice(0,10),
  policy:{catalogTotal:2804,networkRequests:0,paidGoogleDataApiCalls:0,identityMutationAllowed:false,evidenceMutationAllowed:false},
  summary:counts,
  rows
};
fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
fs.writeFileSync(OUTPUT,JSON.stringify(payload,null,2)+'\n','utf8');
console.log(JSON.stringify(counts));
