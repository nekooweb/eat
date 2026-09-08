#!/usr/bin/env python3
"""Derive practical fields from the strict retained Hot Pepper catalog overlay.

The normalized overlay is generated from already-retained provider facts with zero
network/API requests. Ambiguous or contradictory provider text stays raw/unknown rather
than being forced through the old startswith('あり'/'なし') boolean shortcut.
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

OUTPUT_TO_RAW = {
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


def validate_overlay(doc: dict) -> None:
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


def raw_observation(db: sqlite3.Connection, pid: str, srid: str, field_key: str):
    row = db.execute(
        """
        SELECT observation_id,coalesce(observed_at,'')
        FROM field_observations
        WHERE place_id=? AND source_record_id=? AND field_key=? AND field_state='known'
        ORDER BY observation_id LIMIT 1
        """,
        (pid, srid, field_key),
    ).fetchone()
    return (str(row[0]), str(row[1])) if row is not None else (None, None)


def candidates(normalized: dict):
    return {
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


def resolve_hotpepper_basic_practical(db: sqlite3.Connection, stamp: str):
    if not OVERLAY_PATH.exists():
        raise RuntimeError("missing data/hotpepper_catalog_practical_overlay.json; rebuild retained practical overlay first")
    doc = core.read_json(OVERLAY_PATH)
    validate_overlay(doc)
    sources = reviewed_base_sources(db)
    counts = Counter()
    skipped = Counter()

    for row in doc.get("rows") or []:
        pid = str(row.get("googlePlaceId") or "").strip()
        hp_id = str(row.get("hotpepperId") or "").strip()
        if not pid or not hp_id:
            skipped["invalid_identity_key"] += 1
            continue
        source_rows = sources.get((pid, hp_id), [])
        if len(source_rows) != 1:
            skipped["reviewed_base_not_unique"] += 1
            continue
        srid, source_observed = source_rows[0]
        observed = str(row.get("checkedAt") or source_observed or doc.get("checkedAt") or stamp)[:10]
        normalized = row.get("normalized") or {}

        for output_field, value in candidates(normalized).items():
            if value is None or value == "" or value == "unknown":
                skipped[f"unknown:{output_field}"] += 1
                continue
            raw_field = OUTPUT_TO_RAW[output_field]
            raw_oid, raw_observed = raw_observation(db, pid, srid, raw_field)
            if raw_oid is None:
                skipped[f"raw_missing:{raw_field}"] += 1
                continue
            oid = core.observation(
                db,
                pid,
                srid,
                output_field,
                value,
                "known",
                raw_observed or observed,
                derived_from=raw_oid,
                rule=RULE_VERSION,
            )
            core.resolve(db, pid, output_field, oid, "known", "Hot Pepper", stamp)
            selected = db.execute(
                "SELECT observation_id,resolution_state FROM field_resolutions WHERE place_id=? AND field_key=?",
                (pid, output_field),
            ).fetchone()
            if selected and selected[0] == oid and selected[1] == "known":
                db.execute(
                    "UPDATE field_resolutions SET rule_version=? WHERE place_id=? AND field_key=? AND observation_id=?",
                    (RULE_VERSION, pid, output_field, oid),
                )
                counts[output_field] += 1
            else:
                skipped[f"higher_priority_preserved:{output_field}"] += 1

    return {
        "ruleVersion": RULE_VERSION,
        "overlayRows": len(doc.get("rows") or []),
        "reviewedBasePairs": len(sources),
        "derivedObservations": sum(counts.values()),
        "fieldCounts": dict(sorted(counts.items())),
        "skipped": {key: value for key, value in sorted(skipped.items()) if value},
        "networkRequests": 0,
        "ambiguousValuesForced": 0,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    db = sqlite3.connect(args.database)
    db.execute("PRAGMA foreign_keys=ON")
    try:
        db.execute("BEGIN IMMEDIATE")
        summary = resolve_hotpepper_basic_practical(db, core.now_iso())
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print(json.dumps({"status": "pass", **summary}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
