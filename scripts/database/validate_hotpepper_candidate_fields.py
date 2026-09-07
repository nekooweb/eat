#!/usr/bin/env python3
"""Strict validation for Hot Pepper candidate field-only review."""
from __future__ import annotations

import argparse
import json
import sqlite3
from collections import Counter
from pathlib import Path

import derive_hotpepper_practical as practical
import review_hotpepper_candidate_fields as review

DIRECT_TARGETS = {"address", "hours.raw", "budget.dinner.range", "closure.raw"}
PRACTICAL_TARGETS = {target for target, _mode in practical.RULES.values()}
ALLOWED_TARGETS = DIRECT_TARGETS | PRACTICAL_TARGETS


def selected_value(db, pid, field_key):
    row = db.execute(
        """SELECT o.value_json FROM field_resolutions r
           JOIN field_observations o ON o.observation_id=r.observation_id
           WHERE r.place_id=? AND r.field_key=? AND r.resolution_state='known'""",
        (pid, field_key),
    ).fetchone()
    return json.loads(row[0]) if row and row[0] is not None else None


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

    try:
        conflicts = {
            row[0] for row in db.execute(
                "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
            )
        }
        records = list(db.execute(
            """SELECT sr.source_record_id,sr.provider_id,sr.source_url,sr.payload_json,
                      sb.place_id,sb.binding_state,sb.binding_method,sb.confidence,ce.identity_state
               FROM source_records sr
               JOIN source_bindings sb ON sb.source_record_id=sr.source_record_id
               JOIN catalog_entries ce ON ce.place_id=sb.place_id
               WHERE sr.acquisition_method=?""",
            (review.ACQUISITION_METHOD,),
        ))
        field_counts = Counter()
        places = set()

        for (
            derived_source_id,
            provider_id,
            source_url,
            payload_json,
            pid,
            binding_state,
            binding_method,
            confidence,
            identity_state,
        ) in records:
            payload = json.loads(payload_json)
            field_key = payload.get("fieldKey")
            source_oid = payload.get("sourceObservationId")
            source_record_id = payload.get("sourceRecordId")
            value = payload.get("value")

            expect(field_key in ALLOWED_TARGETS, f"candidate resolver field not allowed: {provider_id}/{field_key}")
            expect(binding_state == "reviewed", f"candidate derived binding not reviewed: {provider_id}/{binding_state}")
            expect(binding_method == review.BINDING_METHOD, f"candidate derived binding method mismatch: {provider_id}")
            expect(confidence == "field_only_not_identity", f"candidate derived confidence mismatch: {provider_id}/{confidence}")
            expect(identity_state in ("verified", "source_matched"), f"candidate resolver used non-publishable identity: {pid}/{identity_state}")
            expect(pid not in conflicts, f"candidate resolver selected field on conflict Place ID: {pid}")
            expect(isinstance(source_url, str) and source_url.startswith("https://www.hotpepper.jp/"), f"candidate resolver URL invalid: {provider_id}/{source_url}")
            expect(payload.get("selectionPolicy") == "missing_only_field_only_no_identity_change", f"selection policy mismatch: {provider_id}")
            expect(payload.get("ruleVersion") == review.RULE_VERSION, f"candidate resolver rule mismatch: {provider_id}")

            source = db.execute(
                """SELECT o.place_id,o.field_key,o.value_json,o.source_record_id,
                          sr.acquisition_method,sr.payload_json,sr.source_url,sb.binding_state
                   FROM field_observations o
                   JOIN source_records sr ON sr.source_record_id=o.source_record_id
                   JOIN source_bindings sb ON sb.place_id=o.place_id AND sb.source_record_id=o.source_record_id
                   WHERE o.observation_id=?""",
                (source_oid,),
            ).fetchone()
            expect(source is not None, f"candidate source observation missing: {provider_id}")
            if source is None:
                continue
            source_pid, source_field, source_value_json, actual_source_record, acquisition, source_payload_json, original_url, original_binding = source
            expect(source_pid == pid, f"candidate source Place ID mismatch: {provider_id}")
            expect(actual_source_record == source_record_id, f"candidate source record reference mismatch: {provider_id}")
            expect(acquisition == "retained_hotpepper_artifact", f"candidate source acquisition mismatch: {provider_id}/{acquisition}")
            expect(original_binding == "candidate", f"original Hot Pepper candidate binding was promoted: {provider_id}/{original_binding}")
            expect(isinstance(original_url, str) and original_url.startswith("https://www.hotpepper.jp/"), f"original Hot Pepper URL invalid: {provider_id}")

            original_payload = json.loads(source_payload_json)
            facts = original_payload.get("facts") or {}
            current_name = selected_value(db, pid, "name")
            current_address = selected_value(db, pid, "address")
            current_coords = selected_value(db, pid, "coordinates")
            recomputed = review.identity_check(current_name, current_address, current_coords, facts)
            expect(recomputed.get("accepted") is True, f"candidate identity consistency no longer passes: {provider_id}")
            stored_check = payload.get("identityConsistencyCheck") or {}
            expect(stored_check.get("accepted") is True, f"stored identity check is not accepted: {provider_id}")
            expect(stored_check.get("rule") == recomputed.get("rule"), f"candidate identity rule changed: {provider_id}")
            expect(abs(float(stored_check.get("nameSimilarity", 0)) - float(recomputed.get("nameSimilarity", 0))) < 1e-6, f"candidate name similarity changed: {provider_id}")

            source_value = json.loads(source_value_json) if source_value_json is not None else None
            if field_key in DIRECT_TARGETS:
                expect(source_field == field_key, f"direct candidate source field mismatch: {provider_id}/{source_field}/{field_key}")
                expect(source_value == value, f"direct candidate value changed: {provider_id}/{field_key}")
            else:
                rule = practical.RULES.get(source_field)
                expect(rule is not None and rule[0] == field_key, f"practical candidate source field mismatch: {provider_id}/{source_field}/{field_key}")
                if rule is not None:
                    normalized = practical.parse_boolean(source_value, rule[1])
                    expect(normalized == value, f"practical candidate boolean changed: {provider_id}/{field_key}")

            derived = db.execute(
                """SELECT observation_id,value_json,field_state,derived_from_observation_id,transformation_rule_version
                   FROM field_observations
                   WHERE place_id=? AND source_record_id=? AND field_key=?""",
                (pid, derived_source_id, field_key),
            ).fetchone()
            expect(derived is not None, f"candidate derived observation missing: {provider_id}/{field_key}")
            if derived is not None:
                oid, raw_value, state, derived_from, rule_version = derived
                expect(state == "known", f"candidate derived observation not known: {provider_id}/{field_key}")
                expect(raw_value is not None and json.loads(raw_value) == value, f"candidate derived value mismatch: {provider_id}/{field_key}")
                expect(derived_from == source_oid, f"candidate derived provenance mismatch: {provider_id}/{field_key}")
                expect(rule_version == review.RULE_VERSION, f"candidate derived rule version mismatch: {provider_id}/{field_key}")
                selected = db.execute(
                    "SELECT resolution_state,observation_id FROM field_resolutions WHERE place_id=? AND field_key=?",
                    (pid, field_key),
                ).fetchone()
                expect(selected == ("known", oid), f"candidate derived field not selected: {provider_id}/{field_key}/{selected}")

            field_counts[field_key] += 1
            places.add(pid)

        forbidden_identity_fields = db.execute(
            """SELECT count(*) FROM source_records sr
               JOIN field_observations o ON o.source_record_id=sr.source_record_id
               WHERE sr.acquisition_method=? AND o.field_key IN ('name','coordinates','cuisine')""",
            (review.ACQUISITION_METHOD,),
        ).fetchone()[0]
        expect(forbidden_identity_fields == 0, f"candidate field-only resolver wrote identity/category fields: {forbidden_identity_fields}")

        print(json.dumps({
            "status": "fail" if failures else "pass",
            "sourceRecords": len(records),
            "resolvedPlaces": len(places),
            "fieldCounts": dict(sorted(field_counts.items())),
            "failures": failures,
        }, ensure_ascii=False, sort_keys=True))
    finally:
        db.close()

    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
