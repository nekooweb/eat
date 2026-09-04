#!/usr/bin/env python3
import json, math, os, time, urllib.request, urllib.error
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT_JSON=ROOT/'data'/'area1_google_places.json'
OUT_JS=ROOT/'data'/'area1_google.js'
API_KEY=os.environ.get('GOOGLE_MAPS_API_KEY')
CENTER_LAT=35.6959
CENTER_LNG=139.7576
AREA_RADIUS_M=1200
CELL_RADIUS_M=320
GRID_STEP_M=430

# Google is authoritative for production identity. These searches are deliberately
# split across food-related types because Nearby Search returns at most 20 results.
SEARCH_TYPES=[
    'restaurant','cafe','bakery','meal_takeaway','dessert_shop','ice_cream_shop',
    'ramen_restaurant','japanese_restaurant','chinese_restaurant','korean_restaurant',
    'thai_restaurant','indian_restaurant','italian_restaurant','french_restaurant',
    'pizza_restaurant','hamburger_restaurant','seafood_restaurant','sushi_restaurant',
    'steak_house','barbecue_restaurant'
]

CUISINE_BY_TYPE={
    'ramen_restaurant':'拉面','japanese_restaurant':'日式','chinese_restaurant':'中华',
    'korean_restaurant':'韩国菜','thai_restaurant':'泰国菜','indian_restaurant':'印度菜',
    'italian_restaurant':'意大利菜','french_restaurant':'法餐','pizza_restaurant':'披萨',
    'hamburger_restaurant':'汉堡','seafood_restaurant':'海鲜','sushi_restaurant':'寿司',
    'steak_house':'牛排','barbecue_restaurant':'烧烤','cafe':'咖啡','coffee_shop':'咖啡',
    'bakery':'面包・烘焙','dessert_shop':'甜品','ice_cream_shop':'甜品',
    'meal_takeaway':'快餐','restaurant':'餐厅'
}

def haversine(lat1,lng1,lat2,lng2):
    r=6371000
    p1,p2=math.radians(lat1),math.radians(lat2)
    dp=math.radians(lat2-lat1);dl=math.radians(lng2-lng1)
    x=math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return r*2*math.atan2(math.sqrt(x),math.sqrt(1-x))

def offset_point(north_m,east_m):
    lat=CENTER_LAT+north_m/111320.0
    lng=CENTER_LNG+east_m/(111320.0*math.cos(math.radians(CENTER_LAT)))
    return lat,lng

def grid_points():
    pts=[]
    lim=AREA_RADIUS_M+CELL_RADIUS_M
    x=-lim
    while x<=lim:
        y=-lim
        while y<=lim:
            if math.hypot(x,y)<=AREA_RADIUS_M+CELL_RADIUS_M:
                pts.append(offset_point(y,x))
            y+=GRID_STEP_M
        x+=GRID_STEP_M
    return pts

def post_nearby(lat,lng,ptype):
    body={
        'includedTypes':[ptype],
        'maxResultCount':20,
        'rankPreference':'DISTANCE',
        'locationRestriction':{'circle':{'center':{'latitude':lat,'longitude':lng},'radius':CELL_RADIUS_M}}
    }
    req=urllib.request.Request(
        'https://places.googleapis.com/v1/places:searchNearby',
        data=json.dumps(body).encode(),
        headers={
            'Content-Type':'application/json',
            'X-Goog-Api-Key':API_KEY,
            'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.googleMapsUri,places.primaryType,places.types',
            'User-Agent':'nekooweb-eat-google-discovery/1.0'
        })
    with urllib.request.urlopen(req,timeout=30) as r:
        return json.loads(r.read().decode()).get('places',[])

def cuisine(place):
    p=place.get('primaryType')
    if p in CUISINE_BY_TYPE:return CUISINE_BY_TYPE[p]
    for t in place.get('types') or []:
        if t in CUISINE_BY_TYPE:return CUISINE_BY_TYPE[t]
    return '餐厅'

def main():
    if not API_KEY:raise SystemExit('GOOGLE_MAPS_API_KEY is required')
    found={};calls=0;errors=0
    points=grid_points()
    for lat,lng in points:
        for ptype in SEARCH_TYPES:
            try:
                places=post_nearby(lat,lng,ptype);calls+=1
            except urllib.error.HTTPError as e:
                errors+=1
                if e.code in (429,500,502,503):time.sleep(1.5)
                continue
            for p in places:
                pid=p.get('id');loc=p.get('location') or {}
                plat,plng=loc.get('latitude'),loc.get('longitude')
                if not pid or plat is None or plng is None:continue
                d=haversine(CENTER_LAT,CENTER_LNG,plat,plng)
                if d>AREA_RADIUS_M:continue
                if p.get('businessStatus')=='CLOSED_PERMANENTLY':continue
                found[pid]=p
        time.sleep(.05)
    rows=[]
    for pid,p in found.items():
        loc=p.get('location') or {};lat,lng=loc['latitude'],loc['longitude'];d=round(haversine(CENTER_LAT,CENTER_LNG,lat,lng))
        c=cuisine(p)
        rows.append({
            'id':'g-'+pid,'profile':'TOKYO','area':'地区1️⃣','name':(p.get('displayName') or {}).get('text') or pid,
            'cuisine':c,'tags':[c],'distance':int(round(d/50)*50),'distanceMeters':d,
            'lunch':None,'dinner':None,'dishes':[],'openingHoursRaw':None,'closedDays':[],
            'address':p.get('formattedAddress') or '', 'lat':lat,'lng':lng,
            'googlePlaceId':pid,'googleMapsUrl':p.get('googleMapsUri'),'googleStatus':'verified',
            'googleBusinessStatus':p.get('businessStatus'),'googlePrimaryType':p.get('primaryType'),
            'source':'Google Places','sourceId':pid,'hyakumeiten':False,'randomWeight':1
        })
    rows.sort(key=lambda r:(r['distanceMeters'],r['name']))
    OUT_JSON.write_text(json.dumps({'center':[CENTER_LAT,CENTER_LNG],'radiusMeters':AREA_RADIUS_M,'apiCalls':calls,'errors':errors,'count':len(rows),'places':rows},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    OUT_JS.write_text('// Auto-generated Google-first Area1 production identities.\nwindow.RESTAURANTS.push(\n'+',\n'.join(json.dumps(r,ensure_ascii=False,separators=(',',':')) for r in rows)+'\n);\n',encoding='utf-8')
    print(f'grid_points={len(points)} api_calls={calls} errors={errors} unique_verified={len(rows)}')

if __name__=='__main__':main()
