#!/usr/bin/env python3
"""Audit unresolved lunch/dinner budgets across every retained observation source.

Read-only and zero-network. The audit only inspects publishable, non-conflict Place IDs
whose canonical lunch or dinner budget is still missing, then groups finite retained
budget observations by acquisition method, provider and binding state. It does not
promote candidate evidence and performs no identity or field writes.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

TARGETS = {
    "budget.lunch.range": ("budget.lunch.range", "budget.lunch.legacy_range"),
    "budget.dinner.range": ("budget.dinner.range", "budget.dinner.legacy_range"),
}


def valid_range(value_json: str | None) -> bool:
    if value_json is None:
        return False
    try:
        value = json.loads(value_json)
    except Exception:
        return False
    if not isinstance(value, list) or len(value) != 2:
        return False
    low, high = value
    if isinstance(low, bool) or isinstance(high, bool):
        return False
    if not isinstance(low, (int, float)) or not isinstance(high, (int, float)):
        return False
    return 0 <= low <= high <= 200000


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
        publishable = {
            pid for pid, state in identities.items()
            if state in {"verified", "source_matched"} and pid not in conflict_places
        }
        known = {
            (pid, field_key)
            for pid, field_key in db.execute(
                "SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'"
            )
        }

        unresolved: dict[str, set[str]] = {}
        for target, equivalents in TARGETS.items():
            unresolved[target] = {
                pid for pid in publishable
                if not any((pid, eq) in known for eq in equivalents)
            }

        bindings = defaultdict(list)
        for source_record_id, pid, state, method in db.execute(
            """
            SELECT source_record_id,place_id,binding_state,coalesce(binding_method,'')
            FROM source_bindings
            ORDER BY source_record_id,place_id
            """
        ):
            bindings[(source_record_id, pid)].append((state, method))

        rows = []
        groups = Counter()
        reviewed_groups = Counter()
        safe_place_fields = set()
        any_place_fields = set()
        candidate_only_place_fields = set()

        query = """
            SELECT o.observation_id,o.place_id,o.field_key,o.value_json,o.field_state,
                   sr.source_record_id,sr.provider,sr.provider_id,
                   sr.acquisition_method,coalesce(sr.source_url,''),coalesce(sr.observed_at,'')
            FROM field_observations o
            JOIN source_records sr ON sr.source_record_id=o.source_record_id
            WHERE o.field_key IN ('budget.lunch.range','budget.dinner.range')
              AND o.field_state='known'
            ORDER BY o.place_id,o.field_key,sr.acquisition_method,sr.provider,o.observation_id
        """
        for (
            observation_id, pid, field_key, value_json, field_state, source_record_id,
            provider, provider_id, acquisition, source_url, observed_at,
        ) in db.execute(query):
            if pid not in unresolved[field_key] or not valid_range(value_json):
                continue
            any_place_fields.add((pid, field_key))
            bound = bindings.get((source_record_id, pid)) or [("unbound", "")]
            states = {state for state, _method in bound}
            if "reviewed" in states:
                safe_place_fields.add((pid, field_key))
            elif states & {"candidate", "unbound"}:
                candidate_only_place_fields.add((pid, field_key))
            for binding_state, binding_method in bound:
                key = f"{field_key}|{acquisition}|{provider}|{binding_state}"
                groups[key] += 1
                if binding_state == "reviewed":
                    reviewed_groups[key] += 1
                rows.append({
                    "googlePlaceId": pid,
                    "fieldKey": field_key,
                    "observationId": observation_id,
                    "sourceRecordId": source_record_id,
                    "provider": provider,
                    "providerId": provider_id,
                    "acquisitionMethod": acquisition,
                    "bindingState": binding_state,
                    "bindingMethod": binding_method,
                    "hasHttpsSourceUrl": source_url.startswith("https://"),
                    "observedAt": observed_at,
                    "reviewedBinding": binding_state == "reviewed",
                })

        summary = {
            "publishableNonConflictPlaces": len(publishable),
            "unresolvedLunchPlaces": len(unresolved["budget.lunch.range"]),
            "unresolvedDinnerPlaces": len(unresolved["budget.dinner.range"]),
            "unresolvedPlaceFieldsWithAnyFiniteObservation": len(any_place_fields),
            "unresolvedPlaceFieldsWithReviewedFiniteObservation": len(safe_place_fields),
            "unresolvedPlaceFieldsCandidateOrUnboundOnly": len(candidate_only_place_fields - safe_place_fields),
            "reviewedFiniteByField": {
                field: sum(1 for _pid, f in safe_place_fields if f == field)
                for field in TARGETS
            },
            "anyFiniteByField": {
                field: sum(1 for _pid, f in any_place_fields if f == field)
                for field in TARGETS
            },
            "observationGroups": dict(sorted(groups.items())),
            "reviewedObservationGroups": dict(sorted(reviewed_groups.items())),
        }
        payload = {
            "schemaVersion": 1,
            "policy": {
                "networkRequests": 0,
                "databaseWrites": 0,
                "identityChanges": 0,
                "fieldResolutionChanges": 0,
                "publishableNonConflictOnly": True,
                "finiteRangeOnly": True,
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
