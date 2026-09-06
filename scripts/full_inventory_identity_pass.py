#!/usr/bin/env python3
import concurrent.futures
import datetime as dt
import html as html_lib
import json
import math
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
AUDIT = ROOT / '_audit'
INVENTORY = DATA / 'area1_inventory_ledger.json'
OSM_JS = DATA / 'area1_osm.js'
CACHE = DATA / 'google_places_cache.json'
OFFICIAL_INDEX = DATA / 'official_candidate_index.json'
STATE = DATA / 'area1_full_collection_status.json'

API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY', '').strip()
IDENTITY_CONCURRENCY = max(1, int(os.environ.get('FULL_IDENTITY_CONCURRENCY', '10')))
IDENTITY_LIMIT = max(0, int(os.environ.get('FULL_IDENTITY_LIMIT', '0') or 0))
WEBSITE_CONCURRENCY = max(1, int(os.environ.get('FULL_WEBSITE_CONCURRENCY', '8')))
WEBSITE_LIMIT = max(0, int(os.environ.get('FULL_WEBSITE_LIMIT', '0') or 0))
TIMEOUT = max(5, int(os.environ.get('FULL_REQUEST_TIMEOUT_SEC', '15')))
CHECKED_AT = os.environ.get('FULL_COLLECTION_CHECKED_AT') or dt.date.today().isoformat()
CENTER = (35.6959, 139.7576)
MAX_CENTER_DISTANCE = 1225
QC_VERSION = 4

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

OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter'
]

BLOCKED_WEBSITE_HOSTS = {
    'facebook.com', 'www.facebook.com', 'instagram.com', 'www.instagram.com',
    'x.com', 'twitter.com', 'www.twitter.com', 'tabelog.com', 'www.tabelog.com',
    'hotpepper.jp', 'www.hotpepper.jp', 'r.gnavi.co.jp', 'gnavi.co.jp',
    'tripadvisor.jp', 'www.tripadvisor.jp', 'yelp.com', 'www.yelp.com',
    'google.com', 'www.google.com', 'maps.google.com', 'maps.app.goo.gl'
}


def load_json(path, default):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return default


def load_osm_candidates():
    rows = []
    for line in OSM_JS.read_text(encoding='utf-8').splitlines():
        raw = line.strip().rstrip(',')
        if raw.startswith('{') and raw.endswith('}'):
            try:
                rows.append(json.loads(raw))
            except json.JSONDecodeError:
                pass
    return rows


def norm_name(value):
    value = html_lib.unescape(value or '').lower()
    value = re.sub(r'\b(tokyo|japan|store|shop|branch|restaurant|cafe|coffee)\b', '', value)
    return re.sub(r'[\s　・･\-—_\(\)（）\[\]【】「」『』\'"&＆/／・,，.。]+', '', value)


def name_similarity(left, right):
    a = norm_name(left)
    b = norm_name(right)
    if not a or not b:
        return 0.0, False
    containment = min(len(a), len(b)) >= 3 and (a in b or b in a)
    if containment:
        return 1.0, True
    return SequenceMatcher(None, a, b).ratio(), False


def haversine(lat1, lng1, lat2, lng2):
    radius = 6371000
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    value = math.sin(d_lat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(d_lng / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def get_json(url, mask, retries=3):
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                'X-Goog-Api-Key': API_KEY,
                'X-Goog-FieldMask': mask,
                'User-Agent': 'nekooweb-eat-full-collection/1.0'
            })
            with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as error:
            last = error
            if error.code not in (429, 500, 502, 503) or attempt + 1 == retries:
                raise
            time.sleep(1.2 * (attempt + 1))
        except Exception as error:
            last = error
            if attempt + 1 == retries:
                raise
            time.sleep(0.8 * (attempt + 1))
    raise last


def fetch_identity(place_id):
    try:
        place = get_json(
            'https://places.googleapis.com/v1/places/' + urllib.parse.quote(place_id),
            'id,displayName,location,businessStatus,primaryType,types'
        )
        return {'googlePlaceId': place_id, 'ok': True, 'place': place}
    except urllib.error.HTTPError as error:
        return {'googlePlaceId': place_id, 'ok': False, 'error': f'http_{error.code}'}
    except Exception as error:
        return {'googlePlaceId': place_id, 'ok': False, 'error': type(error).__name__}


def fetch_all_identities(place_ids):
    out = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=IDENTITY_CONCURRENCY) as pool:
        futures = {pool.submit(fetch_identity, pid): pid for pid in place_ids}
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            out.append(future.result())
            if index % 100 == 0:
                print(f'identity_fetch={index}/{len(place_ids)}')
    return out


def fetch_overpass_tags():
    query = '''[out:json][timeout:180];(
      nwr(around:1200,35.6959,139.7576)["amenity"~"^(restaurant|fast_food|cafe|food_court|bar|pub|biergarten|ice_cream)$"]["name"];
      nwr(around:1200,35.6959,139.7576)["shop"~"^(bakery|pastry|confectionery|deli|coffee|tea|ice_cream)$"]["name"];
    );out center tags;'''
    encoded = urllib.parse.urlencode({'data': query}).encode('utf-8')
    last = None
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            req = urllib.request.Request(endpoint, data=encoded, headers={'User-Agent': 'nekooweb-eat-full-collection/1.0'})
            with urllib.request.urlopen(req, timeout=210) as response:
                return json.loads(response.read().decode('utf-8'))
        except Exception as error:
            last = error
            time.sleep(2)
    raise RuntimeError(last)


def build_osm_hints(raw):
    hints = {}
    for element in raw.get('elements', []):
        tags = element.get('tags') or {}
        source_id = f"{element.get('type', 'x')}/{element.get('id')}"
        website = (tags.get('website') or tags.get('contact:website') or tags.get('url') or '').strip()
        hints[source_id] = {
            'sourceId': source_id,
            'website': website or None,
            'brand': tags.get('brand') or None,
            'operator': tags.get('operator') or None,
            'openingHoursRaw': tags.get('opening_hours') or None,
            'phone': tags.get('contact:phone') or tags.get('phone') or None,
        }
    return hints


def pair_rule(distance_m, similarity, containment):
    if containment and distance_m <= 60:
        return True, 'name_containment_60m'
    if distance_m <= 20 and similarity >= 0.72:
        return True, 'similarity_72_20m'
    if distance_m <= 45 and similarity >= 0.86:
        return True, 'similarity_86_45m'
    if distance_m <= 100 and similarity >= 0.95:
        return True, 'similarity_95_100m'
    return False, None


def reverse_reconcile(identity_rows, osm_rows, cache):
    available_osm = []
    for row in osm_rows:
        old = cache.get(row.get('id')) or {}
        if old.get('status') == 'verified':
            continue
        if row.get('lat') is None or row.get('lng') is None:
            continue
        available_osm.append(row)

    accepted_pairs = []
    ambiguous_place_ids = set()
    candidate_count = 0

    for identity in identity_rows:
        if not identity.get('ok'):
            continue
        place = identity.get('place') or {}
        if place.get('businessStatus') == 'CLOSED_PERMANENTLY':
            continue
        types = set(place.get('types') or [])
        primary = place.get('primaryType')
        if primary not in ALLOWED_TYPES and not (types & ALLOWED_TYPES):
            continue
        loc = place.get('location') or {}
        lat = loc.get('latitude')
        lng = loc.get('longitude')
        if lat is None or lng is None:
            continue
        if haversine(CENTER[0], CENTER[1], lat, lng) > MAX_CENTER_DISTANCE:
            continue
        google_name = (place.get('displayName') or {}).get('text', '')
        local_pairs = []
        for osm in available_osm:
            d = haversine(lat, lng, osm['lat'], osm['lng'])
            if d > 100:
                continue
            similarity, containment = name_similarity(google_name, osm.get('name'))
            accepted, rule = pair_rule(d, similarity, containment)
            if not accepted:
                continue
            candidate_count += 1
            score = similarity * 2.0 + (1.0 if containment else 0.0) + max(0.0, (100.0 - d) / 100.0)
            local_pairs.append({
                'googlePlaceId': identity['googlePlaceId'],
                'sourceCandidateId': osm['id'],
                'sourceId': osm.get('sourceId'),
                'sourceName': osm.get('name'),
                'distanceMeters': round(d, 1),
                'similarity': round(similarity, 4),
                'rule': rule,
                'score': score,
            })
        local_pairs.sort(key=lambda item: (-item['score'], item['distanceMeters']))
        if not local_pairs:
            continue
        if len(local_pairs) > 1 and local_pairs[0]['score'] - local_pairs[1]['score'] < 0.18:
            ambiguous_place_ids.add(identity['googlePlaceId'])
            continue
        accepted_pairs.append(local_pairs[0])

    # Enforce one-to-one OSM source assignment. If two Google identities want the
    # same source with similar scores, keep neither rather than guessing.
    by_source = {}
    for pair in accepted_pairs:
        by_source.setdefault(pair['sourceCandidateId'], []).append(pair)

    final = []
    source_conflicts = 0
    for source_candidate_id, pairs in by_source.items():
        pairs.sort(key=lambda item: (-item['score'], item['distanceMeters']))
        if len(pairs) > 1 and pairs[0]['score'] - pairs[1]['score'] < 0.18:
            source_conflicts += 1
            continue
        final.append(pairs[0])

    for pair in final:
        cache[pair['sourceCandidateId']] = {
            'sourceId': pair['sourceCandidateId'],
            'status': 'verified',
            'googlePlaceId': pair['googlePlaceId'],
            'qcVersion': QC_VERSION,
        }

    return final, {
        'rawAcceptedCandidatePairs': candidate_count,
        'ambiguousPlaceIds': len(ambiguous_place_ids),
        'sourceConflicts': source_conflicts,
        'recoveredVerifiedMappings': len(final),
    }


def safe_website(url):
    if not url:
        return None
    try:
        parsed = urllib.parse.urlparse(url if '://' in url else 'https://' + url)
        if parsed.scheme not in {'http', 'https'} or not parsed.netloc:
            return None
        host = parsed.netloc.lower().split(':')[0]
        if host in BLOCKED_WEBSITE_HOSTS or any(host.endswith('.' + blocked) for blocked in BLOCKED_WEBSITE_HOSTS):
            return None
        return parsed.geturl()
    except Exception:
        return None


def strip_html(raw):
    text = re.sub(r'(?is)<script\b.*?</script>|<style\b.*?</style>', ' ', raw)
    title_match = re.search(r'(?is)<title[^>]*>(.*?)</title>', raw)
    title = re.sub(r'\s+', ' ', re.sub(r'(?s)<[^>]+>', ' ', title_match.group(1))).strip() if title_match else ''
    body = re.sub(r'(?s)<[^>]+>', ' ', text)
    body = re.sub(r'\s+', ' ', html_lib.unescape(body)).strip()
    return title, body[:120000]


def validate_website(item):
    row, url = item
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 nekooweb-eat-full-collection/1.0'})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
            final_url = response.geturl()
            content_type = response.headers.get('Content-Type', '')
            if 'text/html' not in content_type and 'application/xhtml' not in content_type:
                return None
            raw = response.read(512000).decode('utf-8', 'replace')
        title, body = strip_html(raw)
        name = row.get('name') or ''
        target = norm_name(name)
        title_norm = norm_name(title)
        body_norm = norm_name(body[:40000])
        sim, containment = name_similarity(name, title)
        matched = bool(target and len(target) >= 3 and (target in title_norm or target in body_norm)) or containment or sim >= 0.72
        if not matched:
            return None
        return {
            'googlePlaceId': row['googlePlaceId'],
            'name': name,
            'distanceMeters': row.get('distanceMeters'),
            'pageUrl': final_url,
            'menuUrls': [],
            'checkedAt': CHECKED_AT,
        }
    except Exception:
        return None


def promote_osm_websites(osm_rows, hints, cache, official_index):
    candidates = []
    for row in osm_rows:
        cached = cache.get(row.get('id')) or {}
        if cached.get('status') != 'verified' or not cached.get('googlePlaceId'):
            continue
        hint = hints.get(row.get('sourceId')) or {}
        website = safe_website(hint.get('website'))
        if not website:
            continue
        candidates.append(({
            **row,
            'googlePlaceId': cached['googlePlaceId'],
        }, website))

    existing_ids = {record.get('googlePlaceId') for record in official_index.get('records', [])}
    candidates = [item for item in candidates if item[0]['googlePlaceId'] not in existing_ids]
    if WEBSITE_LIMIT:
        candidates = candidates[:WEBSITE_LIMIT]

    accepted = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=WEBSITE_CONCURRENCY) as pool:
        for result in pool.map(validate_website, candidates):
            if result:
                accepted.append(result)

    records = official_index.setdefault('records', [])
    records.extend(accepted)
    records.sort(key=lambda item: (item.get('distanceMeters') if isinstance(item.get('distanceMeters'), (int, float)) else 999999, item.get('name', '')))
    official_index['checkedAt'] = CHECKED_AT
    return accepted, {'websiteCandidates': len(candidates), 'websiteAccepted': len(accepted)}


def write_safe_state(summary):
    payload = {
        'schemaVersion': 1,
        'scope': 'TOKYO/地区1️⃣',
        'checkedAt': CHECKED_AT,
        'purpose': 'Persistent summary of full 2,804-identity collection progress. Google display payloads remain transient and are not stored here.',
        **summary,
    }
    STATE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    if not API_KEY:
        raise SystemExit('GOOGLE_MAPS_API_KEY is required')
    AUDIT.mkdir(parents=True, exist_ok=True)

    ledger = load_json(INVENTORY, {})
    entries = ledger.get('entries') or []
    inventory_only_ids = [entry.get('googlePlaceId') for entry in entries if entry.get('status') == 'inventory_only' and entry.get('googlePlaceId')]
    if IDENTITY_LIMIT:
        inventory_only_ids = inventory_only_ids[:IDENTITY_LIMIT]

    print(f'inventory_total={ledger.get("summary", {}).get("inventoryTotal")} inventory_only_targets={len(inventory_only_ids)}')
    identity_rows = fetch_all_identities(inventory_only_ids)
    (AUDIT / 'full_inventory_identity_snapshot.json').write_text(
        json.dumps(identity_rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )

    ok_rows = [row for row in identity_rows if row.get('ok')]
    operational = [row for row in ok_rows if (row.get('place') or {}).get('businessStatus') != 'CLOSED_PERMANENTLY']
    permanently_closed = [row for row in ok_rows if (row.get('place') or {}).get('businessStatus') == 'CLOSED_PERMANENTLY']

    osm_rows = load_osm_candidates()
    cache = load_json(CACHE, {})
    overpass = fetch_overpass_tags()
    hints = build_osm_hints(overpass)

    recovered, reconcile_summary = reverse_reconcile(identity_rows, osm_rows, cache)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (AUDIT / 'full_inventory_reverse_matches.json').write_text(
        json.dumps(recovered, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )

    official_index = load_json(OFFICIAL_INDEX, {'records': []})
    added_websites, website_summary = promote_osm_websites(osm_rows, hints, cache, official_index)
    OFFICIAL_INDEX.write_text(json.dumps(official_index, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (AUDIT / 'full_inventory_osm_websites.json').write_text(
        json.dumps(added_websites, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )

    summary = {
        'inventoryTotal': ledger.get('summary', {}).get('inventoryTotal'),
        'inventoryOnlyTargets': len(inventory_only_ids),
        'placeDetailsProCallsAttempted': len(inventory_only_ids),
        'identityFetchSuccess': len(ok_rows),
        'identityFetchFailed': len(identity_rows) - len(ok_rows),
        'operationalOrNonPermanent': len(operational),
        'closedPermanentObservedTransiently': len(permanently_closed),
        'osmCandidateRows': len(osm_rows),
        **reconcile_summary,
        **website_summary,
        'officialIndexRecordsAfterPass': len(official_index.get('records', [])),
        'googleEnterpriseCalls': 0,
    }
    write_safe_state(summary)
    (AUDIT / 'full_collection_pass_summary.json').write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
