#!/usr/bin/env python3
"""Validate a persistent Eat master SQLite database produced from retained inputs."""
from __future__ import annotations

import argparse
import importlib.util
import json
import sqlite3
from pathlib import Path

BUILDER = Path(__file__).with_name("build_master.py")


def load_builder():
    spec = importlib.util.spec_from_file_location("eat_build_master", BUILDER)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


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

    integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
    foreign = list(db.execute("PRAGMA foreign_key_check"))
    expect(integrity == "ok", f"integrity_check={integrity}")
    expect(not foreign, f"foreign_key_check={foreign[:5]}")

    catalog = db.execute("SELECT count(*) FROM catalog_entries").fetchone()[0]
    unique_catalog = db.execute("SELECT count(DISTINCT place_id) FROM catalog_entries").fetchone()[0]
    expect(catalog == 2804 and unique_catalog == 2804, f"catalog={catalog}, unique={unique_catalog}")

    migration_versions = [row[0] for row in db.execute("SELECT version FROM schema_migrations ORDER BY version")]
    expect(migration_versions == [1], f"schema migrations={migration_versions}")

    legacy_records = db.execute(
        "SELECT count(*) FROM source_records WHERE acquisition_method='retained_legacy_canonical_snapshot'"
    ).fetchone()[0]
    exceptions = db.execute(
        "SELECT count(*) FROM retained_exceptions WHERE exception_type='legacy_core_outside_frozen_catalog'"
    ).fetchone()[0]
    expect(legacy_records == 651, f"legacy canonical in-catalog records={legacy_records}")
    expect(exceptions == 3, f"legacy outside-catalog exceptions={exceptions}")

    collision_rows = list(db.execute("""
      SELECT sr.provider,sr.provider_id,count(DISTINCT sb.place_id) AS places,
             sum(CASE WHEN sb.binding_state <> 'conflict' THEN 1 ELSE 0 END) AS non_conflict_bindings
      FROM source_records sr
      JOIN source_bindings sb ON sb.source_record_id=sr.source_record_id
      GROUP BY sr.provider,sr.provider_id
      HAVING count(DISTINCT sb.place_id) > 1
      ORDER BY sr.provider,sr.provider_id
    """))
    expect(len(collision_rows) >= 5, f"provider ID collision groups unexpectedly low={len(collision_rows)}")
    expect(all(row[3] == 0 for row in collision_rows), f"collision keys with non-conflict bindings={[row for row in collision_rows if row[3] != 0]}")

    collision_place_count = db.execute("""
      WITH collision_keys AS (
        SELECT sr.provider,sr.provider_id
        FROM source_records sr
        JOIN source_bindings sb ON sb.source_record_id=sr.source_record_id
        GROUP BY sr.provider,sr.provider_id
        HAVING count(DISTINCT sb.place_id) > 1
      )
      SELECT count(DISTINCT sb.place_id)
      FROM collision_keys ck
      JOIN source_records sr ON sr.provider=ck.provider AND sr.provider_id=ck.provider_id
      JOIN source_bindings sb ON sb.source_record_id=sr.source_record_id
    """).fetchone()[0]
    conflict_binding_places = db.execute(
        "SELECT count(DISTINCT place_id) FROM source_bindings WHERE binding_state='conflict'"
    ).fetchone()[0]
    expect(
        conflict_binding_places == collision_place_count,
        f"conflict binding places={conflict_binding_places}, collision-derived places={collision_place_count}",
    )

    selected_from_conflict = db.execute("""
      SELECT count(*)
      FROM field_resolutions r
      JOIN field_observations o ON o.observation_id=r.observation_id
      JOIN source_bindings b
        ON b.place_id=o.place_id AND b.source_record_id=o.source_record_id
      WHERE r.resolution_state='known' AND b.binding_state='conflict'
    """).fetchone()[0]
    expect(selected_from_conflict == 0, f"known resolutions selected from conflict bindings={selected_from_conflict}")

    hp_records = db.execute(
        "SELECT count(*) FROM source_records WHERE acquisition_method='retained_hotpepper_artifact'"
    ).fetchone()[0]
    expect(hp_records == 535, f"retained Hot Pepper records={hp_records}")
    hp_hours = db.execute(
        "SELECT count(*) FROM field_observations WHERE field_key='hours.raw' AND value_json IS NOT NULL"
    ).fetchone()[0]
    hp_closure = db.execute(
        "SELECT count(*) FROM field_observations WHERE field_key='closure.raw' AND value_json IS NOT NULL"
    ).fetchone()[0]
    expect(hp_hours == 535, f"Hot Pepper hours observations={hp_hours}")
    expect(hp_closure == 535, f"Hot Pepper closure observations={hp_closure}")

    builder = load_builder()
    sample = builder.parse_budget_range("5000円以上")
    expect(sample is not None and sample["lower"] == 5000 and sample["upper"] is None, f"open budget parse={sample}")
    ranges = list(db.execute(
        "SELECT value_json FROM field_observations WHERE field_key='budget.dinner.range' AND value_json IS NOT NULL"
    ))
    malformed = 0
    for (raw,) in ranges:
        value = json.loads(raw)
        if value.get("upper") is not None and value.get("upper") < value.get("lower", 0):
            malformed += 1
    expect(malformed == 0, f"malformed normalized budget ranges={malformed}")

    named = db.execute(
        "SELECT count(*) FROM field_resolutions WHERE field_key='name' AND resolution_state='known'"
    ).fetchone()[0]
    verified = db.execute(
        "SELECT count(*) FROM catalog_entries WHERE identity_state='verified'"
    ).fetchone()[0]
    source_matched = db.execute(
        "SELECT count(*) FROM catalog_entries WHERE identity_state='source_matched'"
    ).fetchone()[0]
    id_only = db.execute(
        "SELECT count(*) FROM catalog_entries WHERE identity_state='id_only'"
    ).fetchone()[0]
    conflict_state = db.execute(
        "SELECT count(*) FROM catalog_entries WHERE identity_state='conflict'"
    ).fetchone()[0]
    expect(verified == 651, f"verified legacy catalog entries={verified}")
    expect(named >= 1401, f"too few resolved named catalog entries={named}")
    expect(named == verified + source_matched, f"resolved names={named}, verified+source_matched={verified + source_matched}")
    expect(verified + source_matched + id_only + conflict_state == 2804, "identity-state totals do not reconcile")

    successful_runs = db.execute("SELECT count(*) FROM ingestion_runs WHERE status='succeeded'").fetchone()[0]
    expect(successful_runs >= 1, f"successful ingestion runs={successful_runs}")

    summary = {
        "status": "fail" if failures else "pass",
        "catalog": catalog,
        "verified": verified,
        "sourceMatched": source_matched,
        "conflictState": conflict_state,
        "idOnly": id_only,
        "resolvedNames": named,
        "legacyCanonicalRecords": legacy_records,
        "retainedExceptions": exceptions,
        "collisionGroups": len(collision_rows),
        "collisionPlaces": collision_place_count,
        "conflictBindingPlaces": conflict_binding_places,
        "hotPepperRecords": hp_records,
        "hoursRaw": hp_hours,
        "closuresRaw": hp_closure,
        "normalizedBudgetObservations": len(ranges),
        "sourceRecords": db.execute("SELECT count(*) FROM source_records").fetchone()[0],
        "sourceBindings": db.execute("SELECT count(*) FROM source_bindings").fetchone()[0],
        "fieldObservations": db.execute("SELECT count(*) FROM field_observations").fetchone()[0],
        "fieldResolutions": db.execute("SELECT count(*) FROM field_resolutions").fetchone()[0],
        "successfulRuns": successful_runs,
        "failures": failures,
    }
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    db.close()
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
