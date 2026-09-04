#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD = ROOT / 'data' / 'area1_google_places.json'
OUT = ROOT / 'data' / 'area1_google_ids.json'


def main():
    if not OLD.exists():
        if OUT.exists():
            print('Legacy Google cache already removed; ID inventory exists.')
            return
        raise SystemExit('No legacy Google discovery file to migrate')

    data = json.loads(OLD.read_text(encoding='utf-8'))
    place_ids = sorted({
        row.get('googlePlaceId')
        for row in data.get('places', [])
        if isinstance(row, dict) and row.get('googlePlaceId')
    })
    if not place_ids:
        raise SystemExit('Legacy Google discovery file contained no Place IDs')

    payload = {
        'schemaVersion': 2,
        'scope': 'TOKYO/地区1️⃣',
        'radiusMeters': 1200,
        'migratedFromLegacyDiscovery': True,
        'count': len(place_ids),
        'googlePlaceIds': place_ids
    }
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8'
    )
    print(f'migrated_place_ids={len(place_ids)}')


if __name__ == '__main__':
    main()
