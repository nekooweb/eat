#!/usr/bin/env python3
"""Strict checks for retained official identity recovery."""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

import retained_official_identity as official


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    args = parser.parse_args()

    _doc, expected_rows = official.load_index()
    expected_rows = [row for row in expected_rows]
    expected_provider_ids = {official.provider_id(row) for row in expected_rows}
    failures = []

    def expect(condition, message):
        if not condition:
            failures.append(message)

    db = sqlite3.connect(args.database)
    db.execute("PRAGMA foreign_keys=ON")
    try:
        actual_records = list(db.execute(
            """SELECT source_record_id,provider_id,source_url
               FROM source_records
               WHERE acquisition_method=?""",
            (official.ACQUISITION_METHOD,),
        ))
        actual_provider_ids = {row[1] for row in actual_records}
        expect(
            actual_provider_ids == expected_provider_ids,
            f"official identity records differ from retained index: actual={len(actual_provider_ids)} expected={len(expected_provider_ids)}",
        )
        expect(
            len(actual_records) == len(actual_provider_ids),
            "official identity importer produced multiple content versions for one retained provider ID",
        )

        conflict_places = {
            row[0] for row in db.execute(
                "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
            )
        }
        reviewed = 0
        deferred = 0
        for srid, provider_id, source_url in actual_records:
            host = official.host_of(source_url or "")
            expect(bool(host), f"official record lacks valid HTTPS URL: {provider_id}")
            expect(
                not any(fragment in host for fragment in official.BLOCKED_HOST_FRAGMENTS),
                f"blocked host entered official identity evidence: {host}",
            )
            bindings = list(db.execute(
                "SELECT place_id,binding_state FROM source_bindings WHERE source_record_id=?",
                (srid,),
            ))
            expect(len(bindings) == 1, f"official source record binding count={len(bindings)} for {provider_id}")
            if not bindings:
                continue
            pid, state = bindings[0]
            if pid in conflict_places:
                expect(state == "candidate", f"conflict Place ID was auto-reviewed from official index: {pid}")
                deferred += 1
            else:
                expect(state == "reviewed", f"non-conflict official identity is not reviewed: {pid} -> {state}")
                reviewed += 1

            name_obs = list(db.execute(
                """SELECT field_state,value_json
                   FROM field_observations
                   WHERE place_id=? AND source_record_id=? AND field_key='name'""",
                (pid, srid),
            ))
            expect(len(name_obs) == 1, f"official identity name observation count={len(name_obs)} for {pid}")
            if name_obs:
                state_value, raw = name_obs[0]
                expect(state_value in ("known", "conflict"), f"unexpected official name observation state={state_value} for {pid}")
                if raw is not None:
                    value = json.loads(raw)
                    expect(isinstance(value, str) and bool(value.strip()), f"empty official name observation for {pid}")

        selected = list(db.execute(
            """SELECT r.place_id,sb.binding_state,ce.identity_state
               FROM field_resolutions r
               JOIN field_observations o ON o.observation_id=r.observation_id
               JOIN source_records sr ON sr.source_record_id=o.source_record_id
               JOIN source_bindings sb ON sb.place_id=o.place_id AND sb.source_record_id=o.source_record_id
               JOIN catalog_entries ce ON ce.place_id=r.place_id
               WHERE r.field_key='name' AND r.resolution_state='known'
                 AND sr.acquisition_method=?""",
            (official.ACQUISITION_METHOD,),
        ))
        expect(
            all(state == "reviewed" for _pid, state, _identity in selected),
            "official identity name resolution selected a non-reviewed binding",
        )
        expect(
            all(pid not in conflict_places for pid, _state, _identity in selected),
            "official identity name resolution selected a conflict Place ID",
        )
        expect(
            all(identity in ("verified", "source_matched") for _pid, _state, identity in selected),
            "official identity resolution left a selected name on an unpublished identity state",
        )

        id_only_selected = db.execute(
            """SELECT count(*)
               FROM catalog_entries ce
               JOIN field_resolutions r ON r.place_id=ce.place_id
               WHERE ce.identity_state='id_only' AND r.field_key='name' AND r.resolution_state='known'"""
        ).fetchone()[0]
        expect(id_only_selected == 0, f"id-only entries still have selected names={id_only_selected}")

        summary = {
            "status": "fail" if failures else "pass",
            "inputRows": len(expected_rows),
            "sourceRecords": len(actual_records),
            "reviewedBindings": reviewed,
            "conflictDeferredBindings": deferred,
            "selectedOfficialNames": len(selected),
            "identityStates": dict(db.execute("SELECT identity_state,count(*) FROM catalog_entries GROUP BY identity_state")),
            "failures": failures,
        }
        print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    finally:
        db.close()

    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
