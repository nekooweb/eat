#!/usr/bin/env python3
"""Build durable Hot Pepper bindings and a review-safe enrichment shard.

Inputs are review artifacts produced by the Hot Pepper benchmark:
  1. matcher output (Google compatibility ID <-> Hot Pepper ID candidates)
  2. full Hot Pepper detail rows fetched in <=20-ID batches

Outputs:
  1. a durable binding ledger for all high/medium matches
  2. a source_enrichment-compatible JS shard for existing production identities
     that pass a stricter automatic-use gate
  3. a promotion/yield report

This script never admits inventory-only identities into production. It also never
persists the transient Google display payload used by the matcher.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCTION = ROOT / "data" / "production_area1.js"


def parse_production():
    text = PRODUCTION.read_text(encoding="utf-8")
    token = "window.PRODUCTION_RESTAURANTS="
    start = text.find(token)
    if start < 0:
        raise RuntimeError("could not find production dataset")
    start += len(token)
    end = text.find(";\nwindow.PRODUCTION_STATS=", start)
    if end < 0:
        end = text.find(";window.PRODUCTION_STATS=", start)
    if end < 0:
        raise RuntimeError("could not parse production dataset")
    return json.loads(text[start:end])


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def text(value):
    return str(value or "").strip()


def safe_auto_binding(binding):
    """Use a stricter gate than the matcher's broad high/medium review labels.

    Dense Tokyo buildings can contain several restaurants at nearly identical
    coordinates. Automatic field use therefore requires confidence='high' plus
    a strong name/address/postal signal. Medium matches remain ledger-only.
    """
    if binding.get("confidence") != "high":
        return False

    distance = float(binding.get("distanceMeters") or 9999)
    name = float(binding.get("nameSimilarity") or 0)
    address = float(binding.get("addressSimilarity") or 0)
    combined = float(binding.get("combinedScore") or 0)
    postal = bool(binding.get("postalMatch"))

    if distance <= 12 and name >= 0.68 and combined >= 0.74:
        return True
    if distance <= 25 and name >= 0.78 and combined >= 0.78:
        return True
    if distance <= 50 and name >= 0.90 and combined >= 0.80:
        return True
    if distance <= 80 and postal and name >= 0.82 and combined >= 0.78:
        return True
    if distance <= 80 and address >= 0.75 and name >= 0.80 and combined >= 0.78:
        return True
    return False


CUISINE_RULES = [
    (r"ラーメン|中華そば|つけ麺", "拉面"),
    (r"寿司|すし|鮨", "寿司"),
    (r"焼肉|ホルモン", "烤肉"),
    (r"韓国", "韩国菜"),
    (r"中華|中国料理|四川|広東|台湾", "中华"),
    (r"タイ料理|タイ・ベトナム", "泰国菜"),
    (r"ベトナム", "越南菜"),
    (r"インド.*ネパール|ネパール", "印度・尼泊尔"),
    (r"インド", "印度菜"),
    (r"アジア|エスニック", "亚洲・民族"),
    (r"イタリア", "意大利菜"),
    (r"フレンチ|フランス", "法国菜"),
    (r"スペイン", "西班牙菜"),
    (r"メキシコ", "墨西哥菜"),
    (r"ステーキ", "牛排"),
    (r"とんかつ", "炸猪排"),
    (r"カレー", "咖喱"),
    (r"そば|蕎麦", "荞麦面"),
    (r"うどん", "乌冬"),
    (r"お好み焼", "御好烧"),
    (r"もんじゃ", "文字烧"),
    (r"ハンバーガ", "汉堡"),
    (r"ピザ", "披萨"),
    (r"カフェ|喫茶|コーヒー", "咖啡"),
    (r"スイーツ|デザート|ケーキ|パフェ", "甜品"),
    (r"居酒屋", "居酒屋"),
    (r"バー|バル|カクテル", "酒吧"),
    (r"洋食", "洋食"),
    (r"創作料理", "创意料理"),
    (r"和食|日本料理", "日式"),
]


def source_label(value):
    if isinstance(value, dict):
        return " ".join(text(value.get(key)) for key in ("name", "catch") if text(value.get(key)))
    return text(value)


def map_cuisine(detail):
    # Prefer the most specific Hot Pepper classification before broader genre.
    candidates = [
        source_label(detail.get("subGenre")),
        source_label(detail.get("genre")),
        text(detail.get("catch")),
    ]
    for candidate in candidates:
        if not candidate:
            continue
        for pattern, cuisine in CUISINE_RULES:
            if re.search(pattern, candidate, re.IGNORECASE):
                return cuisine
    return None


def parse_budget_band(detail):
    budget = detail.get("budget") or {}
    if not isinstance(budget, dict):
        return None
    raw = text(budget.get("name"))
    if not raw:
        return None
    normalized = raw.replace(",", "").replace("，", "").replace("〜", "～").replace("~", "～")
    numbers = [int(item) for item in re.findall(r"\d+", normalized)]

    # Explicit two-sided Hot Pepper tiers map directly.
    if len(numbers) >= 2:
        low, high = numbers[0], numbers[1]
        if 0 <= low <= high <= 1000000:
            return [low, high]

    # The official budget master also has an explicit upper-cap tier such as
    # "～2000円". Encoding that provider-defined interval as [0, 2000] does not
    # invent an upper or lower commercial threshold; it preserves the stated cap.
    if len(numbers) == 1 and re.match(r"^\s*[～≤<]", normalized):
        high = numbers[0]
        if 0 < high <= 1000000:
            return [0, high]

    # A lower-bound-only tier such as "10000円～" has no finite upper bound and
    # is therefore retained only as raw source evidence rather than fabricated.
    return None


def source_url(detail):
    urls = detail.get("urls") or {}
    if isinstance(urls, dict):
        return text(urls.get("pc") or urls.get("mobile"))
    return ""


def source_fields(row):
    fields = ["name"]
    if text(row.get("address")):
        fields.append("address")
    if row.get("cuisine"):
        fields.append("cuisine")
    if row.get("dinner"):
        fields.append("budget")
    if text(row.get("openingHoursRaw")):
        fields.append("hours")
    if row.get("closedDays") or text(row.get("closedNote")):
        fields.append("closure")
    return fields


def js_identifier(value):
    return re.sub(r"[^A-Za-z0-9_-]+", "-", text(value)).strip("-") or "unknown"


def build_source_row(binding, detail, checked_at):
    cuisine = map_cuisine(detail)
    dinner = parse_budget_band(detail)
    url = source_url(detail)
    close = text(detail.get("close"))

    row = {
        "id": f"src-hotpepper-{js_identifier(binding.get('hotpepperId'))}",
        "profile": "TOKYO",
        "area": "地区1️⃣",
        "name": text(detail.get("name")) or f"Hot Pepper {binding.get('hotpepperId')}",
        "googlePlaceId": binding.get("googlePlaceId"),
        "source": "Hot Pepper",
        "sourceOnly": True,
        "hotpepperId": binding.get("hotpepperId"),
        "hotpepperMatchConfidence": binding.get("confidence"),
        "hotpepperMatchScore": binding.get("combinedScore"),
        "tags": [],
        "lunch": None,
        "dinner": dinner,
        "dishes": [],
        "openingHoursRaw": text(detail.get("open")) or None,
        "closedDays": [close] if close else [],
        "closedNote": close or None,
    }

    address = text(detail.get("address"))
    if address:
        row["address"] = address
    if cuisine:
        row["cuisine"] = cuisine
        row["tags"] = [cuisine]

    raw_genre = detail.get("genre") or {}
    raw_sub_genre = detail.get("subGenre") or {}
    row["hotpepperGenre"] = {
        "code": raw_genre.get("code") if isinstance(raw_genre, dict) else None,
        "name": raw_genre.get("name") if isinstance(raw_genre, dict) else text(raw_genre),
        "subCode": raw_sub_genre.get("code") if isinstance(raw_sub_genre, dict) else None,
        "subName": raw_sub_genre.get("name") if isinstance(raw_sub_genre, dict) else text(raw_sub_genre),
    }

    ref = {
        "provider": "Hot Pepper",
        "url": url or "https://www.hotpepper.jp/",
        "checkedAt": checked_at,
        "fields": source_fields(row),
        "sourceNativeId": binding.get("hotpepperId"),
        "matchConfidence": binding.get("confidence"),
    }
    row["sourceRefs"] = [ref]
    return row


def compact_binding(binding, production_ids):
    item = {
        "googlePlaceId": binding.get("googlePlaceId"),
        "hotpepperId": binding.get("hotpepperId"),
        "confidence": binding.get("confidence"),
        "autoEligible": safe_auto_binding(binding),
        "currentProduction": binding.get("googlePlaceId") in production_ids,
        "distanceMeters": binding.get("distanceMeters"),
        "nameSimilarity": binding.get("nameSimilarity"),
        "addressSimilarity": binding.get("addressSimilarity"),
        "postalMatch": bool(binding.get("postalMatch")),
        "combinedScore": binding.get("combinedScore"),
        "seedSource": binding.get("seedSource"),
    }
    return item


def main():
    if len(sys.argv) != 6:
        raise SystemExit(
            "usage: build_hotpepper_enrichment.py MATCH.json DETAILS.json "
            "BINDINGS.json SOURCE.js REPORT.json"
        )

    match_path, details_path, bindings_out, source_out, report_out = map(Path, sys.argv[1:])
    match_payload = load_json(match_path)
    detail_payload = load_json(details_path)
    production = parse_production()
    production_ids = {row.get("googlePlaceId") for row in production if row.get("googlePlaceId")}
    details_by_id = {
        row.get("hotpepperId"): row
        for row in (detail_payload.get("rows") or [])
        if row.get("hotpepperId")
    }

    raw_bindings = match_payload.get("bindings") or []
    bindings = [compact_binding(binding, production_ids) for binding in raw_bindings]
    bindings.sort(key=lambda row: (
        0 if row["autoEligible"] else 1,
        0 if row["confidence"] == "high" else 1,
        -(float(row.get("combinedScore") or 0)),
        row.get("googlePlaceId") or "",
    ))

    checked_at = datetime.now(timezone.utc).date().isoformat()
    source_rows = []
    missing_details = []
    for binding in bindings:
        if not binding["autoEligible"] or not binding["currentProduction"]:
            continue
        detail = details_by_id.get(binding.get("hotpepperId"))
        if not detail:
            missing_details.append(binding.get("hotpepperId"))
            continue
        source_rows.append(build_source_row(binding, detail, checked_at))

    binding_payload = {
        "schemaVersion": 1,
        "checkedAt": checked_at,
        "source": "Hot Pepper Gourmet Web Service",
        "policy": {
            "paidApiCalls": 0,
            "transientGoogleDisplayPayloadPersisted": False,
            "mediumMatchesAutoEligible": False,
            "inventoryOnlyAutoAdmission": False,
        },
        "summary": {
            "bindings": len(bindings),
            "high": sum(row["confidence"] == "high" for row in bindings),
            "medium": sum(row["confidence"] == "medium" for row in bindings),
            "autoEligible": sum(row["autoEligible"] for row in bindings),
            "currentProductionBindings": sum(row["currentProduction"] for row in bindings),
            "inventoryOnlyBindings": sum(not row["currentProduction"] for row in bindings),
        },
        "bindings": bindings,
    }

    field_counts = Counter()
    for row in source_rows:
        for field in row.get("sourceRefs", [{}])[0].get("fields", []):
            field_counts[field] += 1

    report = {
        "schemaVersion": 1,
        "checkedAt": checked_at,
        "matchSummary": match_payload.get("summary") or {},
        "detailSummary": detail_payload.get("summary") or {},
        "bindingSummary": binding_payload["summary"],
        "production": {
            "currentEntities": len(production_ids),
            "safeHotPepperSourceRows": len(source_rows),
            "missingDetailRows": len(missing_details),
        },
        "fieldClaims": dict(sorted(field_counts.items())),
        "missingDetailHotPepperIds": missing_details,
        "safety": {
            "requiresHighMatch": True,
            "denseBuildingProtection": True,
            "mediumReviewOnly": True,
            "inventoryOnlyReviewOnly": True,
            "lunchPriceInferred": False,
            "lowerBoundOnlyBudgetUpperBoundInvented": False,
            "providerUpperCapMappedFromZero": True,
        },
    }

    bindings_out.parent.mkdir(parents=True, exist_ok=True)
    source_out.parent.mkdir(parents=True, exist_ok=True)
    report_out.parent.mkdir(parents=True, exist_ok=True)

    bindings_out.write_text(json.dumps(binding_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    js_payload = json.dumps(source_rows, ensure_ascii=False, separators=(",", ":"))
    source_out.write_text(
        "// Generated Hot Pepper enrichment candidates. Review before committing.\n"
        "// Existing production identities only; does not admit new restaurants.\n"
        f"window.RESTAURANTS.push(...{js_payload});\n",
        encoding="utf-8",
    )
    report_out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
