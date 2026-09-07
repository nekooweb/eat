#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import uuid
from collections import defaultdict
from pathlib import Path

import derive_hotpepper_practical as derived
import master_import_core as core
import plan_ingestion_tasks as planner
import retained_official_identity as official_identity
import retained_osm_identity as osm_identity
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


def _import_hotpepper_preserving_normalized_cuisine(db, doc, conflict_keys, stamp):
    original = core.add_field

    def guarded(
        db_, place_id, source_record_id, field_key, value, binding_state,
        provider, observed_at, stamp_, *, resolve_field=True
    ):
        if field_key == "cuisine":
            return None
        return original(
            db_, place_id, source_record_id, field_key, value, binding_state,
            provider, observed_at, stamp_, resolve_field=resolve_field,
        )

    core.add_field = guarded
    try:
        return core.import_hotpepper(db, doc, conflict_keys, stamp)
    finally:
        core.add_field = original


def retained_conflict_index(basics, hotpepper, phase2_inputs, extra_identity_rows=()):
    basic = defaultdict(set)
    all_sources = defaultdict(set)
    for row in basics.get("rows", []):
        key = f"{row['provider']}|{row['providerId']}"
        pid = row["googlePlaceId"]
        basic[key].add(pid)
        all_sources[key].add(pid)
    for row in hotpepper.get("rows", []):
        all_sources[f"Hot Pepper|{row['hotpepperId']}"].add(row["googlePlaceId"])
    for key, pid in phase2.native_identity_rows(phase2_inputs):
        all_sources[key].add(pid)
    for key, pid in extra_identity_rows:
        all_sources[key].add(pid)

    basic_conflicts = {key for key, values in basic.items() if len(values) > 1}
    all_conflicts = {key for key, values in all_sources.items() if len(values) > 1}
    if len(basic_conflicts) != 5:
        raise RuntimeError(
            f"retained basic collision baseline changed: expected 5 groups, found {len(basic_conflicts)}"
        )
    if not basic_conflicts.issubset(all_conflicts):
        raise RuntimeError("cross-layer collision index lost a known basic collision")
    return basic_conflicts, all_conflicts, all_sources


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

    # Historical verified OSM source IDs are native provider identity keys. Include
    # them in collision discovery before any binding import so an old reviewed basic
    # binding cannot survive if retained QC proves the same OSM object was attached
    # to more than one Place ID.
    osm_native_rows = osm_identity.native_identity_rows(id_set)
    basic_conflicts, conflict_keys, all_sources = retained_conflict_index(
        basics, hotpepper, phase2_inputs, osm_native_rows
    )
    conflict_places = (
        set().union(*(all_sources[key] for key in conflict_keys)) if conflict_keys else set()
    )

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

        legacy = core.import_legacy_canonical(db, production, id_set, stamp)
        basic = core.import_basic(db, basics, conflict_keys, stamp)
        hotpepper_counts = _import_hotpepper_preserving_normalized_cuisine(
            db, hotpepper, conflict_keys, stamp
        )
        phase = phase2.import_all(db, phase2_inputs, conflict_keys, stamp)

        official_counts = official_identity.import_index(db, id_set, conflict_places, stamp)
        osm_counts = osm_identity.import_verified_osm(
            db, id_set, conflict_keys, conflict_places, stamp
        )

        derived_counts = derived.resolve_hotpepper_basic_practical(db, stamp)
        rich = resolver.resolve_safe_practical(db, stamp)
        taskplan = planner.plan_tasks(db, stamp)

        summary = {
            "catalog": db.execute("SELECT count(*) FROM catalog_entries").fetchone()[0],
            "identityStates": dict(db.execute(
                "SELECT identity_state,count(*) FROM catalog_entries GROUP BY identity_state"
            )),
            "sourceRecords": db.execute("SELECT count(*) FROM source_records").fetchone()[0],
            "sourceBindings": db.execute("SELECT count(*) FROM source_bindings").fetchone()[0],
            "observations": db.execute("SELECT count(*) FROM field_observations").fetchone()[0],
            "resolutions": db.execute("SELECT count(*) FROM field_resolutions").fetchone()[0],
            "legacyCanonical": dict(legacy),
            "basicBindings": dict(basic),
            "hotPepperBindings": dict(hotpepper_counts),
            "phase2": phase,
            "officialIdentityRecovery": official_counts,
            "osmIdentityRecovery": osm_counts,
            "hotPepperBasicPractical": derived_counts,
            "safePracticalResolver": rich,
            "ingestionPlan": taskplan,
            "basicConflictSourceKeys": len(basic_conflicts),
            "allRetainedConflictSourceKeys": len(conflict_keys),
            "allRetainedConflictPlaces": len(conflict_places),
            "hoursRawObserved": db.execute(
                "SELECT count(*) FROM field_observations WHERE field_key='hours.raw' AND value_json IS NOT NULL"
            ).fetchone()[0],
            "closuresRawObserved": db.execute(
                "SELECT count(*) FROM field_observations WHERE field_key='closure.raw' AND value_json IS NOT NULL"
            ).fetchone()[0],
            "budgetRangesKnown": db.execute(
                "SELECT count(*) FROM field_resolutions WHERE field_key='budget.dinner.range' AND resolution_state='known'"
            ).fetchone()[0],
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
    summary = build(args.output, args.reset)
    print(core.canonical_json({"status": "pass", "database": str(args.output), **summary}))


if __name__ == "__main__":
    main()
