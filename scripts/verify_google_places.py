#!/usr/bin/env python3
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
CANDIDATE = ROOT / 'data' / 'area1_osm.js'
OUT = ROOT / 'data' / 'google_entities.generated.js'
CACHE = ROOT / 'data' / 'google_places_cache.json'
API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY')
BATCH_LIMIT = int(os.environ.get('GOOGLE_VERIFY_LIMIT', '0') or 0)
CENTER = (35.6959, 139.7576)
MAX_CENTER_DISTANCE = 1200
MAX_MATCH_DISTANCE = 300
QC_VERSION = 3

ALLOWED_TYPES = {
    'restaurant', 'cafe', 'coffee_shop', 'bakery', 'meal_takeaway',
    'meal_delivery', 'fast_food_restaurant', 'food_court', 'bar', 'pub',
    'dessert_shop', 'ice_cream_shop', 'ramen_restaurant',
    'japanese_restaurant', 'chinese_restaurant', 'korean_restaurant',
    'thai_restaurant', 'indian_restaurant', 'italian_restaurant',
    'french_restaurant', 'pizza_restaurant', 'hamburger_restaurant',
    'seafood_restaurant', 'sushi_restaurant', 'steak_house',
    'barbecue_restaurant', 'japanese_curry_restaurant',
    'udon_restaurant', 'soba_restaurant', 'yakitori_restaurant',
    'tonkatsu_restaurant', 'confectionery'
}


def load_candidates():
    rows = []
    for line in CANDIDATE.read_text(encoding='utf-8').splitlines():
        line = line.strip().rstrip(',')
        if line.startswith('{') and line.endswith('}'):
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return rows


def load_cache():
    if not CACHE.exists():
        return {}
    try:
        raw = json.loads(CACHE.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, OSError):
        return {}

    # Old cache versions stored Google names, addresses, coordinates and Maps URLs.
    # Strip those fields on read; persistent verification state is intentionally
    # limited to our source-candidate ID, status and the cacheable Google Place ID.
    clean = {}
    for source_id, value in raw.items():
        if not isinstance(value, dict):
            continue
        entry = {
            'sourceId': source_id,
            'status': value.get('status', 'pending'),
            'googlePlaceId': value.get('googlePlaceId'),
            'reason': value.get('reason'),
            'qcVersion': value.get('qcVersion')
        }
        clean[source_id] = {k: v for k, v in entry.items() if v is not None}
    return clean


def post_json(url, body, mask):
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': API_KEY,
            'X-Goog-FieldMask': mask,
            'User-Agent': 'nekooweb-eat-google-verifier/4.0'
        }
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode())


def get_json(url, mask):
    request = urllib.request.Request(
        url,
        headers={
            'X-Goog-Api-Key': API_KEY,
            'X-Goog-FieldMask': mask,
            'User-Agent': 'nekooweb-eat-google-verifier/4.0'
        }
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode())


def norm_name(value):
    value = (value or '').lower()
    return re.sub(r'[\s　・･\-—_\(\)（）\[\]【】「」『』\'"&＆]+', '', value)


def name_score(left, right):
    left = norm_name(left)
    right = norm_name(right)
    if not left or not right:
        return 0.0
    if left in right or right in left:
        return 1.0
    return SequenceMatcher(None, left, right).ratio()


def haversine(lat1, lng1, lat2, lng2):
    radius = 6371000
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    value = (
        math.sin(d_lat / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(d_lng / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def search_id(row):
    query = ' '.join(
        value for value in [row.get('name'), row.get('address'), 'Tokyo Japan']
        if value
    )
    body = {
        'textQuery': query,
        'maxResultCount': 1,
        'locationBias': {
            'circle': {
                'center': {'latitude': row['lat'], 'longitude': row['lng']},
                'radius': 200.0
            }
        }
    }
    data = post_json(
        'https://places.googleapis.com/v1/places:searchText',
        body,
        'places.id'
    )
    places = data.get('places') or []
    return places[0].get('id') if places else None


def result(source_id, status, place_id=None, reason=None):
    value = {
        'sourceId': source_id,
        'status': status,
        'googlePlaceId': place_id,
        'reason': reason,
        'qcVersion': QC_VERSION
    }
    return {key: val for key, val in value.items() if val is not None}


def verify_place(place_id, row):
    # Google fields below are used transiently for QC and are deliberately not
    # written into the repository cache or generated browser data.
    place = get_json(
        'https://places.googleapis.com/v1/places/' + place_id,
        'id,displayName,location,businessStatus,primaryType,types'
    )

    if place.get('businessStatus') == 'CLOSED_PERMANENTLY':
        return result(row['id'], 'rejected', place_id, 'closed_permanently')

    location = place.get('location') or {}
    lat = location.get('latitude')
    lng = location.get('longitude')
    if lat is None or lng is None:
        return result(row['id'], 'rejected', place_id, 'missing_google_location')

    center_distance = haversine(CENTER[0], CENTER[1], lat, lng)
    if center_distance > MAX_CENTER_DISTANCE + 25:
        return result(row['id'], 'rejected', place_id, 'outside_1_2km')

    match_distance = haversine(row['lat'], row['lng'], lat, lng)
    if match_distance > MAX_MATCH_DISTANCE:
        return result(row['id'], 'rejected', place_id, 'location_mismatch')

    google_name = (place.get('displayName') or {}).get('text', '')
    if name_score(row.get('name'), google_name) < 0.45:
        return result(row['id'], 'rejected', place_id, 'name_mismatch')

    primary_type = place.get('primaryType')
    types = set(place.get('types') or [])
    if primary_type not in ALLOWED_TYPES and not (types & ALLOWED_TYPES):
        return result(row['id'], 'rejected', place_id, 'non_food_google_type')

    return result(row['id'], 'verified', place_id)


def http_error_detail(error):
    try:
        raw = error.read().decode('utf-8', 'replace')[:1200]
        obj = json.loads(raw)
        return (obj.get('error') or {}).get('message') or raw
    except Exception:
        return str(error)


def write_outputs(cache):
    CACHE.write_text(
        json.dumps(cache, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8'
    )

    rows = list(cache.values())
    payload = json.dumps(rows, ensure_ascii=False, separators=(',', ':'))
    script = (
        "(()=>{const rows=" + payload + ";"
        "const byId=new Map(rows.filter(x=>x.sourceId).map(x=>[x.sourceId,x]));"
        "window.RESTAURANTS.forEach(r=>{const x=byId.get(r.id);if(!x)return;"
        "r.googleStatus=x.status;if(x.googlePlaceId)r.googlePlaceId=x.googlePlaceId;"
        "if(x.reason)r.googleRejectReason=x.reason;});"
        "window.GOOGLE_BATCH_STATS={verified:rows.filter(x=>x.status==='verified').length,"
        "rejected:rows.filter(x=>x.status==='rejected').length,"
        "pending:rows.filter(x=>x.status==='pending').length};})();\n"
    )
    OUT.write_text(script, encoding='utf-8')


def main():
    if not API_KEY:
        raise SystemExit('GOOGLE_MAPS_API_KEY is required')

    all_rows = load_candidates()
    cache = load_cache()

    if BATCH_LIMIT == -1:
        rows = all_rows[:max(1, (len(all_rows) + 1) // 2)]
        print(f'half_mode total_candidates={len(all_rows)} selected={len(rows)}')
    elif BATCH_LIMIT > 0:
        rows = all_rows[:BATCH_LIMIT]
    else:
        rows = all_rows

    new_calls = 0
    for index, row in enumerate(rows, 1):
        source_id = row['id']
        old = cache.get(source_id)
        if old and old.get('status') in {'verified', 'rejected'} and old.get('qcVersion') == QC_VERSION:
            continue

        try:
            place_id = old.get('googlePlaceId') if old else None
            if not place_id:
                place_id = search_id(row)
                new_calls += 1

            if not place_id:
                verification = result(source_id, 'rejected', reason='no_google_place')
            else:
                verification = verify_place(place_id, row)
                new_calls += 1
        except urllib.error.HTTPError as error:
            detail = http_error_detail(error)
            verification = result(source_id, 'pending', old.get('googlePlaceId') if old else None, f'http_{error.code}')
            print(f'HTTP {error.code} for {row["name"]}: {detail}')
            if error.code in (429, 500, 502, 503):
                time.sleep(2)
        except Exception as error:
            verification = result(source_id, 'pending', old.get('googlePlaceId') if old else None, type(error).__name__)
            print(f'ERROR for {row["name"]}: {type(error).__name__}: {error}')

        cache[source_id] = verification
        if index % 20 == 0:
            write_outputs(cache)
            time.sleep(0.15)

    write_outputs(cache)
    results = list(cache.values())
    print(
        'selected_candidates', len(rows),
        'new_api_calls', new_calls,
        'verified', sum(item.get('status') == 'verified' for item in results),
        'rejected', sum(item.get('status') == 'rejected' for item in results),
        'pending', sum(item.get('status') == 'pending' for item in results)
    )


if __name__ == '__main__':
    main()
