#!/usr/bin/env python3
"""Read-only deep audit of the two highest-value strict id-only identity groups.

Group A: current strict id-only rows with OSM<->Overture A/B priority cross-support.
Group B: current strict id-only rows with retained Hot Pepper `high` candidate bindings.

For Group B this audit additionally computes a fresh zero-network Hot Pepper<->Overture
cross-match against the retained Overture snapshot using the same conservative spatial,
name, postal-code and runner-up-margin logic used by `recover_google_inventory_basic.py`.
The result remains review-only and never creates a binding or catalog admission.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
GRID_DEG = 0.001
MAX_DISTANCE_M = 140


def load_json(path: Path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_name(value):
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"[\s\u3000・･\-_.,，。/\\()（）\[\]【】「」『』&＆+]+", "", text)
    for token in ("restaurant", "restaurante", "cafe", "coffee", "shop", "store", "bar", "dining"):
        text = text.replace(token, "")
    return text


def similarity(a, b):
    left, right = normalize_name(a), normalize_name(b)
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0
    if left in right or right in left:
        short, long = min(len(left), len(right)), max(len(left), len(right))
        if short >= 3:
            return max(0.82, short / long)
    return SequenceMatcher(None, left, right).ratio()


def normalize_address(value):
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    return re.sub(r"[\s\u3000・･\-_.,，。/\\()（）\[\]【】「」『』&＆]+", "", text)


def address_similarity(a, b):
    left, right = normalize_address(a), normalize_address(b)
    if not left or not right:
        return 0.0
    return SequenceMatcher(None, left, right).ratio()


def postcode(value):
    match = re.search(r"(?:〒\s*)?(\d{3})[-‐‑–—ー－]?\s*(\d{4})", str(value or ""))
    return "".join(match.groups()) if match else ""


def address_text(row):
    addresses = row.get("addresses") or []
    if not addresses:
        return ""
    first = addresses[0] or {}
    return "".join(str(first.get(key) or "") for key in ("region", "locality", "freeform"))


def haversine(lat1, lng1, lat2, lng2):
    if not all(isinstance(value, (int, float)) and math.isfinite(value) for value in (lat1, lng1, lat2, lng2)):
        return None
    radius = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat, dlng = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    value = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(value))


def grid_key(lat, lng):
    return (round(float(lat) / GRID_DEG), round(float(lng) / GRID_DEG))


def build_overture_grid(rows):
    grid = defaultdict(list)
    for index, row in enumerate(rows):
        lat, lng = row.get("lat"), row.get("lng")
        if isinstance(lat, (int, float)) and isinstance(lng, (int, float)) and row.get("name"):
            grid[grid_key(lat, lng)].append((index, row))
    return grid


def direct_hp_overture(seed: dict, grid):
    lat, lng = seed.get("lat"), seed.get("lng")
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        return {"status": "missing_hotpepper_coordinates"}
    base = grid_key(lat, lng)
    candidates = []
    for di in range(-2, 3):
        for dj in range(-2, 3):
            for index, row in grid.get((base[0] + di, base[1] + dj), []):
                distance = haversine(lat, lng, row.get("lat"), row.get("lng"))
                if distance is None or distance > MAX_DISTANCE_M:
                    continue
                name_score = similarity(seed.get("name"), row.get("name"))
                addr_score = address_similarity(seed.get("address"), address_text(row))
                hp_postal, ov_postal = postcode(seed.get("address")), postcode(address_text(row))
                postal_match = bool(hp_postal and ov_postal and hp_postal == ov_postal)
                distance_score = max(0.0, 1.0 - distance / MAX_DISTANCE_M)
                score = 0.58 * name_score + 0.30 * distance_score + (0.12 if postal_match else 0.0)
                candidates.append((score, name_score, distance, addr_score, postal_match, index, row))
    if not candidates:
        return {"status": "no_nearby_overture"}
    candidates.sort(key=lambda item: (-item[0], item[2], -item[1]))
    best = candidates[0]
    second = candidates[1] if len(candidates) > 1 else None
    score, name_score, distance, addr_score, postal_match, _index, row = best
    margin = score - (second[0] if second else 0.0)
    strong_shape = (
        (name_score >= 0.90 and distance <= 100)
        or (name_score >= 0.78 and distance <= 55)
        or (name_score >= 0.64 and distance <= 25)
        or (postal_match and name_score >= 0.45 and distance <= 18)
        or (postal_match and name_score >= 0.72 and distance <= 45)
    )
    strong = bool(
        strong_shape
        and score >= 0.64
        and (margin >= 0.055 or (name_score >= 0.92 and distance <= 25))
    )
    runner = None
    if second:
        runner = {
            "overtureId": second[6].get("overtureId"),
            "name": second[6].get("name"),
            "score": round(second[0], 4),
            "distanceMeters": round(second[2], 1),
            "nameSimilarity": round(second[1], 4),
        }
    return {
        "status": "strong_review_candidate" if strong else "not_strong",
        "strongReviewCandidate": strong,
        "best": {
            "overtureId": row.get("overtureId"),
            "name": row.get("name"),
            "address": address_text(row),
            "lat": row.get("lat"),
            "lng": row.get("lng"),
            "websites": row.get("websites") or [],
            "phones": row.get("phones") or [],
            "basicCategory": row.get("basicCategory"),
            "score": round(score, 4),
            "nameSimilarity": round(name_score, 4),
            "addressSimilarity": round(addr_score, 4),
            "postalMatch": postal_match,
            "distanceMeters": round(distance, 1),
            "margin": round(margin, 4),
        },
        "runner": runner,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    args = ap.parse_args()

    db = sqlite3.connect(args.database)
    states = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    binding_rows = defaultdict(list)
    for pid, provider, provider_id, state, method, acquisition in db.execute(
        """
        SELECT sb.place_id,sr.provider,sr.provider_id,sb.binding_state,sb.binding_method,sr.acquisition_method
        FROM source_bindings sb
        JOIN source_records sr ON sr.source_record_id=sb.source_record_id
        ORDER BY sb.place_id,sr.provider,sr.provider_id
        """
    ):
        binding_rows[str(pid)].append({
            "provider": provider,
            "providerId": provider_id,
            "bindingState": state,
            "bindingMethod": method,
            "acquisitionMethod": acquisition,
        })
    db.close()

    id_only = {pid for pid, state in states.items() if state == "id_only"}
    queue = load_json(DATA / "area1_enrichment_queue.json", {"items": []}) or {"items": []}
    queue_by_pid = {
        str(item.get("googlePlaceId")): item
        for item in queue.get("items") or []
        if item.get("googlePlaceId")
    }
    hp_doc = load_json(DATA / "hotpepper_catalog_facts.json", {"rows": []}) or {"rows": []}
    hp_by_pid = {str(row.get("googlePlaceId")): row for row in hp_doc.get("rows") or []}
    overture_doc = load_json(DATA / "overture_area1_candidates.json", {"rows": []}) or {"rows": []}
    overture_rows = overture_doc.get("rows") or []
    overture_grid = build_overture_grid(overture_rows)

    cross_priority = []
    hp_high = []
    counts = Counter()

    for pid in sorted(id_only):
        item = queue_by_pid.get(pid) or {}
        overture_support = item.get("overtureSupport") or {}
        if overture_support.get("triage") in {"A_priority_review", "B_blocker_review"}:
            counts["crossPriority"] += 1
            cross_priority.append({
                "googlePlaceId": pid,
                "queue": item.get("queue"),
                "candidateName": item.get("candidateName"),
                "openCandidate": item.get("openCandidate"),
                "overtureSupport": overture_support,
                "hotpepper": hp_by_pid.get(pid),
                "currentBindings": binding_rows.get(pid, []),
            })

        hp = hp_by_pid.get(pid)
        if hp and (hp.get("binding") or {}).get("confidence") == "high":
            counts["hotPepperHigh"] += 1
            facts = hp.get("facts") or {}
            direct = direct_hp_overture({
                "name": facts.get("name"),
                "address": facts.get("address"),
                "lat": facts.get("lat"),
                "lng": facts.get("lng"),
            }, overture_grid)
            if direct.get("strongReviewCandidate"):
                counts["hotPepperHighWithStrongDirectOverture"] += 1
            best = direct.get("best") or {}
            if best.get("websites"):
                counts["hotPepperHighWithDirectOvertureWebsite"] += 1
            hp_high.append({
                "googlePlaceId": pid,
                "queue": item.get("queue"),
                "hotpepper": {
                    "hotpepperId": hp.get("hotpepperId"),
                    "binding": hp.get("binding"),
                    "facts": {
                        "name": facts.get("name"),
                        "address": facts.get("address"),
                        "lat": facts.get("lat"),
                        "lng": facts.get("lng"),
                        "urls": facts.get("urls"),
                    },
                },
                "directOverture": direct,
                "existingOpenCandidate": item.get("openCandidate"),
                "existingOvertureSupport": item.get("overtureSupport"),
                "currentBindings": binding_rows.get(pid, []),
            })

    for row in cross_priority:
        websites = (row.get("overtureSupport") or {}).get("websites") or []
        if websites:
            counts["crossPriorityWithOvertureWebsite"] += 1
        if row.get("hotpepper"):
            counts["crossPriorityWithHotPepper"] += 1

    cross_priority.sort(
        key=lambda row: (
            -(row.get("overtureSupport") or {}).get("combinedScore", 0),
            (row.get("overtureSupport") or {}).get("distanceToOsmMeters") or 999999,
            row["googlePlaceId"],
        )
    )
    hp_high.sort(
        key=lambda row: (
            not bool((row.get("directOverture") or {}).get("strongReviewCandidate")),
            -float(((row.get("directOverture") or {}).get("best") or {}).get("score") or 0),
            row["googlePlaceId"],
        )
    )

    output = {
        "schemaVersion": 1,
        "policy": {
            "readOnly": True,
            "paidDataApiCalls": 0,
            "automaticIdentityPromotion": False,
            "hotPepperDirectOvertureIsReviewOnly": True,
            "runnerUpMarginRequired": True,
            "currentnessEvidenceNotAssumed": True,
        },
        "summary": {
            "strictIdOnly": len(id_only),
            "counts": dict(sorted(counts.items())),
        },
        "crossPriorityIdOnly": cross_priority,
        "hotPepperHighIdOnly": hp_high,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
