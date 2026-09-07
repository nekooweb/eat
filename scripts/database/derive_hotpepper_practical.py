#!/usr/bin/env python3
"""Derive conservative practical booleans from reviewed Hot Pepper raw facts."""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

import master_import_core as core

RULE_VERSION = "hotpepper-basic-practical-v1"
RULES = {
    "lunch_availability.raw": ("practical.lunch_available", "ari_nashi"),
    "course.raw": ("practical.course_available", "ari_nashi"),
    "free_drink.raw": ("practical.free_drink_available", "ari_nashi"),
    "free_food.raw": ("practical.free_food_available", "ari_nashi"),
    "private_room.raw": ("practical.private_room_available", "ari_nashi"),
    "payment_card.raw": ("practical.card_available", "card"),
    "parking.raw": ("practical.parking_available", "ari_nashi"),
}


def parse_boolean(raw, mode):
    if not isinstance(raw, str):
        return None
    text = raw.strip()
    if mode == "card":
        if text.startswith("利用不可"):
            return False
        if text.startswith("利用可"):
            return True
        return None
    if text.startswith("あり"):
        return True
    if text.startswith("なし"):
        return False
    return None


def resolve_hotpepper_basic_practical(db: sqlite3.Connection, stamp: str):
    placeholders = ",".join("?" for _ in RULES)
    rows = list(db.execute(
        f"""
        SELECT o.place_id,o.source_record_id,o.observation_id,o.field_key,o.value_json,o.observed_at
        FROM field_observations o
        JOIN source_records sr ON sr.source_record_id=o.source_record_id
        JOIN source_bindings sb
          ON sb.place_id=o.place_id AND sb.source_record_id=o.source_record_id
        WHERE sr.acquisition_method='retained_hotpepper_artifact'
          AND sb.binding_state='reviewed'
          AND o.field_state='known'
          AND o.field_key IN ({placeholders})
        ORDER BY o.place_id,o.field_key,o.observation_id
        """,
        tuple(RULES),
    ))

    derived = 0
    field_counts = {}
    for place_id, source_record_id, raw_oid, raw_field, value_json, observed_at in rows:
        value = json.loads(value_json)
        output_field, mode = RULES[raw_field]
        normalized = parse_boolean(value, mode)
        if normalized is None:
            continue
        oid = core.observation(
            db,
            place_id,
            source_record_id,
            output_field,
            normalized,
            "known",
            observed_at,
            derived_from=raw_oid,
            rule=RULE_VERSION,
        )
        core.resolve(db, place_id, output_field, oid, "known", "Hot Pepper", stamp)
        db.execute(
            "UPDATE field_resolutions SET rule_version=? WHERE place_id=? AND field_key=? AND observation_id=?",
            (RULE_VERSION, place_id, output_field, oid),
        )
        derived += 1
        field_counts[output_field] = field_counts.get(output_field, 0) + 1

    return {
        "ruleVersion": RULE_VERSION,
        "derivedObservations": derived,
        "fieldCounts": dict(sorted(field_counts.items())),
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
