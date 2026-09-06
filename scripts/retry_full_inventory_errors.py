#!/usr/bin/env python3
import concurrent.futures
import json
import math
import os
import re
import time
import urllib.error
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
QUEUE=ROOT/'data'/'area1_full_collection_queue.json'
OSM=ROOT/'data'/'area1_osm.js'
AUDIT=ROOT/'_audit'
API_KEY=os.environ.get('GOOGLE_MAP_API') or os.environ.get('GOOGLE_MAPS_API_KEY')
CONCURRENCY=int(os.environ.get('FULL_RETRY_CONCURRENCY','6'))
MAX_WAVES=int(os.environ.get('FULL_RETRY_WAVES','3'))
DETAIL_MASK='id,displayName,formattedAddress,location,businessStatus,primaryType,types'
CHECKED_AT=os.environ.get('FULL_COLLECTION_CHECKED_AT','2026-09-06')
ALLOWED={'restaurant','cafe','coffee_shop','bakery','meal_takeaway','meal_delivery','fast_food_restaurant','food_court','bar','pub','dessert_shop','ice_cream_shop','confectionery','tea_house','ramen_restaurant','noodle_shop','japanese_restaurant','japanese_curry_restaurant','japanese_izakaya_restaurant','tonkatsu_restaurant','yakitori_restaurant','yakiniku_restaurant','chinese_restaurant','chinese_noodle_restaurant','korean_restaurant','thai_restaurant','indian_restaurant','italian_restaurant','french_restaurant','pizza_restaurant','hamburger_restaurant','seafood_restaurant','sushi_restaurant','steak_house','barbecue_restaurant'}

def norm(v):
    v=(v or '').lower(); v=re.sub(r'株式会社|有限会社|合同会社|東京|tokyo|店$','',v)
    return re.sub(r'[\s\u3000・･\-—_()（）\[\]【】「」『』\'"&＆.,/]+','',v)
def score(a,b):
    a,b=norm(a),norm(b)
    if not a or not b:return 0.0
    if a==b:return 1.0
    if min(len(a),len(b))>=4 and (a in b or b in a):return 0.96
    return SequenceMatcher(None,a,b).ratio()
def hav(a,b,c,d):
    r=6371000;p1=math.radians(a);p2=math.radians(c);x=math.sin(math.radians(c-a)/2)**2+math.cos(p1)*math.cos(p2)*math.sin(math.radians(d-b)/2)**2
    return r*2*math.atan2(math.sqrt(x),math.sqrt(1-x))
def load_osm():
    out=[]
    for line in OSM.read_text(encoding='utf-8').splitlines():
        t=line.strip().rstrip(',')
        if t.startswith('{') and t.endswith('}'):
            try:
                r=json.loads(t)
                if r.get('id') and r.get('name') and isinstance(r.get('lat'),(int,float)) and isinstance(r.get('lng'),(int,float)):out.append(r)
            except:pass
    return out
def fetch(pid):
    req=urllib.request.Request('https://places.googleapis.com/v1/places/'+pid,headers={'X-Goog-Api-Key':API_KEY,'X-Goog-FieldMask':DETAIL_MASK,'User-Agent':'nekooweb-eat-full-retry/1.0'})
    try:
        with urllib.request.urlopen(req,timeout=25) as res:
            d=json.loads(res.read().decode());d['_placeId']=pid;return d
    except Exception as e:return {'_placeId':pid,'_error':str(e)}
def classify(d):
    if d.get('_error'):return 'fetch_error'
    if d.get('businessStatus')=='CLOSED_PERMANENTLY':return 'closed_permanently'
    p=d.get('primaryType');ts=set(d.get('types') or [])
    if p not in ALLOWED and not(ts&ALLOWED):return 'non_food_type'
    l=d.get('location') or {}
    if l.get('latitude') is None or l.get('longitude') is None:return 'missing_location'
    return 'operational_food'
def match(d,osm):
    l=d.get('location') or {};lat=l.get('latitude');lng=l.get('longitude');name=(d.get('displayName') or {}).get('text','')
    if lat is None or lng is None or not name:return None
    c=[]
    for r in osm:
        dist=hav(lat,lng,r['lat'],r['lng'])
        if dist>350:continue
        s=score(name,r.get('name'))
        if s<0.34 and dist>40:continue
        comb=s*.72+max(0,1-dist/350)*.28;c.append((comb,s,dist,r))
    c.sort(key=lambda x:(-x[0],x[2],-x[1]))
    if not c:return {'matchConfidence':'none'}
    best=c[0];second=c[1][0] if len(c)>1 else None;margin=1 if second is None else best[0]-second
    conf='high' if best[1]>=.92 and best[2]<=60 and margin>=.05 else 'medium' if best[1]>=.78 and best[2]<=120 and margin>=.025 else 'review' if best[1]>=.60 and best[2]<=180 else 'low'
    r=best[3]
    return {'matchConfidence':conf,'candidate':{'sourceCandidateId':r['id'],'sourceName':r.get('name'),'cuisine':r.get('cuisine'),'address':r.get('address') or '','lat':r['lat'],'lng':r['lng'],'distanceMeters':round(best[2]),'nameSimilarity':round(best[1],3)}}

def main():
    if not API_KEY:raise SystemExit('Google API key required')
    AUDIT.mkdir(exist_ok=True)
    q=json.loads(QUEUE.read_text(encoding='utf-8'));rows={r['googlePlaceId']:r for r in q['rows']};osm=load_osm();private=[]
    initial=[pid for pid,r in rows.items() if r.get('googleStatus')=='fetch_error']
    if len(initial)>500:raise SystemExit(f'retry set too large: {len(initial)}')
    pending=initial[:]
    wave_stats=[]
    for wave in range(1,MAX_WAVES+1):
        if not pending:break
        print(f'retry_wave={wave} targets={len(pending)}')
        results=[]
        with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
            for d in pool.map(fetch,pending):results.append(d)
        private.extend(results)
        next_pending=[];success=0
        for d in results:
            pid=d['_placeId'];status=classify(d)
            entry={'googlePlaceId':pid,'googleStatus':status,'checkedAt':CHECKED_AT}
            if status=='operational_food':entry.update(match(d,osm) or {})
            rows[pid]=entry
            if status=='fetch_error':next_pending.append(pid)
            else:success+=1
        wave_stats.append({'wave':wave,'requested':len(pending),'resolved':success,'remaining':len(next_pending)})
        pending=next_pending
        if pending:time.sleep(4*wave)
    q['rows']=[rows[pid] for pid in sorted(rows)]
    sc={};cc={}
    for r in q['rows']:
        s=r.get('googleStatus');sc[s]=sc.get(s,0)+1
        if s=='operational_food':
            c=r.get('matchConfidence','none');cc[c]=cc.get(c,0)+1
    q['summary']={'googleStatusCounts':sc,'candidateConfidenceCounts':cc,'osmIndependentRowsAvailable':len(osm),'retryWaves':wave_stats}
    QUEUE.write_text(json.dumps(q,ensure_ascii=False,indent=2),encoding='utf-8')
    (AUDIT/'full_inventory_retry_private.json').write_text(json.dumps({'checkedAt':CHECKED_AT,'fieldMask':DETAIL_MASK,'rows':private},ensure_ascii=False),encoding='utf-8')
    print(json.dumps(q['summary'],ensure_ascii=False))
if __name__=='__main__':main()
