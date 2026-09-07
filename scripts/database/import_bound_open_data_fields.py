#!/usr/bin/env python3
"""Backfill missing fields from already reviewed bound OpenStreetMap rows.

This stage performs no network requests and never changes identity. It only reconnects
reviewed OpenStreetMap rows in google_basic_source_matches.json with their full retained
candidate payload in data/area1_osm.js, then emits missing-only observations with native
OSM provenance. Ambiguous native source-ID reuse is quarantined instead of promoted.
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict

import master_import_core as core
import retained_osm_identity as retained_osm

ACQUISITION_METHOD = "bound_open_data_field_overlay_v1"
BINDING_METHOD = "field_only_from_reviewed_basic_osm_binding"
RULE_VERSION = "bound-open-data-fields-v1"

EQUIVALENTS = {
    "address": ("address",),
    "coordinates": ("coordinates",),
    "cuisine": ("cuisine",),
    "hours.raw": ("hours.raw", "hours.reference.legacy", "hours.normalized.legacy"),
}


def _known_fields(db) -> set[tuple[str, str]]:
    return {
        (pid, field_key)
        for pid, field_key in db.execute(
            "SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'"
        )
    }


def _missing(known: set[tuple[str, str]], pid: str, field_key: str) -> bool:
    equivalents = EQUIVALENTS.get(field_key, (field_key,))
    return not any((pid, key) in known for key in equivalents)


def _reviewed_basic_osm(db) -> dict[tuple[str, str], str]:
    rows = {}
    for pid, provider_id, source_record_id in db.execute(
        """
        SELECT sb.place_id,sr.provider_id,sr.source_record_id
        FROM source_bindings sb
        JOIN source_records sr ON sr.source_record_id=sb.source_record_id
        WHERE sr.provider='OpenStreetMap'
          AND sr.acquisition_method='retained_repository_basic_match'
          AND sb.binding_state='reviewed'
        ORDER BY sb.place_id,sr.provider_id,sr.source_record_id
        """
    ):
        rows[(pid, str(provider_id))] = source_record_id
    return rows


def _native_source_places(db) -> dict[str, set[str]]:
    output: dict[str, set[str]] = defaultdict(set)
    for provider_id, pid in db.execute(
        """
        SELECT sr.provider_id,sb.place_id
        FROM source_records sr
        JOIN source_bindings sb ON sb.source_record_id=sr.source_record_id
        WHERE sr.provider='OpenStreetMap'
          AND sr.provider_id LIKE 'node/%'
           OR sr.provider='OpenStreetMap' AND sr.provider_id LIKE 'way/%'
           OR sr.provider='OpenStreetMap' AND sr.provider_id LIKE 'relation/%'
        """
    ):
        output[str(provider_id)].add(pid)
    return output


def import_bound_open_data_fields(db, stamp: str):
    reviewed = _reviewed_basic_osm(db)
    candidates = retained_osm.parse_osm_rows()
    by_id = {str(row.get("id") or ""): row for row in candidates if row.get("id")}
    native_places = _native_source_places(db)
    known = _known_fields(db)

    counts = Counter()
    fields = Counter()
    place_ids = set()

    for (pid, basic_provider_id), basic_source_record_id in sorted(reviewed.items()):
        candidate = by_id.get(basic_provider_id)
        if candidate is None:
            counts["missing_candidate"] += 1
            continue

        native_source_id = str(candidate.get("sourceId") or "").strip()
        if not native_source_id:
            counts["missing_native_source_id"] += 1
            continue
        other_places = native_places.get(native_source_id, set()) - {pid}
        if other_places:
            counts["native_source_collision"] += 1
            continue

        source_url = retained_osm.osm_url(candidate)
        observed = stamp[:10]
        payload = {
            "googlePlaceId": pid,
            "reviewedBasicBinding": {
                "providerId": basic_provider_id,
                "sourceRecordId": basic_source_record_id,
                "bindingState": "reviewed",
            },
            "osmNativeSourceId": native_source_id,
            "osmCandidate": candidate,
            "policy": {
                "identityChangeAllowed": False,
                "networkRequests": 0,
                "missingOnly": True,
                "ruleVersion": RULE_VERSION,
            },
        }
        srid = core.source_record(
            db,
            "OpenStreetMap",
            f"bound-basic:{basic_provider_id}",
            payload,
            source_url,
            observed,
            ACQUISITION_METHOD,
            "retained OpenStreetMap row already attached by a reviewed basic binding; field-only reuse",
            stamp,
        )
        core.upsert_binding(
            db,
            pid,
            srid,
            "reviewed",
            BINDING_METHOD,
            "field_only_not_identity",
            candidate.get("distanceMeters"),
            stamp,
        )

        coordinate_value = None
        if isinstance(candidate.get("lat"), (int, float)) and isinstance(candidate.get("lng"), (int, float)):
            coordinate_value = {"lat": candidate["lat"], "lng": candidate["lng"]}

        task_fields = {
            "address": candidate.get("address"),
            "coordinates": coordinate_value,
            "cuisine": candidate.get("cuisine"),
            "hours.raw": candidate.get("openingHoursRaw"),
        }
        for field_key, value in task_fields.items():
            if not core.nonempty(value):
                continue
            if not _missing(known, pid, field_key):
                counts[f"already_known_{field_key}"] += 1
                continue
            oid = core.observation(
                db,
                pid,
                srid,
                field_key,
                value,
                "known",
                observed,
                rule=RULE_VERSION,
            )
            core.resolve(db, pid, field_key, oid, "known", "OpenStreetMap", stamp)
            db.execute(
                "UPDATE field_resolutions SET rule_version=? WHERE place_id=? AND field_key=? AND observation_id=?",
                (RULE_VERSION, pid, field_key, oid),
            )
            known.add((pid, field_key))
            fields[field_key] += 1
            place_ids.add(pid)

        optional_fields = {
            "tags": candidate.get("tags") or None,
            "closure.days.raw": candidate.get("closedDays") or None,
            "source_websites": [source_url] if source_url else None,
            "provenance.osm_native_source_id": native_source_id,
        }
        for field_key, value in optional_fields.items():
            if not core.nonempty(value):
                continue
            core.add_field(
                db,
                pid,
                srid,
                field_key,
                value,
                "reviewed",
                "OpenStreetMap",
                observed,
                stamp,
                resolve_field=False,
            )
        counts["reviewed_rows_processed"] += 1

    return {
        "ruleVersion": RULE_VERSION,
        "reviewedBasicOsmBindings": len(reviewed),
        "processed": counts["reviewed_rows_processed"],
        "placesWithNewTaskFields": len(place_ids),
        "resolvedTaskFields": sum(fields.values()),
        "fieldCounts": dict(sorted(fields.items())),
        "skipped": {
            key: value
            for key, value in sorted(counts.items())
            if key != "reviewed_rows_processed" and value
        },
        "networkRequests": 0,
        "identityChanges": 0,
    }


def main():
    import argparse
    import sqlite3
    from pathlib import Path

    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    db = sqlite3.connect(args.database)
    db.execute("PRAGMA foreign_keys=ON")
    try:
        db.execute("BEGIN IMMEDIATE")
        summary = import_bound_open_data_fields(db, core.now_iso())
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print(json.dumps({"status": "pass", **summary}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
