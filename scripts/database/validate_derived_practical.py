#!/usr/bin/env python3
"""Validate strict retained Hot Pepper practical derivations and lineage."""
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

    doc = json.loads(derived.OVERLAY_PATH.read_text(encoding="utf-8"))
    try:
        derived.validate_overlay(doc)
    except Exception as exc:
        failures.append(f"overlay validation failed: {exc}")

    base = derived.reviewed_base_sources(db)
    expected = {}
    skipped_nonunique = 0
    for item in doc.get("rows") or []:
        pid = str(item.get("googlePlaceId") or "").strip()
        hp_id = str(item.get("hotpepperId") or "").strip()
        sources = base.get((pid, hp_id), [])
        if len(sources) != 1:
            skipped_nonunique += 1
            continue
        srid, _observed = sources[0]
        for field_key, value in derived.candidates(item.get("normalized") or {}).items():
            if value is None or value == "" or value == "unknown":
                continue
            expected[(pid, srid, field_key)] = value

    actual_rows = list(db.execute(
        """
        SELECT place_id,source_record_id,field_key,value_json,
               coalesce(derived_from_observation_id,''),observation_id
        FROM field_observations
        WHERE transformation_rule_version=?
        ORDER BY place_id,source_record_id,field_key,observation_id
        """,
        (derived.RULE_VERSION,),
    ))
    actual = {}
    duplicate_keys = []
    for pid, srid, field_key, value_json, parent_oid, oid in actual_rows:
        key = (str(pid), str(srid), str(field_key))
        if key in actual:
            duplicate_keys.append(key)
            continue
        try:
            value = json.loads(value_json)
        except Exception:
            value = None
        actual[key] = {"value": value, "parent": str(parent_oid or ""), "oid": str(oid)}

    expected_keys = set(expected)
    actual_keys = set(actual)
    missing = sorted(expected_keys - actual_keys)
    unexpected = sorted(actual_keys - expected_keys)
    expect(not duplicate_keys, f"duplicate derived place/source/field keys={len(duplicate_keys)}")
    expect(not missing, f"missing strict-overlay derived observations={len(missing)} sample={missing[:3]}")
    expect(not unexpected, f"unexpected strict-overlay derived observations={len(unexpected)} sample={unexpected[:3]}")

    value_mismatches = []
    lineage_failures = []
    for key in sorted(expected_keys & actual_keys):
        pid, srid, field_key = key
        got = actual[key]
        if got["value"] != expected[key]:
            value_mismatches.append((key, expected[key], got["value"]))
        parent_oid = got["parent"]
        raw_field = derived.OUTPUT_TO_RAW.get(field_key)
        if not parent_oid or not raw_field:
            lineage_failures.append((key, "missing-parent-or-raw-map"))
            continue
        parent = db.execute(
            """
            SELECT place_id,source_record_id,field_key,field_state
            FROM field_observations WHERE observation_id=?
            """,
            (parent_oid,),
        ).fetchone()
        if parent is None:
            lineage_failures.append((key, "parent-not-found"))
            continue
        if (str(parent[0]), str(parent[1]), str(parent[2]), str(parent[3])) != (pid, srid, raw_field, "known"):
            lineage_failures.append((key, (parent[0], parent[1], parent[2], parent[3])))

    expect(not value_mismatches, f"strict-overlay derived value mismatches={len(value_mismatches)} sample={value_mismatches[:2]}")
    expect(not lineage_failures, f"strict-overlay lineage failures={len(lineage_failures)} sample={lineage_failures[:2]}")

    conflict_derived = db.execute(
        """
        SELECT count(*)
        FROM field_observations o
        JOIN source_bindings sb
          ON sb.place_id=o.place_id AND sb.source_record_id=o.source_record_id
        WHERE o.transformation_rule_version=? AND sb.binding_state<>'reviewed'
        """,
        (derived.RULE_VERSION,),
    ).fetchone()[0]
    expect(conflict_derived == 0, f"derived observations from non-reviewed binding={conflict_derived}")

    missing_resolution = 0
    for place_id, _srid, field_key in expected_keys:
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
        "ruleVersion": derived.RULE_VERSION,
        "overlayRows": len(doc.get("rows") or []),
        "reviewedBasePairs": len(base),
        "skippedNonUniqueBaseRows": skipped_nonunique,
        "expectedDerivedObservations": len(expected),
        "actualDerivedObservations": len(actual_rows),
        "uniqueDerivedPlaceSourceFields": len(actual),
        "fieldCounts": field_counts,
        "lineageChecked": len(expected_keys & actual_keys),
        "failures": failures,
    }
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    db.close()
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
