#!/usr/bin/env python3
import json, os, time, urllib.request, urllib.error
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CANDIDATE=ROOT/'data'/'area1_osm.js'
OUT=ROOT/'data'/'google_entities.generated.js'
CACHE=ROOT/'data'/'google_places_cache.json'
API_KEY=os.environ.get('GOOGLE_MAPS_API_KEY')
BATCH_LIMIT=int(os.environ.get('GOOGLE_VERIFY_LIMIT','0') or 0)
ENRICH=os.environ.get('GOOGLE_VERIFY_ENRICH','1')=='1'


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
        'X-Goog-FieldMask':mask,'User-Agent':'nekooweb-eat-google-verifier/2.1'})
    with urllib.request.urlopen(req,timeout=30) as r:return json.loads(r.read().decode())

def get_json(url,mask):
    req=urllib.request.Request(url,headers={'X-Goog-Api-Key':API_KEY,'X-Goog-FieldMask':mask,'User-Agent':'nekooweb-eat-google-verifier/2.1'})
    with urllib.request.urlopen(req,timeout=30) as r:return json.loads(r.read().decode())

def search_id(r):
    query=' '.join(x for x in [r.get('name'),r.get('address'),'Tokyo Japan'] if x)
    body={'textQuery':query,'maxResultCount':1,'locationBias':{'circle':{'center':{'latitude':r['lat'],'longitude':r['lng']},'radius':200.0}}}
    data=post_json('https://places.googleapis.com/v1/places:searchText',body,'places.id')
    p=(data.get('places') or [])
    return p[0].get('id') if p else None

def enrich(place_id,r):
    if not ENRICH:return {'name':r['name'],'status':'verified','googlePlaceId':place_id}
    p=get_json('https://places.googleapis.com/v1/places/'+place_id,
        'id,displayName,formattedAddress,location,businessStatus,googleMapsUri,primaryType')
    if p.get('businessStatus')=='CLOSED_PERMANENTLY':
        return {'name':r['name'],'status':'rejected','reason':'closed_permanently','googlePlaceId':place_id}
    loc=p.get('location') or {}
    return {'name':r['name'],'status':'verified','address':p.get('formattedAddress') or r.get('address'),
        'googlePlaceId':place_id,'googleMapsUrl':p.get('googleMapsUri'),
        'googleDisplayName':(p.get('displayName') or {}).get('text'),
        'lat':loc.get('latitude',r.get('lat')),'lng':loc.get('longitude',r.get('lng')),
        'googleBusinessStatus':p.get('businessStatus'),'googlePrimaryType':p.get('primaryType')}

def http_error_detail(e):
    try:
        raw=e.read().decode('utf-8','replace')[:1200]
        obj=json.loads(raw)
        return (obj.get('error') or {}).get('message') or raw
    except Exception:
        return str(e)

def main():
    if not API_KEY: raise SystemExit('GOOGLE_MAPS_API_KEY is required')
    rows=load_candidates();cache=load_cache();new_calls=0
    if BATCH_LIMIT>0: rows=rows[:BATCH_LIMIT]
    for i,r in enumerate(rows,1):
        key=r['id']
        old=cache.get(key)
        # Keep successful terminal results, but retry pending/error records.
        if old and old.get('status') in {'verified','rejected'}:
            continue
        try:
            pid=search_id(r);new_calls+=1
            if not pid:res={'name':r['name'],'status':'rejected','reason':'no_google_place'}
            else:res=enrich(pid,r);new_calls+=1 if ENRICH else 0
        except urllib.error.HTTPError as e:
            detail=http_error_detail(e)
            res={'name':r['name'],'status':'pending','reason':f'http_{e.code}','errorDetail':detail}
            print(f'HTTP {e.code} for {r["name"]}: {detail}')
            if e.code in (429,500,502,503):time.sleep(2)
        except Exception as e:
            res={'name':r['name'],'status':'pending','reason':type(e).__name__,'errorDetail':str(e)}
            print(f'ERROR for {r["name"]}: {type(e).__name__}: {e}')
        cache[key]=res
        if i%20==0:
            CACHE.write_text(json.dumps(cache,ensure_ascii=False,separators=(',',':')),encoding='utf-8');time.sleep(.15)
    CACHE.write_text(json.dumps(cache,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    all_results=list(cache.values())
    payload=json.dumps(all_results,ensure_ascii=False,separators=(',',':'))
    OUT.write_text("(()=>{const rows="+payload+";const norm=s=>(s||'').replace(/[\\s　・’'\"\\-—_]+/g,'').toLowerCase();const m=new Map(rows.map(x=>[norm(x.name),x]));window.RESTAURANTS.forEach(r=>{const x=m.get(norm(r.name));if(!x)return;r.googleStatus=x.status;if(x.address)r.address=x.address;if(x.googlePlaceId)r.googlePlaceId=x.googlePlaceId;if(x.googleMapsUrl)r.googleMapsUrl=x.googleMapsUrl;if(Number.isFinite(x.lat))r.lat=x.lat;if(Number.isFinite(x.lng))r.lng=x.lng;if(x.reason)r.googleRejectReason=x.reason});window.GOOGLE_BATCH_STATS={verified:rows.filter(x=>x.status==='verified').length,rejected:rows.filter(x=>x.status==='rejected').length,pending:rows.filter(x=>x.status==='pending').length};})();\n",encoding='utf-8')
    print('candidates',len(rows),'new_api_calls',new_calls,'verified',sum(x['status']=='verified' for x in all_results),'rejected',sum(x['status']=='rejected' for x in all_results),'pending',sum(x['status']=='pending' for x in all_results))

if __name__=='__main__':main()
