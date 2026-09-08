#!/usr/bin/env python3
"""Audit why publishable restaurants still lack canonical hours despite retained observations.

Read-only diagnostic. It builds no new evidence, performs no network request, and does
not alter identity or field resolutions. The output separates safe reviewed observations
from candidate/conflict/legacy-only data before any resolver rule is expanded.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

HOURS_EQUIVALENTS = ("hours.raw", "hours.reference.legacy", "hours.normalized.legacy")


def nonempty_hours(value_json: str | None) -> bool:
    if value_json is None:
        return False
    try:
        value = json.loads(value_json)
    except Exception:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, list):
        return any(isinstance(item, str) and item.strip() for item in value)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("database", type=Path)
    ap.add_argument("--output", type=Path)
    args = ap.parse_args()

    db = sqlite3.connect(args.database)
    try:
        identities = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
        conflict_places = {
            pid for pid, in db.execute(
                "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
            )
        }
        known_hours = {
            pid for pid, in db.execute(
                "SELECT DISTINCT place_id FROM field_resolutions WHERE resolution_state='known' AND field_key IN (?,?,?)",
                HOURS_EQUIVALENTS,
            )
        }
        publishable = {
            pid for pid, state in identities.items()
            if state in {"verified", "source_matched"} and pid not in conflict_places
        }
        unresolved = publishable - known_hours

        source_bindings = defaultdict(list)
        for source_record_id, pid, state, method, rule in db.execute(
            """
            SELECT source_record_id,place_id,binding_state,binding_method,coalesce(match_rule,'')
            FROM source_bindings
            ORDER BY place_id,source_record_id
            """
        ):
            source_bindings[(source_record_id, pid)].append((state, method, rule))

        rows = []
        grouping = Counter()
        safe_groups = Counter()
        unresolved_with_any_hours = set()
        unresolved_with_reviewed_hours = set()
        unresolved_with_reviewed_native_hours = set()

        query = """
            SELECT o.observation_id,o.place_id,o.value_json,o.field_state,
                   sr.source_record_id,sr.provider,sr.provider_id,
                   sr.acquisition_method,coalesce(sr.source_url,''),coalesce(sr.observed_at,'')
            FROM field_observations o
            JOIN source_records sr ON sr.source_record_id=o.source_record_id
            WHERE o.field_key='hours.raw'
            ORDER BY o.place_id,sr.provider,sr.acquisition_method,o.observation_id
        """
        for observation_id, pid, value_json, field_state, srid, provider, provider_id, acquisition, source_url, observed_at in db.execute(query):
            if pid not in unresolved or not nonempty_hours(value_json):
                continue
            unresolved_with_any_hours.add(pid)
            bindings = source_bindings.get((srid, pid)) or [("unbound", "", "")]
            for binding_state, binding_method, match_rule in bindings:
                key = f"{acquisition}|{provider}|{binding_state}"
                grouping[key] += 1
                reviewed = binding_state == "reviewed"
                if reviewed:
                    unresolved_with_reviewed_hours.add(pid)
                    safe_groups[key] += 1
                    if acquisition in {
                        "retained_repository_basic_match",
                        "retained_verified_official_identity_index",
                        "retained_verified_osm_identity_qc",
                        "retained_hotpepper_artifact",
                        "retained_hotpepper_rich_metadata",
                        "public_source_basic_web_field_evidence_v1",
                        "derived_retained_field_resolution_v2",
                        "bound_open_data_fields_v1",
                    }:
                        unresolved_with_reviewed_native_hours.add(pid)
                rows.append({
                    "googlePlaceId": pid,
                    "observationId": observation_id,
                    "sourceRecordId": srid,
                    "provider": provider,
                    "providerId": provider_id,
                    "acquisitionMethod": acquisition,
                    "fieldState": field_state,
                    "bindingState": binding_state,
                    "bindingMethod": binding_method,
                    "matchRule": match_rule,
                    "hasHttpsSourceUrl": source_url.startswith("https://"),
                    "observedAt": observed_at,
                    "reviewedBinding": reviewed,
                })

        place_counts = Counter()
        by_place = defaultdict(list)
        for row in rows:
            by_place[row["googlePlaceId"]].append(row)
        for pid in sorted(unresolved):
            evidence = by_place.get(pid, [])
            if not evidence:
                place_counts["no_nonempty_hours_observation"] += 1
            elif any(row["reviewedBinding"] for row in evidence):
                place_counts["reviewed_hours_observation_available"] += 1
            else:
                place_counts["hours_observation_only_unreviewed"] += 1

        summary = {
            "publishableNonConflictPlaces": len(publishable),
            "knownHoursPlaces": len(publishable & known_hours),
            "unresolvedHoursPlaces": len(unresolved),
            "unresolvedWithAnyNonemptyHoursObservation": len(unresolved_with_any_hours),
            "unresolvedWithReviewedHoursObservation": len(unresolved_with_reviewed_hours),
            "unresolvedWithReviewedNativeHoursObservation": len(unresolved_with_reviewed_native_hours),
            "placeClassification": dict(sorted(place_counts.items())),
            "observationGroups": dict(sorted(grouping.items())),
            "reviewedObservationGroups": dict(sorted(safe_groups.items())),
        }
        payload = {
            "schemaVersion": 1,
            "policy": {
                "networkRequests": 0,
                "databaseWrites": 0,
                "identityChanges": 0,
                "fieldResolutionChanges": 0,
                "publishableNonConflictOnly": True,
                "readOnlyDiagnostic": True,
            },
            "summary": summary,
            "rows": rows,
        }
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"status": "pass", **summary}, ensure_ascii=False, sort_keys=True))
    finally:
        db.close()


if __name__ == "__main__":
    main()
