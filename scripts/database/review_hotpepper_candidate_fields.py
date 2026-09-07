#!/usr/bin/env python3
"""Field-only review for retained Hot Pepper candidate bindings.

A candidate binding is never promoted as identity. For an already publishable,
non-conflict Place ID, the retained Hot Pepper row may contribute missing fields only
when its own name/location independently agrees with the currently selected identity.
"""
from __future__ import annotations

import json
import math
import re
import unicodedata
from collections import Counter
from difflib import SequenceMatcher

import derive_hotpepper_practical as practical
import master_import_core as core

ACQUISITION_METHOD = "derived_hotpepper_candidate_field_review_v1"
RULE_VERSION = "hotpepper-candidate-field-review-v1"
BINDING_METHOD = "field_only_from_candidate_after_identity_consistency_check"

EQUIVALENTS = {
    "address": ("address",),
    "hours.raw": ("hours.raw", "hours.reference.legacy", "hours.normalized.legacy"),
    "budget.dinner.range": ("budget.dinner.range", "budget.dinner.legacy_range"),
    "closure.raw": ("closure.raw",),
}


def normalize_text(value) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    return "".join(ch for ch in text if ch.isalnum())


def name_similarity(left, right) -> float:
    a, b = normalize_text(left), normalize_text(right)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def distance_m(a: dict, b: dict) -> float | None:
    try:
        lat1, lon1 = float(a["lat"]), float(a["lng"])
        lat2, lon2 = float(b["lat"]), float(b["lng"])
    except (TypeError, ValueError, KeyError):
        return None
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def selected_values(db):
    output = {}
    for pid, field_key, value_json in db.execute(
        """SELECT r.place_id,r.field_key,o.value_json
           FROM field_resolutions r
           JOIN field_observations o ON o.observation_id=r.observation_id
           WHERE r.resolution_state='known' AND r.field_key IN ('name','address','coordinates')"""
    ):
        if value_json is not None:
            output[(pid, field_key)] = json.loads(value_json)
    return output


def known_fields(db):
    return {
        (pid, field_key)
        for pid, field_key in db.execute(
            "SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'"
        )
    }


def target_missing(known, pid, target):
    equivalents = EQUIVALENTS.get(target, (target,))
    return not any((pid, key) in known for key in equivalents)


def identity_check(current_name, current_address, current_coords, facts):
    hp_name = facts.get("name")
    hp_address = facts.get("address")
    hp_coords = {"lat": facts.get("lat"), "lng": facts.get("lng")}
    similarity = name_similarity(current_name, hp_name)
    spatial = distance_m(current_coords, hp_coords) if isinstance(current_coords, dict) else None
    address_equal = bool(
        normalize_text(current_address)
        and normalize_text(current_address) == normalize_text(hp_address)
    )

    accepted = False
    rule = None
    if spatial is not None and similarity == 1.0 and spatial <= 150:
        accepted, rule = True, "exact_name_within_150m"
    elif spatial is not None and similarity >= 0.95 and spatial <= 80:
        accepted, rule = True, "name_similarity_095_within_80m"
    elif spatial is not None and address_equal and similarity >= 0.85 and spatial <= 100:
        accepted, rule = True, "exact_address_name_085_within_100m"

    return {
        "accepted": accepted,
        "rule": rule,
        "nameSimilarity": round(similarity, 6),
        "distanceMeters": round(spatial, 3) if spatial is not None else None,
        "addressExact": address_equal,
        "currentName": current_name,
        "candidateName": hp_name,
    }


def source_observations(db, source_record_id):
    output = {}
    for oid, field_key, value_json, observed_at in db.execute(
        """SELECT observation_id,field_key,value_json,observed_at
           FROM field_observations WHERE source_record_id=? AND field_state='known'""",
        (source_record_id,),
    ):
        if value_json is not None:
            output[field_key] = {
                "observationId": oid,
                "value": json.loads(value_json),
                "observedAt": observed_at,
            }
    return output


def promote(db, pid, target_field, source, source_record_id, source_url, check, stamp):
    payload = {
        "placeId": pid,
        "fieldKey": target_field,
        "value": source["value"],
        "sourceObservationId": source["observationId"],
        "sourceRecordId": source_record_id,
        "sourceUrl": source_url,
        "identityConsistencyCheck": check,
        "selectionPolicy": "missing_only_field_only_no_identity_change",
        "ruleVersion": RULE_VERSION,
    }
    provider_id = f"candidate-field:{pid}:{target_field}:{source['observationId']}"
    derived_source = core.source_record(
        db,
        "Hot Pepper",
        provider_id,
        payload,
        source_url,
        source.get("observedAt") or stamp[:10],
        ACQUISITION_METHOD,
        "derived from retained Hot Pepper candidate only after existing-identity consistency check; no new API call",
        stamp,
    )
    core.upsert_binding(
        db,
        pid,
        derived_source,
        "reviewed",
        BINDING_METHOD,
        "field_only_not_identity",
        check.get("distanceMeters"),
        stamp,
    )
    oid = core.observation(
        db,
        pid,
        derived_source,
        target_field,
        source["value"],
        "known",
        source.get("observedAt") or stamp[:10],
        derived_from=source["observationId"],
        rule=RULE_VERSION,
    )
    core.resolve(db, pid, target_field, oid, "known", "Hot Pepper", stamp)
    return oid


def resolve_candidate_fields(db, stamp: str):
    identities = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    conflicts = {
        row[0] for row in db.execute(
            "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
        )
    }
    selected = selected_values(db)
    known = known_fields(db)
    counts = Counter()
    checks = Counter()
    resolved_places = set()

    rows = list(db.execute(
        """SELECT sr.source_record_id,sr.source_url,sr.payload_json,sb.place_id
           FROM source_records sr
           JOIN source_bindings sb ON sb.source_record_id=sr.source_record_id
           WHERE sr.acquisition_method='retained_hotpepper_artifact'
             AND sb.binding_state='candidate'
           ORDER BY sb.place_id,sr.provider_id,sr.source_record_id"""
    ))

    for source_record_id, source_url, payload_json, pid in rows:
        if identities.get(pid) not in ("verified", "source_matched"):
            checks["identity_not_publishable"] += 1
            continue
        if pid in conflicts:
            checks["identity_conflict"] += 1
            continue
        payload = json.loads(payload_json)
        facts = payload.get("facts") or {}
        current_name = selected.get((pid, "name"))
        current_address = selected.get((pid, "address"))
        current_coords = selected.get((pid, "coordinates"))
        check = identity_check(current_name, current_address, current_coords, facts)
        if not check["accepted"]:
            checks["identity_consistency_rejected"] += 1
            continue
        if not isinstance(source_url, str) or not source_url.startswith("https://www.hotpepper.jp/"):
            checks["invalid_source_url"] += 1
            continue
        checks["eligible_candidate_binding"] += 1
        observations = source_observations(db, source_record_id)

        direct_fields = {
            "address": "address",
            "hours.raw": "hours.raw",
            "budget.dinner.range": "budget.dinner.range",
            "closure.raw": "closure.raw",
        }
        for target, source_field in direct_fields.items():
            source = observations.get(source_field)
            if source is None or not target_missing(known, pid, target):
                continue
            promote(db, pid, target, source, source_record_id, source_url, check, stamp)
            known.add((pid, target))
            counts[target] += 1
            resolved_places.add(pid)

        for raw_field, (target, mode) in practical.RULES.items():
            source = observations.get(raw_field)
            if source is None or (pid, target) in known:
                continue
            normalized = practical.parse_boolean(source["value"], mode)
            if normalized is None:
                continue
            normalized_source = dict(source)
            normalized_source["value"] = normalized
            # Practical boolean is a transformation of the raw candidate observation.
            payload = {
                "placeId": pid,
                "fieldKey": target,
                "value": normalized,
                "sourceObservationId": source["observationId"],
                "sourceRecordId": source_record_id,
                "sourceUrl": source_url,
                "identityConsistencyCheck": check,
                "selectionPolicy": "missing_only_field_only_no_identity_change",
                "ruleVersion": RULE_VERSION,
                "booleanParser": practical.RULE_VERSION,
            }
            provider_id = f"candidate-field:{pid}:{target}:{source['observationId']}"
            derived_source = core.source_record(
                db,
                "Hot Pepper",
                provider_id,
                payload,
                source_url,
                source.get("observedAt") or stamp[:10],
                ACQUISITION_METHOD,
                "derived from retained Hot Pepper candidate after identity consistency check; no new API call",
                stamp,
            )
            core.upsert_binding(
                db, pid, derived_source, "reviewed", BINDING_METHOD,
                "field_only_not_identity", check.get("distanceMeters"), stamp,
            )
            oid = core.observation(
                db,
                pid,
                derived_source,
                target,
                normalized,
                "known",
                source.get("observedAt") or stamp[:10],
                derived_from=source["observationId"],
                rule=RULE_VERSION,
            )
            core.resolve(db, pid, target, oid, "known", "Hot Pepper", stamp)
            known.add((pid, target))
            counts[target] += 1
            resolved_places.add(pid)

    return {
        "ruleVersion": RULE_VERSION,
        "candidateBindings": len(rows),
        "resolvedFields": sum(counts.values()),
        "resolvedPlaces": len(resolved_places),
        "fieldCounts": dict(sorted(counts.items())),
        "checkCounts": dict(sorted(checks.items())),
    }
