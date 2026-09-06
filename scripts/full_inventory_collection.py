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

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / 'data' / 'area1_inventory_ledger.json'
OSM = ROOT / 'data' / 'area1_osm.js'
AUDIT_DIR = ROOT / '_audit'
PRIVATE_DETAILS = AUDIT_DIR / 'full_inventory_place_details.json'
PUBLIC_QUEUE = ROOT / 'data' / 'area1_full_collection_queue.json'
SUMMARY = AUDIT_DIR / 'full_inventory_collection_summary.json'

API_KEY = os.environ.get('GOOGLE_MAP_API') or os.environ.get('GOOGLE_MAPS_API_KEY')
CONCURRENCY = int(os.environ.get('FULL_COLLECTION_CONCURRENCY', '16'))
TIMEOUT = int(os.environ.get('FULL_COLLECTION_TIMEOUT_SECONDS', '20'))
MAX_REQUESTS = int(os.environ.get('FULL_COLLECTION_MAX_REQUESTS', '2200'))
CHECKED_AT = os.environ.get('FULL_COLLECTION_CHECKED_AT', '2026-09-06')

DETAIL_MASK = 'id,displayName,formattedAddress,location,businessStatus,primaryType,types'
ALLOWED_TYPES = {
    'restaurant', 'cafe', 'coffee_shop', 'bakery', 'meal_takeaway',
    'meal_delivery', 'fast_food_restaurant', 'food_court', 'bar', 'pub',
    'dessert_shop', 'ice_cream_shop', 'confectionery', 'tea_house',
    'ramen_restaurant', 'noodle_shop', 'japanese_restaurant',
    'japanese_curry_restaurant', 'japanese_izakaya_restaurant',
    'tonkatsu_restaurant', 'yakitori_restaurant', 'yakiniku_restaurant',
    'chinese_restaurant', 'chinese_noodle_restaurant', 'korean_restaurant',
    'thai_restaurant', 'indian_restaurant', 'italian_restaurant',
    'french_restaurant', 'pizza_restaurant', 'hamburger_restaurant',
    'seafood_restaurant', 'sushi_restaurant', 'steak_house',
    'barbecue_restaurant'
}


def norm_name(value):
    value = (value or '').lower()
    value = re.sub(r'株式会社|有限会社|合同会社|東京|tokyo|店$', '', value)
    return re.sub(r'[\s\u3000・･\-—_()（）\[\]【】「」『』\'"&＆.,/]+', '', value)


def name_score(a, b):
    a = norm_name(a)
    b = norm_name(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    if min(len(a), len(b)) >= 4 and (a in b or b in a):
        return 0.96
    return SequenceMatcher(None, a, b).ratio()


def haversine(lat1, lng1, lat2, lng2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    x = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))


def load_osm():
    rows = []
    for line in OSM.read_text(encoding='utf-8').splitlines():
        text = line.strip().rstrip(',')
        if text.startswith('{') and text.endswith('}'):
            try:
                row = json.loads(text)
                if row.get('id') and row.get('name') and isinstance(row.get('lat'), (int, float)) and isinstance(row.get('lng'), (int, float)):
                    rows.append(row)
            except json.JSONDecodeError:
                pass
    return rows


def request_detail(place_id):
    url = 'https://places.googleapis.com/v1/places/' + place_id
    headers = {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': DETAIL_MASK,
        'User-Agent': 'nekooweb-eat-full-collection/1.0'
    }
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
                data = json.loads(response.read().decode())
                data['_placeId'] = place_id
                return data
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code not in (429, 500, 502, 503) or attempt == 3:
                break
        except Exception as exc:
            last = exc
            if attempt == 3:
                break
        time.sleep(0.5 * (attempt + 1))
    return {'_placeId': place_id, '_error': str(last)}


def classify_google(detail):
    if detail.get('_error'):
        return 'fetch_error'
    status = detail.get('businessStatus')
    if status == 'CLOSED_PERMANENTLY':
        return 'closed_permanently'
    primary = detail.get('primaryType')
    types = set(detail.get('types') or [])
    if primary not in ALLOWED_TYPES and not (types & ALLOWED_TYPES):
        return 'non_food_type'
    loc = detail.get('location') or {}
    if loc.get('latitude') is None or loc.get('longitude') is None:
        return 'missing_location'
    return 'operational_food'


def candidate_matches(detail, osm_rows):
    loc = detail.get('location') or {}
    lat = loc.get('latitude')
    lng = loc.get('longitude')
    google_name = (detail.get('displayName') or {}).get('text', '')
    if lat is None or lng is None or not google_name:
        return []

    candidates = []
    for row in osm_rows:
        dist = haversine(lat, lng, row['lat'], row['lng'])
        if dist > 350:
            continue
        score = name_score(google_name, row.get('name'))
        if score < 0.34 and dist > 40:
            continue
        combined = score * 0.72 + max(0.0, 1 - dist / 350) * 0.28
        candidates.append((combined, score, dist, row))
    candidates.sort(key=lambda x: (-x[0], x[2], -x[1]))
    return candidates[:5]


def confidence(score, dist, second_combined=None, combined=None):
    margin = 1.0 if second_combined is None or combined is None else combined - second_combined
    if score >= 0.92 and dist <= 60 and margin >= 0.05:
        return 'high'
    if score >= 0.78 and dist <= 120 and margin >= 0.025:
        return 'medium'
    if score >= 0.60 and dist <= 180:
        return 'review'
    return 'low'


def main():
    if not API_KEY:
        raise SystemExit('GOOGLE_MAP_API or GOOGLE_MAPS_API_KEY is required')
    AUDIT_DIR.mkdir(exist_ok=True)
    ledger = json.loads(LEDGER.read_text(encoding='utf-8'))
    inventory_only = [e['googlePlaceId'] for e in ledger.get('entries', []) if e.get('status') == 'inventory_only']
    if len(inventory_only) > MAX_REQUESTS:
        raise SystemExit(f'inventory-only request count {len(inventory_only)} exceeds hard cap {MAX_REQUESTS}')
    osm_rows = load_osm()

    details = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futures = {pool.submit(request_detail, pid): pid for pid in inventory_only}
        done = 0
        for future in concurrent.futures.as_completed(futures):
            details.append(future.result())
            done += 1
            if done % 100 == 0 or done == len(inventory_only):
                print(f'place_details={done}/{len(inventory_only)}')
    details.sort(key=lambda x: x.get('_placeId', ''))
    PRIVATE_DETAILS.write_text(json.dumps({
        'schemaVersion': 1,
        'checkedAt': CHECKED_AT,
        'fieldMask': DETAIL_MASK,
        'note': 'Private Actions audit only; Google display payload must not be committed.',
        'rows': details
    }, ensure_ascii=False), encoding='utf-8')

    queue = []
    status_counts = {}
    conf_counts = {}
    for detail in details:
        pid = detail['_placeId']
        gstatus = classify_google(detail)
        status_counts[gstatus] = status_counts.get(gstatus, 0) + 1
        entry = {'googlePlaceId': pid, 'googleStatus': gstatus, 'checkedAt': CHECKED_AT}
        if gstatus == 'operational_food':
            matches = candidate_matches(detail, osm_rows)
            if matches:
                best = matches[0]
                second = matches[1][0] if len(matches) > 1 else None
                conf = confidence(best[1], best[2], second, best[0])
                conf_counts[conf] = conf_counts.get(conf, 0) + 1
                row = best[3]
                entry.update({
                    'matchConfidence': conf,
                    'candidate': {
                        'sourceCandidateId': row['id'],
                        'sourceName': row.get('name'),
                        'cuisine': row.get('cuisine'),
                        'address': row.get('address') or '',
                        'lat': row['lat'],
                        'lng': row['lng'],
                        'distanceMeters': round(best[2]),
                        'nameSimilarity': round(best[1], 3)
                    }
                })
            else:
                entry['matchConfidence'] = 'none'
                conf_counts['none'] = conf_counts.get('none', 0) + 1
        queue.append(entry)

    # Durable queue deliberately contains only Place ID + independent OSM candidate facts + status class.
    # Google display name/address/location are kept only in the private Actions artifact above.
    public_payload = {
        'schemaVersion': 1,
        'scope': ledger.get('scope'),
        'generatedAt': CHECKED_AT,
        'inventoryBaseline': 2804,
        'inventoryOnlyProcessed': len(inventory_only),
        'policy': {
            'googleDisplayPayloadPersisted': False,
            'enterpriseWebsiteUriRequested': False,
            'highConfidenceIsCandidateNotAutomaticProductionAdmission': True
        },
        'summary': {
            'googleStatusCounts': status_counts,
            'candidateConfidenceCounts': conf_counts,
            'osmIndependentRowsAvailable': len(osm_rows)
        },
        'rows': queue
    }
    PUBLIC_QUEUE.write_text(json.dumps(public_payload, ensure_ascii=False, indent=2), encoding='utf-8')
    SUMMARY.write_text(json.dumps(public_payload['summary'], ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({
        'inventoryOnlyProcessed': len(inventory_only),
        'googleStatusCounts': status_counts,
        'candidateConfidenceCounts': conf_counts,
        'osmRows': len(osm_rows)
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
