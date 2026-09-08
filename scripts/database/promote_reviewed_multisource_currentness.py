#!/usr/bin/env python3
"""Build a durable basic-source overlay from freshly reviewed multi-source currentness.

This script does not call the network and does not mutate the database. It consumes the
fresh output of `review_id_only_currentness_sources_v2.py`, then emits only rows that are
still safe to admit into the existing `source_matched` layer.

A row must still be strict SQLite `id_only`, have no conflict binding, have no existing
basic-source row, and pass the v2 review's hard historical Hot Pepper gate, hard direct
Overture gate, and current independent-page name+location reconfirmation. Both the chosen
Hot Pepper provider ID and the supporting Overture provider ID must be unused by any
other Place ID in the current database/base file.

Durable display fields come only from Hot Pepper. Overture and the current official page
are retained solely as independent identity-consensus provenance. Legacy production
`verified` state is never created by this overlay.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

RULE_VERSION = "reviewed-multisource-currentness-v1"
CENTER_LAT = 35.6959
CENTER_LNG = 139.7576
RADIUS_M = 1200


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def haversine(lat1, lng1, lat2, lng2):
    radius = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    value = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    return radius * 2 * math.asin(math.sqrt(value))


def safe_https(value: str) -> str | None:
    text = str(value or "").strip()
    if not text.startswith("https://"):
        return None
    try:
        parsed = urlparse(text)
    except Exception:
        return None
    return text if parsed.hostname else None


def binding_index(db):
    output = defaultdict(set)
    states = {}
    conflicts = set()
    for pid, state in db.execute("SELECT place_id,identity_state FROM catalog_entries"):
        states[str(pid)] = str(state)
    for pid, provider, provider_id, binding_state in db.execute(
        """
        SELECT sb.place_id,sr.provider,sr.provider_id,sb.binding_state
        FROM source_bindings sb
        JOIN source_records sr ON sr.source_record_id=sb.source_record_id
        """
    ):
        key = (str(provider), str(provider_id))
        output[key].add(str(pid))
        if str(binding_state) == "conflict":
            conflicts.add(str(pid))
    return states, conflicts, output


def base_indexes(base_doc: dict):
    by_pid = {}
    native = defaultdict(set)
    for row in base_doc.get("rows") or []:
        pid = str(row.get("googlePlaceId") or "")
        provider = str(row.get("provider") or "")
        provider_id = str(row.get("providerId") or "")
        if pid:
            by_pid[pid] = row
        if provider and provider_id and pid:
            native[(provider, provider_id)].add(pid)
    return by_pid, native


def hp_index(hp_doc: dict):
    return {
        str(row.get("googlePlaceId")): row
        for row in hp_doc.get("rows") or []
        if row.get("googlePlaceId")
    }


def independent_currentness(review: dict):
    if review.get("accepted") is not True:
        return False
    final_url = safe_https(review.get("finalUrl"))
    content_hash = str(review.get("contentHash") or "")
    check = review.get("bestCheck") or {}
    return bool(
        final_url
        and re.fullmatch(r"[0-9a-f]{64}", content_hash)
        and check.get("locationConfirmed") is True
        and float(check.get("nameSimilarity") or 0) >= 0.72
    )


def support_collision(binding_map, base_native, provider, provider_id, pid):
    key = (provider, str(provider_id))
    others = (binding_map.get(key, set()) | base_native.get(key, set())) - {pid}
    return sorted(others)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--review", type=Path, required=True)
    ap.add_argument("--base", type=Path, required=True)
    ap.add_argument("--hotpepper", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    args = ap.parse_args()

    review_doc = load_json(args.review)
    base_doc = load_json(args.base)
    hp_doc = load_json(args.hotpepper)

    if review_doc.get("ruleVersion") != "id-only-currentness-review-v2":
        raise RuntimeError("promotion requires fresh alias-aware currentness v2 review")
    review_policy = review_doc.get("policy") or {}
    if review_policy.get("paidDataApiCalls") != 0 or review_policy.get("googleDisplayPayloadPersisted") is not False:
        raise RuntimeError("currentness review violates zero-paid/no-Google-display policy")
    if review_policy.get("proposalOnly") is not True or review_policy.get("nameAndLocationReconfirmationRequired") is not True:
        raise RuntimeError("currentness review policy is not strict enough for promotion")

    base_policy = base_doc.get("policy") or {}
    if base_policy.get("paidGoogleApiCalls") != 0 or base_policy.get("googleDisplayPayloadPersisted") is not False:
        raise RuntimeError("basic source file violates zero-paid/no-Google-display policy")
    if int(base_doc.get("inventoryCount") or 0) != 2804:
        raise RuntimeError("unexpected frozen inventory count")

    db = sqlite3.connect(args.database)
    states, conflict_places, binding_map = binding_index(db)
    db.close()
    base_by_pid, base_native = base_indexes(base_doc)
    hp_by_pid = hp_index(hp_doc)

    counts = Counter()
    rows = []
    used_support = set()

    for candidate in review_doc.get("rows") or []:
        if candidate.get("admissionReady") is not True:
            continue
        counts["review_ready_rows"] += 1
        pid = str(candidate.get("googlePlaceId") or "").strip()
        if not pid or states.get(pid) != "id_only":
            counts["not_current_strict_id_only"] += 1
            continue
        if pid in conflict_places:
            counts["current_conflict_deferred"] += 1
            continue
        if pid in base_by_pid:
            counts["already_basic_source_matched"] += 1
            continue
        if candidate.get("group") != "hotpepper_high_direct_overture":
            counts["unsupported_review_group"] += 1
            continue
        if candidate.get("hardHistoricalBindingGate") is not True or candidate.get("hardDirectOvertureGate") is not True:
            counts["hard_gate_missing"] += 1
            continue

        currentness = candidate.get("currentnessReview") or {}
        if not independent_currentness(currentness):
            counts["currentness_not_strict_enough"] += 1
            continue

        hp = hp_by_pid.get(pid)
        if not hp:
            counts["hotpepper_row_missing"] += 1
            continue
        binding = hp.get("binding") or {}
        facts = hp.get("facts") or {}
        hp_id = str(hp.get("hotpepperId") or "").strip()
        review_hp = candidate.get("hotpepper") or {}
        if hp_id != str(review_hp.get("hotpepperId") or "").strip():
            counts["hotpepper_id_changed"] += 1
            continue
        if binding.get("confidence") != "high" or binding.get("seedSource") != "transient_full_sweep":
            counts["hotpepper_historical_gate_changed"] += 1
            continue
        if not (
            float(binding.get("distanceMeters") or 999999) <= 15
            and float(binding.get("nameSimilarity") or 0) >= 0.60
            and float(binding.get("combinedScore") or 0) >= 0.74
        ):
            counts["hotpepper_historical_metrics_changed"] += 1
            continue

        overture = candidate.get("overture") or {}
        overture_id = str(overture.get("overtureId") or "").strip()
        if not overture_id:
            counts["overture_support_missing"] += 1
            continue
        if not (
            float(overture.get("distanceMeters") or 999999) <= 20
            and float(overture.get("nameSimilarity") or 0) >= 0.75
            and float(overture.get("margin") or 0) >= 0.15
        ):
            counts["overture_hard_metrics_changed"] += 1
            continue

        hp_collision = support_collision(binding_map, base_native, "Hot Pepper", hp_id, pid)
        ov_collision = support_collision(binding_map, base_native, "Overture Maps", overture_id, pid)
        if hp_collision:
            counts["hotpepper_provider_collision"] += 1
            continue
        if ov_collision:
            counts["overture_provider_collision"] += 1
            continue
        if ("Hot Pepper", hp_id) in used_support or ("Overture Maps", overture_id) in used_support:
            counts["within_overlay_source_reuse"] += 1
            continue

        name = str(facts.get("name") or "").strip()
        address = str(facts.get("address") or "").strip()
        lat, lng = facts.get("lat"), facts.get("lng")
        if not name or not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            counts["hotpepper_durable_fields_incomplete"] += 1
            continue
        area_distance = haversine(CENTER_LAT, CENTER_LNG, float(lat), float(lng))
        if area_distance > RADIUS_M:
            counts["hotpepper_outside_frozen_radius"] += 1
            continue

        genre = facts.get("subGenre") or facts.get("genre") or {}
        cuisine = str((genre or {}).get("name") or "餐厅").strip() or "餐厅"
        hp_url = safe_https(((facts.get("urls") or {}).get("pc")))
        current_url = safe_https(currentness.get("finalUrl"))
        websites = []
        for url in (hp_url, current_url):
            if url and url not in websites:
                websites.append(url)

        best_check = currentness.get("bestCheck") or {}
        row = {
            "googlePlaceId": pid,
            "provider": "Hot Pepper",
            "providerId": hp_id,
            "name": name,
            "address": address,
            "lat": float(lat),
            "lng": float(lng),
            "distanceMeters": round(area_distance),
            "cuisine": cuisine,
            "websites": websites,
            "sourceCheckedAt": str(currentness.get("retrievedAt") or "")[:10],
            "verification": "reviewed_hotpepper_overture_currentness_consensus",
            "matchLevel": RULE_VERSION,
            "identityConsensus": {
                "historicalHotPepperReview": {
                    "hotpepperId": hp_id,
                    "distanceMeters": binding.get("distanceMeters"),
                    "nameSimilarity": binding.get("nameSimilarity"),
                    "addressSimilarity": binding.get("addressSimilarity"),
                    "combinedScore": binding.get("combinedScore"),
                    "confidence": binding.get("confidence"),
                    "seedSource": binding.get("seedSource"),
                },
                "overtureSupport": {
                    "overtureId": overture_id,
                    "name": overture.get("name"),
                    "address": overture.get("address"),
                    "lat": overture.get("lat"),
                    "lng": overture.get("lng"),
                    "distanceMeters": overture.get("distanceMeters"),
                    "nameSimilarity": overture.get("nameSimilarity"),
                    "addressSimilarity": overture.get("addressSimilarity"),
                    "postalMatch": overture.get("postalMatch"),
                    "margin": overture.get("margin"),
                },
                "currentIndependentPage": {
                    "url": current_url,
                    "retrievedAt": currentness.get("retrievedAt"),
                    "contentHash": currentness.get("contentHash"),
                    "matchedExpectedName": best_check.get("matchedExpectedName"),
                    "pageName": best_check.get("pageName"),
                    "pageAddress": best_check.get("pageAddress"),
                    "nameSimilarity": best_check.get("nameSimilarity"),
                    "addressSimilarity": best_check.get("addressSimilarity"),
                    "postalMatch": best_check.get("postalMatch"),
                    "geoDistanceMeters": best_check.get("geoDistanceMeters"),
                    "locationConfirmed": best_check.get("locationConfirmed"),
                },
                "policy": {
                    "legacyVerifiedStateCreated": False,
                    "sourceMatchedOnly": True,
                    "independentSources": ["Hot Pepper", "Overture Maps", "current official page"],
                    "currentnessRequired": True,
                    "providerReuseForbidden": True,
                    "ruleVersion": RULE_VERSION,
                },
            },
        }
        rows.append(row)
        used_support.add(("Hot Pepper", hp_id))
        used_support.add(("Overture Maps", overture_id))
        counts["promotable_rows"] += 1

    rows.sort(key=lambda row: row["googlePlaceId"])
    output = {
        "schemaVersion": 1,
        "ruleVersion": RULE_VERSION,
        "policy": {
            "newGoogleApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "durableFieldsIndependentSourceOnly": True,
            "proximityOnlyBindingAllowed": False,
            "minimumIndependentProviders": 2,
            "currentIndependentPageRequired": True,
            "strictIdOnlyRequired": True,
            "providerReuseForbidden": True,
            "legacyVerifiedStateCreated": False,
            "targetIdentityState": "source_matched",
        },
        "summary": {
            "rows": len(rows),
            **dict(sorted(counts.items())),
            "providers": dict(sorted(Counter(row["provider"] for row in rows).items())),
        },
        "rows": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", "ruleVersion": RULE_VERSION, **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
