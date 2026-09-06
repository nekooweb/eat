#!/usr/bin/env python3
"""Build a durable, non-core Hot Pepper metadata overlay.

The core canonical dataset intentionally keeps a compact schema. This builder
retains additional structured facts from already-reviewed strict-safe Hot Pepper
bindings without creating identities or overwriting canonical core fields such
as address/cuisine/budget/hours.

Inputs:
  hotpepper_bindings.json
  hotpepper rich/detail JSON
Output:
  hotpepper_rich_metadata.js

The output attaches optional metadata to window.PRODUCTION_RESTAURANTS at
runtime when loaded after production_area1.js. No photos are stored.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def text(value):
    value = str(value or "").strip()
    return value or None


def integer(value):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def prefix_bool(
    value,
    true_prefixes=("あり", "利用可", "営業している", "可"),
    false_prefixes=("なし", "利用不可", "営業していない", "不可"),
):
    value = text(value)
    if not value:
        return None
    for prefix in true_prefixes:
        if value.startswith(prefix):
            return True
    for prefix in false_prefixes:
        if value.startswith(prefix):
            return False
    return None


def add_bool(target, key, value, **kwargs):
    parsed = prefix_bool(value, **kwargs)
    if parsed is not None:
        target[key] = parsed


def nonempty_dict(value):
    return value if isinstance(value, dict) else {}


RAW_SERVICE_FIELDS = (
    ("wifi", "wifi"),
    ("wedding", "wedding"),
    ("course", "course"),
    ("freeDrink", "allYouCanDrink"),
    ("freeFood", "allYouCanEat"),
    ("privateRoom", "privateRoom"),
    ("horigotatsu", "horigotatsu"),
    ("tatami", "tatami"),
    ("card", "card"),
    ("nonSmoking", "smoking"),
    ("charter", "charter"),
    ("ktai", "mobileSignal"),
    ("parking", "parking"),
    ("barrierFree", "barrierFree"),
    ("otherMemo", "otherEquipment"),
    ("sommelier", "sommelier"),
    ("openAir", "openAir"),
    ("show", "liveShow"),
    ("equipment", "entertainmentEquipment"),
    ("karaoke", "karaoke"),
    ("band", "bandPerformance"),
    ("tv", "tvProjector"),
    ("english", "englishMenu"),
    ("pet", "pet"),
    ("child", "children"),
    ("midnight", "lateNight"),
    ("shopDetailMemo", "shopDetail"),
)


def main():
    if len(sys.argv) != 4:
        raise SystemExit("usage: build_hotpepper_rich_metadata.py BINDINGS.json DETAILS.json OUTPUT.js")

    bindings_path, details_path, output_path = map(Path, sys.argv[1:])
    bindings_payload = load_json(bindings_path)
    details_payload = load_json(details_path)
    details_by_id = {
        row.get("hotpepperId"): row
        for row in details_payload.get("rows", [])
        if row.get("hotpepperId")
    }

    rows = []
    seen_google_ids = set()
    checked_at = bindings_payload.get("checkedAt") or "2026-09-06"

    for binding in bindings_payload.get("bindings", []):
        if not binding.get("autoEligible") or not binding.get("currentProduction"):
            continue
        google_id = binding.get("googlePlaceId")
        hotpepper_id = binding.get("hotpepperId")
        detail = details_by_id.get(hotpepper_id)
        if not google_id or not detail:
            continue
        if google_id in seen_google_ids:
            raise RuntimeError(f"duplicate rich metadata production identity: {google_id}")
        seen_google_ids.add(google_id)

        urls = nonempty_dict(detail.get("urls"))
        coupon_urls = nonempty_dict(detail.get("couponUrls"))

        amenities = {}
        add_bool(amenities, "courseAvailable", detail.get("course"))
        add_bool(amenities, "allYouCanDrink", detail.get("freeDrink"))
        add_bool(amenities, "allYouCanEat", detail.get("freeFood"))
        add_bool(amenities, "privateRoom", detail.get("privateRoom"))
        add_bool(amenities, "cardAccepted", detail.get("card"))
        add_bool(amenities, "parkingAvailable", detail.get("parking"))
        add_bool(amenities, "wifiAvailable", detail.get("wifi"))
        add_bool(amenities, "horigotatsu", detail.get("horigotatsu"))
        add_bool(amenities, "tatami", detail.get("tatami"))
        add_bool(
            amenities,
            "charterAvailable",
            detail.get("charter"),
            true_prefixes=("貸切可", "あり", "利用可", "可"),
            false_prefixes=("貸切不可", "なし", "利用不可", "不可"),
        )
        add_bool(amenities, "barrierFree", detail.get("barrierFree"))
        add_bool(amenities, "sommelier", detail.get("sommelier"))
        add_bool(amenities, "openAir", detail.get("openAir"))
        add_bool(amenities, "liveShow", detail.get("show"))
        add_bool(amenities, "karaoke", detail.get("karaoke"))
        add_bool(amenities, "bandPerformance", detail.get("band"))
        add_bool(amenities, "tvProjector", detail.get("tv"))
        add_bool(amenities, "englishMenu", detail.get("english"))
        add_bool(amenities, "petAllowed", detail.get("pet"))
        add_bool(amenities, "lateNightAfter23", detail.get("midnight"))
        add_bool(
            amenities,
            "childrenWelcome",
            detail.get("child"),
            true_prefixes=("お子様連れ歓迎", "お子様連れOK", "あり"),
            false_prefixes=("お子様連れ不可", "なし"),
        )
        smoking = text(detail.get("nonSmoking"))
        if smoking:
            amenities["smokingPolicy"] = smoking

        # Preserve the provider's complete service text alongside normalized
        # booleans. This avoids losing conditions such as "course only",
        # nearby coin parking, private-room capacity, child-seat caveats, etc.
        source_service_text = {}
        for source_key, output_key in RAW_SERVICE_FIELDS:
            value = text(detail.get(source_key))
            if value:
                source_service_text[output_key] = value

        row = {
            "googlePlaceId": google_id,
            "hotpepperId": hotpepper_id,
            "hotpepperUrl": text(urls.get("pc") or urls.get("mobile")),
            "couponUrl": text(coupon_urls.get("pc") or coupon_urls.get("sp")),
            "nameKana": text(detail.get("nameKana")),
            "nearestStation": text(detail.get("stationName")),
            "accessText": text(detail.get("access")),
            "mobileAccessText": text(detail.get("mobileAccess")),
            "budgetMemo": text(detail.get("budgetMemo")),
            "sourceCatch": text(detail.get("catch")),
            "lunchAvailable": prefix_bool(detail.get("lunch")),
            "capacity": integer(detail.get("capacity")),
            "partyCapacity": integer(detail.get("partyCapacity")),
            "amenities": amenities or None,
            "sourceServiceText": source_service_text or None,
            "checkedAt": checked_at,
            "source": "Hot Pepper Gourmet Web Service",
        }
        row = {key: value for key, value in row.items() if value not in (None, {}, [])}
        rows.append(row)

    rows.sort(key=lambda row: row["googlePlaceId"])

    summary_keys = [
        "nameKana", "nearestStation", "accessText", "mobileAccessText",
        "budgetMemo", "sourceCatch", "lunchAvailable", "capacity",
        "partyCapacity", "amenities", "sourceServiceText", "hotpepperUrl", "couponUrl",
    ]
    summary = {key: sum(key in row for row in rows) for key in summary_keys}
    amenity_keys = sorted({key for row in rows for key in row.get("amenities", {})})
    summary["amenityFields"] = {
        key: sum(key in row.get("amenities", {}) for row in rows)
        for key in amenity_keys
    }
    service_text_keys = sorted({key for row in rows for key in row.get("sourceServiceText", {})})
    summary["sourceServiceTextFields"] = {
        key: sum(key in row.get("sourceServiceText", {}) for row in rows)
        for key in service_text_keys
    }
    summary["rows"] = len(rows)

    payload = {
        "schemaVersion": 3,
        "checkedAt": checked_at,
        "source": "Hot Pepper Gourmet Web Service",
        "policy": {
            "strictSafeCurrentProductionOnly": True,
            "createsProductionIdentity": False,
            "overwritesCanonicalCoreFields": False,
            "photosStored": False,
            "rawServiceTextPreserved": True,
        },
        "summary": summary,
        "rows": rows,
    }

    js_payload = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    output = (
        "// Generated from reviewed strict-safe Hot Pepper bindings.\n"
        "// Rich metadata only; does not create identities or overwrite canonical core fields.\n"
        f"window.HOTPEPPER_RICH_METADATA={js_payload};\n"
        "if (Array.isArray(window.PRODUCTION_RESTAURANTS)) {\n"
        "  const richById=new Map(window.PRODUCTION_RESTAURANTS.map((row)=>[row.googlePlaceId,row]));\n"
        "  for (const meta of window.HOTPEPPER_RICH_METADATA.rows) {\n"
        "    const row=richById.get(meta.googlePlaceId);\n"
        "    if (!row) continue;\n"
        "    for (const key of ['hotpepperId','hotpepperUrl','couponUrl','nameKana','nearestStation','accessText','mobileAccessText','budgetMemo','sourceCatch','lunchAvailable','capacity','partyCapacity','amenities','sourceServiceText']) {\n"
        "      if (meta[key] != null) row[key]=meta[key];\n"
        "    }\n"
        "  }\n"
        "}\n"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(output, encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
