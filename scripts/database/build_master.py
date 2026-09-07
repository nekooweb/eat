#!/usr/bin/env python3
"""Persistent Eat master-database entrypoint."""
from __future__ import annotations

import argparse
import os
import uuid
from collections import defaultdict
from pathlib import Path

import master_import_core as core
import retained_phase2 as phase2
import resolve_master as resolver

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
PARSER_VERSION = core.PARSER_VERSION
parse_budget_range = core.parse_budget_range

_ORIGINAL_RESOLVE = core.resolve


def _resolve_preserving_known_on_conflict(db, place_id, field_key, observation_id, state, provider, stamp):
    if state == "conflict":
        current = db.execute(
            "SELECT resolution_state FROM field_resolutions WHERE place_id=? AND field_key=?",
            (place_id, field_key),
        ).fetchone()
        if current is not None and current[0] == "known":
            return
    return _ORIGINAL_RESOLVE(db, place_id, field_key, observation_id, state, provider, stamp)


core.resolve = _resolve_preserving_known_on_conflict


def retained_conflict_index(basics, hotpepper, phase2_inputs):
    basic_places = defaultdict(set)
    all_places = defaultdict(set)

    for row in basics.get("rows", []):
        key = f"{row['provider']}|{row['providerId']}"
        pid = row["googlePlaceId"]
        basic_places[key].add(pid)
        all_places[key].add(pid)

    for row in hotpepper.get("rows", []):
        key = f"Hot Pepper|{row['hotpepperId']}"
        all_places[key].add(row["googlePlaceId"])

    for key, pid in phase2.native_identity_rows(phase2_inputs):
        all_places[key].add(pid)

    basic_conflicts = {key for key, places in basic_places.items() if len(places) > 1}
    all_conflicts = {key for key, places in all_places.items() if len(places) > 1}
    if len(basic_conflicts) != 5:
        raise RuntimeError(
            f"retained basic collision baseline changed: expected 5 groups, found {len(basic_conflicts)}"
        )
    if not basic_conflicts.issubset(all_conflicts):
        raise RuntimeError("cross-layer collision index lost a known basic collision")
    return basic_conflicts, all_conflicts, all_places


def build(output: Path, reset: bool = False):
    if reset and output.exists():
        output.unlink()
    if reset:
        for suffix in ("-wal", "-shm"):
            sidecar = Path(str(output) + suffix)
            if sidecar.exists():
                sidecar.unlink()

    inventory = core.read_json(DATA / "area1_google_ids.json")
    basics = core.read_json(DATA / "google_basic_source_matches.json")
    hotpepper = core.read_json(DATA / "hotpepper_catalog_facts.json")
    production = core.read_production()
    phase2_inputs = phase2.load_inputs()
    ids = inventory.get("googlePlaceIds") or []
    id_set = set(ids)
    if len(ids) != 2804 or len(id_set) != 2804 or inventory.get("count") != 2804:
        raise RuntimeError("frozen catalog must contain exactly 2,804 unique Place IDs")

    basic_conflicts, conflict_keys, all_places = retained_conflict_index(
        basics, hotpepper, phase2_inputs
    )
    conflict_place_ids = set().union(*(all_places[key] for key in conflict_keys)) if conflict_keys else set()

    stamp = core.now_iso()
    source_commit = os.environ.get("GITHUB_SHA") or "repository-working-tree"
    run_id = uuid.uuid4().hex
    db = core.connect(output)
    try:
        core.apply_migrations(db)
        db.execute("BEGIN IMMEDIATE")
        db.execute(
            "INSERT INTO ingestion_runs(run_id,started_at,source_commit,parser_version,status) VALUES(?,?,?,?,?)",
            (run_id, stamp, source_commit, PARSER_VERSION, "running"),
        )
        snapshot = core.canonical_json({
            "checkedAt": inventory.get("checkedAt"),
            "method": inventory.get("method"),
            "count": inventory.get("count"),
        })
        for pid in ids:
            core.upsert_catalog(
                db,
                pid,
                inventory.get("scope") or "TOKYO/地区1️⃣",
                snapshot,
                "id_only",
                stamp,
            )

        legacy_counts = core.import_legacy_canonical(db, production, id_set, stamp)
        basic_counts = core.import_basic(db, basics, conflict_keys, stamp)
        hp_counts = core.import_hotpepper(db, hotpepper, conflict_keys, stamp)
        phase2_counts = phase2.import_all(db, phase2_inputs, conflict_keys, stamp)
        practical_counts = resolver.resolve_safe_practical(db, stamp)

        summary = {
            "catalog": db.execute("SELECT count(*) FROM catalog_entries").fetchone()[0],
            "identityStates": dict(db.execute("SELECT identity_state,count(*) FROM catalog_entries GROUP BY identity_state")),
            "sourceRecords": db.execute("SELECT count(*) FROM source_records").fetchone()[0],
            "sourceBindings": db.execute("SELECT count(*) FROM source_bindings").fetchone()[0],
            "observations": db.execute("SELECT count(*) FROM field_observations").fetchone()[0],
            "resolutions": db.execute("SELECT count(*) FROM field_resolutions").fetchone()[0],
            "legacyCanonical": dict(legacy_counts),
            "basicBindings": dict(basic_counts),
            "hotPepperBindings": dict(hp_counts),
            "phase2": phase2_counts,
            "safePracticalResolver": practical_counts,
            "basicConflictSourceKeys": len(basic_conflicts),
            "allRetainedConflictSourceKeys": len(conflict_keys),
            "allRetainedConflictPlaces": len(conflict_place_ids),
            "hoursRawObserved": db.execute("SELECT count(*) FROM field_observations WHERE field_key='hours.raw' AND value_json IS NOT NULL").fetchone()[0],
            "closuresRawObserved": db.execute("SELECT count(*) FROM field_observations WHERE field_key='closure.raw' AND value_json IS NOT NULL").fetchone()[0],
            "budgetRangesKnown": db.execute("SELECT count(*) FROM field_resolutions WHERE field_key='budget.dinner.range' AND resolution_state='known'").fetchone()[0],
            "exceptions": db.execute("SELECT count(*) FROM retained_exceptions").fetchone()[0],
        }
        db.execute(
            "UPDATE ingestion_runs SET completed_at=?,status='succeeded',summary_json=? WHERE run_id=?",
            (core.now_iso(), core.canonical_json(summary), run_id),
        )
        db.commit()
        return summary
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "_local" / "eat-main.sqlite")
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args()
    summary = build(args.output, reset=args.reset)
    print(core.canonical_json({"status": "pass", "database": str(args.output), **summary}))


if __name__ == "__main__":
    main()
