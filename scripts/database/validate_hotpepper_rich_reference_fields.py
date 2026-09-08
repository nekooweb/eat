#!/usr/bin/env python3
"""Validate additional reviewed Hot Pepper rich-reference resolutions and lineage."""
from __future__ import annotations

import argparse
import json
import sqlite3
from collections import Counter
from pathlib import Path

import import_hotpepper_rich_metadata as rich
import resolve_hotpepper_rich_reference_fields as resolver


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

    identity_before = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    actual_rows = list(db.execute(
        """
        SELECT place_id,source_record_id,field_key,value_json,
               coalesce(derived_from_observation_id,''),observation_id
        FROM field_observations
        WHERE transformation_rule_version=?
        ORDER BY place_id,source_record_id,field_key,observation_id
        """,
        (resolver.RULE_VERSION,),
    ))
    expect(bool(actual_rows), "no hotpepper-rich-reference-v1 observations found")

    allowed_outputs = {output for _raw, output, _kind in resolver.FIELD_SPECS}
    spec_by_output = {output: (raw, kind) for raw, output, kind in resolver.FIELD_SPECS}
    duplicate_keys = []
    seen = set()
    field_counts = Counter()
    lineage_failures = []
    value_failures = []
    resolution_failures = []

    for pid, srid, field_key, value_json, parent_oid, oid in actual_rows:
        pid, srid, field_key = str(pid), str(srid), str(field_key)
        key = (pid, srid, field_key)
        if key in seen:
            duplicate_keys.append(key)
        seen.add(key)
        field_counts[field_key] += 1
        if field_key not in allowed_outputs:
            value_failures.append((key, "unexpected-output-field"))
            continue
        try:
            value = json.loads(value_json)
        except Exception:
            value = None
        raw_field, kind = spec_by_output[field_key]
        normalized = resolver.valid_value(value, kind)
        if normalized is None or normalized != value:
            value_failures.append((key, value))

        if not parent_oid:
            lineage_failures.append((key, "missing-parent"))
        else:
            parent = db.execute(
                """
                SELECT place_id,source_record_id,field_key,field_state
                FROM field_observations WHERE observation_id=?
                """,
                (parent_oid,),
            ).fetchone()
            if parent is None:
                lineage_failures.append((key, "parent-not-found"))
            elif (str(parent[0]), str(parent[1]), str(parent[2]), str(parent[3])) != (pid, srid, raw_field, "known"):
                lineage_failures.append((key, tuple(parent)))

        selected = db.execute(
            """
            SELECT observation_id,resolution_state,coalesce(rule_version,'')
            FROM field_resolutions WHERE place_id=? AND field_key=?
            """,
            (pid, field_key),
        ).fetchone()
        if selected is None or selected[0] != oid or selected[1] != "known" or selected[2] != resolver.RULE_VERSION:
            resolution_failures.append((key, selected))

        source = db.execute(
            """
            SELECT sr.provider,sr.acquisition_method,sb.binding_state,sr.provider_id
            FROM source_records sr
            JOIN source_bindings sb
              ON sb.source_record_id=sr.source_record_id AND sb.place_id=?
            WHERE sr.source_record_id=?
            """,
            (pid, srid),
        ).fetchone()
        if source is None or source[0] != "Hot Pepper" or source[1] != "retained_hotpepper_rich_metadata" or source[2] != "reviewed":
            lineage_failures.append((key, "invalid-reviewed-rich-source", source))

    expect(not duplicate_keys, f"duplicate rich-reference place/source/field keys={len(duplicate_keys)} sample={duplicate_keys[:3]}")
    expect(not value_failures, f"rich-reference value failures={len(value_failures)} sample={value_failures[:3]}")
    expect(not lineage_failures, f"rich-reference lineage failures={len(lineage_failures)} sample={lineage_failures[:3]}")
    expect(not resolution_failures, f"rich-reference resolution failures={len(resolution_failures)} sample={resolution_failures[:3]}")

    conflict_derived = db.execute(
        """
        SELECT count(*)
        FROM field_observations o
        JOIN source_bindings sb
          ON sb.place_id=o.place_id AND sb.source_record_id=o.source_record_id
        WHERE o.transformation_rule_version=? AND sb.binding_state<>'reviewed'
        """,
        (resolver.RULE_VERSION,),
    ).fetchone()[0]
    expect(conflict_derived == 0, f"rich-reference observations from non-reviewed binding={conflict_derived}")

    identity_after = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    expect(identity_after == identity_before, "validator observed an identity-state mutation")

    final_known = dict(db.execute(
        """
        SELECT field_key,count(*)
        FROM field_resolutions
        WHERE resolution_state='known'
          AND field_key IN (%s)
        GROUP BY field_key ORDER BY field_key
        """ % ",".join("?" for _ in allowed_outputs),
        tuple(sorted(allowed_outputs)),
    ))

    summary = {
        "status": "fail" if failures else "pass",
        "ruleVersion": resolver.RULE_VERSION,
        "derivedObservations": len(actual_rows),
        "derivedFieldCounts": dict(sorted(field_counts.items())),
        "finalKnownFieldCounts": final_known,
        "lineageChecked": len(actual_rows),
        "identityChanges": 0,
        "networkRequests": 0,
        "failures": failures,
    }
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    db.close()
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
