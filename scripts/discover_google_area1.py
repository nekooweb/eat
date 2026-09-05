#!/usr/bin/env python3
import datetime as dt
import json
import math
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_JSON = ROOT / 'data' / 'area1_google_ids.json'
API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY')
CENTER_LAT = 35.6959
CENTER_LNG = 139.7576
AREA_RADIUS_M = 1200
SECTOR_RADIUS_M = 1225
INITIAL_SECTORS = 24
MAX_PLACES_PER_INSIGHT = 100
MAX_ARC_STEP_DEG = 1.0
AGGREGATE_URL = 'https://areainsights.googleapis.com/v1:computeInsights'

# Keep this scope aligned with the production verifier. Aggregate type filters
# include subtypes, but the explicit list documents the intended food-store
# universe and preserves compatibility with the current production contract.
SEARCH_TYPES = [
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
]


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


def offset_point(distance_m, angle_rad):
    east_m = distance_m * math.cos(angle_rad)
    north_m = distance_m * math.sin(angle_rad)
    lat = CENTER_LAT + north_m / 111320.0
    lng = CENTER_LNG + east_m / (111320.0 * math.cos(math.radians(CENTER_LAT)))
    return {'latitude': lat, 'longitude': lng}


def request_json(url, body=None, field_mask=None, retries=4):
    headers = {
        'X-Goog-Api-Key': API_KEY,
        'User-Agent': 'nekooweb-eat-google-discovery/3.0'
    }
    data = None
    if body is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(body).encode()
    if field_mask:
        headers['X-Goog-FieldMask'] = field_mask

    last_error = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, data=data, headers=headers)
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode())
        except urllib.error.HTTPError as error:
            last_error = error
            try:
                detail = error.read().decode('utf-8', 'replace')[:1600]
            except Exception:
                detail = str(error)
            print(f'HTTP {error.code}: {detail}')
            if error.code not in (429, 500, 502, 503) or attempt + 1 == retries:
                raise
            time.sleep(1.5 * (attempt + 1))
        except Exception as error:
            last_error = error
            if attempt + 1 == retries:
                raise
            time.sleep(1.0 * (attempt + 1))
    raise last_error


def type_filter():
    return {'includedTypes': SEARCH_TYPES}


def circle_count():
    body = {
        'insights': ['INSIGHT_COUNT'],
        'filter': {
            'locationFilter': {
                'circle': {
                    'latLng': {'latitude': CENTER_LAT, 'longitude': CENTER_LNG},
                    'radius': AREA_RADIUS_M
                }
            },
            'typeFilter': type_filter(),
            'operatingStatus': ['OPERATING_STATUS_OPERATIONAL']
        }
    }
    data = request_json(AGGREGATE_URL, body=body)
    return int(data.get('count', 0))


def sector_polygon(start_angle, end_angle):
    span = end_angle - start_angle
    segments = max(2, math.ceil(math.degrees(span) / MAX_ARC_STEP_DEG))
    center = {'latitude': CENTER_LAT, 'longitude': CENTER_LNG}
    coordinates = [center]
    for index in range(segments + 1):
        angle = start_angle + span * index / segments
        coordinates.append(offset_point(SECTOR_RADIUS_M, angle))
    coordinates.append(center)
    return coordinates


def sector_insight(start_angle, end_angle):
    body = {
        'insights': ['INSIGHT_COUNT', 'INSIGHT_PLACES'],
        'filter': {
            'locationFilter': {
                'customArea': {
                    'polygon': {
                        'coordinates': sector_polygon(start_angle, end_angle)
                    }
                }
            },
            'typeFilter': type_filter(),
            'operatingStatus': ['OPERATING_STATUS_OPERATIONAL']
        }
    }
    return request_json(AGGREGATE_URL, body=body)


def collect_sector_ids(start_angle, end_angle, stats, depth=0):
    data = sector_insight(start_angle, end_angle)
    stats['aggregateRequests'] += 1
    count = int(data.get('count', 0))
    if count <= MAX_PLACES_PER_INSIGHT:
        place_ids = {
            item.get('place', '').removeprefix('places/')
            for item in (data.get('placeInsights') or [])
            if item.get('place')
        }
        if len(place_ids) != count:
            raise RuntimeError(
                f'Aggregate sector count mismatch: count={count} ids={len(place_ids)} '
                f'depth={depth}'
            )
        return place_ids

    if depth >= 12:
        raise RuntimeError(f'Aggregate sector still has {count} places at depth {depth}')

    middle = (start_angle + end_angle) / 2
    return (
        collect_sector_ids(start_angle, middle, stats, depth + 1)
        | collect_sector_ids(middle, end_angle, stats, depth + 1)
    )


def place_is_inside(place_id, stats):
    data = request_json(
        'https://places.googleapis.com/v1/places/' + place_id,
        field_mask='location,businessStatus'
    )
    stats['detailRequests'] += 1
    if data.get('businessStatus') != 'OPERATIONAL':
        return False
    location = data.get('location') or {}
    lat = location.get('latitude')
    lng = location.get('longitude')
    if lat is None or lng is None:
        return False
    return haversine(CENTER_LAT, CENTER_LNG, lat, lng) <= AREA_RADIUS_M


def main():
    if not API_KEY:
        raise SystemExit('GOOGLE_MAPS_API_KEY is required')

    stats = {'aggregateRequests': 0, 'detailRequests': 0}
    exact_count = circle_count()
    stats['aggregateRequests'] += 1
    print(f'aggregate_exact_count={exact_count}')

    discovered = set()
    full_turn = 2 * math.pi
    for index in range(INITIAL_SECTORS):
        start = full_turn * index / INITIAL_SECTORS
        end = full_turn * (index + 1) / INITIAL_SECTORS
        discovered |= collect_sector_ids(start, end, stats)
        print(
            f'sector={index + 1}/{INITIAL_SECTORS} '
            f'unique_candidate_ids={len(discovered)}'
        )

    # Sectors deliberately extend 25 m beyond the production circle so the
    # inscribed polygon boundary cannot miss edge places. Coordinates are used
    # only transiently here to trim the union back to the exact 1,200 m circle.
    inside_ids = []
    for index, place_id in enumerate(sorted(discovered), 1):
        if place_is_inside(place_id, stats):
            inside_ids.append(place_id)
        if index % 100 == 0:
            print(f'boundary_qc={index}/{len(discovered)} inside={len(inside_ids)}')
            time.sleep(0.05)

    if len(inside_ids) != exact_count:
        raise RuntimeError(
            'Area1 completeness check failed: '
            f'aggregate_count={exact_count} enumerated_inside={len(inside_ids)} '
            f'raw_sector_union={len(discovered)}'
        )

    payload = {
        'schemaVersion': 3,
        'scope': 'TOKYO/地区1️⃣',
        'radiusMeters': AREA_RADIUS_M,
        'method': 'places_aggregate_partition_v1',
        'checkedAt': dt.date.today().isoformat(),
        'count': exact_count,
        'complete': True,
        'aggregateRequests': stats['aggregateRequests'],
        'detailRequests': stats['detailRequests'],
        'searchTypes': SEARCH_TYPES,
        'googlePlaceIds': inside_ids
    }
    OUT_JSON.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8'
    )
    print(
        f'complete=true exact_count={exact_count} '
        f'aggregate_requests={stats["aggregateRequests"]} '
        f'detail_requests={stats["detailRequests"]}'
    )


if __name__ == '__main__':
    main()
