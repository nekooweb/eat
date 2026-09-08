#!/usr/bin/env python3
"""Audit latent observations behind unresolved core field-completion tasks.

Read-only, zero-network diagnostic. It inspects only publishable, non-conflict catalog
entities and never promotes an observation. The purpose is to find fields that are
already present on a reviewed bound source record but were not selected by the current
canonical resolver.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

TARGETS = {
    "address": ("address",),
    "coordinates": ("coordinates",),
    "cuisine": ("cuisine",),
    "telephone": ("contact.telephone",),
}
PHONE_DIGITS = re.compile(r"\d")


def decode(value_json):
    try:
        return json.loads(value_json) if value_json is not None else None
    except Exception:
        return None


def valid_value(field_key: str, value) -> bool:
    if field_key == "address":
        return isinstance(value, str) and bool(value.strip()) and len(value.strip()) <= 300
    if field_key == "coordinates":
        if not isinstance(value, dict):
            return False
        lat, lng = value.get("lat"), value.get("lng")
        return (
            isinstance(lat, (int, float)) and not isinstance(lat, bool)
            and isinstance(lng, (int, float)) and not isinstance(lng, bool)
            and -90 <= lat <= 90 and -180 <= lng <= 180
        )
    if field_key == "cuisine":
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, list):
            return any(isinstance(x, str) and x.strip() for x in value)
        return False
    if field_key == "contact.telephone":
        candidates = value if isinstance(value, list) else [value]
        for item in candidates:
            if not isinstance(item, str) or not item.strip():
                continue
            digits = "".join(PHONE_DIGITS.findall(item))
            if 9 <= len(digits) <= 13:
                return True
        return False
    if field_key.startswith("practical."):
        return value is False or value is True or (isinstance(value, str) and bool(value.strip())) or isinstance(value, (dict, list))
    return value is not None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("database", type=Path)
    ap.add_argument("--output", type=Path)
    args = ap.parse_args()

    db = sqlite3.connect(args.database)
    try:
        identities = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
        conflicts = {
            pid for pid, in db.execute(
                "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
            )
        }
        publishable = {
            pid for pid, state in identities.items()
            if state in {"verified", "source_matched"} and pid not in conflicts
        }
        known = {
            (pid, key)
            for pid, key in db.execute(
                "SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'"
            )
        }
        unresolved = {
            logical: {
                pid for pid in publishable
                if not any((pid, key) in known for key in keys)
            }
            for logical, keys in TARGETS.items()
        }
        practical_known = {pid for pid, key in known if key.startswith("practical.")}
        unresolved["practical"] = publishable - practical_known

        bindings = defaultdict(list)
        for srid, pid, state, method in db.execute(
            """
            SELECT source_record_id,place_id,binding_state,coalesce(binding_method,'')
            FROM source_bindings
            ORDER BY source_record_id,place_id
            """
        ):
            bindings[(srid, pid)].append((state, method))

        rows = []
        groups = Counter()
        reviewed_groups = Counter()
        any_pairs = set()
        reviewed_pairs = set()
        any_places = defaultdict(set)
        reviewed_places = defaultdict(set)

        query = """
            SELECT o.observation_id,o.place_id,o.field_key,o.value_json,o.field_state,
                   sr.source_record_id,sr.provider,sr.provider_id,sr.acquisition_method,
                   coalesce(sr.source_url,''),coalesce(sr.observed_at,'')
            FROM field_observations o
            JOIN source_records sr ON sr.source_record_id=o.source_record_id
            WHERE o.field_state='known'
              AND (
                o.field_key IN ('address','coordinates','cuisine','contact.telephone')
                OR o.field_key LIKE 'practical.%'
              )
            ORDER BY o.place_id,o.field_key,sr.acquisition_method,sr.provider,o.observation_id
        """
        for (
            oid, pid, field_key, value_json, field_state, srid, provider, provider_id,
            acquisition, source_url, observed_at,
        ) in db.execute(query):
            logical = "practical" if field_key.startswith("practical.") else {
                "address": "address",
                "coordinates": "coordinates",
                "cuisine": "cuisine",
                "contact.telephone": "telephone",
            }.get(field_key)
            if logical is None or pid not in unresolved[logical]:
                continue
            value = decode(value_json)
            if not valid_value(field_key, value):
                continue
            any_pairs.add((pid, field_key))
            any_places[logical].add(pid)
            bound = bindings.get((srid, pid)) or [("unbound", "")]
            for binding_state, binding_method in bound:
                group_key = f"{logical}|{field_key}|{acquisition}|{provider}|{binding_state}"
                groups[group_key] += 1
                reviewed = binding_state == "reviewed"
                if reviewed:
                    reviewed_groups[group_key] += 1
                    reviewed_pairs.add((pid, field_key))
                    reviewed_places[logical].add(pid)
                rows.append({
                    "googlePlaceId": pid,
                    "logicalField": logical,
                    "fieldKey": field_key,
                    "observationId": oid,
                    "sourceRecordId": srid,
                    "provider": provider,
                    "providerId": provider_id,
                    "acquisitionMethod": acquisition,
                    "bindingState": binding_state,
                    "bindingMethod": binding_method,
                    "reviewedBinding": reviewed,
                    "hasHttpsSourceUrl": source_url.startswith("https://"),
                    "observedAt": observed_at,
                })

        summary = {
            "publishableNonConflictPlaces": len(publishable),
            "unresolvedCounts": {key: len(value) for key, value in sorted(unresolved.items())},
            "unresolvedPlacesWithAnyValidObservation": {key: len(any_places[key]) for key in sorted(unresolved)},
            "unresolvedPlacesWithReviewedValidObservation": {key: len(reviewed_places[key]) for key in sorted(unresolved)},
            "validObservationPlaceFieldPairs": len(any_pairs),
            "reviewedValidObservationPlaceFieldPairs": len(reviewed_pairs),
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
