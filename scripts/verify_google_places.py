#!/usr/bin/env python3
import json, os, re, time, urllib.request, urllib.error
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CANDIDATE=ROOT/'data'/'area1_osm.js'
OUT=ROOT/'data'/'google_entities.generated.js'
API_KEY=os.environ.get('GOOGLE_MAPS_API_KEY')
CENTER_LAT=35.6959
CENTER_LNG=139.7576
MAX_DISTANCE_M=1200

def load_candidates():
    text=CANDIDATE.read_text(encoding='utf-8')
    rows=[]
    for line in text.splitlines():
        line=line.strip().rstrip(',')
        if line.startswith('{') and line.endswith('}'):
            try: rows.append(json.loads(line))
            except Exception: pass
    return rows

def request_json(url, body, field_mask):
    req=urllib.request.Request(url,data=json.dumps(body).encode(),headers={
        'Content-Type':'application/json','X-Goog-Api-Key':API_KEY,'X-Goog-FieldMask':field_mask,'User-Agent':'nekooweb-eat-google-verifier/1.0'})
    with urllib.request.urlopen(req,timeout=30) as r:
        return json.loads(r.read().decode())

def verify_one(r):
    query=' '.join(x for x in [r.get('name'),r.get('address'),'Tokyo Japan'] if x)
    body={'textQuery':query,'maxResultCount':5,'locationBias':{'circle':{'center':{'latitude':r['lat'],'longitude':r['lng']},'radius':300.0}}}
    data=request_json('https://places.googleapis.com/v1/places:searchText',body,
        'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.googleMapsUri,places.primaryType,places.types')
    places=data.get('places',[])
    if not places:return {'name':r['name'],'status':'rejected','reason':'no_google_place'}
    def score(p):
        n=(p.get('displayName') or {}).get('text','')
        s=0
        if r['name'] in n or n in r['name']:s+=5
        loc=p.get('location') or {}
        if abs(loc.get('latitude',0)-r['lat'])<0.003 and abs(loc.get('longitude',0)-r['lng'])<0.003:s+=3
        return s
    p=max(places,key=score)
    if score(p)<3:return {'name':r['name'],'status':'rejected','reason':'weak_google_match'}
    if p.get('businessStatus')=='CLOSED_PERMANENTLY':return {'name':r['name'],'status':'rejected','reason':'closed_permanently','googlePlaceId':p.get('id')}
    loc=p.get('location') or {}
    return {'name':r['name'],'status':'verified','address':p.get('formattedAddress') or r.get('address'),'googlePlaceId':p.get('id'),'googleMapsUrl':p.get('googleMapsUri'),'lat':loc.get('latitude',r['lat']),'lng':loc.get('longitude',r['lng']),'googleBusinessStatus':p.get('businessStatus'),'googlePrimaryType':p.get('primaryType')}

def js_quote(s):return json.dumps(s,ensure_ascii=False,separators=(',',':'))

def main():
    if not API_KEY:raise SystemExit('GOOGLE_MAPS_API_KEY is required')
    rows=load_candidates(); results=[]
    for i,r in enumerate(rows,1):
        try:results.append(verify_one(r))
        except urllib.error.HTTPError as e:
            if e.code in (429,500,502,503):time.sleep(2);results.append(verify_one(r))
            else:results.append({'name':r['name'],'status':'pending','reason':f'http_{e.code}'})
        except Exception as e:results.append({'name':r['name'],'status':'pending','reason':type(e).__name__})
        if i%25==0:time.sleep(0.2)
    payload=json.dumps(results,ensure_ascii=False,separators=(',',':'))
    OUT.write_text("(()=>{const rows="+payload+";const norm=s=>(s||'').replace(/[\\s　・’'\"\\-—_]+/g,'').toLowerCase();const m=new Map(rows.map(x=>[norm(x.name),x]));window.RESTAURANTS.forEach(r=>{const x=m.get(norm(r.name));if(!x)return;r.googleStatus=x.status;if(x.address)r.address=x.address;if(x.googlePlaceId)r.googlePlaceId=x.googlePlaceId;if(x.googleMapsUrl)r.googleMapsUrl=x.googleMapsUrl;if(Number.isFinite(x.lat))r.lat=x.lat;if(Number.isFinite(x.lng))r.lng=x.lng;if(x.reason)r.googleRejectReason=x.reason});window.GOOGLE_BATCH_STATS={verified:rows.filter(x=>x.status==='verified').length,rejected:rows.filter(x=>x.status==='rejected').length,pending:rows.filter(x=>x.status==='pending').length};})();\n",encoding='utf-8')
    print('verified',sum(x['status']=='verified' for x in results),'rejected',sum(x['status']=='rejected' for x in results),'pending',sum(x['status']=='pending' for x in results))
if __name__=='__main__':main()
