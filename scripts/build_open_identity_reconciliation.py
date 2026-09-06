#!/usr/bin/env python3
"""Prioritize frozen legacy identity reconciliation without paid API calls.

The script combines persisted historical Google->OSM match metrics with current
Overture candidates near the persisted OSM entity. It emits review priorities;
it never promotes production automatically.
"""

import json
import math
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OVERTURE = ROOT / '_audit' / 'overture_area1_candidates.json'
LEGACY_QUEUE = ROOT / 'data' / 'area1_full_collection_queue.json'
DEFAULT_OUTPUT = ROOT / '_audit' / 'open_identity_reconciliation.json'
GRID_DEG = 0.002
MAX_DISTANCE_M = 250


def haversine(lat1, lng1, lat2, lng2):
    radius = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    value = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def normalize(value):
    text = unicodedata.normalize('NFKC', str(value or '')).lower()
    text = re.sub(r'株式会社|有限会社|合同会社|東京|tokyo', '', text)
    text = re.sub(r'店$', '', text)
    return re.sub(r'[\s\u3000・･\-—_()（）\[\]【】「」『』\'"&＆.,/]+', '', text)


def similarity(left, right):
    a, b = normalize(left), normalize(right)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    if min(len(a), len(b)) >= 4 and (a in b or b in a):
        return 0.96
    return SequenceMatcher(None, a, b).ratio()


def compact_text(value):
    if value is None:
        return ''
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def cell(lat, lng):
    return (math.floor(float(lat) / GRID_DEG), math.floor(float(lng) / GRID_DEG))


def nearby(index, lat, lng):
    cy, cx = cell(lat, lng)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            yield from index.get((cy + dy, cx + dx), [])


def cross_confidence(name_score, distance, address_score):
    if name_score >= 0.92 and distance <= 70:
        return 'high'
    if name_score >= 0.84 and distance <= 40 and address_score >= 0.50:
        return 'high'
    if name_score >= 0.76 and distance <= 120:
        return 'medium'
    if name_score >= 0.62 and distance <= 180:
        return 'review'
    return 'low'


def triage(prior, cross):
    if prior in {'medium', 'review'} and cross == 'high':
        return 'A_priority_review'
    if prior == 'high' and cross == 'high':
        return 'B_blocker_review'
    if prior in {'medium', 'review', 'high'} and cross == 'medium':
        return 'C_review'
    return 'D_unresolved'


def main():
    overture_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OVERTURE
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUTPUT
    output_path.parent.mkdir(parents=True, exist_ok=True)

    overture_payload = json.loads(overture_path.read_text(encoding='utf-8'))
    legacy = json.loads(LEGACY_QUEUE.read_text(encoding='utf-8'))
    overture_rows = overture_payload.get('rows', [])

    spatial = defaultdict(list)
    for row in overture_rows:
        if isinstance(row.get('lat'), (int, float)) and isinstance(row.get('lng'), (int, float)):
            spatial[cell(row['lat'], row['lng'])].append(row)

    results = []
    for row in legacy.get('rows', []):
        candidate = row.get('candidate') or {}
        lat, lng = candidate.get('lat'), candidate.get('lng')
        prior = row.get('matchConfidence') or 'none'
        if row.get('googleStatus') != 'operational_food' or lat is None or lng is None:
            continue

        best = None
        for item in nearby(spatial, lat, lng):
            distance = haversine(lat, lng, item['lat'], item['lng'])
            if distance > MAX_DISTANCE_M:
                continue
            name_score = similarity(candidate.get('sourceName'), item.get('name'))
            address_score = similarity(candidate.get('address'), compact_text(item.get('addresses')))
            distance_score = max(0.0, 1 - distance / MAX_DISTANCE_M)
            combined = name_score * 0.70 + distance_score * 0.25 + address_score * 0.05
            scored = (combined, name_score, -distance, address_score, item)
            if best is None or scored[:4] > best[:4]:
                best = scored

        result = {
            'legacyGooglePlaceId': row.get('googlePlaceId'),
            'historicalGoogleOsmConfidence': prior,
            'historicalGoogleOsmDistanceMeters': candidate.get('distanceMeters'),
            'historicalGoogleOsmNameSimilarity': candidate.get('nameSimilarity'),
            'osmCandidate': {
                'sourceCandidateId': candidate.get('sourceCandidateId'),
                'name': candidate.get('sourceName'),
                'address': candidate.get('address'),
                'lat': lat,
                'lng': lng
            }
        }

        if best is None:
            result.update({
                'overtureSupport': None,
                'crossSourceConfidence': 'none',
                'triage': 'D_unresolved'
            })
        else:
            combined, name_score, neg_distance, address_score, item = best
            distance = -neg_distance
            cross = cross_confidence(name_score, distance, address_score)
            result.update({
                'overtureSupport': {
                    'overtureId': item.get('overtureId'),
                    'name': item.get('name'),
                    'distanceToOsmMeters': round(distance),
                    'nameSimilarity': round(name_score, 3),
                    'addressSimilarity': round(address_score, 3),
                    'combinedScore': round(combined, 3),
                    'basicCategory': item.get('basicCategory'),
                    'websites': item.get('websites'),
                    'brand': item.get('brand'),
                    'sources': item.get('sources')
                },
                'crossSourceConfidence': cross,
                'triage': triage(prior, cross)
            })
        results.append(result)

    order = {'A_priority_review': 0, 'B_blocker_review': 1, 'C_review': 2, 'D_unresolved': 3}
    results.sort(key=lambda row: (
        order.get(row['triage'], 9),
        -(row.get('overtureSupport') or {}).get('combinedScore', 0),
        row.get('legacyGooglePlaceId') or ''
    ))

    payload = {
        'schemaVersion': 1,
        'policy': {
            'paidApiCalls': 0,
            'automaticPromotion': False,
            'historicalTerminalConflictsMustBePreserved': True,
            'priorLowConfidenceCannotAutoPromote': True
        },
        'sources': {
            'legacyQueue': str(LEGACY_QUEUE.relative_to(ROOT)),
            'overture': str(overture_path),
            'overtureRelease': overture_payload.get('release')
        },
        'summary': {
            'legacyRowsCompared': len(results),
            'triageCounts': dict(Counter(row['triage'] for row in results)),
            'crossSourceConfidenceCounts': dict(Counter(row['crossSourceConfidence'] for row in results))
        },
        'rows': results
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(payload['summary'], ensure_ascii=False))


if __name__ == '__main__':
    main()
