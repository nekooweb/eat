#!/usr/bin/env python3
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
CELL_RADIUS_M = 320
GRID_STEP_M = 430

# Nearby Search returns at most 20 places. Dense Jimbocho cells therefore use
# separate food-type searches so specialist stores are not hidden by the generic
# restaurant result cap. Types are restricted to current Places API Table A.
SEARCH_TYPES = [
    'restaurant', 'cafe', 'coffee_shop', 'bakery', 'meal_takeaway',
    'fast_food_restaurant', 'food_court', 'dessert_shop', 'ice_cream_shop',
    'confectionery', 'ramen_restaurant', 'noodle_shop', 'japanese_restaurant',
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


def offset_point(north_m, east_m):
    lat = CENTER_LAT + north_m / 111320.0
    lng = CENTER_LNG + east_m / (111320.0 * math.cos(math.radians(CENTER_LAT)))
    return lat, lng


def grid_points():
    points = []
    limit = AREA_RADIUS_M + CELL_RADIUS_M
    east = -limit
    while east <= limit:
        north = -limit
        while north <= limit:
            if math.hypot(east, north) <= AREA_RADIUS_M + CELL_RADIUS_M:
                points.append(offset_point(north, east))
            north += GRID_STEP_M
        east += GRID_STEP_M
    return points


def post_nearby(lat, lng, place_type):
    body = {
        'includedTypes': [place_type],
        'maxResultCount': 20,
        'rankPreference': 'DISTANCE',
        'locationRestriction': {
            'circle': {
                'center': {'latitude': lat, 'longitude': lng},
                'radius': CELL_RADIUS_M
            }
        }
    }
    request = urllib.request.Request(
        'https://places.googleapis.com/v1/places:searchNearby',
        data=json.dumps(body).encode(),
        headers={
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': API_KEY,
            # Location/status are used only to enforce the production boundary and
            # remove permanent closures. Only the Place ID is persisted below.
            'X-Goog-FieldMask': 'places.id,places.location,places.businessStatus',
            'User-Agent': 'nekooweb-eat-google-discovery/2.0'
        }
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode()).get('places', [])


def main():
    if not API_KEY:
        raise SystemExit('GOOGLE_MAPS_API_KEY is required')

    place_ids = set()
    calls = 0
    errors = 0
    points = grid_points()

    for lat, lng in points:
        for place_type in SEARCH_TYPES:
            try:
                places = post_nearby(lat, lng, place_type)
                calls += 1
            except urllib.error.HTTPError as error:
                errors += 1
                if error.code in (429, 500, 502, 503):
                    time.sleep(1.5)
                continue

            for place in places:
                place_id = place.get('id')
                location = place.get('location') or {}
                place_lat = location.get('latitude')
                place_lng = location.get('longitude')
                if not place_id or place_lat is None or place_lng is None:
                    continue
                if haversine(CENTER_LAT, CENTER_LNG, place_lat, place_lng) > AREA_RADIUS_M:
                    continue
                if place.get('businessStatus') == 'CLOSED_PERMANENTLY':
                    continue
                place_ids.add(place_id)
        time.sleep(0.05)

    payload = {
        'schemaVersion': 2,
        'scope': 'TOKYO/地区1️⃣',
        'radiusMeters': AREA_RADIUS_M,
        'apiCalls': calls,
        'errors': errors,
        'count': len(place_ids),
        'googlePlaceIds': sorted(place_ids)
    }
    OUT_JSON.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8'
    )
    print(
        f'grid_points={len(points)} search_types={len(SEARCH_TYPES)} '
        f'api_calls={calls} errors={errors} unique_place_ids={len(place_ids)}'
    )


if __name__ == '__main__':
    main()
