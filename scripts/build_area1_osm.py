#!/usr/bin/env python3
import json, math, re, sys, time, urllib.parse, urllib.request
from pathlib import Path
CENTER_LAT=35.6959; CENTER_LNG=139.7576; RADIUS_M=1200
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'data'/'area1_osm.js'
SOURCE_FILES=[ROOT/'data'/'restaurants.js',ROOT/'data'/'area1_bulk.js',ROOT/'data'/'area1_more.js']
ENDPOINTS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.nchc.org.tw/api/interpreter']
CUISINE_MAP={'japanese':'日式','sushi':'寿司','ramen':'拉面','noodle':'面食','udon':'乌冬','soba':'荞麦面','tempura':'天妇罗','yakitori':'烧鸟','yakiniku':'烤肉','tonkatsu':'炸猪排','curry':'咖喱','indian':'印度菜','nepalese':'尼泊尔菜','thai':'泰国菜','vietnamese':'越南菜','korean':'韩国菜','chinese':'中华','taiwanese':'台湾菜','italian':'意大利菜','pizza':'披萨','french':'法餐','spanish':'西班牙菜','burger':'汉堡','american':'美式','steak_house':'牛排','seafood':'海鲜','donburi':'盖饭','gyoza':'饺子','hotpot':'锅物','barbecue':'烧烤','coffee_shop':'咖啡','dessert':'甜品','cake':'甜品','ice_cream':'甜品'}
def haversine(a,b,c,d):
 r=6371000;a1,a2=math.radians(a),math.radians(c);da=math.radians(c-a);do=math.radians(d-b);x=math.sin(da/2)**2+math.cos(a1)*math.cos(a2)*math.sin(do/2)**2;return r*2*math.atan2(math.sqrt(x),math.sqrt(1-x))
def norm(s):return re.sub(r'[\s　・\-—_]+','',s or '').lower()
def curated_names():
 names=set();pat=re.compile(r"name:'([^']+)'|name:\"([^\"]+)\"")
 for p in SOURCE_FILES:
  if p.exists():
   for m in pat.finditer(p.read_text(encoding='utf-8')):names.add(norm(m.group(1) or m.group(2)))
 return names
def fetch_overpass():
 # Keep the independent OSM candidate universe aligned with the repository's
 # Google food-business scope. The previous query omitted bar/pub/ice-cream
 # features even though those Google place types are intentionally included in
 # exact Area1 discovery, which created an avoidable independent-source gap.
 q=f'''[out:json][timeout:180];(
 nwr(around:{RADIUS_M},{CENTER_LAT},{CENTER_LNG})["amenity"~"^(restaurant|fast_food|cafe|food_court|bar|pub|biergarten|ice_cream)$"]["name"];
 nwr(around:{RADIUS_M},{CENTER_LAT},{CENTER_LNG})["shop"~"^(bakery|pastry|confectionery|deli|coffee|tea|ice_cream)$"]["name"];
 );out center tags;''';data=urllib.parse.urlencode({'data':q}).encode();last=None
 for ep in ENDPOINTS:
  try:
   req=urllib.request.Request(ep,data=data,headers={'User-Agent':'nekooweb-eat-static-builder/2.2'});return json.loads(urllib.request.urlopen(req,timeout=210).read().decode())
  except Exception as e:last=e;time.sleep(3)
 raise RuntimeError(last)
def cuisine_for(t):
 raw=(t.get('cuisine') or '').lower().replace(',',';')
 for token in [x.strip() for x in raw.split(';') if x.strip()]:
  if token in CUISINE_MAP:return CUISINE_MAP[token]
  for k,v in CUISINE_MAP.items():
   if k in token:return v
 if t.get('amenity')=='cafe' or t.get('shop') in {'coffee','tea'}:return '咖啡'
 if t.get('amenity')=='fast_food':return '快餐'
 if t.get('amenity') in {'bar','pub','biergarten'}:return '酒吧'
 if t.get('amenity')=='ice_cream' or t.get('shop')=='ice_cream':return '甜品'
 if t.get('shop') in {'bakery','pastry'}:return '面包・烘焙'
 if t.get('shop')=='confectionery':return '甜品'
 return '餐厅'
def address(t):return ' '.join(dict.fromkeys(v for k in ['addr:province','addr:city','addr:suburb','addr:quarter','addr:neighbourhood','addr:street','addr:housenumber'] if (v:=t.get(k))))
def main():
 existing=curated_names();raw=fetch_overpass();out=[];seen=set();overlap_count=0
 for el in raw.get('elements',[]):
  t=el.get('tags') or {};name=(t.get('name:ja') or t.get('name') or '').strip();lat=el.get('lat') or (el.get('center') or {}).get('lat');lng=el.get('lon') or (el.get('center') or {}).get('lon')
  if not name or lat is None or lng is None:continue
  d=haversine(CENTER_LAT,CENTER_LNG,float(lat),float(lng));addr=address(t);entity=(norm(name),round(float(lat),4),round(float(lng),4))
  if d>RADIUS_M+5 or entity in seen:continue
  seen.add(entity);c=cuisine_for(t);opening=t.get('opening_hours') or None;overlap=norm(name) in existing
  if overlap: overlap_count+=1
  # Keep curated-name overlaps instead of excluding them. They are valuable
  # identity bridges: Google verification can attach a Place ID to the OSM row,
  # then the canonical builder can merge independently maintained curated
  # budget/dish/schedule metadata by the unique normalized name.
  out.append({'id':'osm-'+el.get('type','x')[0]+'-'+str(el.get('id')),'profile':'TOKYO','area':'地区1️⃣','name':name,'cuisine':c,'tags':[c],'distance':int(round(d/50)*50),'distanceMeters':int(round(d)),'lunch':None,'dinner':None,'dishes':[],'openingHoursRaw':opening,'closedDays':[],'address':addr,'lat':round(float(lat),6),'lng':round(float(lng),6),'googlePlaceId':None,'googleStatus':'pending','source':'OpenStreetMap','sourceId':f"{el.get('type','x')}/{el.get('id')}",'curatedOverlap':overlap,'hyakumeiten':False,'randomWeight':1})
 out.sort(key=lambda x:(x['distanceMeters'],x['name']));OUT.write_text('// Auto-generated candidate pool. Google business identity must be verified before promotion.\nwindow.RESTAURANTS.push(\n'+',\n'.join(json.dumps(r,ensure_ascii=False,separators=(',',':')) for r in out)+'\n);\n',encoding='utf-8');print(f'Generated {len(out)} compact Area 1 candidates; curated overlaps={overlap_count}; Google status=pending')
 return 0
if __name__=='__main__':sys.exit(main())