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
BOUNDARY_RECOVERY_RADIUS_M = 1205
EARTH_RADIUS_M = 6371000
INITIAL_SECTORS = 24
MAX_PLACES_PER_INSIGHT = 100
MAX_ARC_STEP_DEG = 0.25
MAX_SPLIT_DEPTH = 12
AGGREGATE_URL = 'https://areainsights.googleapis.com/v1:computeInsights'

# Project food-business universe. General restaurant includes its subtypes;
# explicit additional food-service types cover cafes, bakeries, bars, etc.
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
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    value = (
        math.sin(d_lat / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(d_lng / 2) ** 2
    )
    return EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def destination_point(distance_m, math_angle_rad):
    # math_angle_rad: 0=east, pi/2=north. Navigation bearing is 0=north,
    # pi/2=east, hence the conversion below.
    bearing = math.pi / 2 - math_angle_rad
    angular_distance = distance_m / EARTH_RADIUS_M
    lat1 = math.radians(CENTER_LAT)
    lng1 = math.radians(CENTER_LNG)

    lat2 = math.asin(
        math.sin(lat1) * math.cos(angular_distance)
        + math.cos(lat1) * math.sin(angular_distance) * math.cos(bearing)
    )
    lng2 = lng1 + math.atan2(
        math.sin(bearing) * math.sin(angular_distance) * math.cos(lat1),
        math.cos(angular_distance) - math.sin(lat1) * math.sin(lat2)
    )
    return {'latitude': math.degrees(lat2), 'longitude': math.degrees(lng2)}


def request_json(url, body=None, field_mask=None, retries=4):
    headers = {
        'X-Goog-Api-Key': API_KEY,
        'User-Agent': 'nekooweb-eat-google-discovery/5.0'
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


def aggregate_filter(location_filter):
    return {
        'locationFilter': location_filter,
        'typeFilter': {'includedTypes': SEARCH_TYPES},
        'operatingStatus': ['OPERATING_STATUS_OPERATIONAL']
    }


def circle_count():
    body = {
        'insights': ['INSIGHT_COUNT'],
        'filter': aggregate_filter({
            'circle': {
                'latLng': {'latitude': CENTER_LAT, 'longitude': CENTER_LNG},
                'radius': AREA_RADIUS_M
            }
        })
    }
    return int(request_json(AGGREGATE_URL, body=body).get('count', 0))


def sector_polygon(start_angle, end_angle, radius_m):
    span = end_angle - start_angle
    segments = max(2, math.ceil(math.degrees(span) / MAX_ARC_STEP_DEG))
    center = {'latitude': CENTER_LAT, 'longitude': CENTER_LNG}
    coordinates = [center]
    for index in range(segments + 1):
        angle = start_angle + span * index / segments
        coordinates.append(destination_point(radius_m, angle))
    coordinates.append(center)
    return coordinates


def sector_query(start_angle, end_angle, radius_m, insights, retries=4):
    body = {
        'insights': insights,
        'filter': aggregate_filter({
            'customArea': {
                'polygon': {
                    'coordinates': sector_polygon(start_angle, end_angle, radius_m)
                }
            }
        })
    }
    return request_json(AGGREGATE_URL, body=body, retries=retries)


def collect_sector_ids(start_angle, end_angle, radius_m, stats, depth=0):
    # INSIGHT_PLACES refuses regions above 100 results, so always count first
    # and recursively split dense sectors before requesting IDs.
    count_data = sector_query(start_angle, end_angle, radius_m, ['INSIGHT_COUNT'])
    stats['aggregateRequests'] += 1
    count = int(count_data.get('count', 0))

    if count > MAX_PLACES_PER_INSIGHT:
        if depth >= MAX_SPLIT_DEPTH:
            raise RuntimeError(
                f'Aggregate sector still has {count} places at depth {depth}'
            )
        stats['aggregateSplits'] += 1
        middle = (start_angle + end_angle) / 2
        return (
            collect_sector_ids(start_angle, middle, radius_m, stats, depth + 1)
            | collect_sector_ids(middle, end_angle, radius_m, stats, depth + 1)
        )

    if count == 0:
        return set()

    try:
        data = sector_query(
            start_angle,
            end_angle,
            radius_m,
            ['INSIGHT_COUNT', 'INSIGHT_PLACES'],
            retries=1
        )
        stats['aggregateRequests'] += 1
    except urllib.error.HTTPError as error:
        # The result count can change between COUNT and PLACES calls. If it
        # crossed the cap, split rather than retrying an over-cap request.
        if error.code != 429 or depth >= MAX_SPLIT_DEPTH:
            raise
        stats['aggregateRequests'] += 1
        stats['aggregateSplits'] += 1
        middle = (start_angle + end_angle) / 2
        return (
            collect_sector_ids(start_angle, middle, radius_m, stats, depth + 1)
            | collect_sector_ids(middle, end_angle, radius_m, stats, depth + 1)
        )

    returned_count = int(data.get('count', count))
    place_ids = {
        item.get('place', '').removeprefix('places/')
        for item in (data.get('placeInsights') or [])
        if item.get('place')
    }
    if len(place_ids) != returned_count:
        raise RuntimeError(
            f'Aggregate sector count mismatch: count={returned_count} '
            f'ids={len(place_ids)} depth={depth}'
        )
    return place_ids


def enumerate_radius(radius_m, stats, label):
    discovered = set()
    full_turn = 2 * math.pi
    for index in range(INITIAL_SECTORS):
        start = full_turn * index / INITIAL_SECTORS
        end = full_turn * (index + 1) / INITIAL_SECTORS
        discovered |= collect_sector_ids(start, end, radius_m, stats)
        print(
            f'{label}_sector={index + 1}/{INITIAL_SECTORS} '
            f'unique_candidate_ids={len(discovered)}'
        )
    return discovered


def place_location_is_inside(place_id, stats):
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


def discover_exact(stats):
    exact_count = circle_count()
    stats['aggregateRequests'] += 1
    print(f'aggregate_exact_count={exact_count}')

    inner_ids = enumerate_radius(AREA_RADIUS_M, stats, 'inner')
    print(f'inner_geodesic_union={len(inner_ids)}')

    if len(inner_ids) == exact_count:
        return {
            'method': 'places_aggregate_geodesic_partition_v3',
            'count': exact_count,
            'googlePlaceIds': sorted(inner_ids),
            'boundaryCandidates': 0,
            'boundaryRecovered': 0
        }

    if len(inner_ids) > exact_count:
        raise RuntimeError(
            f'Geodesic sector union exceeds exact circle count: '
            f'count={exact_count} ids={len(inner_ids)}'
        )

    # The exact circle and custom polygon filters can differ minutely at the
    # boundary. Enumerate a 5 m outer guard band, then request transient
    # location/status only for IDs absent from the inscribed union. This avoids
    # fetching Place Details for the full inventory.
    outer_ids = enumerate_radius(BOUNDARY_RECOVERY_RADIUS_M, stats, 'outer')
    boundary_candidates = sorted(outer_ids - inner_ids)
    stats['boundaryCandidates'] = len(boundary_candidates)
    print(
        f'boundary_candidates={len(boundary_candidates)} '
        f'outer_union={len(outer_ids)}'
    )

    recovered = set()
    for place_id in boundary_candidates:
        if place_location_is_inside(place_id, stats):
            recovered.add(place_id)

    final_ids = inner_ids | recovered
    stats['boundaryRecovered'] = len(recovered)
    print(
        f'boundary_recovered={len(recovered)} '
        f'final_unique_ids={len(final_ids)}'
    )

    if len(final_ids) != exact_count:
        raise RuntimeError(
            'Area1 completeness check failed after geodesic boundary recovery: '
            f'aggregate_count={exact_count} inner_ids={len(inner_ids)} '
            f'boundary_candidates={len(boundary_candidates)} '
            f'recovered={len(recovered)} final_ids={len(final_ids)}'
        )

    return {
        'method': 'places_aggregate_geodesic_partition_boundary_qc_v3',
        'count': exact_count,
        'googlePlaceIds': sorted(final_ids),
        'boundaryCandidates': len(boundary_candidates),
        'boundaryRecovered': len(recovered)
    }


def read_previous_ids():
    try:
        payload = json.loads(OUT_JSON.read_text(encoding='utf-8'))
        return set(payload.get('googlePlaceIds') or [])
    except Exception:
        return set()


def main():
    if not API_KEY:
        raise SystemExit('GOOGLE_MAPS_API_KEY is required')

    previous_ids = read_previous_ids()
    stats = {
        'aggregateRequests': 0,
        'aggregateSplits': 0,
        'detailRequests': 0,
        'boundaryCandidates': 0,
        'boundaryRecovered': 0
    }

    result = discover_exact(stats)
    ids = result['googlePlaceIds']
    id_set = set(ids)

    payload = {
        'schemaVersion': 6,
        'scope': 'TOKYO/地区1️⃣',
        'radiusMeters': AREA_RADIUS_M,
        'method': result['method'],
        'checkedAt': dt.date.today().isoformat(),
        'count': result['count'],
        'complete': True,
        'coverageVerified': True,
        'independentCountVerified': True,
        'completenessBasis': 'aggregate_exact_circle_count_equals_geodesic_partition_inventory',
        'aggregateExactCount': result['count'],
        'aggregateRequests': stats['aggregateRequests'],
        'aggregateSplits': stats['aggregateSplits'],
        'detailRequests': stats['detailRequests'],
        'boundaryCandidates': result['boundaryCandidates'],
        'boundaryRecovered': result['boundaryRecovered'],
        'previousInventoryCount': len(previous_ids),
        'newSincePrevious': len(id_set - previous_ids),
        'missingFromPrevious': len(previous_ids - id_set),
        'searchTypes': SEARCH_TYPES,
        'googlePlaceIds': ids
    }

    OUT_JSON.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8'
    )
    print(
        f'complete=true method={result["method"]} count={result["count"]} '
        f'new_since_previous={payload["newSincePrevious"]} '
        f'missing_from_previous={payload["missingFromPrevious"]} '
        f'aggregate_requests={stats["aggregateRequests"]} '
        f'detail_requests={stats["detailRequests"]}'
    )


if __name__ == '__main__':
    main()
