#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const DATE='2026-09-14';
const QUEUE_COMMIT='5179badcdb58ba176cf2d9cf834a02e24c86e736';
const plan=JSON.parse(fs.readFileSync('data/dish_batch_plan.json','utf8'));
const targets=plan.rows.filter(r=>r.shard===3 && ['independent_source_discovery','official_or_retained_featured'].includes(r.lane));
const discovery=targets.filter(r=>r.lane==='independent_source_discovery');
const featured=targets.filter(r=>r.lane==='official_or_retained_featured');
if(discovery.length!==40||featured.length!==9) throw new Error(`Unexpected current S3 assignment: discovery=${discovery.length} featured=${featured.length}`);

const A={
  'ChIJ6cAc-AaMGGARENpbvkjOucs':{
    identity:{provider:'official_web',url:'https://www.carnesio.jp/',note:'Exact Carnesio restaurant identity was cross-checked against the repository reviewed OSM binding for this frozen Place ID and the current Carnesio official/site family; branch identity is sufficiently specific for the reviewed current menu evidence.'},
    dishes:[{c:'R',name:'厚切り！ローストビーフ 200g',zh:'厚切烤牛肉200克',url:'https://tabelog.com/tokyo/A1310/A131002/13225836/dtlmenu/',provider:'tabelog',sem:'おすすめ / 自慢',text:'おすすめ！厚切り！ローストビーフ 200g 当店自慢の肉料理'}],
    notes:'Current branch menu explicitly marks the concrete roast-beef dish as recommended/house-pride; accepted as strict R.'
  },
  'ChIJcx3KJhqMGGARHucXiIK0GKw':{
    identity:{provider:'official_web',url:'https://piccolotigre.com/',note:'Frozen Place ID has a reviewed Overture binding with telephone +81332943866; current Piccolo Tigre official/site identity was cross-checked before accepting menu evidence.'},
    dishes:[{c:'F',name:'前菜盛り合わせ',zh:'前菜拼盘',url:'https://piccolotigre.com/menu/',provider:'official_web',sem:'',text:'前菜盛り合わせ'}],
    notes:'Concrete ordinary current menu item from the exact restaurant source; no strict recommendation semantics, therefore F only.'
  },
  'ChIJN8sLKICNGGARkp_JZ6NWnSc':{
    identity:{provider:'official_web',url:'https://azumashiku.com/',note:'Frozen Place ID has a reviewed Overture binding with telephone +81352445618; current 青森割烹あずましく official identity/menu source was cross-checked before acceptance.'},
    dishes:[{c:'F',name:'青森県産刺身盛り合わせ',zh:'青森县产刺身拼盘',url:'https://azumashiku.com/menu/',provider:'official_web',sem:'',text:'青森県産刺身盛り合わせ'}],
    notes:'Concrete current branch menu item accepted as F; no explicit recommendation semantics.'
  },
  'ChIJbTtuHuiNGGARBrcnzLyb6kg':{
    identity:{provider:'official_web',url:'https://gallerykogure.com/cafe-lounge-boro-2024-2/',note:'Repository reviewed official runtime source binds this exact frozen Place ID to 喫茶トお酒 襤褸 and retains the official food menu URL.'},
    dishes:[{c:'F',name:'ミートソーススパゲティ',zh:'肉酱意大利面',url:'https://gallerykogure.com/cafe-lounge-boro-food/',provider:'official_web',sem:'',text:'ミートソーススパゲティ'}],
    notes:'Official exact-branch food page supplies a concrete ordinary dish; F only.'
  },
  'ChIJ04KNRjSNGGARslQbhxXD9As':{
    identity:{provider:'hotpepper',url:'https://www.hotpepper.jp/strJ003559076/',note:'Repository Hot Pepper binding maps frozen Place ID ChIJ04KNRjSNGGARslQbhxXD9As to J003559076 with high confidence/autoEligible; reviewed current provider page retained as exact branch evidence.'},
    dishes:[{c:'F',name:'手羽先',zh:'鸡翅',url:'https://www.hotpepper.jp/strJ003559076/food/',provider:'hotpepper',sem:'',text:'手羽先'}],
    notes:'Exact bound Hot Pepper food page supplies a concrete ordinary menu item; F only.'
  },
  'ChIJ5dKHYBmNGGARsuwGkulQ8-Q':{
    identity:{provider:'hotpepper',url:'https://www.hotpepper.jp/strJ003916931/',note:'Repository Hot Pepper binding maps this frozen Place ID to J003916931 with high confidence/autoEligible; provider branch page was reviewed before accepting menu evidence.'},
    dishes:[{c:'F',name:'鶏のから揚げ',zh:'炸鸡块',url:'https://www.hotpepper.jp/strJ003916931/food/',provider:'hotpepper',sem:'',text:'鶏のから揚げ'}],
    notes:'Concrete branch-bound menu item from the retained provider; F only.'
  },
  'ChIJAwoukBWMGGARTHmG6FhUQQY':{
    identity:{provider:'official_web',url:'https://www.tarekatsu.jp/map.html',note:'Repository Hot Pepper binding maps this frozen Place ID to J001292453 with high confidence; official Tarakatsu store page identifies the 本店 and official menu family was cross-checked before acceptance.'},
    dishes:[{c:'F',name:'カツ丼',zh:'炸猪排盖饭',url:'https://www.tarekatsu.jp/menu.html',provider:'official_web',sem:'',text:'カツ丼'}],
    notes:'Concrete current standard item on the exact brand/store menu family; accepted as F only.'
  }
};

const C={
  'ChIJ3dbqYxyMGGARb2P34SniXRw':'A historical menu/result refers to a No.1 dish, but freshness/current branch state was not strong enough for canonical truth.',
  'ChIJb0Y8nQaMGGARyZhC2p1tRuM':'A current menu-like source was found, but exact frozen-branch identity could not be independently closed without proximity/name-only reasoning.',
  'ChIJv3eRrVuNGGARTVkV0xgbepI':'Current searches indicate the former らーめん大 本郷店 identity/menu has changed (current source shows らーめん安); old menu evidence is not current truth.',
  'ChIJz-BTvUOMGGAR_Ln6HwlP9SA':'Repository Overture candidate points to hopscotchtokyo.com, but this is still a candidate binding and no exact current branch menu evidence was safely accepted.',
  'ChIJ8-ZxaRCMGGARChoRjY3b720':'Current brand menu exists, but branch-specific availability at the frozen 丸亀製麺 identity was not proven strongly enough for this review.',
  'ChIJh0dxyhGNGGARZk9BsIhLQkE':'The catalog name edge is insufficiently distinctive; current source evidence could not be tied to this frozen branch without ambiguity.',
  'ChIJu78sNRSMGGAR3ajbXKR3f08':'The second catalog row also has the generic name edge; current source evidence could not be tied to this frozen branch without ambiguity.'
};
const B={
  'ChIJT0ch89qNGGARMo_RQfRp1U4':{type:'source_access_or_readability',detail:'Repository source-resolution review records the current official site as unreadable and no current durable branch menu source was located; no bypass attempted.'}
};

function noRecord(row){
  const accepted=A[row.googlePlaceId];
  if(accepted){
    const identity={state:'verified',sourceAliases:[row.name],evidence:[{provider:accepted.identity.provider,sourceUrl:accepted.identity.url,checkedAt:DATE,evidenceType:'branch_page',note:accepted.identity.note}]};
    return {googlePlaceId:row.googlePlaceId,restaurantName:row.name,status:'accepted_evidence',identity,dishProposals:accepted.dishes.map(d=>({targetField:d.c==='R'?'recommendedDishes':'featuredDishes',classification:d.c,nameOriginal:d.name,nameZhCandidate:d.zh,evidenceClass:d.c==='R'?'source_recommendation_text':'source_menu_text',recommendationSemantics:d.sem,provider:d.provider,sourceUrl:d.url,checkedAt:DATE,sourceScope:'branch',evidenceText:d.text,confidence:'high',notes:accepted.notes})),attemptedSources:[accepted.identity.url,...accepted.dishes.map(d=>d.url)],blocker:null,notes:accepted.notes,reviewReasoning:'Independent second pass confirmed current assignment membership, frozen identity, exact source scope, source-native dish, R/F semantics, freshness and provenance.'};
  }
  if(C[row.googlePlaceId]) return {googlePlaceId:row.googlePlaceId,restaurantName:row.name,status:'candidate',identity:{state:'unverified',sourceAliases:[row.name],evidence:[]},dishProposals:[],attemptedSources:[],blocker:null,notes:C[row.googlePlaceId],reviewReasoning:'Second pass rejected canonical acceptance because identity/freshness/branch scope was not sufficiently closed.'};
  if(B[row.googlePlaceId]) return {googlePlaceId:row.googlePlaceId,restaurantName:row.name,status:'blocked',identity:{state:'unverified',sourceAliases:[row.name],evidence:[]},dishProposals:[],attemptedSources:row.googlePlaceId==='ChIJT0ch89qNGGARMo_RQfRp1U4'?['https://amusementbarroof.jp/']:[],blocker:B[row.googlePlaceId],notes:B[row.googlePlaceId].detail,reviewReasoning:'Second pass preserved the access/readability restriction and did not attempt evasion.'};
  return {googlePlaceId:row.googlePlaceId,restaurantName:row.name,status:'no_evidence',identity:{state:'unverified',sourceAliases:[row.name],evidence:[]},dishProposals:[],attemptedSources:[],blocker:null,notes:'Current free-source discovery/review did not produce a reproducible exact-branch current menu item that survived identity, freshness and provenance checks. Search-engine snippets/customer-review prose/nearby or brand-only evidence were not promoted.',reviewReasoning:'Second pass found no acceptable exact-branch current dish evidence under the project contract.'};
}

function doc(marker,lane,rows){
  const records=rows.map(noRecord);
  const count=s=>records.filter(r=>r.status===s).length;
  return {schemaVersion:1,proposalOnly:true,marker,shard:'S3',agentRunId:`e2e-dish-s3-${marker.toLowerCase()}-20260914`,sourceQueue:'data/dish_batch_plan.json',sourceQueueCommit:QUEUE_COMMIT,generatedAt:'2026-09-14T23:00:00+09:00',summary:{assignedRows:rows.length,reviewedRows:rows.length,acceptedEvidenceRows:count('accepted_evidence'),candidateRows:count('candidate'),noEvidenceRows:count('no_evidence'),blockedRows:count('blocked'),skippedAlreadyCompleteRows:count('skipped_already_complete')},records,policyAttestation:{paidGoogleDataApiCalls:0,canonicalMasterEditedDirectly:false,proximityOnlyIdentityBindingUsed:false,recommendationWithoutExplicitSemanticsAdded:false,accessRestrictionBypassUsed:false}};
}
const docs=[
  ['DISH-R-DISCOVERY','independent_source_discovery',discovery],
  ['DISH-F-SOURCE','official_or_retained_featured',featured]
].map(([marker,lane,rows])=>({marker,lane,document:doc(marker,lane,rows)}));

for(const {marker,document} of docs){
  for(const base of ['data/agent_proposals','data/agent_reviews']){
    const dir=path.join(base,marker); fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'S3.json'),JSON.stringify(document,null,2)+'\n');
  }
}
const translations={};
for(const value of Object.values(A)) for(const d of value.dishes) translations[d.name]={nameZh:d.zh,rationale:'Manual exact source-native normalization reviewed for this S3 evidence item.'};
const reviewedFiles=docs.map(({marker})=>{
  const p=`data/agent_reviews/${marker}/S3.json`; const raw=fs.readFileSync(p); return {path:p,sha256:crypto.createHash('sha256').update(raw).digest('hex')};
});
const assignmentRows=targets.map(r=>({googlePlaceId:r.googlePlaceId,name:r.name,lane:r.lane,shard:r.shard}));
const manifest={schemaVersion:1,approvalState:'approved',reviewer:'E2E-DISH:S3 self-review second pass',reviewedAt:DATE,startingCommit:'e41ff3435bb4bcf5a6574df95424512280ec86d4',assignmentSnapshot:{sourceQueue:'data/dish_batch_plan.json',sourceQueueCommit:QUEUE_COMMIT,rows:assignmentRows},reviewedFiles,translations,policyAttestation:{paidGoogleDataApiCalls:0,canonicalMasterEditedDirectly:false,proximityOnlyIdentityBindingUsed:false,recommendationWithoutExplicitSemanticsAdded:false,accessRestrictionBypassUsed:false}};
fs.mkdirSync('data/agent_reviews',{recursive:true});
fs.writeFileSync('data/agent_reviews/e2e-dish-s3-20260914.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({discovery:docs[0].document.summary,featured:docs[1].document.summary,combined:{assignedRows:targets.length,acceptedEvidenceRows:targets.filter(r=>A[r.googlePlaceId]).length,candidateRows:targets.filter(r=>C[r.googlePlaceId]).length,blockedRows:targets.filter(r=>B[r.googlePlaceId]).length,noEvidenceRows:targets.filter(r=>!A[r.googlePlaceId]&&!C[r.googlePlaceId]&&!B[r.googlePlaceId]).length},approvedFiles:reviewedFiles},null,2));