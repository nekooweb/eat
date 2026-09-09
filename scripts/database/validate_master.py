#!/usr/bin/env python3
"""Strict validator for the persistent Eat SQLite master.

The validator intentionally treats reviewed Hot Pepper rich metadata as three distinct
resolution families:
- safe practical fields resolved by resolve_master;
- fine rich fields resolved by import_hotpepper_rich_metadata;
- reviewed reference/practical fields resolved by resolve_hotpepper_rich_reference_fields.

All three families require an exact reviewed Hot Pepper base binding.  The third family
was added after the runtime field-materialisation pass so legitimate reference fields do
not get misclassified as unapproved rich resolutions.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sqlite3
from pathlib import Path

import import_hotpepper_rich_metadata as hotpepper_rich
import retained_phase2 as phase2
import resolve_hotpepper_rich_reference_fields as rich_reference
import resolve_master as resolver

BUILDER = Path(__file__).with_name("build_master.py")
NONRESOLVING_PHASE2_METHODS = (
    "retained_source_fact_overlay",
    "retained_source_provenance_link",
    "retained_dish_evidence",
)
RICH_CANONICAL_FIELDS = (
    "hours.raw",
    "closure.raw",
    "budget.lunch.range",
    "budget.dinner.range",
)
RICH_FINE_PRACTICAL_FIELDS = tuple(sorted(
    set(hotpepper_rich.AMENITY_FIELDS.values()) | {"practical.smoking_policy"}
))
RICH_FINE_FIELDS = tuple(sorted(set(RICH_CANONICAL_FIELDS) | set(RICH_FINE_PRACTICAL_FIELDS)))
RICH_REFERENCE_FIELDS = tuple(sorted({output_field for _, output_field, _ in rich_reference.FIELD_SPECS}))


def load_builder():
    spec = importlib.util.spec_from_file_location("eat_build_master", BUILDER)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def reviewed_hotpepper_base_clause(alias: str = "rich") -> str:
    return f"""
      EXISTS (
        SELECT 1
        FROM source_records base
        JOIN source_bindings bb ON bb.source_record_id=base.source_record_id
        WHERE base.provider='Hot Pepper'
          AND base.provider_id={alias}.provider_id
          AND base.acquisition_method='retained_hotpepper_artifact'
          AND bb.place_id=o.place_id
          AND bb.binding_state='reviewed'
      )
    """


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    db = sqlite3.connect(args.database)
    db.execute("PRAGMA foreign_keys=ON")
    failures: list[str] = []

    def expect(condition, message):
        if not condition:
            failures.append(message)

    expect(db.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "integrity_check failed")
    expect(list(db.execute("PRAGMA foreign_key_check")) == [], "foreign_key_check failed")

    catalog = db.execute("SELECT count(*) FROM catalog_entries").fetchone()[0]
    unique_catalog = db.execute("SELECT count(DISTINCT place_id) FROM catalog_entries").fetchone()[0]
    expect(catalog == 2804 and unique_catalog == 2804, f"catalog={catalog}, unique={unique_catalog}")
    migration_dir = Path(__file__).resolve().parents[2] / "database/migrations"
    expected_versions = sorted(int(p.name.split("_", 1)[0]) for p in migration_dir.glob("*.sql"))
    expect(
        [r[0] for r in db.execute("SELECT version FROM schema_migrations ORDER BY version")] == expected_versions,
        "schema migration version mismatch",
    )

    legacy_records = db.execute(
        "SELECT count(*) FROM source_records WHERE acquisition_method='retained_legacy_canonical_snapshot'"
    ).fetchone()[0]
    exceptions = db.execute(
        "SELECT count(*) FROM retained_exceptions WHERE exception_type='legacy_core_outside_frozen_catalog'"
    ).fetchone()[0]
    expect(legacy_records == 651, f"legacy canonical records={legacy_records}")
    expect(exceptions == 3, f"retained exceptions={exceptions}")

    collision_rows = list(db.execute("""
      SELECT sr.provider,sr.provider_id,count(DISTINCT sb.place_id),
             sum(CASE WHEN sb.binding_state <> 'conflict' THEN 1 ELSE 0 END)
      FROM source_records sr
      JOIN source_bindings sb ON sb.source_record_id=sr.source_record_id
      GROUP BY sr.provider,sr.provider_id
      HAVING count(DISTINCT sb.place_id) > 1
      ORDER BY sr.provider,sr.provider_id
    """))
    expect(len(collision_rows) >= 5, f"collision groups unexpectedly low={len(collision_rows)}")
    expect(
        all(row[3] == 0 for row in collision_rows),
        f"colliding keys have non-conflict bindings={[row for row in collision_rows if row[3] != 0]}",
    )
    collision_places = db.execute("""
      WITH keys AS (
        SELECT sr.provider,sr.provider_id
        FROM source_records sr JOIN source_bindings sb ON sb.source_record_id=sr.source_record_id
        GROUP BY sr.provider,sr.provider_id HAVING count(DISTINCT sb.place_id)>1
      )
      SELECT count(DISTINCT sb.place_id)
      FROM keys k
      JOIN source_records sr ON sr.provider=k.provider AND sr.provider_id=k.provider_id
      JOIN source_bindings sb ON sb.source_record_id=sr.source_record_id
    """).fetchone()[0]
    conflict_binding_places = db.execute(
        "SELECT count(DISTINCT place_id) FROM source_bindings WHERE binding_state='conflict'"
    ).fetchone()[0]
    expect(
        collision_places == conflict_binding_places,
        f"collision places={collision_places}, conflict binding places={conflict_binding_places}",
    )
    selected_from_conflict = db.execute("""
      SELECT count(*)
      FROM field_resolutions r
      JOIN field_observations o ON o.observation_id=r.observation_id
      JOIN source_bindings b ON b.place_id=o.place_id AND b.source_record_id=o.source_record_id
      WHERE r.resolution_state='known' AND b.binding_state='conflict'
    """).fetchone()[0]
    expect(selected_from_conflict == 0, f"known resolutions selected from conflict bindings={selected_from_conflict}")

    hp_records = db.execute(
        "SELECT count(*) FROM source_records WHERE acquisition_method='retained_hotpepper_artifact'"
    ).fetchone()[0]
    hp_hours = db.execute("""
      SELECT count(*) FROM field_observations o JOIN source_records sr ON sr.source_record_id=o.source_record_id
      WHERE sr.acquisition_method='retained_hotpepper_artifact' AND o.field_key='hours.raw' AND o.value_json IS NOT NULL
    """).fetchone()[0]
    hp_closure = db.execute("""
      SELECT count(*) FROM field_observations o JOIN source_records sr ON sr.source_record_id=o.source_record_id
      WHERE sr.acquisition_method='retained_hotpepper_artifact' AND o.field_key='closure.raw' AND o.value_json IS NOT NULL
    """).fetchone()[0]
    expect(
        hp_records == 535 and hp_hours == 535 and hp_closure == 535,
        f"Hot Pepper records/hours/closures={hp_records}/{hp_hours}/{hp_closure}",
    )

    builder = load_builder()
    open_budget = builder.parse_budget_range("5000円以上")
    expect(
        open_budget is not None and open_budget["lower"] == 5000 and open_budget["upper"] is None,
        f"open budget parse={open_budget}",
    )
    normalized_budgets = list(db.execute("""
      SELECT o.value_json FROM field_observations o JOIN source_records sr ON sr.source_record_id=o.source_record_id
      WHERE sr.acquisition_method='retained_hotpepper_artifact' AND o.field_key='budget.dinner.range' AND o.value_json IS NOT NULL
    """))
    malformed_budget = 0
    for (raw,) in normalized_budgets:
        value = json.loads(raw)
        if value.get("upper") is not None and value.get("upper") < value.get("lower", 0):
            malformed_budget += 1
    expect(malformed_budget == 0, f"malformed normalized budgets={malformed_budget}")

    inputs = phase2.load_inputs()
    expected_source_facts = sum(len(row.get("sourceFacts", [])) for row in inputs["source_facts"].get("rows", []))
    expected_provenance = sum(len(row.get("sourceLinks", [])) for row in inputs["source_provenance"].get("rows", []))
    expected_rich = len(inputs["hotpepper_rich"].get("rows", []))
    expected_dish_items = sum(
        len(row.get("recommendedDishes", []) or []) + len(row.get("featuredDishes", []) or [])
        for row in inputs["detail_evidence"].get("rows", [])
    )
    acquisition_counts = dict(db.execute("SELECT acquisition_method,count(*) FROM source_records GROUP BY acquisition_method"))
    expect(
        acquisition_counts.get("retained_source_fact_overlay", 0) == expected_source_facts,
        f"source facts={acquisition_counts.get('retained_source_fact_overlay',0)}, expected={expected_source_facts}",
    )
    expect(
        acquisition_counts.get("retained_source_provenance_link", 0) == expected_provenance,
        f"provenance={acquisition_counts.get('retained_source_provenance_link',0)}, expected={expected_provenance}",
    )
    expect(
        acquisition_counts.get("retained_hotpepper_rich_metadata", 0) == expected_rich,
        f"rich={acquisition_counts.get('retained_hotpepper_rich_metadata',0)}, expected={expected_rich}",
    )
    expect(
        acquisition_counts.get("retained_dish_evidence", 0) == expected_dish_items,
        f"dish evidence={acquisition_counts.get('retained_dish_evidence',0)}, expected={expected_dish_items}",
    )

    placeholders = ",".join("?" for _ in resolver.SAFE_HOTPEPPER_PRACTICAL_FIELDS)
    expected_practical = db.execute(
        f"""SELECT count(*) FROM (
          SELECT DISTINCT o.place_id,o.field_key
          FROM field_observations o
          JOIN source_records sr ON sr.source_record_id=o.source_record_id
          JOIN source_bindings sb ON sb.place_id=o.place_id AND sb.source_record_id=o.source_record_id
          WHERE sr.acquisition_method='retained_hotpepper_rich_metadata'
            AND sb.binding_state='reviewed' AND o.field_state='known'
            AND o.field_key IN ({placeholders})
        )""",
        resolver.SAFE_HOTPEPPER_PRACTICAL_FIELDS,
    ).fetchone()[0]
    actual_practical = db.execute(
        "SELECT count(*) FROM field_resolutions WHERE rule_version=?",
        (resolver.RULE_VERSION,),
    ).fetchone()[0]
    expect(actual_practical == expected_practical, f"safe practical resolutions={actual_practical}, expected={expected_practical}")

    unexpected_nonresolving = db.execute(
        f"""SELECT count(*)
        FROM field_resolutions r
        JOIN field_observations o ON o.observation_id=r.observation_id
        JOIN source_records sr ON sr.source_record_id=o.source_record_id
        WHERE sr.acquisition_method IN ({','.join('?' for _ in NONRESOLVING_PHASE2_METHODS)})""",
        NONRESOLVING_PHASE2_METHODS,
    ).fetchone()[0]
    expect(unexpected_nonresolving == 0, f"non-resolving Phase-2 evidence selected={unexpected_nonresolving}")

    fine_placeholders = ",".join("?" for _ in RICH_FINE_FIELDS)
    reference_placeholders = ",".join("?" for _ in RICH_REFERENCE_FIELDS)
    unexpected_rich = db.execute(
        f"""SELECT count(*)
        FROM field_resolutions r
        JOIN field_observations o ON o.observation_id=r.observation_id
        JOIN source_records sr ON sr.source_record_id=o.source_record_id
        WHERE sr.acquisition_method='retained_hotpepper_rich_metadata'
          AND NOT (
            (r.rule_version=? AND o.field_key IN ({placeholders}))
            OR (r.rule_version=? AND o.field_key IN ({fine_placeholders}))
            OR (r.rule_version=? AND o.field_key IN ({reference_placeholders}))
          )""",
        (
            resolver.RULE_VERSION,
            *resolver.SAFE_HOTPEPPER_PRACTICAL_FIELDS,
            hotpepper_rich.RULE_VERSION,
            *RICH_FINE_FIELDS,
            rich_reference.RULE_VERSION,
            *RICH_REFERENCE_FIELDS,
        ),
    ).fetchone()[0]
    expect(unexpected_rich == 0, f"unapproved rich resolution selected={unexpected_rich}")

    fine_rich_resolutions = db.execute("""
        SELECT count(*)
        FROM field_resolutions r
        JOIN field_observations o ON o.observation_id=r.observation_id
        JOIN source_records sr ON sr.source_record_id=o.source_record_id
        WHERE sr.acquisition_method='retained_hotpepper_rich_metadata'
          AND r.rule_version=?
        """, (hotpepper_rich.RULE_VERSION,)).fetchone()[0]
    reference_rich_resolutions = db.execute("""
        SELECT count(*)
        FROM field_resolutions r
        JOIN field_observations o ON o.observation_id=r.observation_id
        JOIN source_records sr ON sr.source_record_id=o.source_record_id
        WHERE sr.acquisition_method='retained_hotpepper_rich_metadata'
          AND r.rule_version=?
        """, (rich_reference.RULE_VERSION,)).fetchone()[0]

    fine_without_reviewed_base = db.execute(
        f"""SELECT count(*)
        FROM field_resolutions r
        JOIN field_observations o ON o.observation_id=r.observation_id
        JOIN source_records rich ON rich.source_record_id=o.source_record_id
        WHERE rich.acquisition_method='retained_hotpepper_rich_metadata'
          AND r.rule_version=?
          AND NOT ({reviewed_hotpepper_base_clause('rich')})""",
        (hotpepper_rich.RULE_VERSION,),
    ).fetchone()[0]
    reference_without_reviewed_base = db.execute(
        f"""SELECT count(*)
        FROM field_resolutions r
        JOIN field_observations o ON o.observation_id=r.observation_id
        JOIN source_records rich ON rich.source_record_id=o.source_record_id
        WHERE rich.acquisition_method='retained_hotpepper_rich_metadata'
          AND r.rule_version=?
          AND NOT ({reviewed_hotpepper_base_clause('rich')})""",
        (rich_reference.RULE_VERSION,),
    ).fetchone()[0]
    expect(fine_without_reviewed_base == 0, f"fine rich resolutions without reviewed base binding={fine_without_reviewed_base}")
    expect(reference_without_reviewed_base == 0, f"reference rich resolutions without reviewed base binding={reference_without_reviewed_base}")

    rich_budget_rows = list(db.execute("""
        SELECT o.value_json
        FROM field_resolutions r
        JOIN field_observations o ON o.observation_id=r.observation_id
        JOIN source_records sr ON sr.source_record_id=o.source_record_id
        WHERE sr.acquisition_method='retained_hotpepper_rich_metadata'
          AND r.rule_version=?
          AND o.field_key IN ('budget.lunch.range','budget.dinner.range')
        """, (hotpepper_rich.RULE_VERSION,)))
    malformed_rich_budget = 0
    for (raw,) in rich_budget_rows:
        try:
            value = json.loads(raw)
            if (
                value.get("currency") != "JPY"
                or not isinstance(value.get("lower"), int)
                or not isinstance(value.get("upper"), int)
                or value["upper"] < value["lower"]
                or value.get("evidenceType") != "explicit_labeled_hotpepper_average_range"
            ):
                malformed_rich_budget += 1
        except Exception:
            malformed_rich_budget += 1
    expect(malformed_rich_budget == 0, f"malformed rich budgets={malformed_rich_budget}")

    named = db.execute(
        "SELECT count(*) FROM field_resolutions WHERE field_key='name' AND resolution_state='known'"
    ).fetchone()[0]
    states = dict(db.execute("SELECT identity_state,count(*) FROM catalog_entries GROUP BY identity_state"))
    verified = states.get("verified", 0)
    source_matched = states.get("source_matched", 0)
    expect(verified == 651, f"verified={verified}")
    expect(named == verified + source_matched, f"resolved names={named}, verified+source_matched={verified + source_matched}")
    expect(sum(states.values()) == 2804, f"identity states do not reconcile={states}")

    successful_runs = db.execute("SELECT count(*) FROM ingestion_runs WHERE status='succeeded'").fetchone()[0]
    expect(successful_runs >= 1, f"successful ingestion runs={successful_runs}")

    summary = {
        "status": "fail" if failures else "pass",
        "catalog": catalog,
        "identityStates": states,
        "resolvedNames": named,
        "collisionGroups": len(collision_rows),
        "collisionPlaces": collision_places,
        "hotPepperRecords": hp_records,
        "hoursRaw": hp_hours,
        "closuresRaw": hp_closure,
        "normalizedBudgetObservations": len(normalized_budgets),
        "phase2SourceFacts": acquisition_counts.get("retained_source_fact_overlay", 0),
        "phase2ProvenanceLinks": acquisition_counts.get("retained_source_provenance_link", 0),
        "phase2HotPepperRich": acquisition_counts.get("retained_hotpepper_rich_metadata", 0),
        "phase2DishEvidenceItems": acquisition_counts.get("retained_dish_evidence", 0),
        "safePracticalResolutions": actual_practical,
        "fineRichResolutions": fine_rich_resolutions,
        "richReferenceResolutions": reference_rich_resolutions,
        "fineRichBudgetResolutions": len(rich_budget_rows),
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
