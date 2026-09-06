#!/usr/bin/env python3
import concurrent.futures
import json
import os
from pathlib import Path

import full_inventory_identity_pass as base

ESSENTIAL_CONCURRENCY = max(1, int(os.environ.get('FULL_ESSENTIAL_CONCURRENCY', '6')))
PRO_CONCURRENCY = max(1, int(os.environ.get('FULL_PRO_CONCURRENCY', '5')))
PRO_NAME_LIMIT = max(0, int(os.environ.get('FULL_PRO_NAME_LIMIT', '1500') or 0))
NEARBY_NAME_RADIUS_M = float(os.environ.get('FULL_PRO_NEARBY_RADIUS_M', '65'))
REJECTED_NAME_RADIUS_M = float(os.environ.get('FULL_PRO_REJECTED_RADIUS_M', '100'))


def fetch_essential(place_id):
    try:
        place = base.get_json(
            'https://places.googleapis.com/v1/places/' + place_id,
            'id,location,businessStatus,types',
            retries=5,
        )
        return {'googlePlaceId': place_id, 'ok': True, 'place': place}
    except Exception as error:
        return {'googlePlaceId': place_id, 'ok': False, 'error': type(error).__name__}


def fetch_name(place_id):
    try:
        place = base.get_json(
            'https://places.googleapis.com/v1/places/' + place_id,
            'displayName',
            retries=5,
        )
        return place_id, (place.get('displayName') or {}).get('text', '')
    except Exception:
        return place_id, ''


def fetch_parallel(ids, worker, concurrency, progress_label):
    out = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {pool.submit(worker, place_id): place_id for place_id in ids}
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            out.append(future.result())
            if index % 100 == 0:
                print(f'{progress_label}={index}/{len(ids)}')
    return out


def distance_to_nearest_unverified(row, osm_rows, cache):
    place = row.get('place') or {}
    loc = place.get('location') or {}
    lat = loc.get('latitude')
    lng = loc.get('longitude')
    if lat is None or lng is None:
        return None
    best = None
    for osm in osm_rows:
        state = cache.get(osm.get('id')) or {}
        if state.get('status') == 'verified':
            continue
        if osm.get('lat') is None or osm.get('lng') is None:
            continue
        distance = base.haversine(lat, lng, osm['lat'], osm['lng'])
        if best is None or distance < best:
            best = distance
    return best


def main():
    if not base.API_KEY:
        raise SystemExit('GOOGLE_MAPS_API_KEY is required')
    base.AUDIT.mkdir(parents=True, exist_ok=True)

    ledger = base.load_json(base.INVENTORY, {})
    entries = ledger.get('entries') or []
    inventory_only_ids = [
        entry.get('googlePlaceId')
        for entry in entries
        if entry.get('status') == 'inventory_only' and entry.get('googlePlaceId')
    ]
    identity_limit = max(0, int(os.environ.get('FULL_IDENTITY_LIMIT', '0') or 0))
    if identity_limit:
        inventory_only_ids = inventory_only_ids[:identity_limit]

    print(f'inventory_total={ledger.get("summary", {}).get("inventoryTotal")} inventory_only_targets={len(inventory_only_ids)}')
    identity_rows = fetch_parallel(
        inventory_only_ids,
        fetch_essential,
        ESSENTIAL_CONCURRENCY,
        'essential_identity_fetch',
    )
    ok_rows = [row for row in identity_rows if row.get('ok')]

    osm_rows = base.load_osm_candidates()
    cache = base.load_json(base.CACHE, {})
    rejected_place_ids = {
        state.get('googlePlaceId')
        for state in cache.values()
        if state.get('status') == 'rejected' and state.get('googlePlaceId')
    }

    pro_candidates = []
    for row in ok_rows:
        distance = distance_to_nearest_unverified(row, osm_rows, cache)
        if distance is None:
            continue
        place_id = row['googlePlaceId']
        eligible = distance <= NEARBY_NAME_RADIUS_M or (
            place_id in rejected_place_ids and distance <= REJECTED_NAME_RADIUS_M
        )
        if eligible:
            pro_candidates.append((0 if place_id in rejected_place_ids else 1, distance, place_id))
    pro_candidates.sort()
    pro_ids = [item[2] for item in pro_candidates]
    if PRO_NAME_LIMIT:
        pro_ids = pro_ids[:PRO_NAME_LIMIT]

    print(f'pro_name_candidates={len(pro_candidates)} pro_name_selected={len(pro_ids)} limit={PRO_NAME_LIMIT}')
    names = dict(fetch_parallel(pro_ids, fetch_name, PRO_CONCURRENCY, 'pro_name_fetch')) if pro_ids else {}
    for row in identity_rows:
        name = names.get(row.get('googlePlaceId'))
        if name:
            row.setdefault('place', {})['displayName'] = {'text': name}

    (base.AUDIT / 'full_inventory_identity_snapshot.json').write_text(
        json.dumps(identity_rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )

    overpass = base.fetch_overpass_tags()
    hints = base.build_osm_hints(overpass)
    recovered, reconcile_summary = base.reverse_reconcile(identity_rows, osm_rows, cache)
    base.CACHE.write_text(json.dumps(cache, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (base.AUDIT / 'full_inventory_reverse_matches.json').write_text(
        json.dumps(recovered, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )

    official_index = base.load_json(base.OFFICIAL_INDEX, {'records': []})
    added_websites, website_summary = base.promote_osm_websites(osm_rows, hints, cache, official_index)
    base.OFFICIAL_INDEX.write_text(json.dumps(official_index, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (base.AUDIT / 'full_inventory_osm_websites.json').write_text(
        json.dumps(added_websites, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )

    permanently_closed = [
        row for row in ok_rows
        if (row.get('place') or {}).get('businessStatus') == 'CLOSED_PERMANENTLY'
    ]
    summary = {
        'inventoryTotal': ledger.get('summary', {}).get('inventoryTotal'),
        'inventoryOnlyTargets': len(inventory_only_ids),
        'placeDetailsEssentialsCallsAttempted': len(inventory_only_ids),
        'placeDetailsProNameCallsAttempted': len(pro_ids),
        'proNameCandidatePool': len(pro_candidates),
        'identityFetchSuccess': len(ok_rows),
        'identityFetchFailed': len(identity_rows) - len(ok_rows),
        'closedPermanentObservedTransiently': len(permanently_closed),
        'osmCandidateRows': len(osm_rows),
        **reconcile_summary,
        **website_summary,
        'officialIndexRecordsAfterPass': len(official_index.get('records', [])),
        'googleEnterpriseCalls': 0,
    }
    base.write_safe_state(summary)
    (base.AUDIT / 'full_collection_pass_summary.json').write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
