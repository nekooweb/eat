#!/usr/bin/env python3
"""Strict validation for retained historical verified OSM identity recovery."""
from __future__ import annotations

import argparse
import json
import sqlite3
from collections import defaultdict
from pathlib import Path

import retained_osm_identity as osm

FORBIDDEN_GOOGLE_PAYLOAD_KEYS = {
    "displayName",
    "formattedAddress",
    "googleName",
    "googleAddress",
    "googleLocation",
    "currentOpeningHours",
    "nationalPhoneNumber",
    "internationalPhoneNumber",
    "websiteUri",
}


def walk_keys(value):
    if isinstance(value, dict):
        for key, child in value.items():
            yield key
            yield from walk_keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_keys(child)


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
        id_set = {row[0] for row in db.execute("SELECT place_id FROM catalog_entries")}
        expected_pairs, missing_candidates = osm.verified_pairs(id_set)
        expected_pair_keys = {(source_id, pid) for source_id, pid, _qc, _candidate in expected_pairs}

        actual_records = list(db.execute(
            """SELECT source_record_id,provider_id,source_url,payload_json
               FROM source_records WHERE acquisition_method=?""",
            (osm.ACQUISITION_METHOD,),
        ))
        actual_pairs = set()
        record_by_id = {}
        for srid, provider_id, source_url, raw_payload in actual_records:
            record_by_id[srid] = (provider_id, source_url, raw_payload)
            payload = json.loads(raw_payload)
            pid = str(payload.get("googlePlaceId") or "")
            actual_pairs.add((provider_id, pid))
            expect(provider_id.startswith("osm-"), f"unexpected OSM provider ID: {provider_id}")
            expect(
                source_url is not None and source_url.startswith("https://www.openstreetmap.org/"),
                f"invalid OSM source URL for {provider_id}: {source_url}",
            )
            leaked = FORBIDDEN_GOOGLE_PAYLOAD_KEYS & set(walk_keys(payload))
            expect(not leaked, f"forbidden Google display keys leaked into OSM retained payload: {sorted(leaked)}")
            qc = payload.get("retainedIdentityQc") or {}
            expect(qc.get("status") == "verified", f"non-verified QC imported for {provider_id}")
            expect(qc.get("sourceId") == provider_id, f"QC/source provider ID mismatch for {provider_id}")
            expect(qc.get("paidDataApiCallsThisImport") == 0, f"paid API marker invalid for {provider_id}")

        expect(
            actual_pairs == expected_pair_keys,
            f"OSM retained records differ from verified QC pairs: actual={len(actual_pairs)} expected={len(expected_pair_keys)} missingCandidates={len(missing_candidates)}",
        )
        expect(
            len(actual_records) == len(actual_pairs),
            "OSM retained importer produced duplicate content versions for the same verified mapping pair",
        )

        provider_places = defaultdict(set)
        for provider_id, pid in actual_pairs:
            provider_places[provider_id].add(pid)
        colliding_provider_ids = {key for key, places in provider_places.items() if len(places) > 1}
        conflict_places = {
            row[0] for row in db.execute(
                "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
            )
        }

        reviewed = candidate = conflict = 0
        for srid, (provider_id, _url, raw_payload) in record_by_id.items():
            pid = str(json.loads(raw_payload).get("googlePlaceId") or "")
            binding = db.execute(
                "SELECT binding_state FROM source_bindings WHERE place_id=? AND source_record_id=?",
                (pid, srid),
            ).fetchone()
            expect(binding is not None, f"OSM retained record lacks binding: {provider_id}/{pid}")
            if binding is None:
                continue
            state = binding[0]
            if provider_id in colliding_provider_ids:
                expect(state == "conflict", f"colliding OSM source ID was not quarantined: {provider_id}/{pid}/{state}")
            elif pid in conflict_places:
                expect(state in ("candidate", "conflict"), f"existing conflict Place ID was auto-reviewed by OSM QC: {pid}")
            else:
                expect(state == "reviewed", f"safe verified OSM mapping not reviewed: {provider_id}/{pid}/{state}")
            if state == "reviewed": reviewed += 1
            elif state == "candidate": candidate += 1
            elif state == "conflict": conflict += 1

        selected = list(db.execute(
            """SELECT DISTINCT r.place_id,r.field_key,sb.binding_state,ce.identity_state
               FROM field_resolutions r
               JOIN field_observations o ON o.observation_id=r.observation_id
               JOIN source_records sr ON sr.source_record_id=o.source_record_id
               JOIN source_bindings sb ON sb.place_id=o.place_id AND sb.source_record_id=o.source_record_id
               JOIN catalog_entries ce ON ce.place_id=r.place_id
               WHERE r.resolution_state='known' AND sr.acquisition_method=?""",
            (osm.ACQUISITION_METHOD,),
        ))
        expect(
            all(binding_state == "reviewed" for _pid, _field, binding_state, _identity in selected),
            "known field selected from non-reviewed OSM recovery binding",
        )
        expect(
            all(pid not in conflict_places for pid, _field, _binding, _identity in selected),
            "known OSM recovery field selected for a conflict Place ID",
        )
        selected_names = [row for row in selected if row[1] == "name"]
        expect(
            all(identity in ("verified", "source_matched") for _pid, _field, _binding, identity in selected_names),
            "selected OSM recovery name did not promote identity into a publishable state",
        )

        id_only_named = db.execute(
            """SELECT count(*) FROM catalog_entries ce
               JOIN field_resolutions r ON r.place_id=ce.place_id
               WHERE ce.identity_state='id_only' AND r.field_key='name' AND r.resolution_state='known'"""
        ).fetchone()[0]
        expect(id_only_named == 0, f"id-only rows with selected name={id_only_named}")

        summary = {
            "status": "fail" if failures else "pass",
            "verifiedPairs": len(expected_pairs),
            "missingCandidateRows": len(missing_candidates),
            "sourceRecords": len(actual_records),
            "mappingCollisionSourceIds": len(colliding_provider_ids),
            "reviewedBindings": reviewed,
            "candidateBindings": candidate,
            "conflictBindings": conflict,
            "selectedFields": len(selected),
            "selectedNames": len(selected_names),
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
