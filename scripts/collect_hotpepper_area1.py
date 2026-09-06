#!/usr/bin/env python3
"""Collect Hot Pepper Gourmet enrichment data for the already-known Area1 list.

This script uses the free/authorized Hot Pepper Gourmet Web Service. It does not
call Google or any paid place/search API.

Modes:
  discover OUTPUT.json
      Fetch a geographic superset with type=lite, paginate at 100 rows/page,
      crop locally to the exact 1.2 km Area1 radius, and write matching input.

  details BINDINGS.json OUTPUT.json
      Read hotpepperId values from a binding candidate file and fetch full shop
      details in batches of <=20 IDs per request.

Raw responses stay in short-lived audit outputs. Canonical promotion is handled
separately after exact identity matching/review.
"""

from __future__ import annotations

import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API_URL = "https://webservice.recruit.co.jp/hotpepper/gourmet/v1/"
CENTER_LAT = 35.6959
CENTER_LNG = 139.7576
AREA_RADIUS_M = 1200
EARTH_RADIUS_M = 6371000
DISCOVERY_RANGE = int(os.environ.get("HOTPEPPER_DISCOVERY_RANGE", "4"))  # 2 km
PAGE_SIZE = 100
DETAIL_BATCH_SIZE = 20
REQUEST_INTERVAL = float(os.environ.get("HOTPEPPER_REQUEST_INTERVAL", "0.20"))
TIMEOUT = int(os.environ.get("HOTPEPPER_TIMEOUT_SECONDS", "30"))
MAX_PAGES = int(os.environ.get("HOTPEPPER_MAX_PAGES", "100"))
API_KEY = os.environ.get("HOTPEPPER_API_KEY", "").strip()


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    value = (
        math.sin(dlat / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    )
    return EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def api_error(payload):
    results = payload.get("results") or {}
    error = results.get("error")
    if not error:
        return None
    if isinstance(error, list):
        return "; ".join(str((item or {}).get("message") or item) for item in error)
    if isinstance(error, dict):
        return str(error.get("message") or error)
    return str(error)


def request_json(params, retries=4):
    if not API_KEY:
        raise SystemExit("HOTPEPPER_API_KEY is required")
    query = dict(params)
    query["key"] = API_KEY
    query["format"] = "json"
    url = API_URL + "?" + urllib.parse.urlencode(query, doseq=True)
    headers = {
        "User-Agent": "nekooweb-eat-hotpepper-enrichment/1.0",
        "Accept": "application/json",
    }
    last_error = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
                payload = json.loads(response.read().decode("utf-8"))
            message = api_error(payload)
            if message:
                raise RuntimeError(f"Hot Pepper API error: {message}")
            return payload
        except (urllib.error.URLError, TimeoutError, RuntimeError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt + 1 == retries:
                raise
            time.sleep(max(0.5, REQUEST_INTERVAL) * (attempt + 1))
    raise last_error


def compact_lite(shop):
    genre = shop.get("genre") or {}
    return {
        "hotpepperId": shop.get("id"),
        "name": shop.get("name"),
        "address": shop.get("address"),
        "lat": shop.get("lat"),
        "lng": shop.get("lng"),
        "genre": {
            "code": genre.get("code"),
            "name": genre.get("name"),
            "catch": genre.get("catch"),
        },
        "url": (shop.get("urls") or {}).get("pc"),
    }


def compact_detail(shop):
    return {
        "hotpepperId": shop.get("id"),
        "name": shop.get("name"),
        "nameKana": shop.get("name_kana"),
        "address": shop.get("address"),
        "stationName": shop.get("station_name"),
        "lat": shop.get("lat"),
        "lng": shop.get("lng"),
        "genre": shop.get("genre"),
        "subGenre": shop.get("sub_genre"),
        "budget": shop.get("budget"),
        "budgetMemo": shop.get("budget_memo"),
        "catch": shop.get("catch"),
        "open": shop.get("open"),
        "close": shop.get("close"),
        "lunch": shop.get("lunch"),
        "urls": shop.get("urls"),
        "access": shop.get("access"),
        "course": shop.get("course"),
        "freeDrink": shop.get("free_drink"),
        "freeFood": shop.get("free_food"),
        "privateRoom": shop.get("private_room"),
        "card": shop.get("card"),
        "nonSmoking": shop.get("non_smoking"),
        "parking": shop.get("parking"),
    }


def discover(output_path: Path):
    rows_by_id = {}
    start = 1
    pages = 0
    available = None

    while pages < MAX_PAGES:
        payload = request_json({
            "lat": CENTER_LAT,
            "lng": CENTER_LNG,
            "range": DISCOVERY_RANGE,
            "order": 4,
            "start": start,
            "count": PAGE_SIZE,
            "type": "lite",
        })
        results = payload.get("results") or {}
        available = int(results.get("results_available") or 0)
        shops = results.get("shop") or []
        if isinstance(shops, dict):
            shops = [shops]
        for shop in shops:
            hotpepper_id = shop.get("id")
            if hotpepper_id:
                rows_by_id[hotpepper_id] = compact_lite(shop)

        pages += 1
        returned = int(results.get("results_returned") or len(shops))
        print(
            json.dumps({
                "page": pages,
                "start": start,
                "returned": returned,
                "available": available,
                "unique": len(rows_by_id),
            }, ensure_ascii=False)
        )
        if not returned or start + returned > available:
            break
        start += returned
        time.sleep(REQUEST_INTERVAL)

    if pages >= MAX_PAGES and available and len(rows_by_id) < available:
        raise RuntimeError(
            f"discovery reached HOTPEPPER_MAX_PAGES={MAX_PAGES} before exhausting {available} results"
        )

    inside = []
    missing_coords = 0
    for row in rows_by_id.values():
        try:
            lat = float(row.get("lat"))
            lng = float(row.get("lng"))
        except (TypeError, ValueError):
            missing_coords += 1
            continue
        distance = haversine(CENTER_LAT, CENTER_LNG, lat, lng)
        if distance <= AREA_RADIUS_M:
            item = dict(row)
            item["lat"] = lat
            item["lng"] = lng
            item["distanceMeters"] = round(distance)
            inside.append(item)

    inside.sort(key=lambda row: (row["distanceMeters"], row.get("name") or "", row["hotpepperId"]))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": 1,
        "source": "Hot Pepper Gourmet Web Service",
        "mode": "geographic_lite_discovery",
        "scope": {
            "center": {"lat": CENTER_LAT, "lng": CENTER_LNG},
            "productionRadiusMeters": AREA_RADIUS_M,
            "apiRange": DISCOVERY_RANGE,
        },
        "policy": {
            "paidApiCalls": 0,
            "productionAdmission": False,
            "rawGooglePayloadPersisted": False,
            "imagesCollected": False,
        },
        "summary": {
            "apiResultsAvailableInSuperset": available or 0,
            "apiPages": pages,
            "uniqueSupersetShopIds": len(rows_by_id),
            "insideArea1": len(inside),
            "missingCoordinates": missing_coords,
        },
        "rows": inside,
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False))


def read_hotpepper_ids(path: Path):
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("bindings") or payload.get("rows") or []
    ids = []
    for row in rows:
        hotpepper_id = row.get("hotpepperId")
        if hotpepper_id and hotpepper_id not in ids:
            ids.append(hotpepper_id)
    return ids


def details(bindings_path: Path, output_path: Path):
    ids = read_hotpepper_ids(bindings_path)
    shops_by_id = {}
    requests = 0

    for offset in range(0, len(ids), DETAIL_BATCH_SIZE):
        batch = ids[offset : offset + DETAIL_BATCH_SIZE]
        payload = request_json({
            "id": ",".join(batch),
            "count": 100,
        })
        results = payload.get("results") or {}
        shops = results.get("shop") or []
        if isinstance(shops, dict):
            shops = [shops]
        for shop in shops:
            hotpepper_id = shop.get("id")
            if hotpepper_id:
                shops_by_id[hotpepper_id] = compact_detail(shop)
        requests += 1
        print(json.dumps({
            "detailRequest": requests,
            "requestedIds": len(batch),
            "returned": len(shops),
            "totalCollected": len(shops_by_id),
        }, ensure_ascii=False))
        time.sleep(REQUEST_INTERVAL)

    missing = [hotpepper_id for hotpepper_id in ids if hotpepper_id not in shops_by_id]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": 1,
        "source": "Hot Pepper Gourmet Web Service",
        "mode": "bound_id_full_details",
        "policy": {
            "paidApiCalls": 0,
            "productionAdmission": False,
            "imagesCollected": False,
        },
        "summary": {
            "requestedShopIds": len(ids),
            "detailRequests": requests,
            "returnedShopIds": len(shops_by_id),
            "missingShopIds": len(missing),
        },
        "missing": missing,
        "rows": [shops_by_id[key] for key in ids if key in shops_by_id],
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False))


def usage():
    raise SystemExit(
        "usage:\n"
        "  collect_hotpepper_area1.py discover OUTPUT.json\n"
        "  collect_hotpepper_area1.py details BINDINGS.json OUTPUT.json"
    )


def main():
    if len(sys.argv) < 3:
        usage()
    mode = sys.argv[1]
    if mode == "discover" and len(sys.argv) == 3:
        discover(Path(sys.argv[2]))
        return
    if mode == "details" and len(sys.argv) == 4:
        details(Path(sys.argv[2]), Path(sys.argv[3]))
        return
    usage()


if __name__ == "__main__":
    main()
