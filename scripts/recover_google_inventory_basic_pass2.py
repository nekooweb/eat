#!/usr/bin/env python3
import json, math, re, unicodedata
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
CENTER_LAT = 35.6959
CENTER_LNG = 139.7576
RADIUS_M = 1200
CHECKED_AT = '2026-09-07'


def load_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def norm(value):
    s = unicodedata.normalize('NFKC', str(value or '')).lower()
    s = re.sub(r'https?://\S+', '', s)
    s = re.sub(r'[\s\u3000・･\-_.,，。/\\()（）\[\]【】「」『』&＆+]+', '', s)
    for token in ('restaurant','restaurante','cafe','coffee','shop','store','bar','dining','東京','tokyo'):
        s = s.replace(token, '')
    return s


def sim(a, b):
    a = norm(a); b = norm(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    if len(a) >= 3 and len(b) >= 3 and (a in b or b in a):
        return max(0.82, min(len(a), len(b)) / max(len(a), len(b)))
    return SequenceMatcher(None, a, b).ratio()


def postcode(value):
    m = re.search(r'(?:〒\s*)?(\d{3})[-ー－]?(\d{4})', str(value or ''))
    return ''.join(m.groups()) if m else ''


def dist_m(lat1, lng1, lat2, lng2):
    r = 6371000.0
    p1 = math.radians(lat1); p2 = math.radians(lat2)
    dp = math.radians(lat2-lat1); dl = math.radians(lng2-lng1)
    x = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*r*math.asin(math.sqrt(x))


def within_area(lat, lng):
    return dist_m(CENTER_LAT, CENTER_LNG, lat, lng) <= RADIUS_M + 5


def address_text(row):
    addresses = row.get('addresses') or []
    if not addresses:
        return ''
    a = addresses[0] or {}
    return ''.join(str(x or '') for x in (a.get('region'), a.get('locality'), a.get('freeform')))


def cuisine_from_overture(row):
    primary = ((row.get('taxonomy') or {}).get('primary') or row.get('basicCategory') or '').lower()
    mapping = {
        'ramen_restaurant':'拉面','noodle_restaurant':'面食','udon_restaurant':'乌冬','soba_restaurant':'荞麦面',
        'sushi_restaurant':'寿司','japanese_restaurant':'日式','izakaya':'居酒屋','japanese_izakaya_restaurant':'居酒屋',
        'chinese_restaurant':'中华','korean_restaurant':'韩国菜','thai_restaurant':'泰国菜','indian_restaurant':'印度菜',
        'italian_restaurant':'意大利菜','french_restaurant':'法餐','pizza_restaurant':'披萨','hamburger_restaurant':'汉堡',
        'seafood_restaurant':'海鲜','steak_house':'牛排','barbecue_restaurant':'烧肉','yakiniku_restaurant':'烧肉',
        'yakitori_restaurant':'烧鸟','tonkatsu_restaurant':'炸猪排','japanese_curry_restaurant':'咖喱',
        'coffee_shop':'咖啡','cafe':'咖啡','bakery':'面包・烘焙','tea_house':'茶饮','dessert_shop':'甜品',
        'ice_cream_shop':'甜品','confectionery':'甜品','bar':'酒吧','pub':'酒吧'
    }
    return mapping.get(primary, '餐厅')


def load_google_transient():
    by_id = {}
    paths = [
        ROOT/'_private_google'/'initial'/'full_inventory_place_details.json',
        ROOT/'_private_google'/'retry'/'full_inventory_retry_private.json',
    ]
    for path in paths:
        if not path.exists():
            continue
        doc = load_json(path)
        for row in doc.get('rows', []):
            pid = row.get('_placeId') or row.get('id')
            name = ((row.get('displayName') or {}).get('text') or '').strip()
            loc = row.get('location') or {}
            lat = loc.get('latitude'); lng = loc.get('longitude')
            if not pid or not name or not isinstance(lat,(int,float)) or not isinstance(lng,(int,float)):
                continue
            by_id[pid] = {
                'googlePlaceId':pid,'name':name,'address':row.get('formattedAddress') or '',
                'lat':float(lat),'lng':float(lng),'businessStatus':row.get('businessStatus') or ''
            }
    return by_id


def make_candidates():
    candidates = []
    hp = load_json(DATA/'hotpepper_catalog_facts.json') if (DATA/'hotpepper_catalog_facts.json').exists() else {'rows':[]}
    for row in hp.get('rows', []):
        facts = row.get('facts') or {}
        lat=facts.get('lat'); lng=facts.get('lng'); name=facts.get('name')
        if not name or not isinstance(lat,(int,float)) or not isinstance(lng,(int,float)) or not within_area(lat,lng):
            continue
        genre=(facts.get('subGenre') or facts.get('genre') or {}).get('name') or '餐厅'
        candidates.append({
            'provider':'Hot Pepper','providerId':row.get('hotpepperId'),'name':name,
            'address':facts.get('address') or '','lat':lat,'lng':lng,'cuisine':genre,
            'websites':[u for u in [(facts.get('urls') or {}).get('pc')] if u],
            'sourceCheckedAt':hp.get('checkedAt') or CHECKED_AT
        })
    ov = load_json(DATA/'overture_area1_candidates.json')
    for row in ov.get('rows', []):
        lat=row.get('lat'); lng=row.get('lng'); name=row.get('name')
        if not name or not isinstance(lat,(int,float)) or not isinstance(lng,(int,float)) or not within_area(lat,lng):
            continue
        candidates.append({
            'provider':'Overture Maps','providerId':row.get('overtureId'),'name':name,
            'address':address_text(row),'lat':lat,'lng':lng,'cuisine':cuisine_from_overture(row),
            'websites':row.get('websites') or [],'sourceCheckedAt':CHECKED_AT
        })
    return candidates


def grid_key(lat, lng, step=0.00045):
    return (round(lat/step), round(lng/step))


def main():
    inventory = load_json(DATA/'area1_google_ids.json')
    ids = inventory.get('googlePlaceIds') or []
    assert len(ids)==2804 and len(set(ids))==2804 and inventory.get('complete') is True
    existing = load_json(DATA/'google_basic_source_matches.json')
    existing_rows = {r['googlePlaceId']:r for r in existing.get('rows', [])}

    # Production-backed IDs are not in the durable match file. Infer the frozen IDs already covered
    # by the prior summary so only true identity-only rows are targeted.
    runtime_text = (DATA/'google_inventory_runtime.js').read_text(encoding='utf-8')
    prefix='window.GOOGLE_INVENTORY_RESTAURANTS='
    start=runtime_text.find(prefix); end=runtime_text.find(';\nwindow.GOOGLE_INVENTORY_STATS=', start)
    runtime=json.loads(runtime_text[start+len(prefix):end])
    covered = {r['googlePlaceId'] for r in runtime if r.get('basicInfoState') != 'google_place_id_only'}
    unresolved = set(ids) - covered

    google = load_google_transient()
    candidates = make_candidates()
    grid=defaultdict(list)
    for idx,c in enumerate(candidates):
        grid[grid_key(c['lat'],c['lng'])].append((idx,c))

    proposals=[]
    for pid in unresolved:
        g=google.get(pid)
        if not g or g.get('businessStatus') not in ('','OPERATIONAL'):
            continue
        base=grid_key(g['lat'],g['lng'])
        nearby=[]
        for di in range(-4,5):
            for dj in range(-4,5):
                for idx,c in grid.get((base[0]+di,base[1]+dj),[]):
                    d=dist_m(g['lat'],g['lng'],c['lat'],c['lng'])
                    if d > 130:
                        continue
                    s=sim(g['name'],c['name'])
                    gp=postcode(g['address']); cp=postcode(c['address']); post=bool(gp and cp and gp==cp)
                    provider_bonus=0.035 if c['provider']=='Hot Pepper' else 0.0
                    score=0.62*s + 0.30*max(0,1-d/130) + (0.10 if post else 0.0) + provider_bonus
                    nearby.append((score,s,d,post,idx,c))
        if not nearby:
            continue
        nearby.sort(key=lambda x:(-x[0],x[2]))
        best=nearby[0]; second=nearby[1] if len(nearby)>1 else None
        score,s,d,post,idx,c=best
        margin=score-(second[0] if second else 0)
        if c['provider']=='Hot Pepper':
            strong=((s>=0.90 and d<=100) or (s>=0.78 and d<=55) or (s>=0.62 and d<=25) or
                    (s>=0.45 and d<=12 and post) or (s>=0.55 and d<=45 and post))
            min_score=0.64
        else:
            strong=((s>=0.92 and d<=120) or (s>=0.80 and d<=70) or (s>=0.68 and d<=30) or
                    (s>=0.55 and d<=12) or (s>=0.50 and d<=40 and post))
            min_score=0.63
        if not strong or score < min_score:
            continue
        if margin < 0.045 and not (s>=0.94 and d<=20) and not (post and d<=10 and s>=0.60):
            continue
        proposals.append((score,s,d,margin,pid,idx,c))

    proposals.sort(key=lambda x:(-x[0],x[2]))
    used_provider_ids=set()
    accepted=[]
    private=[]
    for score,s,d,margin,pid,idx,c in proposals:
        key=(c['provider'],c.get('providerId') or idx)
        if pid in existing_rows or key in used_provider_ids:
            continue
        used_provider_ids.add(key)
        accepted.append({
            'googlePlaceId':pid,'provider':c['provider'],'providerId':c.get('providerId'),
            'name':c['name'],'address':c.get('address') or '','lat':c['lat'],'lng':c['lng'],
            'distanceMeters':round(dist_m(CENTER_LAT,CENTER_LNG,c['lat'],c['lng'])),
            'cuisine':c.get('cuisine') or '餐厅','websites':c.get('websites') or [],
            'sourceCheckedAt':c.get('sourceCheckedAt') or CHECKED_AT,
            'verification':'matched_against_transient_google_place_details_pass2','matchLevel':'strong'
        })
        private.append({'googlePlaceId':pid,'provider':c['provider'],'providerId':c.get('providerId'),
                        'score':round(score,4),'nameSimilarity':round(s,4),'googleToSourceMeters':round(d,1),'margin':round(margin,4)})

    merged = list(existing_rows.values()) + accepted
    merged.sort(key=lambda r:r['googlePlaceId'])
    providers=Counter(r['provider'] for r in merged)
    production_backed=int(existing.get('summary',{}).get('productionBacked',651))
    summary={
        'productionBacked':production_backed,
        'sourceMatchedInventoryOnly':len(merged),
        'basicReadyTotal':production_backed+len(merged),
        'identityOnlyRemaining':2804-production_backed-len(merged),
        'providers':dict(sorted(providers.items())),
        'pass2NewMatches':len(accepted)
    }
    output={
        'schemaVersion':2,'scope':inventory.get('scope'),'radiusMeters':1200,'inventoryCount':2804,
        'policy':{
            'paidGoogleApiCalls':0,'googleDisplayPayloadPersisted':False,'googlePlaceIdsPersisted':True,
            'sourceFieldsOnly':True,'lowConfidenceMatchesExcluded':True,
            'pass2Rule':'strict geospatial + name/address match against transient retained Google sweep; durable fields are independent-source only'
        },
        'summary':summary,'rows':merged
    }
    (DATA/'google_basic_source_matches.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    Path('_audit').mkdir(exist_ok=True)
    Path('_audit/google_basic_pass2_private.json').write_text(json.dumps({'accepted':private},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False))

if __name__=='__main__':
    main()
