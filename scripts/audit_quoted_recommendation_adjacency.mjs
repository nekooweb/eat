#!/usr/bin/env node
import fs from 'node:fs';

const INPUT=process.argv[2];
const OUTPUT=process.argv[3]||'/tmp/quoted-recommendation-adjacency.json';
if(!INPUT) throw new Error('Usage: node audit_quoted_recommendation_adjacency.mjs <adjacency.json> [output.json]');
const doc=JSON.parse(fs.readFileSync(INPUT,'utf8'));
const STRONG=/名物|看板|自慢|一番人気|人気(?:No\.?1|NO\.?1|ナンバー1|メニュー|商品)?|イチオシ|一押し|おすすめ|オススメ|お勧め/iu;
const BAD=/おすすめ記事|おすすめスポット|ランキング|求人|採用|ニュース|お知らせ|ブログ|キャンペーン|フェア|ギフト|通販|オンライン|グッズ|アクセス|営業時間|予約|ドリンク|ワイン|ビール|日本酒|焼酎|サワー|カクテル/iu;
const QUOTED_PATTERNS=[/「([^」]{2,48})」/gu,/『([^』]{2,48})』/gu,/“([^”]{2,48})”/gu,/"([^"]{2,48})"/gu];
const TITLEISH=/^[^。！？!?]{2,60}$/u;
function clean(v){return String(v||'').replace(/\s+/g,' ').trim();}
function candidatesFrom(text){
  const out=[]; const seen=new Set(); const t=clean(text);
  for(const pattern of QUOTED_PATTERNS){
    pattern.lastIndex=0;
    for(const m of t.matchAll(pattern)){
      const c=clean(m[1]);
      if(!c||BAD.test(c)||/^(?:\d|.*(?:円|税込)|https?:|www\.)/iu.test(c)||seen.has(c)) continue;
      seen.add(c); out.push(c);
    }
  }
  return out;
}
function addTitleCandidate(out,position,text){
  const t=clean(text);
  if(!t||!TITLEISH.test(t)||BAD.test(t)) return;
  if(/^(おすすめ|オススメ|お勧め|名物|看板|自慢|一番人気|人気|メニュー|料理|商品|詳細|一覧)$/u.test(t)) return;
  if(!/[ぁ-んァ-ヶ一-龠々〆ヵヶA-Za-z]/u.test(t)) return;
  out.push({position,text:t});
}
const rows=[];
for(const page of doc.rows||[]){
  for(const n of page.neighborhoods||[]){
    const markerText=`${clean(n.marker)} ${clean(n.markerBlock)}`;
    if(!STRONG.test(markerText)||BAD.test(markerText)) continue;
    const local=[];
    const fields=[['before2',n.before2],['before1',n.before1],['marker',n.markerBlock],['after1',n.after1],['after2',n.after2],['title',n.title]];
    for(const [position,text] of fields){
      for(const quoted of candidatesFrom(text)) local.push({position,kind:'quoted',text:quoted});
    }
    if(!local.length){
      addTitleCandidate(local,'before1',n.before1);
      addTitleCandidate(local,'after1',n.after1);
    }
    if(!local.length) continue;
    const uniq=[]; const seen=new Set();
    for(const c of local){const key=`${c.position}|${c.text}`; if(seen.has(key)) continue; seen.add(key); uniq.push(c);}
    rows.push({googlePlaceId:page.googlePlaceId,name:page.name,url:page.url,marker:clean(n.marker),markerBlock:clean(n.markerBlock),candidates:uniq.slice(0,8)});
  }
}
rows.sort((a,b)=>a.googlePlaceId.localeCompare(b.googlePlaceId)||a.url.localeCompare(b.url));
const payload={schemaVersion:1,policy:{auditOnly:true,networkRequests:0,paidGoogleDataApiCalls:0,identityMutationAllowed:false,dishEvidenceMutationAllowed:false,automaticPromotionAllowed:false,requiresStrongRecommendationMarker:true,quotedOrImmediateTitleCandidateOnly:true},summary:{catalogTotal:2804,inputPages:(doc.rows||[]).length,candidateContexts:rows.length,candidateRestaurants:new Set(rows.map(r=>r.googlePlaceId)).size,quotedCandidates:rows.reduce((s,r)=>s+r.candidates.filter(c=>c.kind==='quoted').length,0)},rows};
fs.writeFileSync(OUTPUT,JSON.stringify(payload,null,2)+'\n','utf8');
console.log(JSON.stringify(payload.summary));
for(const r of rows.slice(0,120)) console.log(`QUOTE\t${r.googlePlaceId}\t${r.name}\t${r.marker}\t${r.candidates.map(c=>`${c.position}:${c.text}`).join(' || ')}\t${r.url}\t${r.markerBlock}`);
