#!/usr/bin/env python3
import json, os, time, urllib.request, urllib.error, math, re
from difflib import SequenceMatcher
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CANDIDATE=ROOT/'data'/'area1_osm.js'
OUT=ROOT/'data'/'google_entities.generated.js'
CACHE=ROOT/'data'/'google_places_cache.json'
API_KEY=os.environ.get('GOOGLE_MAPS_API_KEY')
BATCH_LIMIT=int(os.environ.get('GOOGLE_VERIFY_LIMIT','0') or 0)
ENRICH=os.environ.get('GOOGLE_VERIFY_ENRICH','1')=='1'
CENTER=(35.6959,139.7576)
MAX_CENTER_DISTANCE=1200
MAX_MATCH_DISTANCE=300
QC_VERSION=2
ALLOWED_TYPES={
    'restaurant','cafe','coffee_shop','bakery','meal_takeaway','meal_delivery',
    'fast_food_restaurant','food_court','bar','pub','dessert_shop','ice_cream_shop',
    'ramen_restaurant','japanese_restaurant','chinese_restaurant','korean_restaurant',
    'thai_restaurant','indian_restaurant','italian_restaurant','french_restaurant',
    'pizza_restaurant','hamburger_restaurant','seafood_restaurant','sushi_restaurant',
    'steak_house','barbecue_restaurant'
}

def load_candidates():
    rows=[]
    for line in CANDIDATE.read_text(encoding='utf-8').splitlines():
        line=line.strip().rstrip(',')
        if line.startswith('{') and line.endswith('}'):
            try: rows.append(json.loads(line))
            except Exception: pass
    return rows

def load_cache():
    if not CACHE.exists(): return {}
    try:return json.loads(CACHE.read_text(encoding='utf-8'))
    except Exception:return {}

def post_json(url,body,mask):
    req=urllib.request.Request(url,data=json.dumps(body).encode(),headers={
        'Content-Type':'application/json','X-Goog-Api-Key':API_KEY,
        'X-Goog-FieldMask':mask,'User-Agent':'nekooweb-eat-google-verifier/3.0'})
    with urllib.request.urlopen(req,timeout=30) as r:return json.loads(r.read().decode())

def get_json(url,mask):
    req=urllib.request.Request(url,headers={'X-Goog-Api-Key':API_KEY,'X-Goog-FieldMask':mask,'User-Agent':'nekooweb-eat-google-verifier/3.0'})
    with urllib.request.urlopen(req,timeout=30) as r:return json.loads(r.read().decode())

def norm_name(s):
    s=(s or '').lower()
    s=re.sub(r'[\s　・･\-—_\(\)（）\[\]【】「」『』\'"&＆]+','',s)
    return s

def name_score(a,b):
    a,b=norm_name(a),norm_name(b)
    if not a or not b:return 0.0
    if a in b or b in a:return 1.0
    return SequenceMatcher(None,a,b).ratio()

def haversine(lat1,lng1,lat2,lng2):
    r=6371000
    p1,p2=math.radians(lat1),math.radians(lat2)
    dp=math.radians(lat2-lat1);dl=math.radians(lng2-lng1)
    x=math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return r*2*math.atan2(math.sqrt(x),math.sqrt(1-x))

def search_id(r):
    query=' '.join(x for x in [r.get('name'),r.get('address'),'Tokyo Japan'] if x)
    body={'textQuery':query,'maxResultCount':1,'locationBias':{'circle':{'center':{'latitude':r['lat'],'longitude':r['lng']},'radius':200.0}}}
    data=post_json('https://places.googleapis.com/v1/places:searchText',body,'places.id')
    p=(data.get('places') or [])
    return p[0].get('id') if p else None

def enrich_and_qc(place_id,r):
    if not ENRICH:return {'name':r['name'],'status':'pending','reason':'enrichment_required_for_qc','googlePlaceId':place_id,'qcVersion':QC_VERSION}
    p=get_json('https://places.googleapis.com/v1/places/'+place_id,
        'id,displayName,formattedAddress,location,businessStatus,googleMapsUri,primaryType,types')
    gname=(p.get('displayName') or {}).get('text','')
    loc=p.get('location') or {}
    lat,lng=loc.get('latitude'),loc.get('longitude')
    ptype=p.get('primaryType')
    if p.get('businessStatus')=='CLOSED_PERMANENTLY':
        return {'name':r['name'],'status':'rejected','reason':'closed_permanently','googlePlaceId':place_id,'qcVersion':QC_VERSION}
    if lat is None or lng is None:
        return {'name':r['name'],'status':'rejected','reason':'missing_google_location','googlePlaceId':place_id,'qcVersion':QC_VERSION}
    center_d=haversine(CENTER[0],CENTER[1],lat,lng)
    match_d=haversine(r['lat'],r['lng'],lat,lng)
    nscore=name_score(r['name'],gname)
    types=set(p.get('types') or [])
    food_type=ptype in ALLOWED_TYPES or bool(types & ALLOWED_TYPES)
    if center_d>MAX_CENTER_DISTANCE+25:
        return {'name':r['name'],'status':'rejected','reason':'outside_1_2km','googlePlaceId':place_id,'qcVersion':QC_VERSION,'googleDistanceMeters':round(center_d)}
    if match_d>MAX_MATCH_DISTANCE:
        return {'name':r['name'],'status':'rejected','reason':'location_mismatch','googlePlaceId':place_id,'qcVersion':QC_VERSION,'matchDistanceMeters':round(match_d)}
    if nscore<0.45:
        return {'name':r['name'],'status':'rejected','reason':'name_mismatch','googlePlaceId':place_id,'qcVersion':QC_VERSION,'googleDisplayName':gname,'nameScore':round(nscore,3)}
    if not food_type:
        return {'name':r['name'],'status':'rejected','reason':'non_food_google_type','googlePlaceId':place_id,'qcVersion':QC_VERSION,'googlePrimaryType':ptype}
    return {'name':r['name'],'status':'verified','address':p.get('formattedAddress') or r.get('address'),
        'googlePlaceId':place_id,'googleMapsUrl':p.get('googleMapsUri'),'googleDisplayName':gname,
        'lat':lat,'lng':lng,'googleBusinessStatus':p.get('businessStatus'),'googlePrimaryType':ptype,
        'googleTypes':list(types),'nameScore':round(nscore,3),'matchDistanceMeters':round(match_d),
        'googleDistanceMeters':round(center_d),'qcVersion':QC_VERSION}

def http_error_detail(e):
    try:
        raw=e.read().decode('utf-8','replace')[:1200];obj=json.loads(raw)
        return (obj.get('error') or {}).get('message') or raw
    except Exception:return str(e)

def main():
    if not API_KEY: raise SystemExit('GOOGLE_MAPS_API_KEY is required')
    rows=load_candidates();cache=load_cache();new_calls=0
    if BATCH_LIMIT>0: rows=rows[:BATCH_LIMIT]
    for i,r in enumerate(rows,1):
        key=r['id'];old=cache.get(key)
        # Re-run old terminal records if they predate current QC rules.
        if old and old.get('status') in {'verified','rejected'} and old.get('qcVersion')==QC_VERSION:continue
        try:
            pid=old.get('googlePlaceId') if old and old.get('googlePlaceId') else search_id(r)
            if not (old and old.get('googlePlaceId')):new_calls+=1
            if not pid:res={'name':r['name'],'status':'rejected','reason':'no_google_place','qcVersion':QC_VERSION}
            else:
                res=enrich_and_qc(pid,r);new_calls+=1 if ENRICH else 0
        except urllib.error.HTTPError as e:
            detail=http_error_detail(e);res={'name':r['name'],'status':'pending','reason':f'http_{e.code}','errorDetail':detail}
            print(f'HTTP {e.code} for {r["name"]}: {detail}')
            if e.code in (429,500,502,503):time.sleep(2)
        except Exception as e:
            res={'name':r['name'],'status':'pending','reason':type(e).__name__,'errorDetail':str(e)}
            print(f'ERROR for {r["name"]}: {type(e).__name__}: {e}')
        cache[key]=res
        if i%20==0:
            CACHE.write_text(json.dumps(cache,ensure_ascii=False,separators=(',',':')),encoding='utf-8');time.sleep(.15)
    CACHE.write_text(json.dumps(cache,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    all_results=list(cache.values());payload=json.dumps(all_results,ensure_ascii=False,separators=(',',':'))
    OUT.write_text("(()=>{const rows="+payload+";const norm=s=>(s||'').replace(/[\\s　・’'\"\\-—_]+/g,'').toLowerCase();const m=new Map(rows.map(x=>[norm(x.name),x]));window.RESTAURANTS.forEach(r=>{const x=m.get(norm(r.name));if(!x)return;r.googleStatus=x.status;if(x.address)r.address=x.address;if(x.googlePlaceId)r.googlePlaceId=x.googlePlaceId;if(x.googleMapsUrl)r.googleMapsUrl=x.googleMapsUrl;if(Number.isFinite(x.lat))r.lat=x.lat;if(Number.isFinite(x.lng))r.lng=x.lng;if(x.reason)r.googleRejectReason=x.reason;r.googleQcVersion=x.qcVersion||null});window.GOOGLE_BATCH_STATS={verified:rows.filter(x=>x.status==='verified').length,rejected:rows.filter(x=>x.status==='rejected').length,pending:rows.filter(x=>x.status==='pending').length};})();\n",encoding='utf-8')
    print('candidates',len(rows),'new_api_calls',new_calls,'verified',sum(x['status']=='verified' for x in all_results),'rejected',sum(x['status']=='rejected' for x in all_results),'pending',sum(x['status']=='pending' for x in all_results))

if __name__=='__main__':main()
