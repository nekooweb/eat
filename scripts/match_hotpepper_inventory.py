#!/usr/bin/env python3
"""Match Hot Pepper Area1 rows to the already-captured historical inventory.

The matcher consumes the successful private full-collection/retry artifacts as
transient evidence. It never writes the Google display payload into its durable
binding output. Current production rows are preferred as matching seeds when
available.

Usage:
  match_hotpepper_inventory.py FULL.json RETRY.json HOTPEPPER.json OUTPUT.json

OUTPUT.json contains high/medium candidate ID bindings plus review diagnostics.
It is intended as an audit artifact until the first Area1 benchmark is reviewed.
"""

from __future__ import annotations

import json
import math
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / "data" / "area1_google_ids.json"
PRODUCTION = ROOT / "data" / "production_area1.js"
GRID_DEG = 0.0015
MAX_PAIR_DISTANCE_M = 220
EARTH_RADIUS_M = 6371000

try:
    from pykakasi import kakasi

    _KAKASI = kakasi()
except Exception:
    _KAKASI = None


def haversine(lat1, lng1, lat2, lng2):
    p1 = math.radians(float(lat1))
    p2 = math.radians(float(lat2))
    dlat = math.radians(float(lat2) - float(lat1))
    dlng = math.radians(float(lng2) - float(lng1))
    value = (
        math.sin(dlat / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    )
    return EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def normalize(value):
    text = unicodedata.normalize("NFKC", str(value or "")).lower()
    text = re.sub(r"株式会社|有限会社|合同会社", "", text)
    text = re.sub(r"(?:東京|tokyo)", "", text)
    text = re.sub(r"店$", "", text)
    return re.sub(r"[\s\u3000・･\-—_()（）\[\]【】「」『』'\"&＆.,，。:/\\]+", "", text)


def romanize(value):
    text = str(value or "")
    if not text:
        return ""
    if _KAKASI is None:
        return normalize(text)
    try:
        converted = "".join(item.get("hepburn", "") for item in _KAKASI.convert(text))
        return normalize(converted)
    except Exception:
        return normalize(text)


def similarity(a, b):
    left, right = normalize(a), normalize(b)
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0
    if min(len(left), len(right)) >= 4 and (left in right or right in left):
        return 0.96
    return SequenceMatcher(None, left, right).ratio()


def name_similarity(seed_name, hp_name):
    direct = similarity(seed_name, hp_name)
    seed_roman = romanize(seed_name)
    hp_roman = romanize(hp_name)
    roman = similarity(seed_roman, hp_roman)
    return max(direct, roman), direct, roman


def postal_code(value):
    match = re.search(r"(?:〒\s*)?(\d{3})[-‐‑–—ー]?\s*(\d{4})", str(value or ""))
    return "".join(match.groups()) if match else None


def address_similarity(a, b):
    left, right = normalize(a), normalize(b)
    if not left or not right:
        return 0.0
    return SequenceMatcher(None, left, right).ratio()


def parse_production():
    text = PRODUCTION.read_text(encoding="utf-8")
    start_token = "window.PRODUCTION_RESTAURANTS="
    start = text.find(start_token)
    if start < 0:
        return []
    start += len(start_token)
    end = text.find(";\nwindow.PRODUCTION_STATS=", start)
    if end < 0:
        end = text.find(";window.PRODUCTION_STATS=", start)
    if end < 0:
        raise RuntimeError("could not parse data/production_area1.js")
    return json.loads(text[start:end])


def load_rows(path):
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    rows = payload.get("rows") or []
    return rows if isinstance(rows, list) else []


def seed_from_google_detail(row):
    loc = row.get("location") or {}
    display = row.get("displayName") or {}
    lat = loc.get("latitude")
    lng = loc.get("longitude")
    if lat is None or lng is None:
        return None
    if row.get("businessStatus") == "CLOSED_PERMANENTLY":
        return None
    return {
        "googlePlaceId": row.get("_placeId") or row.get("id"),
        "name": display.get("text") if isinstance(display, dict) else None,
        "address": row.get("formattedAddress"),
        "lat": float(lat),
        "lng": float(lng),
        "seedSource": "transient_full_sweep",
    }


def build_seeds(full_path, retry_path):
    inventory_payload = json.loads(INVENTORY.read_text(encoding="utf-8"))
    inventory_ids = set(inventory_payload.get("googlePlaceIds") or [])

    full = load_rows(full_path)
    retry = load_rows(retry_path)
    details_by_id = {}
    for row in full:
        pid = row.get("_placeId") or row.get("id")
        if pid:
            details_by_id[pid] = row
    for row in retry:
        pid = row.get("_placeId") or row.get("id")
        if pid:
            details_by_id[pid] = row

    seeds = {}
    for pid, row in details_by_id.items():
        if pid not in inventory_ids:
            continue
        seed = seed_from_google_detail(row)
        if seed:
            seeds[pid] = seed

    for row in parse_production():
        pid = row.get("googlePlaceId")
        if pid not in inventory_ids:
            continue
        if not isinstance(row.get("lat"), (int, float)) or not isinstance(row.get("lng"), (int, float)):
            continue
        seeds[pid] = {
            "googlePlaceId": pid,
            "name": row.get("name"),
            "address": row.get("address") or "",
            "lat": float(row["lat"]),
            "lng": float(row["lng"]),
            "seedSource": "current_production",
        }

    return seeds, len(inventory_ids)


def cell(lat, lng):
    return (math.floor(float(lat) / GRID_DEG), math.floor(float(lng) / GRID_DEG))


def nearby(index, lat, lng):
    cy, cx = cell(lat, lng)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            yield from index.get((cy + dy, cx + dx), [])


def score_candidate(seed, hp):
    distance = haversine(seed["lat"], seed["lng"], hp["lat"], hp["lng"])
    if distance > MAX_PAIR_DISTANCE_M:
        return None

    name_score, direct_name, roman_name = name_similarity(seed.get("name"), hp.get("name"))
    addr_score = address_similarity(seed.get("address"), hp.get("address"))
    seed_postal = postal_code(seed.get("address"))
    hp_postal = postal_code(hp.get("address"))
    postal_match = bool(seed_postal and hp_postal and seed_postal == hp_postal)
    distance_score = max(0.0, 1.0 - distance / MAX_PAIR_DISTANCE_M)

    combined = (
        distance_score * 0.52
        + name_score * 0.38
        + addr_score * 0.05
        + (0.05 if postal_match else 0.0)
    )
    return {
        "hotpepperId": hp.get("hotpepperId"),
        "hotpepperName": hp.get("name"),
        "distanceMeters": round(distance, 1),
        "nameSimilarity": round(name_score, 4),
        "directNameSimilarity": round(direct_name, 4),
        "romanizedNameSimilarity": round(roman_name, 4),
        "addressSimilarity": round(addr_score, 4),
        "postalMatch": postal_match,
        "combinedScore": round(combined, 4),
    }


def classify(best, second, close_candidate_count):
    if not best:
        return "none"
    distance = best["distanceMeters"]
    name = best["nameSimilarity"]
    address = best["addressSimilarity"]
    postal = best["postalMatch"]
    margin = best["combinedScore"] - (second["combinedScore"] if second else 0.0)

    if distance <= 20 and name >= 0.60 and margin >= 0.08:
        return "high"
    if distance <= 80 and name >= 0.85 and (postal or address >= 0.45) and margin >= 0.06:
        return "high"
    if distance <= 45 and name >= 0.45 and (postal or address >= 0.30) and margin >= 0.05:
        return "medium"
    if distance <= 20 and postal and close_candidate_count == 1 and margin >= 0.08:
        return "medium"
    if distance <= 120 and (name >= 0.25 or postal):
        return "review"
    if distance <= 35:
        return "review"
    return "low"


def main():
    if len(sys.argv) != 5:
        raise SystemExit(
            "usage: match_hotpepper_inventory.py FULL.json RETRY.json HOTPEPPER.json OUTPUT.json"
        )

    full_path, retry_path, hp_path, out_path = map(Path, sys.argv[1:])
    seeds, inventory_total = build_seeds(full_path, retry_path)
    hp_payload = json.loads(hp_path.read_text(encoding="utf-8"))
    hp_rows = hp_payload.get("rows") or []

    spatial = defaultdict(list)
    for row in hp_rows:
        if isinstance(row.get("lat"), (int, float)) and isinstance(row.get("lng"), (int, float)):
            spatial[cell(row["lat"], row["lng"])].append(row)

    results = []
    for pid, seed in seeds.items():
        scored = []
        close_count = 0
        for hp in nearby(spatial, seed["lat"], seed["lng"]):
            candidate = score_candidate(seed, hp)
            if not candidate:
                continue
            scored.append(candidate)
            if candidate["distanceMeters"] <= 35:
                close_count += 1
        scored.sort(key=lambda row: (-row["combinedScore"], row["distanceMeters"]))
        best = scored[0] if scored else None
        second = scored[1] if len(scored) > 1 else None
        confidence = classify(best, second, close_count)
        results.append({
            "googlePlaceId": pid,
            "seedSource": seed["seedSource"],
            "confidence": confidence,
            "best": best,
            "second": second,
            "nearbyCandidateCount": len(scored),
            "closeCandidateCount": close_count,
        })

    # One Hot Pepper listing cannot be silently assigned to multiple identities.
    claims = defaultdict(list)
    for row in results:
        if row["confidence"] not in {"high", "medium"} or not row.get("best"):
            continue
        claims[row["best"]["hotpepperId"]].append(row)

    collisions = set()
    for hotpepper_id, rows in claims.items():
        if len(rows) > 1:
            collisions.add(hotpepper_id)
            for row in rows:
                row["confidence"] = "review_collision"

    bindings = []
    for row in results:
        if row["confidence"] not in {"high", "medium"} or not row.get("best"):
            continue
        bindings.append({
            "googlePlaceId": row["googlePlaceId"],
            "hotpepperId": row["best"]["hotpepperId"],
            "confidence": row["confidence"],
            "seedSource": row["seedSource"],
            "distanceMeters": row["best"]["distanceMeters"],
            "nameSimilarity": row["best"]["nameSimilarity"],
            "postalMatch": row["best"]["postalMatch"],
            "combinedScore": row["best"]["combinedScore"],
        })

    bindings.sort(key=lambda row: (0 if row["confidence"] == "high" else 1, -row["combinedScore"], row["googlePlaceId"]))
    results.sort(key=lambda row: (
        {"high": 0, "medium": 1, "review": 2, "review_collision": 3, "low": 4, "none": 5}.get(row["confidence"], 9),
        -(row.get("best") or {}).get("combinedScore", 0),
        row["googlePlaceId"],
    ))

    output = {
        "schemaVersion": 1,
        "policy": {
            "paidApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "automaticProductionPromotion": False,
            "hotpepperBindingsAreReviewCandidates": True,
        },
        "summary": {
            "historicalInventory": inventory_total,
            "matchingSeeds": len(seeds),
            "hotpepperRowsInsideArea1": len(hp_rows),
            "confidenceCounts": dict(Counter(row["confidence"] for row in results)),
            "detailEligibleBindings": len(bindings),
            "hotpepperIdCollisions": len(collisions),
            "romanizationEnabled": _KAKASI is not None,
        },
        "bindings": bindings,
        "review": results,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(output["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
