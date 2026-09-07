#!/usr/bin/env python3
"""Strict validation for retained-field resolver v2."""
from __future__ import annotations

import argparse
import json
import sqlite3
from collections import Counter
from pathlib import Path

import resolve_retained_fields as resolver


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
        conflict_places = {
            row[0] for row in db.execute(
                "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
            )
        }
        records = list(db.execute(
            """SELECT sr.source_record_id,sr.provider,sr.provider_id,sr.source_url,sr.payload_json,
                      sb.place_id,sb.binding_state,sb.binding_method,sb.confidence,ce.identity_state
               FROM source_records sr
               JOIN source_bindings sb ON sb.source_record_id=sr.source_record_id
               JOIN catalog_entries ce ON ce.place_id=sb.place_id
               WHERE sr.acquisition_method=?""",
            (resolver.ACQUISITION_METHOD,),
        ))
        field_counts = Counter()
        provider_counts = Counter()
        derived_observation_ids = set()

        for (
            source_record_id,
            provider,
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
            source_observation_id = payload.get("sourceObservationId")
            source_record_ref = payload.get("sourceRecordId")
            value = payload.get("value")
            links = payload.get("sourceLinks") or []
            claimed = set(payload.get("claimedFields") or [])

            expect(provider in resolver.ALLOWED_PROVIDERS, f"resolver provider not allowed: {provider_id}/{provider}")
            expect(binding_state == "reviewed", f"resolver binding not reviewed: {provider_id}/{binding_state}")
            expect(binding_method == resolver.BINDING_METHOD, f"resolver binding method mismatch: {provider_id}")
            expect(confidence == "field_only_not_identity", f"resolver confidence mismatch: {provider_id}/{confidence}")
            expect(identity_state in ("verified", "source_matched"), f"resolver used non-publishable identity: {pid}/{identity_state}")
            expect(pid not in conflict_places, f"resolver selected field on conflict Place ID: {pid}")
            expect(field_key in resolver.FIELD_RULES, f"resolver field not allowlisted: {field_key}")
            expect(payload.get("selectionPolicy") == "missing_only_no_identity_change", f"resolver selection policy mismatch: {provider_id}")
            expect(payload.get("ruleVersion") == resolver.RULE_VERSION, f"resolver rule version mismatch: {provider_id}")
            expect(isinstance(source_url, str) and source_url.startswith("https://"), f"resolver source URL not HTTPS: {provider_id}")
            expect(bool(links) and all(isinstance(url, str) and url.startswith("https://") for url in links), f"resolver provenance links invalid: {provider_id}")
            if field_key in resolver.FIELD_RULES:
                expect(bool(claimed & resolver.FIELD_RULES[field_key]["claims"]), f"resolver claim does not support field: {provider_id}/{field_key}")
                expect(resolver.valid_value(field_key, value), f"resolver value invalid: {provider_id}/{field_key}")

            source = db.execute(
                """SELECT o.place_id,o.field_key,o.value_json,sr.acquisition_method,sr.provider,sr.source_record_id
                   FROM field_observations o
                   JOIN source_records sr ON sr.source_record_id=o.source_record_id
                   WHERE o.observation_id=?""",
                (source_observation_id,),
            ).fetchone()
            expect(source is not None, f"resolver source observation missing: {provider_id}")
            if source is not None:
                source_pid, source_field, source_value_json, acquisition, source_provider, actual_source_record = source
                expect(source_pid == pid, f"resolver source observation Place ID mismatch: {provider_id}")
                expect(source_field == field_key, f"resolver source field mismatch: {provider_id}/{source_field}/{field_key}")
                expect(acquisition == "retained_source_fact_overlay", f"resolver source is not retained source fact: {provider_id}/{acquisition}")
                expect(source_provider == provider, f"resolver source provider mismatch: {provider_id}/{source_provider}/{provider}")
                expect(actual_source_record == source_record_ref, f"resolver source record reference mismatch: {provider_id}")
                if source_value_json is not None:
                    expect(json.loads(source_value_json) == value, f"resolver changed retained value: {provider_id}/{field_key}")

            derived = db.execute(
                """SELECT observation_id,field_state,value_json,derived_from_observation_id,transformation_rule_version
                   FROM field_observations
                   WHERE place_id=? AND source_record_id=? AND field_key=?""",
                (pid, source_record_id, field_key),
            ).fetchone()
            expect(derived is not None, f"derived field observation missing: {provider_id}/{field_key}")
            if derived is not None:
                oid, state, raw_value, derived_from, rule_version = derived
                derived_observation_ids.add(oid)
                expect(state == "known", f"derived field not known: {provider_id}/{field_key}/{state}")
                expect(raw_value is not None and json.loads(raw_value) == value, f"derived field value mismatch: {provider_id}/{field_key}")
                expect(derived_from == source_observation_id, f"derived provenance link mismatch: {provider_id}/{field_key}")
                expect(rule_version == resolver.RULE_VERSION, f"derived transformation rule mismatch: {provider_id}/{field_key}")
                selected = db.execute(
                    """SELECT resolution_state,observation_id
                       FROM field_resolutions WHERE place_id=? AND field_key=?""",
                    (pid, field_key),
                ).fetchone()
                expect(selected == ("known", oid), f"derived field is not the selected known resolution: {provider_id}/{field_key}/{selected}")

            field_counts[field_key] += 1
            provider_counts[provider] += 1

        selected_outside = list(db.execute(
            """SELECT r.place_id,r.field_key,sr.acquisition_method
               FROM field_resolutions r
               JOIN field_observations o ON o.observation_id=r.observation_id
               JOIN source_records sr ON sr.source_record_id=o.source_record_id
               WHERE sr.acquisition_method=? AND r.resolution_state!='known'""",
            (resolver.ACQUISITION_METHOD,),
        ))
        expect(not selected_outside, f"resolver produced non-known selected states: {selected_outside[:5]}")

        name_records = db.execute(
            "SELECT count(*) FROM source_records WHERE acquisition_method=? AND payload_json LIKE '%\"fieldKey\":\"name\"%'",
            (resolver.ACQUISITION_METHOD,),
        ).fetchone()[0]
        expect(name_records == 0, f"field-only resolver attempted name/identity changes: {name_records}")

        summary = {
            "status": "fail" if failures else "pass",
            "sourceRecords": len(records),
            "derivedObservations": len(derived_observation_ids),
            "fieldCounts": dict(sorted(field_counts.items())),
            "providerCounts": dict(sorted(provider_counts.items())),
            "failures": failures,
        }
        print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    finally:
        db.close()

    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
