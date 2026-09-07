#!/usr/bin/env python3
"""Field-level resolver passes for the persistent Eat master database."""
from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import master_import_core as core

SAFE_HOTPEPPER_PRACTICAL_FIELDS = (
    "practical.accepted_credit_cards",
    "practical.special_features",
    "practical.mobile_coupon_available",
    "practical.nearest_station",
    "practical.access",
    "practical.mobile_access",
    "practical.lunch_available",
    "practical.capacity",
    "practical.party_capacity",
    "practical.amenities",
)
RULE_VERSION = "hotpepper-practical-v1"


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def resolve_safe_practical(db: sqlite3.Connection, stamp: str | None = None):
    stamp = stamp or now_iso()
    placeholders = ",".join("?" for _ in SAFE_HOTPEPPER_PRACTICAL_FIELDS)
    rows = list(db.execute(
        f"""
        SELECT o.place_id,o.field_key,o.observation_id,o.observed_at
        FROM field_observations o
        JOIN source_records sr ON sr.source_record_id=o.source_record_id
        JOIN source_bindings sb
          ON sb.place_id=o.place_id AND sb.source_record_id=o.source_record_id
        WHERE sr.acquisition_method='retained_hotpepper_rich_metadata'
          AND sb.binding_state='reviewed'
          AND o.field_state='known'
          AND o.field_key IN ({placeholders})
        ORDER BY o.place_id,o.field_key,coalesce(o.observed_at,'' ) DESC,o.observation_id
        """,
        SAFE_HOTPEPPER_PRACTICAL_FIELDS,
    ))

    selected = {}
    for place_id, field_key, observation_id, _observed_at in rows:
        selected.setdefault((place_id, field_key), observation_id)

    for (place_id, field_key), observation_id in selected.items():
        # These are new practical field namespaces. Use the standard resolver so
        # reruns are idempotent and later higher-priority direct sources can replace them.
        core.resolve(db, place_id, field_key, observation_id, "known", "Hot Pepper", stamp)
        db.execute(
            "UPDATE field_resolutions SET rule_version=? WHERE place_id=? AND field_key=?",
            (RULE_VERSION, place_id, field_key),
        )

    return {
        "ruleVersion": RULE_VERSION,
        "resolvedPlaceFields": len(selected),
        "resolvedPlaces": len({place_id for place_id, _ in selected}),
        "fieldCounts": dict(db.execute(
            f"""
            SELECT field_key,count(*)
            FROM field_resolutions
            WHERE rule_version=? AND field_key IN ({placeholders})
            GROUP BY field_key ORDER BY field_key
            """,
            (RULE_VERSION, *SAFE_HOTPEPPER_PRACTICAL_FIELDS),
        )),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    db = sqlite3.connect(args.database)
    db.execute("PRAGMA foreign_keys=ON")
    try:
        db.execute("BEGIN IMMEDIATE")
        summary = resolve_safe_practical(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print(json.dumps({"status": "pass", **summary}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
