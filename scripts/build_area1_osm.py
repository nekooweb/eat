#!/usr/bin/env python3
import json, math, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

CENTER_LAT=35.6959
CENTER_LNG=139.7576
RADIUS_M=3000
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'area1_osm.js'
SOURCE_FILES=[ROOT/'data'/'restaurants.js',ROOT/'data'/'area1_bulk.js',ROOT/'data'/'area1_more.js']
ENDPOINTS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.nchc.org.tw/api/interpreter']

CUISINE_MAP={
 'japanese':'日式','sushi':'寿司','ramen':'拉面','noodle':'面食','udon':'乌冬','soba':'荞麦面','tempura':'天妇罗','yakitori':'烧鸟','yakiniku':'烤肉','tonkatsu':'炸猪排','curry':'咖喱','indian':'印度菜','nepalese':'尼泊尔菜','thai':'泰国菜','vietnamese':'越南菜','korean':'韩国菜','chinese':'中华','taiwanese':'台湾菜','italian':'意大利菜','pizza':'披萨','french':'法餐','spanish':'西班牙菜','burger':'汉堡','american':'美式','steak_house':'牛排','seafood':'海鲜','donburi':'盖饭','gyoza':'饺子','shabu-shabu':'涮涮锅','hotpot':'锅物','barbecue':'烧烤','coffee_shop':'咖啡','dessert':'甜品','cake':'甜品','ice_cream':'甜品','international':'国际料理','regional':'地方料理'
}

def haversine(lat1,lon1,lat2,lon2):
    r=6371000
    a1,a2=math.radians(lat1),math.radians(lat2)
    da=math.radians(lat2-lat1); do=math.radians(lon2-lon1)
    a=math.sin(da/2)**2+math.cos(a1)*math.cos(a2)*math.sin(do/2)**2
    return r*2*math.atan2(math.sqrt(a),math.sqrt(1-a))

def normalize_name(s):
    return re.sub(r'\s+','',s or '').lower()

def curated_names():
    names=set()
    pat=re.compile(r"name:'([^']+)'|name:\"([^\"]+)\"")
    for p in SOURCE_FILES:
        if p.exists():
            txt=p.read_text(encoding='utf-8')
            for m in pat.finditer(txt): names.add(normalize_name(m.group(1) or m.group(2)))
    return names

def fetch_overpass():
    query=f'''[out:json][timeout:180];(
      nwr(around:{RADIUS_M},{CENTER_LAT},{CENTER_LNG})["amenity"~"^(restaurant|fast_food|cafe|food_court)$"]["name"];
      nwr(around:{RADIUS_M},{CENTER_LAT},{CENTER_LNG})["shop"~"^(bakery|pastry|confectionery|deli|coffee|tea)$"]["name"];
    );out center tags;'''
    data=urllib.parse.urlencode({'data':query}).encode()
    last=None
    for ep in ENDPOINTS:
        try:
            req=urllib.request.Request(ep,data=data,headers={'User-Agent':'nekooweb-eat-static-builder/1.0 (GitHub Pages project)'})
            with urllib.request.urlopen(req,timeout=210) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            last=e; time.sleep(3)
    raise RuntimeError(f'All Overpass endpoints failed: {last}')

def cuisine_for(tags):
    raw=(tags.get('cuisine') or '').lower().replace(',',';')
    toks=[x.strip() for x in raw.split(';') if x.strip()]
    for t in toks:
        if t in CUISINE_MAP:return CUISINE_MAP[t]
        for k,v in CUISINE_MAP.items():
            if k in t:return v
    amenity=tags.get('amenity','')
    shop=tags.get('shop','')
    if amenity=='cafe' or shop in {'coffee','tea'}:return '咖啡'
    if amenity=='fast_food':return '快餐'
    if amenity=='food_court':return '美食广场'
    if shop in {'bakery','pastry'}:return '面包・烘焙'
    if shop=='confectionery':return '甜品'
    if shop=='deli':return '熟食'
    return '餐厅'

def address(tags):
    parts=[]
    for k in ['addr:province','addr:city','addr:suburb','addr:quarter','addr:neighbourhood','addr:street','addr:housenumber']:
        v=tags.get(k)
        if v and v not in parts: parts.append(v)
    return ' '.join(parts)

def js(s):
    return json.dumps(s,ensure_ascii=False,separators=(',',':'))

def main():
    existing=curated_names()
    raw=fetch_overpass()
    out=[]; seen=set()
    for el in raw.get('elements',[]):
        tags=el.get('tags') or {}; name=(tags.get('name:ja') or tags.get('name') or '').strip()
        if not name:continue
        lat=el.get('lat') or (el.get('center') or {}).get('lat'); lng=el.get('lon') or (el.get('center') or {}).get('lon')
        if lat is None or lng is None:continue
        d=haversine(CENTER_LAT,CENTER_LNG,float(lat),float(lng))
        if d>RADIUS_M+5:continue
        osmkey=f"{el.get('type','x')}/{el.get('id')}"
        if osmkey in seen:continue
        seen.add(osmkey)
        if normalize_name(name) in existing:continue
        c=cuisine_for(tags)
        addr=address(tags)
        q=' '.join(x for x in [name,addr,'東京都'] if x)
        out.append({
          'id':'osm-'+el.get('type','x')[0]+'-'+str(el.get('id')),
          'profile':'TOKYO','area':'地区1️⃣','name':name,'cuisine':c,'tags':[c],
          'distance':int(round(d/50.0)*50),'lunch':None,'dinner':None,
          'dishes':['推荐菜待补充'],'closedNote':'营业时间待核验，请在 Google Maps 确认','schedule':None,
          'address':addr,'mapQuery':q,'lat':round(float(lat),6),'lng':round(float(lng),6),
          'source':'OpenStreetMap','sourceId':osmkey,'dataLevel':'base'
        })
    out.sort(key=lambda x:(x['distance'],x['name']))
    # Preserve every named food POI within 3 km. The count is expected to exceed 1000 in central Tokyo.
    lines=['// Auto-generated by scripts/build_area1_osm.py. Source: OpenStreetMap contributors (ODbL).','window.RESTAURANTS.push(']
    for i,r in enumerate(out):
        lines.append(js(r)+(',' if i<len(out)-1 else ''))
    lines.append(');')
    OUT.write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print(f'Generated {len(out)} Area 1 base POIs -> {OUT}')
    if len(out)<1000:
        print('ERROR: generated dataset is below required 1000 entries',file=sys.stderr)
        return 2
    return 0

if __name__=='__main__':sys.exit(main())
