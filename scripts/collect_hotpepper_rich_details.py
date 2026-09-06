#!/usr/bin/env python3
"""Refresh maximum non-image Hot Pepper details for reviewed production bindings.

This collector is intentionally narrow: it does not repeat geographic discovery
or identity matching. It reads the durable binding ledger and selects either:
1) strict automatic-use current-production bindings; or
2) explicit manually reviewed rich-metadata-only exceptions.

Hot Pepper IDs are fetched in batches of at most 20. `type=credit_card+special`
adds the API's optional credit-card and feature/special response blocks while
keeping the normal full response. Photos/logo URLs are deliberately excluded.
No Google or other paid place/search API is called.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API_URL = "https://webservice.recruit.co.jp/hotpepper/gourmet/v1/"
DETAIL_BATCH_SIZE = 20
REQUEST_INTERVAL = float(os.environ.get("HOTPEPPER_REQUEST_INTERVAL", "0.20"))
TIMEOUT = int(os.environ.get("HOTPEPPER_TIMEOUT_SECONDS", "30"))
API_KEY = os.environ.get("HOTPEPPER_API_KEY", "").strip()


def request_json(params, retries=4):
    if not API_KEY:
        raise SystemExit("HOTPEPPER_API_KEY is required")
    query = dict(params)
    query["key"] = API_KEY
    query["format"] = "json"
    url = API_URL + "?" + urllib.parse.urlencode(query, doseq=True)
    headers = {
        "User-Agent": "nekooweb-eat-hotpepper-rich-refresh/2.0",
        "Accept": "application/json",
    }
    last_error = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
                payload = json.loads(response.read().decode("utf-8"))
            error = (payload.get("results") or {}).get("error")
            if error:
                raise RuntimeError(str(error))
            return payload
        except (urllib.error.URLError, TimeoutError, RuntimeError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt + 1 == retries:
                raise
            time.sleep(max(0.5, REQUEST_INTERVAL) * (attempt + 1))
    raise last_error


def compact_detail(shop):
    return {
        "hotpepperId": shop.get("id"),
        "name": shop.get("name"),
        "nameKana": shop.get("name_kana"),
        "address": shop.get("address"),
        "stationName": shop.get("station_name"),
        "ktaiCoupon": shop.get("ktai_coupon"),
        "largeServiceArea": shop.get("large_service_area"),
        "serviceArea": shop.get("service_area"),
        "largeArea": shop.get("large_area"),
        "middleArea": shop.get("middle_area"),
        "smallArea": shop.get("small_area"),
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
        "mobileAccess": shop.get("mobile_access"),
        "capacity": shop.get("capacity"),
        "partyCapacity": shop.get("party_capacity"),
        "wifi": shop.get("wifi"),
        "wedding": shop.get("wedding"),
        "course": shop.get("course"),
        "freeDrink": shop.get("free_drink"),
        "freeFood": shop.get("free_food"),
        "privateRoom": shop.get("private_room"),
        "horigotatsu": shop.get("horigotatsu"),
        "tatami": shop.get("tatami"),
        "card": shop.get("card"),
        "nonSmoking": shop.get("non_smoking"),
        "charter": shop.get("charter"),
        "ktai": shop.get("ktai"),
        "parking": shop.get("parking"),
        "barrierFree": shop.get("barrier_free"),
        "otherMemo": shop.get("other_memo"),
        "sommelier": shop.get("sommelier"),
        "openAir": shop.get("open_air"),
        "show": shop.get("show"),
        "equipment": shop.get("equipment"),
        "karaoke": shop.get("karaoke"),
        "band": shop.get("band"),
        "tv": shop.get("tv"),
        "english": shop.get("english"),
        "pet": shop.get("pet"),
        "child": shop.get("child"),
        "midnight": shop.get("midnight"),
        "shopDetailMemo": shop.get("shop_detail_memo"),
        "couponUrls": shop.get("coupon_urls"),
        "creditCards": shop.get("credit_card"),
        "specialFeatures": shop.get("special"),
    }


def manual_pairs(path: Path | None):
    if not path or not path.exists():
        return set()
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {
        (row.get("googlePlaceId"), row.get("hotpepperId"))
        for row in payload.get("approved", [])
        if row.get("googlePlaceId") and row.get("hotpepperId")
    }


def main():
    if len(sys.argv) not in (3, 4):
        raise SystemExit(
            "usage: collect_hotpepper_rich_details.py BINDINGS.json OUTPUT.json [MANUAL_ALLOWLIST.json]"
        )
    bindings_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    allowlist_path = Path(sys.argv[3]) if len(sys.argv) == 4 else None

    payload = json.loads(bindings_path.read_text(encoding="utf-8"))
    reviewed = manual_pairs(allowlist_path)
    bindings = []
    automatic_count = 0
    manual_count = 0
    for row in payload.get("bindings", []):
        pair = (row.get("googlePlaceId"), row.get("hotpepperId"))
        automatic = bool(row.get("autoEligible") and row.get("currentProduction") and row.get("hotpepperId"))
        manual = bool(row.get("currentProduction") and pair in reviewed)
        if not (automatic or manual):
            continue
        bindings.append(row)
        if automatic:
            automatic_count += 1
        elif manual:
            manual_count += 1

    ids = []
    for row in bindings:
        if row["hotpepperId"] not in ids:
            ids.append(row["hotpepperId"])

    shops_by_id = {}
    requests = 0
    for offset in range(0, len(ids), DETAIL_BATCH_SIZE):
        batch = ids[offset: offset + DETAIL_BATCH_SIZE]
        response = request_json({
            "id": ",".join(batch),
            "count": 100,
            "type": "credit_card+special",
        })
        shops = (response.get("results") or {}).get("shop") or []
        if isinstance(shops, dict):
            shops = [shops]
        for shop in shops:
            hotpepper_id = shop.get("id")
            if hotpepper_id:
                shops_by_id[hotpepper_id] = compact_detail(shop)
        requests += 1
        print(json.dumps({
            "request": requests,
            "requestedIds": len(batch),
            "returned": len(shops),
            "collected": len(shops_by_id),
        }, ensure_ascii=False))
        time.sleep(REQUEST_INTERVAL)

    missing = [hotpepper_id for hotpepper_id in ids if hotpepper_id not in shops_by_id]
    rows = [shops_by_id[hotpepper_id] for hotpepper_id in ids if hotpepper_id in shops_by_id]
    field_names = [
        "nameKana", "stationName", "ktaiCoupon", "largeServiceArea", "serviceArea",
        "largeArea", "middleArea", "smallArea", "access", "mobileAccess", "capacity",
        "partyCapacity", "budgetMemo", "catch", "lunch", "wifi", "wedding", "course",
        "freeDrink", "freeFood", "privateRoom", "horigotatsu", "tatami", "card",
        "nonSmoking", "charter", "ktai", "parking", "barrierFree", "otherMemo",
        "sommelier", "openAir", "show", "equipment", "karaoke", "band", "tv",
        "english", "pet", "child", "midnight", "shopDetailMemo", "couponUrls",
        "creditCards", "specialFeatures",
    ]

    def has(value):
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, dict):
            return any(has(item) for item in value.values())
        if isinstance(value, list):
            return any(has(item) for item in value)
        return value is not None

    output = {
        "schemaVersion": 4,
        "source": "Hot Pepper Gourmet Web Service",
        "mode": "reviewed_current_production_max_non_image_refresh",
        "policy": {
            "paidApiCalls": 0,
            "geographicDiscoveryRepeated": False,
            "identityMatchingRepeated": False,
            "automaticStrictSafeOnly": True,
            "manualExceptionsRequireExplicitAllowlist": True,
            "photosCollected": False,
            "logoCollected": False,
            "optionalResponseBlocks": ["credit_card", "special"],
        },
        "summary": {
            "selectedBindings": len(bindings),
            "automaticBindings": automatic_count,
            "manualReviewedBindings": manual_count,
            "uniqueShopIds": len(ids),
            "detailRequests": requests,
            "returnedShopIds": len(shops_by_id),
            "missingShopIds": len(missing),
            "fieldYield": {field: sum(has(row.get(field)) for row in rows) for field in field_names},
        },
        "missing": missing,
        "rows": rows,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(output["summary"], ensure_ascii=False, indent=2))
    if missing:
        raise RuntimeError(f"missing Hot Pepper rich detail rows: {len(missing)}")


if __name__ == "__main__":
    main()
