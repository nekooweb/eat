#!/usr/bin/env python3
"""Diagnostic field-level diff between the rebuilt public runtime and SQLite shadow.

This report is intentionally non-blocking during refactor. It compares only Place IDs
present in both recommendation sets and classifies each field as equal, changed,
shadow-added, shadow-missing, or absent-on-both. Structural membership/order remains
covered by compare_runtime_shadow.py.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / "data" / "google_inventory_runtime.js"
FIELDS = (
    "name",
    "address",
    "coordinates",
    "cuisine",
    "lunchBudget",
    "dinnerBudget",
    "hours",
    "recommendedDishes",
    "featuredDishes",
    "practical",
)


def parse_assignment(path: Path, variable: str):
    text = path.read_text(encoding="utf-8")
    prefix = f"window.{variable}="
    start = text.find(prefix)
    if start < 0:
        raise RuntimeError(f"missing {variable} in {path}")
    value, _end = json.JSONDecoder().raw_decode(text[start + len(prefix):].lstrip())
    return value


def norm_text(value):
    if not isinstance(value, str):
        return None
    text = unicodedata.normalize("NFKC", value)
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def norm_coords(value):
    if not value:
        return None
    if isinstance(value, dict):
        lat, lng = value.get("lat"), value.get("lng")
    elif isinstance(value, (list, tuple)) and len(value) >= 2:
        lat, lng = value[0], value[1]
    else:
        return None
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        return None
    return [round(float(lat), 6), round(float(lng), 6)]


def norm_budget(value):
    if not value:
        return None
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        low, high = value[0], value[1]
    elif isinstance(value, dict):
        low, high = value.get("lower"), value.get("upper")
    else:
        return None
    if low is not None and not isinstance(low, (int, float)):
        return None
    if high is not None and not isinstance(high, (int, float)):
        return None
    return {
        "lower": int(low) if isinstance(low, (int, float)) and float(low).is_integer() else low,
        "upper": int(high) if isinstance(high, (int, float)) and float(high).is_integer() else high,
    }


def dish_name(item):
    if isinstance(item, str):
        return norm_text(item)
    if isinstance(item, dict):
        return norm_text(item.get("nameZh") or item.get("nameJa"))
    return None


def norm_dishes(value):
    if not isinstance(value, list) or not value:
        return None
    names = []
    for item in value:
        name = dish_name(item)
        if name and name not in names:
            names.append(name)
    return names or None


def normalize_practical(value):
    if not isinstance(value, dict) or not value:
        return None
    return json.loads(json.dumps(value, ensure_ascii=False, sort_keys=True))


def runtime_field(row, field):
    if field == "name":
        return norm_text(row.get("name"))
    if field == "address":
        return norm_text(row.get("address"))
    if field == "coordinates":
        return norm_coords({"lat": row.get("lat"), "lng": row.get("lng")})
    if field == "cuisine":
        cuisine = norm_text(row.get("cuisine"))
        return None if cuisine == "餐厅" else cuisine
    if field == "lunchBudget":
        return norm_budget(row.get("lunch"))
    if field == "dinnerBudget":
        return norm_budget(row.get("dinner"))
    if field == "hours":
        return norm_text(row.get("hoursReference"))
    if field == "recommendedDishes":
        return norm_dishes(row.get("recommendedDishes"))
    if field == "featuredDishes":
        return norm_dishes(row.get("featuredDishes"))
    if field == "practical":
        return None
    raise KeyError(field)


def shadow_field(row, field):
    if field == "name":
        return norm_text(row.get("name"))
    if field == "address":
        return norm_text(row.get("address"))
    if field == "coordinates":
        return norm_coords(row.get("coordinates"))
    if field == "cuisine":
        cuisine = norm_text(row.get("cuisine"))
        return None if cuisine == "餐厅" else cuisine
    if field == "lunchBudget":
        return norm_budget(row.get("lunchBudget"))
    if field == "dinnerBudget":
        return norm_budget(row.get("dinnerBudget"))
    if field == "hours":
        return norm_text(row.get("hoursRaw") or row.get("hoursReference"))
    if field == "recommendedDishes":
        return norm_dishes(row.get("recommendedDishes"))
    if field == "featuredDishes":
        return norm_dishes(row.get("featuredDishes"))
    if field == "practical":
        return normalize_practical(row.get("practical"))
    raise KeyError(field)


def classify(old, new):
    if old is None and new is None:
        return "absentBoth"
    if old is None:
        return "shadowAdded"
    if new is None:
        return "shadowMissing"
    if old == new:
        return "equal"
    return "changed"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("shadow_recommendation", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    runtime_rows = parse_assignment(RUNTIME, "GOOGLE_INVENTORY_RESTAURANTS")
    shadow_doc = json.loads(args.shadow_recommendation.read_text(encoding="utf-8"))
    shadow_rows = shadow_doc.get("rows") or []
    old_by_id = {row.get("googlePlaceId"): row for row in runtime_rows if row.get("googlePlaceId")}
    new_by_id = {row.get("placeId"): row for row in shadow_rows if row.get("placeId")}
    common_ids = [row.get("placeId") for row in shadow_rows if row.get("placeId") in old_by_id]

    field_summary = {}
    changed_places = set()
    examples = {}
    for field in FIELDS:
        counts = Counter()
        field_examples = []
        for pid in common_ids:
            old = runtime_field(old_by_id[pid], field)
            new = shadow_field(new_by_id[pid], field)
            state = classify(old, new)
            counts[state] += 1
            if state in ("changed", "shadowAdded", "shadowMissing"):
                changed_places.add(pid)
                if len(field_examples) < 12:
                    field_examples.append({"placeId": pid, "old": old, "shadow": new, "state": state})
        field_summary[field] = dict(counts)
        examples[field] = field_examples

    report = {
        "status": "pass",
        "mode": "diagnostic_non_blocking",
        "runtimeRows": len(runtime_rows),
        "shadowRows": len(shadow_rows),
        "commonRows": len(common_ids),
        "placesWithAnyFieldDifference": len(changed_places),
        "fieldSummary": field_summary,
        "examples": examples,
    }
    text = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "examples"}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
