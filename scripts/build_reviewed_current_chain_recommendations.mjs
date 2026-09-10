#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { assertRuntimeCatalogContract } from './runtime_catalog_contract.mjs';

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
const YOSHINOYA=[
  'ChIJGwjljhWMGGARjLafECSEbqA',
  'ChIJ38dCzRqMGGAR9Awruuaqr_A'
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
  },
  {
    googlePlaceId:'ChIJVaTZmWqMGGARH0x_mvWNJuc',
    id:'gusto-current-big-chicken-katsu-recommendation',
    hostSuffix:'skylark.co.jp',
    sourceUrl:'https://www.skylark.co.jp/gusto/',
    dishes:[
      {nameJa:'黒酢タルタルのビッグチキンカツ定食',nameZh:'黑醋塔塔酱大份鸡排套餐'}
    ],
    evidenceSnippet:'2026/07/16 おすすめメニュー：ガスト食堂。黒酢タルタルのビッグチキンカツ定食など、食欲そそるボリューム満点メニュー。',
    evidenceBasis:'official current Gusto page labels the section おすすめメニュー and names the concrete dish in the recommendation copy'
  },
  {
    googlePlaceId:'ChIJJ_D4jRmMGGARMpn_E26qUCA',
    id:'ringerhut-2026-natsukara-champon',
    hostSuffix:'ringerhut.jp',
    sourceUrl:'https://www.ringerhut.jp/menu/seasonal/natsukara_cp_2026/',
    dishes:[
      {nameJa:'夏辛ちゃんぽん',nameZh:'夏辣长崎什锦面'}
    ],
    evidenceSnippet:'夏辛ちゃんぽん。唐辛子と花椒オイルの辛味が溶けだしたとんこつスープ。辛党必食の一杯。',
    evidenceBasis:'official current seasonal product page explicitly calls 夏辛ちゃんぽん a 辛党必食の一杯'
  },
  ...YOSHINOYA.map((googlePlaceId)=>({
    googlePlaceId,
    id:`yoshinoya-current-recommended-menu-${googlePlaceId.slice(-6)}`,
    hostSuffix:'yoshinoya.com',
    sourceUrl:'https://www.yoshinoya.com/menu/',
    dishes:[
      {nameJa:'月見牛とじ御膳',nameZh:'月见牛肉滑蛋御膳'},
      {nameJa:'極旨牛鉄板ステーキ定食',nameZh:'极旨铁板牛排套餐'}
    ],
    evidenceSnippet:'おすすめメニュー RECOMMENDED：月見牛とじ御膳/月見牛とじ丼、極旨牛鉄板ステーキ定食',
    evidenceBasis:'official current Yoshinoya menu page explicitly lists these concrete dishes under おすすめメニュー / RECOMMENDED'
  }))
];

function loadWindowFile(filename){const sandbox={window:{},console};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(DATA,filename),'utf8'),sandbox,{filename});return sandbox.window;}
function hostOf(value){try{return new URL(String(value||'').trim()).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}}
function hostMatches(host,suffix){return host===suffix||host.endsWith(`.${suffix}`);}
const runtime=loadWindowFile('google_inventory_runtime.js');
const {rows:runtimeRows,stats}=assertRuntimeCatalogContract(runtime);
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
const skippedAlreadyRecommended=[];
for(const rule of RULES){
  const row=runtimeById.get(rule.googlePlaceId);
  if(!row) throw new Error(`Target missing runtime: ${rule.googlePlaceId}`);
  const hosts=boundHosts(rule.googlePlaceId,row);
  if(![...hosts].some(h=>hostMatches(h,rule.hostSuffix))) throw new Error(`Official chain domain not bound to target: ${rule.googlePlaceId}; bound=${[...hosts].join(',')}`);
  if(!hostMatches(hostOf(rule.sourceUrl),rule.hostSuffix)) throw new Error(`Source URL domain mismatch: ${rule.id}`);
  if(!rule.evidenceSnippet||!rule.evidenceBasis||!rule.dishes?.length||rule.dishes.length>2) throw new Error(`Invalid rule: ${rule.id}`);
  if(Array.isArray(row.recommendedDishes)&&row.recommendedDishes.length){
    skippedAlreadyRecommended.push({googlePlaceId:rule.googlePlaceId,id:rule.id,name:row.name});
    continue;
  }
  rows.push({googlePlaceId:rule.googlePlaceId,name:row.name,recommendedDishes:rule.dishes.map(d=>({nameZh:d.nameZh,nameJa:d.nameJa,provider:'sourceWebsite',sourceUrl:rule.sourceUrl,checkedAt:CHECKED_AT,evidenceClass:'source_recommendation_text',evidenceRule:`reviewed-current-chain:${rule.id}`,evidenceSnippet:rule.evidenceSnippet.slice(0,90)})),featuredDishes:[]});
}
const payload={schemaVersion:3,checkedAt:CHECKED_AT,policy:{source:'current official chain pages whose domain is already bound to each target identity',networkRequests:0,paidGoogleDataApiCalls:0,catalogIdentityKey:'frozen Place ID only',publicRuntimeCountPolicy:'dynamic; validate runtime stats and public+unpublished catalog reconciliation instead of a fixed named-row count',toolIdentityNameSource:'runtime_catalog_name',identityMutationAllowed:false,sourceDomainMustAlreadyBeBoundToIdentity:true,currentOfficialRecommendationHeadingOrPairingRequired:true,chainWideApplicationAllowedOnlyForCurrentChainMenuOrCampaign:true,genericCuisinePromotionAllowed:false,automaticPromotionAllowed:false,alreadyRecommendedTargetsSkipped:true,outputOnlyCurrentRecommendationGaps:true},summary:{catalogTotal:Number(stats.catalogTotal),publicRuntimeTotal:runtimeRows.length,reviewedRules:RULES.length,skippedAlreadyRecommendedRules:skippedAlreadyRecommended.length,recommendationRestaurants:rows.length,recommendationItems:rows.reduce((s,r)=>s+r.recommendedDishes.length,0)},skippedAlreadyRecommended,rows};
fs.mkdirSync(path.dirname(path.resolve(OUTPUT)),{recursive:true});fs.writeFileSync(OUTPUT,JSON.stringify(payload,null,2)+'\n','utf8');
console.log(JSON.stringify(payload.summary));for(const row of rows)console.log(JSON.stringify({googlePlaceId:row.googlePlaceId,name:row.name,dishes:row.recommendedDishes.map(d=>d.nameZh)}));
