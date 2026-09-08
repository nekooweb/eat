#!/usr/bin/env python3
"""Resolve practical restaurant fields from the normalized retained Hot Pepper catalog overlay.

The overlay is generated locally from already-retained Hot Pepper facts. This importer
performs no network requests, requires the same unique reviewed base Hot Pepper binding,
never changes identity, and fills canonical practical fields missing-only.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

import master_import_core as core

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
OVERLAY_PATH = DATA / "hotpepper_catalog_practical_overlay.json"
RULE_VERSION = "hotpepper-catalog-practical-v1"

RAW_FIELD_BY_OUTPUT = {
    "practical.lunch_available": "lunch_availability.raw",
    "practical.course_available": "course.raw",
    "practical.free_drink_available": "free_drink.raw",
    "practical.free_food_available": "free_food.raw",
    "practical.private_room_available": "private_room.raw",
    "practical.private_room_policy": "private_room.raw",
    "practical.card_available": "payment_card.raw",
    "practical.smoking_policy": "smoking.raw",
    "practical.parking_available": "parking.raw",
    "practical.parking_policy": "parking.raw",
    "station.name": "station.raw",
    "access.reference": "access.raw",
}


def reviewed_base_sources(db: sqlite3.Connection):
    mapping: dict[tuple[str, str], list[tuple[str, str]]] = defaultdict(list)
    for pid, provider_id, srid, observed_at in db.execute(
        """
        SELECT sb.place_id,sr.provider_id,sr.source_record_id,coalesce(sr.observed_at,'')
        FROM source_records sr
        JOIN source_bindings sb ON sb.source_record_id=sr.source_record_id
        WHERE sr.provider='Hot Pepper'
          AND sr.acquisition_method='retained_hotpepper_artifact'
          AND sb.binding_state='reviewed'
        ORDER BY sb.place_id,sr.provider_id,sr.source_record_id
        """
    ):
        mapping[(str(pid), str(provider_id))].append((str(srid), str(observed_at)))
    return mapping


def known_resolution_set(db: sqlite3.Connection):
    return {
        (str(pid), str(field_key))
        for pid, field_key in db.execute(
            "SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'"
        )
    }


def existing_raw_observation(db, pid: str, srid: str, field_key: str):
    row = db.execute(
        """
        SELECT observation_id,value_json,coalesce(observed_at,'')
        FROM field_observations
        WHERE place_id=? AND source_record_id=? AND field_key=? AND field_state='known'
        ORDER BY observation_id LIMIT 1
        """,
        (pid, srid, field_key),
    ).fetchone()
    if row is None:
        return None, None, None
    try:
        value = json.loads(row[1]) if row[1] is not None else None
    except Exception:
        value = None
    return str(row[0]), value, str(row[2])


def resolve_missing(db, known, pid, srid, field_key, value, observed, stamp, derived_from):
    if (pid, field_key) in known:
        return False
    if value is None or value == "" or value == "unknown":
        return False
    oid = core.observation(
        db,
        pid,
        srid,
        field_key,
        value,
        "known",
        observed,
        derived_from=derived_from,
        rule=RULE_VERSION,
    )
    core.resolve(db, pid, field_key, oid, "known", "Hot Pepper", stamp)
    db.execute(
        "UPDATE field_resolutions SET rule_version=? WHERE place_id=? AND field_key=? AND observation_id=?",
        (RULE_VERSION, pid, field_key, oid),
    )
    known.add((pid, field_key))
    return True


def validate_overlay(doc: dict):
    if doc.get("ruleVersion") != RULE_VERSION:
        raise RuntimeError(f"unexpected Hot Pepper practical overlay ruleVersion: {doc.get('ruleVersion')}")
    policy = doc.get("policy") or {}
    required = {
        "sourceBackedOnly": True,
        "reviewedAutoEligibleBindingOnly": True,
        "paidGoogleDataApiCalls": 0,
        "hotPepperWebServiceApiCalls": 0,
        "networkRequests": 0,
        "rawSourceTextRetained": True,
        "ambiguousContradictoryValuesResolveToUnknown": True,
        "parkingNearbyPaidIsNotOnSiteParking": True,
        "privateSemiRoomIsNotFullPrivateRoom": True,
    }
    for key, expected in required.items():
        if policy.get(key) != expected:
            raise RuntimeError(f"Hot Pepper practical overlay policy mismatch for {key}: {policy.get(key)!r}")


def import_overlay(db: sqlite3.Connection, id_set: set[str], conflict_places: set[str], stamp: str):
    if not OVERLAY_PATH.exists():
        return {"inputRows": 0, "resolvedFields": 0, "fieldCounts": {}, "networkRequests": 0}
    doc = core.read_json(OVERLAY_PATH)
    validate_overlay(doc)
    base = reviewed_base_sources(db)
    known = known_resolution_set(db)
    identity_before = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    counts = Counter()
    skipped = Counter()

    for row in doc.get("rows") or []:
        pid = str(row.get("googlePlaceId") or "").strip()
        hp_id = str(row.get("hotpepperId") or "").strip()
        if not pid or pid not in id_set or not hp_id:
            skipped["invalid_identity_key"] += 1
            continue
        if pid in conflict_places:
            skipped["identity_conflict"] += 1
            continue
        sources = base.get((pid, hp_id), [])
        if len(sources) != 1:
            skipped["reviewed_base_not_unique"] += 1
            continue
        srid, source_observed = sources[0]
        normalized = row.get("normalized") or {}
        observed = str(row.get("checkedAt") or source_observed or doc.get("checkedAt") or stamp)[:10]

        candidates = {
            "practical.lunch_available": normalized.get("lunchAvailable"),
            "practical.course_available": normalized.get("courseAvailable"),
            "practical.free_drink_available": normalized.get("allYouCanDrinkAvailable"),
            "practical.free_food_available": normalized.get("allYouCanEatAvailable"),
            "practical.private_room_available": normalized.get("privateRoomAvailable"),
            "practical.private_room_policy": normalized.get("privateRoomStatus"),
            "practical.card_available": normalized.get("cardPaymentAvailable"),
            "practical.smoking_policy": normalized.get("smokingPolicy"),
            "practical.parking_available": normalized.get("parkingAvailable"),
            "practical.parking_policy": normalized.get("parkingStatus"),
            "station.name": normalized.get("stationName"),
            "access.reference": normalized.get("accessReference"),
        }

        for output_field, value in candidates.items():
            if value is None or value == "" or value == "unknown":
                skipped[f"unknown:{output_field}"] += 1
                continue
            raw_field = RAW_FIELD_BY_OUTPUT[output_field]
            raw_oid, raw_value, _raw_observed = existing_raw_observation(db, pid, srid, raw_field)
            if raw_oid is None:
                skipped[f"raw_missing:{raw_field}"] += 1
                continue
            if resolve_missing(db, known, pid, srid, output_field, value, observed, stamp, raw_oid):
                counts[output_field] += 1
            else:
                skipped[f"already_known:{output_field}"] += 1

    identity_after = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    if identity_after != identity_before:
        raise RuntimeError("Hot Pepper catalog practical importer changed identity state")

    return {
        "ruleVersion": RULE_VERSION,
        "inputRows": len(doc.get("rows") or []),
        "reviewedBasePairs": len(base),
        "resolvedFields": sum(counts.values()),
        "fieldCounts": dict(sorted(counts.items())),
        "skipped": {k: v for k, v in sorted(skipped.items()) if v},
        "networkRequests": 0,
        "identityChanges": 0,
        "missingOnly": True,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    db = sqlite3.connect(args.database)
    db.execute("PRAGMA foreign_keys=ON")
    try:
        id_set = {str(row[0]) for row in db.execute("SELECT place_id FROM catalog_entries")}
        conflict_places = {
            str(row[0]) for row in db.execute(
                "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
            )
        }
        db.execute("BEGIN IMMEDIATE")
        summary = import_overlay(db, id_set, conflict_places, core.now_iso())
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print(json.dumps({"status": "pass", **summary}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
