#!/usr/bin/env python3
"""Validate conservative derived Hot Pepper practical fields."""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

import derive_hotpepper_practical as derived


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    db = sqlite3.connect(args.database)
    db.execute("PRAGMA foreign_keys=ON")
    failures = []

    def expect(condition, message):
        if not condition:
            failures.append(message)

    placeholders = ",".join("?" for _ in derived.RULES)
    raw_rows = list(db.execute(
        f"""
        SELECT o.place_id,o.observation_id,o.field_key,o.value_json
        FROM field_observations o
        JOIN source_records sr ON sr.source_record_id=o.source_record_id
        JOIN source_bindings sb
          ON sb.place_id=o.place_id AND sb.source_record_id=o.source_record_id
        WHERE sr.acquisition_method='retained_hotpepper_artifact'
          AND sb.binding_state='reviewed'
          AND o.field_state='known'
          AND o.field_key IN ({placeholders})
        """,
        tuple(derived.RULES),
    ))
    expected = 0
    expected_pairs = set()
    for place_id, _raw_oid, raw_field, value_json in raw_rows:
        value = json.loads(value_json)
        output_field, mode = derived.RULES[raw_field]
        if derived.parse_boolean(value, mode) is not None:
            expected += 1
            expected_pairs.add((place_id, output_field))

    actual = db.execute(
        "SELECT count(*) FROM field_observations WHERE transformation_rule_version=?",
        (derived.RULE_VERSION,),
    ).fetchone()[0]
    expect(actual == expected, f"derived observations={actual}, expected={expected}")

    conflict_derived = db.execute("""
      SELECT count(*)
      FROM field_observations o
      JOIN source_bindings sb
        ON sb.place_id=o.place_id AND sb.source_record_id=o.source_record_id
      WHERE o.transformation_rule_version=? AND sb.binding_state<>'reviewed'
    """, (derived.RULE_VERSION,)).fetchone()[0]
    expect(conflict_derived == 0, f"derived observations from non-reviewed binding={conflict_derived}")

    missing_resolution = 0
    for place_id, field_key in expected_pairs:
        row = db.execute(
            "SELECT resolution_state FROM field_resolutions WHERE place_id=? AND field_key=?",
            (place_id, field_key),
        ).fetchone()
        if row is None or row[0] != "known":
            missing_resolution += 1
    expect(missing_resolution == 0, f"derived place-fields without final known resolution={missing_resolution}")

    field_counts = dict(db.execute(
        "SELECT field_key,count(*) FROM field_observations WHERE transformation_rule_version=? GROUP BY field_key ORDER BY field_key",
        (derived.RULE_VERSION,),
    ))
    summary = {
        "status": "fail" if failures else "pass",
        "derivedObservations": actual,
        "derivedPlaceFields": len(expected_pairs),
        "fieldCounts": field_counts,
        "failures": failures,
    }
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    db.close()
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
