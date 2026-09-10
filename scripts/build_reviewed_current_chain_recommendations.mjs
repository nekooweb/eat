#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..');
const DATA=path.join(ROOT,'data');
const OUTPUT=process.argv[2]||'/tmp/reviewed-current-chain-recommendations.json';
const CHECKED_AT='2026-09-10';

const TULLYS_SOURCE='https://www.tullys.co.jp/company/pressrelease/2026/08/newsletter0826.html';
const TULLYS_SNIPPET='秋スイーツとコーヒーのおいしい関係。彩りOIMOドーナツ × フレンチローストをおすすめの組み合わせとして紹介。';
const TULLYS=[
  ['ChIJCRf6uziMGGARPOpXUziKe7s','Tullys Coffee'],
  ['ChIJdaJiORONGGARDd15rhczE28',"Tully's Coffee"],
  ['ChIJH8GYiROMGGARAjxscGAOoIA','タリーズコーヒー 神保町店'],
  ['ChIJHc25sgSMGGARAqITOEMtNxk','タリーズコーヒー 淡路町靖国通り店'],
  ['ChIJM1B1zgWMGGAR04DJYO1QtR0','タリーズコーヒー 神田橋本郷通り店'],
  ['ChIJqxsi-ECMGGAR9MgoPJ4JWHw','タリーズコーヒー 飯田橋ガーデンエアタワー店'],
  ['ChIJV6X7zcWNGGARyT1xchJ9ukA',"Tully's Coffee"]
];
const RULES=[
  ...TULLYS.map(([googlePlaceId])=>({
    googlePlaceId,
    id:`tullys-oimo-frenchroast-${googlePlaceId.slice(-6)}`,
    hostSuffix:'tullys.co.jp',
    sourceUrl:TULLYS_SOURCE,
    dishes:[{nameJa:'彩りOIMOドーナツ × フレンチロースト',nameZh:'红薯甜甜圈配法式烘焙咖啡'}],
    evidenceSnippet:TULLYS_SNIPPET,
    evidenceBasis:'official current 2026 seasonal newsletter explicitly presents this as an おすすめの組み合わせ'
  })),
  {
    googlePlaceId:'ChIJJ9zW1BqMGGARfIp-qxuT1pg',
    id:'doutor-current-season-recommendations',
    hostSuffix:'doutor.co.jp',
    sourceUrl:'https://www.doutor.co.jp/dcs/menu/season.html',
    dishes:[
      {nameJa:'ピーチ＆マンゴー ルイボス',nameZh:'桃芒果路易波士茶'},
      {nameJa:'ライチレモネードソーダ',nameZh:'荔枝柠檬汽水'}
    ],
    evidenceSnippet:'季節のおすすめ：ピーチ＆マンゴー ルイボス／ライチレモネードソーダ',
    evidenceBasis:'official current menu section explicitly titled 季節のおすすめ'
  },
  {
    googlePlaceId:'ChIJ7wAjrBuMGGARHOWStkoMVCI',
    id:'newyorkers-current-season-cakes',
    hostSuffix:'ginza-renoir.co.jp',
    sourceUrl:'https://www.ginza-renoir.co.jp/newyorkers/season_recommend/',
    dishes:[
      {nameJa:'コーヒー香るチョコとヘーゼルナッツ',nameZh:'咖啡香巧克力榛子蛋糕'},
      {nameJa:'バニラ香るキャラメルとアーモンドのズコット',nameZh:'香草焦糖杏仁祖科托蛋糕'}
    ],
    evidenceSnippet:'季節限定おすすめケーキ：コーヒー香るチョコとヘーゼルナッツ／バニラ香るキャラメルとアーモンドのズコット',
    evidenceBasis:'official current page explicitly titled 季節限定おすすめケーキ'
  }
];

function loadWindowFile(filename){const sandbox={window:{},console};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(DATA,filename),'utf8'),sandbox,{filename});return sandbox.window;}
function hostOf(value){try{return new URL(String(value||'').trim()).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}}
function hostMatches(host,suffix){return host===suffix||host.endsWith(`.${suffix}`);}
const runtime=loadWindowFile('google_inventory_runtime.js');
const runtimeRows=runtime.GOOGLE_INVENTORY_RESTAURANTS||[];
const stats=runtime.GOOGLE_INVENTORY_STATS||{};
if(stats.catalogTotal!==2804||runtimeRows.length!==1422) throw new Error('Unexpected public runtime baseline');
const runtimeById=new Map(runtimeRows.map(r=>[r.googlePlaceId,r]));
const provenance=loadWindowFile('source_provenance.js').SOURCE_PROVENANCE||{rows:[]};
const provById=new Map((provenance.rows||[]).map(r=>[r.googlePlaceId,r]));
const official=JSON.parse(fs.readFileSync(path.join(DATA,'reviewed_official_runtime_sources.json'),'utf8'));
const officialById=new Map((official.rows||[]).map(r=>[r.googlePlaceId,r]));

function boundHosts(pid,row){
  const hosts=new Set();
  for(const raw of row.sourceWebsites||[]){const h=hostOf(raw);if(h)hosts.add(h);}
  for(const link of provById.get(pid)?.sourceLinks||[]){const h=hostOf(link?.url);if(h)hosts.add(h);}
  const o=officialById.get(pid);for(const raw of [o?.pageUrl,...(o?.menuUrls||[])]){const h=hostOf(raw);if(h)hosts.add(h);}
  return hosts;
}
const rows=[];
for(const rule of RULES){
  const row=runtimeById.get(rule.googlePlaceId);
  if(!row) throw new Error(`Target missing runtime: ${rule.googlePlaceId}`);
  if(Array.isArray(row.recommendedDishes)&&row.recommendedDishes.length) throw new Error(`Target already recommended: ${rule.googlePlaceId}`);
  const hosts=boundHosts(rule.googlePlaceId,row);
  if(![...hosts].some(h=>hostMatches(h,rule.hostSuffix))) throw new Error(`Official chain domain not bound to target: ${rule.googlePlaceId}; bound=${[...hosts].join(',')}`);
  if(!hostMatches(hostOf(rule.sourceUrl),rule.hostSuffix)) throw new Error(`Source URL domain mismatch: ${rule.id}`);
  if(!rule.evidenceSnippet||!rule.evidenceBasis||!rule.dishes?.length||rule.dishes.length>2) throw new Error(`Invalid rule: ${rule.id}`);
  rows.push({googlePlaceId:rule.googlePlaceId,name:row.name,recommendedDishes:rule.dishes.map(d=>({nameZh:d.nameZh,nameJa:d.nameJa,provider:'sourceWebsite',sourceUrl:rule.sourceUrl,checkedAt:CHECKED_AT,evidenceClass:'source_recommendation_text',evidenceRule:`reviewed-current-chain:${rule.id}`,evidenceSnippet:rule.evidenceSnippet.slice(0,90)})),featuredDishes:[]});
}
const payload={schemaVersion:1,checkedAt:CHECKED_AT,policy:{source:'current official chain pages whose domain is already bound to each target identity',networkRequests:0,paidGoogleDataApiCalls:0,catalogIdentityKey:'frozen Place ID only',toolIdentityNameSource:'runtime_catalog_name',identityMutationAllowed:false,sourceDomainMustAlreadyBeBoundToIdentity:true,currentOfficialRecommendationHeadingOrPairingRequired:true,chainWideApplicationAllowedOnlyForCurrentChainMenuOrCampaign:true,genericCuisinePromotionAllowed:false,automaticPromotionAllowed:false},summary:{catalogTotal:2804,publicRuntimeTotal:runtimeRows.length,reviewedRules:RULES.length,recommendationRestaurants:rows.length,recommendationItems:rows.reduce((s,r)=>s+r.recommendedDishes.length,0)},rows};
fs.mkdirSync(path.dirname(path.resolve(OUTPUT)),{recursive:true});fs.writeFileSync(OUTPUT,JSON.stringify(payload,null,2)+'\n','utf8');
console.log(JSON.stringify(payload.summary));for(const row of rows)console.log(JSON.stringify({googlePlaceId:row.googlePlaceId,name:row.name,dishes:row.recommendedDishes.map(d=>d.nameZh)}));
