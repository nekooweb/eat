#!/usr/bin/env python3
import json, math, re, sys, time, urllib.parse, urllib.request
from pathlib import Path
CENTER_LAT=35.6959; CENTER_LNG=139.7576; RADIUS_M=1200
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'data'/'area1_osm.js'
SOURCE_FILES=[ROOT/'data'/'restaurants.js',ROOT/'data'/'area1_bulk.js',ROOT/'data'/'area1_more.js']
ENDPOINTS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.nchc.org.tw/api/interpreter']
CUISINE_MAP={'japanese':'日式','sushi':'寿司','ramen':'拉面','noodle':'面食','udon':'乌冬','soba':'荞麦面','tempura':'天妇罗','yakitori':'烧鸟','yakiniku':'烤肉','tonkatsu':'炸猪排','curry':'咖喱','indian':'印度菜','nepalese':'尼泊尔菜','thai':'泰国菜','vietnamese':'越南菜','korean':'韩国菜','chinese':'中华','taiwanese':'台湾菜','italian':'意大利菜','pizza':'披萨','french':'法餐','spanish':'西班牙菜','burger':'汉堡','american':'美式','steak_house':'牛排','seafood':'海鲜','donburi':'盖饭','gyoza':'饺子','shabu-shabu':'涮涮锅','hotpot':'锅物','barbecue':'烧烤','coffee_shop':'咖啡','dessert':'甜品','cake':'甜品','ice_cream':'甜品','international':'国际料理','regional':'地方料理'}
def haversine(a,b,c,d):
 r=6371000; a1,a2=math.radians(a),math.radians(c); da=math.radians(c-a); do=math.radians(d-b); x=math.sin(da/2)**2+math.cos(a1)*math.cos(a2)*math.sin(do/2)**2; return r*2*math.atan2(math.sqrt(x),math.sqrt(1-x))
def norm(s): return re.sub(r'\s+','',s or '').lower()
def curated_names():
 names=set(); pat=re.compile(r"name:'([^']+)'|name:\"([^\"]+)\"")
 for p in SOURCE_FILES:
  if p.exists():
   for m in pat.finditer(p.read_text(encoding='utf-8')): names.add(norm(m.group(1) or m.group(2)))
 return names
def fetch_overpass():
 q=f'''[out:json][timeout:180];(nwr(around:{RADIUS_M},{CENTER_LAT},{CENTER_LNG})["amenity"~"^(restaurant|fast_food|cafe|food_court)$"]["name"];nwr(around:{RADIUS_M},{CENTER_LAT},{CENTER_LNG})["shop"~"^(bakery|pastry|confectionery|deli|coffee|tea)$"]["name"];);out center tags;'''; data=urllib.parse.urlencode({'data':q}).encode(); last=None
 for ep in ENDPOINTS:
  try:
   req=urllib.request.Request(ep,data=data,headers={'User-Agent':'nekooweb-eat-static-builder/1.2'}); return json.loads(urllib.request.urlopen(req,timeout=210).read().decode())
  except Exception as e: last=e; time.sleep(3)
 raise RuntimeError(last)
def cuisine_for(t):
 raw=(t.get('cuisine') or '').lower().replace(',',';')
 for token in [x.strip() for x in raw.split(';') if x.strip()]:
  if token in CUISINE_MAP:return CUISINE_MAP[token]
  for k,v in CUISINE_MAP.items():
   if k in token:return v
 if t.get('amenity')=='cafe' or t.get('shop') in {'coffee','tea'}:return '咖啡'
 if t.get('amenity')=='fast_food':return '快餐'
 if t.get('amenity')=='food_court':return '美食广场'
 if t.get('shop') in {'bakery','pastry'}:return '面包・烘焙'
 if t.get('shop')=='confectionery':return '甜品'
 if t.get('shop')=='deli':return '熟食'
 return '餐厅'
def address(t):
 return ' '.join(dict.fromkeys(v for k in ['addr:province','addr:city','addr:suburb','addr:quarter','addr:neighbourhood','addr:street','addr:housenumber'] if (v:=t.get(k))))
def main():
 existing=curated_names(); raw=fetch_overpass(); out=[]; seen=set()
 for el in raw.get('elements',[]):
  t=el.get('tags') or {}; name=(t.get('name:ja') or t.get('name') or '').strip(); lat=el.get('lat') or (el.get('center') or {}).get('lat'); lng=el.get('lon') or (el.get('center') or {}).get('lon')
  if not name or lat is None or lng is None:continue
  d=haversine(CENTER_LAT,CENTER_LNG,float(lat),float(lng)); key=f"{el.get('type','x')}/{el.get('id')}"
  if d>RADIUS_M+5 or key in seen or norm(name) in existing:continue
  seen.add(key); c=cuisine_for(t); addr=address(t); opening=t.get('opening_hours') or None
  out.append({'id':'osm-'+el.get('type','x')[0]+'-'+str(el.get('id')),'profile':'TOKYO','area':'地区1️⃣','name':name,'cuisine':c,'tags':[c],'distance':int(round(d/50)*50),'lunch':None,'dinner':None,'dishes':['推荐菜待补充'],'closedNote':'休日信息见公开营业时间字段' if opening else '休日待核验','schedule':None,'openingHoursRaw':opening,'closedDays':[],'holidayNote':None,'address':addr,'mapQuery':' '.join(x for x in [name,addr,'東京都'] if x),'lat':round(float(lat),6),'lng':round(float(lng),6),'source':'OpenStreetMap','sourceId':key,'dataLevel':'base','hyakumeiten':False,'randomWeight':1})
 out.sort(key=lambda x:(x['distance'],x['name'])); OUT.write_text('// Auto-generated. Source: OpenStreetMap contributors (ODbL).\nwindow.RESTAURANTS.push(\n'+',\n'.join(json.dumps(r,ensure_ascii=False,separators=(',',':')) for r in out)+'\n);\n',encoding='utf-8')
 print(f'Generated {len(out)} Area 1 base POIs within {RADIUS_M}m -> {OUT}')
 return 0
if __name__=='__main__':sys.exit(main())