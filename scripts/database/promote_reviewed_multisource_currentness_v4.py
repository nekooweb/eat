#!/usr/bin/env python3
"""Promote only strict v4 Hot Pepper/Overture/current-branch consensus rows.

V4 keeps the historical frozen-ID <-> Hot Pepper gate unchanged. Overture support must
pass either the original <=20 m gate or the audited <=60 m branch-address-offset gate,
which additionally requires a matching street-address core, retained name components,
and runner-up margin >= 0.15. A freshly fetched independent branch page must still
reconfirm name + location. Proximity alone can never promote an identity.

Durable display fields continue to come only from Hot Pepper. Overture and the current
branch page are retained as identity-consensus provenance. The target state is
`source_matched`; this script never creates legacy `verified` identities.
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

RULE_VERSION = "reviewed-multisource-currentness-v4"
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


def validate_review_policy(doc: dict):
    if doc.get("ruleVersion") != "id-only-currentness-review-v4":
        raise RuntimeError("promotion requires fresh branch-address currentness v4 review")
    p = doc.get("policy") or {}
    required_true = (
        "proposalOnly",
        "nameAndLocationReconfirmationRequired",
        "historicalHotPepperGateUnchanged",
        "overtureBase20mGateRetained",
        "overtureAddressOffsetRequiresStreetCoreMatch",
        "overtureAddressOffsetRequiresNameComponents",
    )
    if any(p.get(key) is not True for key in required_true):
        raise RuntimeError("v4 review is missing strict policy markers")
    if p.get("paidDataApiCalls") != 0 or p.get("googleDisplayPayloadPersisted") is not False:
        raise RuntimeError("v4 review violates zero-paid/no-Google-display policy")
    if p.get("proximityOnlyAdmissionAllowed") is not False:
        raise RuntimeError("v4 review would allow proximity-only admission")
    if int(p.get("overtureAddressOffsetMaximumMeters") or 0) != 60:
        raise RuntimeError("unexpected v4 Overture address-offset radius")
    if float(p.get("overtureAddressOffsetRequiresRunnerUpMargin") or 0) != 0.15:
        raise RuntimeError("unexpected v4 runner-up margin")


def validate_overture_gate(candidate: dict):
    overture = candidate.get("overture") or {}
    gate = candidate.get("overtureGateV4") or {}
    if candidate.get("hardDirectOvertureGate") is not True or gate.get("accepted") is not True:
        return False, "overture_v4_hard_gate_missing"
    distance = float(overture.get("distanceMeters") or 999999)
    raw_name = float(overture.get("nameSimilarity") or 0)
    effective_name = float(gate.get("effectiveNameSimilarity") or 0)
    margin = float(overture.get("margin") or 0)
    if abs(float(gate.get("distanceMeters") or 999999) - distance) > 0.11:
        return False, "overture_gate_distance_drift"
    if abs(float(gate.get("rawNameSimilarity") or 0) - raw_name) > 0.0002:
        return False, "overture_gate_name_drift"
    if abs(float(gate.get("margin") or 0) - margin) > 0.0002:
        return False, "overture_gate_margin_drift"

    if gate.get("base20mGate") is True:
        if not (distance <= 20 and effective_name >= 0.75 and margin >= 0.15):
            return False, "overture_base20m_metrics_changed"
        return True, "base20m"

    if gate.get("branchAddressOffsetGate") is True:
        if not (
            distance <= 60
            and effective_name >= 0.82
            and gate.get("addressCoreMatch") is True
            and margin >= 0.15
        ):
            return False, "overture_branch_address_metrics_changed"
        return True, "branch_address_offset"

    return False, "overture_v4_gate_shape_missing"


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
    validate_review_policy(review_doc)

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
        if candidate.get("group") != "hotpepper_high_direct_overture_v4":
            counts["unsupported_review_group"] += 1
            continue
        if candidate.get("hardHistoricalBindingGate") is not True:
            counts["historical_hotpepper_gate_missing"] += 1
            continue

        gate_ok, gate_kind = validate_overture_gate(candidate)
        if not gate_ok:
            counts[gate_kind] += 1
            continue
        counts[f"accepted_overture_gate_{gate_kind}"] += 1

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
            "verification": "reviewed_hotpepper_overture_branch_address_currentness_consensus",
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
                    "v4Gate": candidate.get("overtureGateV4"),
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
                    "independentSources": ["Hot Pepper", "Overture Maps", "current independent branch page"],
                    "currentnessRequired": True,
                    "providerReuseForbidden": True,
                    "proximityOnlyBindingAllowed": False,
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
            "historicalHotPepperGateUnchanged": True,
            "overtureBase20mGateRetained": True,
            "branchAddressOffsetMaximumMeters": 60,
            "branchAddressOffsetRequiresAddressCoreMatch": True,
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
