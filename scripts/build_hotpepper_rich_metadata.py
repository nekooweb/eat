#!/usr/bin/env python3
"""Build a durable, non-core Hot Pepper metadata overlay.

The core canonical dataset intentionally keeps a compact schema. This builder
retains additional structured facts from reviewed Hot Pepper bindings without
creating identities or overwriting canonical core fields such as
address/cuisine/budget/hours.

Inputs:
  hotpepper_bindings.json
  hotpepper rich/detail JSON
  output JS
  optional manual rich-binding allowlist

The output attaches optional metadata to window.PRODUCTION_RESTAURANTS at
runtime when loaded after production_area1.js. Photos/logo URLs are not stored.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def text(value):
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def integer(value):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def as_list(value):
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        return [value]
    return []


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


def compact_dict(value, keys):
    value = nonempty_dict(value)
    result = {}
    for source_key, output_key in keys:
        item = value.get(source_key)
        if item is not None and str(item).strip():
            result[output_key] = item
    return result or None


def compact_code_name(value):
    return compact_dict(value, (("code", "code"), ("name", "name")))


def compact_credit_cards(value):
    rows = []
    for item in as_list(value):
        compact = compact_code_name(item)
        if compact:
            rows.append(compact)
    return rows or None


def compact_special_features(value):
    rows = []
    for item in as_list(value):
        if not isinstance(item, dict):
            continue
        compact = compact_dict(
            item,
            (("code", "code"), ("name", "name"), ("title", "title")),
        ) or {}
        category = compact_code_name(item.get("special_category"))
        if category:
            compact["category"] = category
        if compact:
            rows.append(compact)
    return rows or None


def mobile_coupon_available(value):
    raw = text(value)
    if raw == "0":
        return True
    if raw == "1":
        return False
    return None


def manual_pairs(path: Path | None):
    if not path or not path.exists():
        return set()
    payload = load_json(path)
    return {
        (row.get("googlePlaceId"), row.get("hotpepperId"))
        for row in payload.get("approved", [])
        if row.get("googlePlaceId") and row.get("hotpepperId")
    }


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
    if len(sys.argv) not in (4, 5):
        raise SystemExit(
            "usage: build_hotpepper_rich_metadata.py BINDINGS.json DETAILS.json OUTPUT.js [MANUAL_ALLOWLIST.json]"
        )

    bindings_path = Path(sys.argv[1])
    details_path = Path(sys.argv[2])
    output_path = Path(sys.argv[3])
    allowlist_path = Path(sys.argv[4]) if len(sys.argv) == 5 else None

    bindings_payload = load_json(bindings_path)
    details_payload = load_json(details_path)
    reviewed = manual_pairs(allowlist_path)
    details_by_id = {
        row.get("hotpepperId"): row
        for row in details_payload.get("rows", [])
        if row.get("hotpepperId")
    }

    rows = []
    seen_google_ids = set()
    checked_at = bindings_payload.get("checkedAt") or "2026-09-06"
    automatic_rows = 0
    manual_rows = 0

    for binding in bindings_payload.get("bindings", []):
        google_id = binding.get("googlePlaceId")
        hotpepper_id = binding.get("hotpepperId")
        pair = (google_id, hotpepper_id)
        automatic = bool(binding.get("autoEligible") and binding.get("currentProduction"))
        manual = bool(binding.get("currentProduction") and pair in reviewed)
        if not (automatic or manual):
            continue
        detail = details_by_id.get(hotpepper_id)
        if not google_id or not hotpepper_id or not detail:
            continue
        if google_id in seen_google_ids:
            raise RuntimeError(f"duplicate rich metadata production identity: {google_id}")
        seen_google_ids.add(google_id)
        if automatic:
            automatic_rows += 1
            review_mode = "strict_auto"
        else:
            manual_rows += 1
            review_mode = "manual_exact"

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

        source_service_text = {}
        for source_key, output_key in RAW_SERVICE_FIELDS:
            value = text(detail.get(source_key))
            if value:
                source_service_text[output_key] = value

        hotpepper_location = None
        lat = number(detail.get("lat"))
        lng = number(detail.get("lng"))
        if lat is not None and lng is not None:
            hotpepper_location = {"lat": lat, "lng": lng}

        hotpepper_genre = compact_dict(
            detail.get("genre"),
            (("code", "code"), ("name", "name"), ("catch", "catch")),
        ) or {}
        sub_genre = compact_dict(
            detail.get("subGenre"),
            (("code", "code"), ("name", "name")),
        )
        if sub_genre:
            hotpepper_genre["subGenre"] = sub_genre
        hotpepper_genre = hotpepper_genre or None

        hotpepper_budget = compact_dict(
            detail.get("budget"),
            (("code", "code"), ("name", "name"), ("average", "average")),
        )

        area = {}
        for source_key, output_key in (
            ("largeServiceArea", "largeServiceArea"),
            ("serviceArea", "serviceArea"),
            ("largeArea", "largeArea"),
            ("middleArea", "middleArea"),
            ("smallArea", "smallArea"),
        ):
            compact = compact_code_name(detail.get(source_key))
            if compact:
                area[output_key] = compact

        row = {
            "googlePlaceId": google_id,
            "hotpepperId": hotpepper_id,
            "hotpepperReviewMode": review_mode,
            "hotpepperUrl": text(urls.get("pc") or urls.get("mobile")),
            "couponUrl": text(coupon_urls.get("pc") or coupon_urls.get("sp")),
            "mobileCouponAvailable": mobile_coupon_available(detail.get("ktaiCoupon")),
            "hotpepperKtaiCouponRaw": text(detail.get("ktaiCoupon")),
            "hotpepperName": text(detail.get("name")),
            "nameKana": text(detail.get("nameKana")),
            "hotpepperAddress": text(detail.get("address")),
            "hotpepperLocation": hotpepper_location,
            "hotpepperArea": area or None,
            "hotpepperGenre": hotpepper_genre,
            "hotpepperBudget": hotpepper_budget,
            "acceptedCreditCards": compact_credit_cards(detail.get("creditCards")),
            "specialFeatures": compact_special_features(detail.get("specialFeatures")),
            "nearestStation": text(detail.get("stationName")),
            "accessText": text(detail.get("access")),
            "mobileAccessText": text(detail.get("mobileAccess")),
            "budgetMemo": text(detail.get("budgetMemo")),
            "sourceCatch": text(detail.get("catch")),
            "lunchAvailable": prefix_bool(detail.get("lunch")),
            "capacity": integer(detail.get("capacity")),
            "partyCapacity": integer(detail.get("partyCapacity")),
            "hotpepperOpeningHoursText": text(detail.get("open")),
            "hotpepperClosedText": text(detail.get("close")),
            "amenities": amenities or None,
            "sourceServiceText": source_service_text or None,
            "checkedAt": checked_at,
            "source": "Hot Pepper Gourmet Web Service",
        }
        row = {key: value for key, value in row.items() if value not in (None, {}, [])}
        rows.append(row)

    rows.sort(key=lambda row: row["googlePlaceId"])

    summary_keys = [
        "hotpepperName", "nameKana", "hotpepperAddress", "hotpepperLocation",
        "hotpepperArea", "hotpepperGenre", "hotpepperBudget", "acceptedCreditCards",
        "specialFeatures", "mobileCouponAvailable", "hotpepperKtaiCouponRaw",
        "nearestStation", "accessText", "mobileAccessText", "budgetMemo", "sourceCatch",
        "lunchAvailable", "capacity", "partyCapacity", "hotpepperOpeningHoursText",
        "hotpepperClosedText", "amenities", "sourceServiceText", "hotpepperUrl", "couponUrl",
    ]
    summary = {key: sum(key in row for row in rows) for key in summary_keys}
    summary["automaticRows"] = automatic_rows
    summary["manualReviewedRows"] = manual_rows
    summary["creditCardEntries"] = sum(len(row.get("acceptedCreditCards", [])) for row in rows)
    summary["specialFeatureEntries"] = sum(len(row.get("specialFeatures", [])) for row in rows)
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
        "schemaVersion": 6,
        "checkedAt": checked_at,
        "source": "Hot Pepper Gourmet Web Service",
        "policy": {
            "strictSafeAutomaticBindings": True,
            "manualExceptionsRequireExplicitAllowlist": True,
            "createsProductionIdentity": False,
            "overwritesCanonicalCoreFields": False,
            "photosStored": False,
            "logosStored": False,
            "rawServiceTextPreserved": True,
            "rawSourceClassificationPreserved": True,
            "maximumNonImageOptionalBlocks": ["credit_card", "special"],
        },
        "summary": summary,
        "rows": rows,
    }

    js_payload = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    runtime_keys = [
        "hotpepperId", "hotpepperReviewMode", "hotpepperUrl", "couponUrl",
        "mobileCouponAvailable", "hotpepperKtaiCouponRaw", "hotpepperName", "nameKana",
        "hotpepperAddress", "hotpepperLocation", "hotpepperArea", "hotpepperGenre",
        "hotpepperBudget", "acceptedCreditCards", "specialFeatures", "nearestStation",
        "accessText", "mobileAccessText", "budgetMemo", "sourceCatch", "lunchAvailable",
        "capacity", "partyCapacity", "hotpepperOpeningHoursText", "hotpepperClosedText",
        "amenities", "sourceServiceText",
    ]
    runtime_keys_json = json.dumps(runtime_keys, ensure_ascii=False, separators=(",", ":"))
    output = (
        "// Generated from reviewed Hot Pepper bindings.\n"
        "// Rich metadata only; does not create identities or overwrite canonical core fields.\n"
        f"window.HOTPEPPER_RICH_METADATA={js_payload};\n"
        "if (Array.isArray(window.PRODUCTION_RESTAURANTS)) {\n"
        "  const richById=new Map(window.PRODUCTION_RESTAURANTS.map((row)=>[row.googlePlaceId,row]));\n"
        f"  const richKeys={runtime_keys_json};\n"
        "  for (const meta of window.HOTPEPPER_RICH_METADATA.rows) {\n"
        "    const row=richById.get(meta.googlePlaceId);\n"
        "    if (!row) continue;\n"
        "    for (const key of richKeys) if (meta[key] != null) row[key]=meta[key];\n"
        "  }\n"
        "}\n"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(output, encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
