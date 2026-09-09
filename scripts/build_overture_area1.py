#!/usr/bin/env python3
"""Build a zero-paid-API Overture Places staging snapshot for Area1.

This script reads Overture's public GeoParquet with DuckDB. It does not use an
API key and does not promote rows into production. The output is a review input.

The staging snapshot retains the source entity's primary and common names. Common
names are source-provided aliases/language variants only; they never replace the
catalog/runtime identity name by themselves.
"""

import json
import math
import os
import re
import sys
from pathlib import Path

CENTER_LAT = 35.6959
CENTER_LNG = 139.7576
RADIUS_M = 1200
EARTH_RADIUS_M = 6371000
DEFAULT_RELEASE = '2026-08-19.0'
FOOD_TOKENS = {
    'food', 'drink', 'restaurant', 'cafe', 'coffee', 'bakery', 'bar', 'pub',
    'dessert', 'ice_cream', 'confectionery', 'tea', 'meal', 'ramen', 'noodle',
    'sushi', 'curry', 'izakaya', 'yakiniku', 'yakitori', 'tonkatsu', 'pizza',
    'hamburger', 'seafood', 'steak', 'barbecue', 'fast_food'
}


def haversine(lat1, lng1, lat2, lng2):
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    value = (
        math.sin(dlat / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    )
    return EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def parse_json(value):
    if value is None:
        return None
    if isinstance(value, (dict, list, int, float, bool)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return value


def flatten_strings(value):
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        output = []
        for item in value:
            output.extend(flatten_strings(item))
        return output
    if isinstance(value, dict):
        output = []
        for item in value.values():
            output.extend(flatten_strings(item))
        return output
    return [str(value)]


def is_food_candidate(basic_category, taxonomy):
    haystack = ' '.join(
        [str(basic_category or '')] + flatten_strings(taxonomy)
    ).lower().replace('-', '_').replace(' ', '_')
    return any(token in haystack for token in FOOD_TOKENS)


def retained_names(primary, names_doc):
    """Keep only identity-safe source name facts needed for later alias review."""
    common = names_doc.get('common') if isinstance(names_doc, dict) else None
    return {
        'primary': primary,
        'common': common,
    }


def main():
    try:
        import duckdb
    except ImportError:
        raise SystemExit('duckdb is required: python -m pip install "duckdb>=1.3,<2"')

    release = os.environ.get('OVERTURE_RELEASE', DEFAULT_RELEASE).strip()
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}\.\d+', release):
        raise SystemExit(f'Invalid OVERTURE_RELEASE: {release!r}')

    output = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('_audit/overture_area1_candidates.json')
    output.parent.mkdir(parents=True, exist_ok=True)

    margin_m = RADIUS_M + 150
    lat_delta = margin_m / 111320
    lng_delta = margin_m / (111320 * math.cos(math.radians(CENTER_LAT)))
    west, east = CENTER_LNG - lng_delta, CENTER_LNG + lng_delta
    south, north = CENTER_LAT - lat_delta, CENTER_LAT + lat_delta

    source = f's3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*'
    con = duckdb.connect(database=':memory:')
    con.execute('INSTALL httpfs; LOAD httpfs;')
    con.execute('INSTALL spatial; LOAD spatial;')
    con.execute("SET s3_region='us-west-2'")

    query = f'''
        SELECT
          id,
          names.primary AS name,
          to_json(names) AS names_json,
          basic_category,
          to_json(taxonomy) AS taxonomy_json,
          confidence,
          to_json(websites) AS websites_json,
          to_json(phones) AS phones_json,
          to_json(brand) AS brand_json,
          to_json(addresses) AS addresses_json,
          to_json(sources) AS sources_json,
          ST_Y(geometry) AS lat,
          ST_X(geometry) AS lng
        FROM read_parquet('{source}', hive_partitioning=1)
        WHERE bbox.xmin <= {east}
          AND bbox.xmax >= {west}
          AND bbox.ymin <= {north}
          AND bbox.ymax >= {south}
    '''

    cursor = con.execute(query)
    columns = [item[0] for item in cursor.description]
    rows = []
    scanned = 0
    rows_with_common_names = 0
    common_name_values = 0
    for raw in cursor.fetchall():
        scanned += 1
        item = dict(zip(columns, raw))
        lat = item.get('lat')
        lng = item.get('lng')
        if lat is None or lng is None:
            continue
        distance = haversine(CENTER_LAT, CENTER_LNG, float(lat), float(lng))
        if distance > RADIUS_M:
            continue
        taxonomy = parse_json(item.get('taxonomy_json'))
        if not is_food_candidate(item.get('basic_category'), taxonomy):
            continue
        names_doc = parse_json(item.get('names_json'))
        names = retained_names(item.get('name'), names_doc)
        common_values = [v.strip() for v in flatten_strings(names.get('common')) if isinstance(v, str) and v.strip()]
        if common_values:
            rows_with_common_names += 1
            common_name_values += len(set(common_values))
        rows.append({
            'overtureId': item.get('id'),
            'name': item.get('name'),
            'names': names,
            'basicCategory': item.get('basic_category'),
            'taxonomy': taxonomy,
            'confidence': item.get('confidence'),
            'websites': parse_json(item.get('websites_json')),
            'phones': parse_json(item.get('phones_json')),
            'brand': parse_json(item.get('brand_json')),
            'addresses': parse_json(item.get('addresses_json')),
            'sources': parse_json(item.get('sources_json')),
            'lat': round(float(lat), 7),
            'lng': round(float(lng), 7),
            'distanceMeters': round(distance)
        })

    rows.sort(key=lambda row: (row['distanceMeters'], row.get('name') or '', row.get('overtureId') or ''))
    payload = {
        'schemaVersion': 2,
        'source': 'Overture Maps Places public GeoParquet',
        'release': release,
        'scope': {
            'profile': 'TOKYO',
            'area': '地区1️⃣',
            'center': {'lat': CENTER_LAT, 'lng': CENTER_LNG},
            'radiusMeters': RADIUS_M
        },
        'policy': {
            'paidApiCalls': 0,
            'productionAdmission': False,
            'preciseRadiusApplied': True,
            'preserveRecordSourcesForAttribution': True,
            'sourceNamesRetained': ['primary', 'common'],
            'commonNamesAreAliasEvidenceOnly': True,
            'commonNamesMayReplaceCatalogIdentity': False,
        },
        'summary': {
            'bboxRowsScanned': scanned,
            'foodCandidatesInsideRadius': len(rows),
            'rowsWithCommonNames': rows_with_common_names,
            'commonNameValues': common_name_values,
        },
        'rows': rows
    }
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(payload['summary'], ensure_ascii=False))


if __name__ == '__main__':
    main()
