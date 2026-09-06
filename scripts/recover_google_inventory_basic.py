#!/usr/bin/env python3
import json, math, os, re, unicodedata
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
CENTER_LAT = 35.6959
CENTER_LNG = 139.7576
RADIUS_M = 1200
CHECKED_AT = '2026-09-06'


def load_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def load_production():
    text = (DATA / 'production_area1.js').read_text(encoding='utf-8')
    m = re.search(r'window\.PRODUCTION_RESTAURANTS\s*=\s*(\[.*\])\s*;?\s*$', text, re.S)
    if not m:
        raise RuntimeError('Cannot parse production_area1.js')
    return json.loads(m.group(1))


def normalize_name(value):
    s = unicodedata.normalize('NFKC', str(value or '')).lower()
    s = re.sub(r'https?://\S+', '', s)
    s = re.sub(r'[\s\u3000・･\-_.,，。/\\()（）\[\]【】「」『』&＆+]+', '', s)
    for token in ('restaurant', 'restaurante', 'cafe', 'coffee', 'shop', 'store', 'bar', 'dining'):
        s = s.replace(token, '')
    return s


def name_similarity(a, b):
    a = normalize_name(a); b = normalize_name(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    if a in b or b in a:
        short = min(len(a), len(b)); long = max(len(a), len(b))
        if short >= 3:
            return max(0.82, short / long)
    return SequenceMatcher(None, a, b).ratio()


def postcode(value):
    m = re.search(r'(?:〒\s*)?(\d{3})[-ー－]?(\d{4})', str(value or ''))
    return ''.join(m.groups()) if m else ''


def haversine(lat1, lng1, lat2, lng2):
    r = 6371000.0
    p1 = math.radians(lat1); p2 = math.radians(lat2)
    dp = math.radians(lat2-lat1); dl = math.radians(lng2-lng1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*r*math.asin(math.sqrt(a))


def within_area(lat, lng):
    return haversine(CENTER_LAT, CENTER_LNG, lat, lng) <= RADIUS_M + 5


def address_text(row):
    addresses = row.get('addresses') or []
    if not addresses:
        return ''
    a = addresses[0] or {}
    parts = [a.get('region'), a.get('locality'), a.get('freeform')]
    out = ''.join(str(x) for x in parts if x)
    return out


def cuisine_from_overture(row):
    primary = ((row.get('taxonomy') or {}).get('primary') or row.get('basicCategory') or '').lower()
    mapping = {
        'ramen_restaurant':'拉面','noodle_restaurant':'面食','udon_restaurant':'乌冬','soba_restaurant':'荞麦面',
        'sushi_restaurant':'寿司','japanese_restaurant':'日式','izakaya':'居酒屋','japanese_izakaya_restaurant':'居酒屋',
        'chinese_restaurant':'中华','korean_restaurant':'韩国菜','thai_restaurant':'泰国菜','indian_restaurant':'印度菜',
        'italian_restaurant':'意大利菜','french_restaurant':'法餐','pizza_restaurant':'披萨','burger_restaurant':'汉堡',
        'hamburger_restaurant':'汉堡','seafood_restaurant':'海鲜','steak_house':'牛排','barbecue_restaurant':'烧肉',
        'yakiniku_restaurant':'烧肉','yakitori_restaurant':'烧鸟','tonkatsu_restaurant':'炸猪排','curry_restaurant':'咖喱',
        'japanese_curry_restaurant':'咖喱','coffee_shop':'咖啡','cafe':'咖啡','bakery':'面包・烘焙',
        'tea_house':'茶饮','dessert_shop':'甜品','ice_cream_shop':'甜品','confectionery':'甜品','bar':'酒吧','pub':'酒吧'
    }
    return mapping.get(primary, '餐厅')


def grid_key(lat, lng, step=0.001):
    return (round(lat/step), round(lng/step))


def load_google_transient():
    paths = [
        ROOT / '_private_google' / 'initial' / 'full_inventory_place_details.json',
        ROOT / '_private_google' / 'retry' / 'full_inventory_retry_private.json',
    ]
    by_id = {}
    for path in paths:
        if not path.exists():
            continue
        doc = load_json(path)
        for row in doc.get('rows', []):
            pid = row.get('_placeId') or row.get('id')
            name = ((row.get('displayName') or {}).get('text') or '').strip()
            loc = row.get('location') or {}
            lat = loc.get('latitude'); lng = loc.get('longitude')
            if not pid or not name or not isinstance(lat, (int,float)) or not isinstance(lng, (int,float)):
                continue
            by_id[pid] = {
                'googlePlaceId': pid,
                'name': name,
                'address': row.get('formattedAddress') or '',
                'lat': float(lat), 'lng': float(lng),
                'businessStatus': row.get('businessStatus') or '',
                'primaryType': row.get('primaryType') or '',
            }
    return by_id


def build_overture_matches(google_by_id, overture_rows, already_bound):
    grid = defaultdict(list)
    for idx, row in enumerate(overture_rows):
        lat = row.get('lat'); lng = row.get('lng')
        if isinstance(lat,(int,float)) and isinstance(lng,(int,float)) and row.get('name'):
            grid[grid_key(lat,lng)].append((idx,row))

    proposals = []
    step = 0.001
    for pid, g in google_by_id.items():
        if pid in already_bound or g.get('businessStatus') != 'OPERATIONAL':
            continue
        base = grid_key(g['lat'], g['lng'], step)
        candidates = []
        for di in range(-2,3):
            for dj in range(-2,3):
                for idx, row in grid.get((base[0]+di, base[1]+dj), []):
                    dist = haversine(g['lat'], g['lng'], row['lat'], row['lng'])
                    if dist > 140:
                        continue
                    sim = name_similarity(g['name'], row.get('name'))
                    gp = postcode(g.get('address')); op = postcode(address_text(row))
                    post = bool(gp and op and gp == op)
                    dscore = max(0.0, 1.0 - dist/140.0)
                    score = 0.58*sim + 0.30*dscore + (0.12 if post else 0.0)
                    candidates.append((score, sim, dist, post, idx, row))
        if not candidates:
            continue
        candidates.sort(key=lambda x: (-x[0], x[2]))
        best = candidates[0]
        second = candidates[1] if len(candidates) > 1 else None
        score, sim, dist, post, idx, row = best
        margin = score - (second[0] if second else 0)
        strong = (
            (sim >= 0.90 and dist <= 100) or
            (sim >= 0.78 and dist <= 55) or
            (sim >= 0.64 and dist <= 25) or
            (post and sim >= 0.45 and dist <= 18) or
            (post and sim >= 0.72 and dist <= 45)
        )
        if not strong or score < 0.64:
            continue
        if margin < 0.055 and not (sim >= 0.92 and dist <= 25):
            continue
        proposals.append((score, sim, dist, margin, pid, idx, row))

    proposals.sort(key=lambda x: (-x[0], x[2]))
    used_overture = set()
    out = {}
    private_audit = []
    for score, sim, dist, margin, pid, idx, row in proposals:
        oid = row.get('overtureId') or str(idx)
        if pid in out or oid in used_overture:
            continue
        if not within_area(row['lat'], row['lng']):
            continue
        used_overture.add(oid)
        out[pid] = {
            'googlePlaceId': pid,
            'provider': 'Overture Maps',
            'providerId': row.get('overtureId'),
            'name': row.get('name'),
            'address': address_text(row),
            'lat': row.get('lat'), 'lng': row.get('lng'),
            'distanceMeters': round(haversine(CENTER_LAT,CENTER_LNG,row['lat'],row['lng'])),
            'cuisine': cuisine_from_overture(row),
            'websites': row.get('websites') or [],
            'sourceCheckedAt': CHECKED_AT,
            'verification': 'matched_against_transient_google_place_details',
            'matchLevel': 'strong'
        }
        private_audit.append({'googlePlaceId':pid,'overtureId':oid,'score':round(score,4),'nameSimilarity':round(sim,4),'googleToSourceMeters':round(dist,1),'margin':round(margin,4)})
    return out, private_audit


def main():
    inventory = load_json(DATA / 'area1_google_ids.json')
    ids = inventory.get('googlePlaceIds') or []
    assert len(ids) == 2804 and len(set(ids)) == 2804
    assert inventory.get('complete') is True and inventory.get('coverageVerified') is True

    production = load_production()
    prod_by_id = {r.get('googlePlaceId'):r for r in production if r.get('googlePlaceId') in set(ids)}

    source_matches = {}
    hp = load_json(DATA / 'hotpepper_catalog_facts.json') if (DATA/'hotpepper_catalog_facts.json').exists() else {'rows':[]}
    for row in hp.get('rows', []):
        pid = row.get('googlePlaceId'); binding = row.get('binding') or {}; facts = row.get('facts') or {}
        if pid not in set(ids) or pid in prod_by_id:
            continue
        if binding.get('confidence') != 'high' or not binding.get('autoEligible'):
            continue
        lat=facts.get('lat'); lng=facts.get('lng'); name=facts.get('name')
        if not name or not isinstance(lat,(int,float)) or not isinstance(lng,(int,float)) or not within_area(lat,lng):
            continue
        genre=(facts.get('subGenre') or facts.get('genre') or {}).get('name') or '餐厅'
        source_matches[pid] = {
            'googlePlaceId':pid,'provider':'Hot Pepper','providerId':row.get('hotpepperId'),
            'name':name,'address':facts.get('address') or '', 'lat':lat,'lng':lng,
            'distanceMeters':round(haversine(CENTER_LAT,CENTER_LNG,lat,lng)), 'cuisine':genre,
            'websites':[u for u in [(facts.get('urls') or {}).get('pc')] if u],
            'sourceCheckedAt':hp.get('checkedAt') or CHECKED_AT,
            'verification':'existing_high_confidence_binding','matchLevel':'strong'
        }

    google_by_id = load_google_transient()
    overture = load_json(DATA / 'overture_area1_candidates.json')
    ov_matches, private_audit = build_overture_matches(google_by_id, overture.get('rows',[]), set(prod_by_id)|set(source_matches))
    source_matches.update(ov_matches)

    # Existing high/medium OSM matches are safe fallbacks after transient Google QC.
    queue = load_json(DATA / 'area1_full_collection_queue.json') if (DATA/'area1_full_collection_queue.json').exists() else {'rows':[]}
    for row in queue.get('rows',[]):
        pid=row.get('googlePlaceId'); cand=row.get('candidate') or {}
        if pid in prod_by_id or pid in source_matches or pid not in set(ids):
            continue
        if row.get('matchConfidence') not in ('high','medium'):
            continue
        lat=cand.get('lat'); lng=cand.get('lng'); name=cand.get('sourceName')
        if not name or not isinstance(lat,(int,float)) or not isinstance(lng,(int,float)) or not within_area(lat,lng):
            continue
        source_matches[pid] = {
            'googlePlaceId':pid,'provider':'OpenStreetMap','providerId':cand.get('sourceCandidateId'),
            'name':name,'address':cand.get('address') or '', 'lat':lat,'lng':lng,
            'distanceMeters':round(haversine(CENTER_LAT,CENTER_LNG,lat,lng)), 'cuisine':cand.get('cuisine') or '餐厅',
            'websites':[], 'sourceCheckedAt':row.get('checkedAt') or CHECKED_AT,
            'verification':'existing_high_or_medium_transient_google_qc','matchLevel':'strong'
        }

    durable = {
        'schemaVersion':1,
        'scope':'TOKYO/地区1️⃣',
        'radiusMeters':RADIUS_M,
        'inventoryCount':2804,
        'policy':{
            'paidGoogleApiCalls':0,
            'googleDisplayPayloadPersisted':False,
            'googlePlaceIdsPersisted':True,
            'sourceFieldsOnly':True,
            'lowConfidenceMatchesExcluded':True
        },
        'summary':{
            'productionBacked':len(prod_by_id),
            'sourceMatchedInventoryOnly':len(source_matches),
            'basicReadyTotal':len(prod_by_id)+len(source_matches),
            'identityOnlyRemaining':2804-len(prod_by_id)-len(source_matches),
            'providers':dict(sorted(__import__('collections').Counter(r['provider'] for r in source_matches.values()).items()))
        },
        'rows':sorted(source_matches.values(), key=lambda r:r['googlePlaceId'])
    }
    (DATA/'google_basic_source_matches.json').write_text(json.dumps(durable,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    Path('_audit').mkdir(exist_ok=True)
    Path('_audit/google_basic_match_private_metrics.json').write_text(json.dumps({'matches':private_audit},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(durable['summary'],ensure_ascii=False))

if __name__ == '__main__':
    main()
