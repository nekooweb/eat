#!/usr/bin/env python3
"""Resolve residual fields from exact reviewed historical OSM identity mappings.

The repository retains historical verified mappings from OSM candidate IDs such as
`osm-n-...` to frozen Google Place IDs. Each retained candidate row also carries its
native OSM `sourceId` (`node/...`, `way/...`, or `relation/...`). This resolver runs late
in the master build and may only fill still-missing fields for bindings that are currently
`reviewed` under `retained_verified_osm_identity_qc`.

No identity matching is performed here. The reviewed source-record provider ID must join
byte-for-byte to the current retained OSM candidate's stable candidate `id`; candidate-ID
and native-source-ID collisions are both deferred. Telephone is accepted only when the
retained row contains exactly one distinct valid source-native number. Practical fields
are limited to three unambiguous OSM tag values: `payment:credit_cards=yes/no`,
`internet_access=wlan/no`, and `wheelchair=yes/no`. Ambiguous values such as
`wheelchair=limited` remain provenance only.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

import master_import_core as core
import retained_osm_identity as retained_osm

IDENTITY_ACQUISITION_METHOD = "retained_verified_osm_identity_qc"
RULE_VERSION = "verified-osm-native-metadata-v2"


def _known_fields(db) -> set[tuple[str, str]]:
    return {
        (pid, field_key)
        for pid, field_key in db.execute(
            "SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'"
        )
    }


def _reviewed_verified_osm(db) -> list[tuple[str, str, str]]:
    return list(db.execute(
        """
        SELECT sb.place_id, sr.provider_id, sr.source_record_id
        FROM source_bindings sb
        JOIN source_records sr ON sr.source_record_id=sb.source_record_id
        WHERE sr.provider='OpenStreetMap'
          AND sr.acquisition_method=?
          AND sb.binding_state='reviewed'
        ORDER BY sb.place_id, sr.provider_id, sr.source_record_id
        """,
        (IDENTITY_ACQUISITION_METHOD,),
    ))


def _candidate_indexes() -> tuple[dict[str, dict], set[str], set[str]]:
    """Return unique candidate-ID index plus candidate/native collision sets."""
    rows = retained_osm.parse_osm_rows()
    by_candidate_id: dict[str, list[dict]] = defaultdict(list)
    by_native_source_id: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        candidate_id = str(row.get("id") or "").strip()
        native_source_id = str(row.get("sourceId") or "").strip()
        if candidate_id:
            by_candidate_id[candidate_id].append(row)
        if native_source_id:
            by_native_source_id[native_source_id].append(row)

    candidate_collisions = {
        candidate_id for candidate_id, values in by_candidate_id.items() if len(values) != 1
    }
    native_collisions = {
        source_id for source_id, values in by_native_source_id.items() if len(values) != 1
    }
    unique_candidates = {
        candidate_id: values[0]
        for candidate_id, values in by_candidate_id.items()
        if candidate_id not in candidate_collisions
    }
    return unique_candidates, candidate_collisions, native_collisions


def _binding_collisions(reviewed_rows: list[tuple[str, str, str]]) -> set[str]:
    provider_places: dict[str, set[str]] = defaultdict(set)
    for pid, provider_id, _srid in reviewed_rows:
        provider_places[str(provider_id)].add(str(pid))
    return {
        provider_id
        for provider_id, places in provider_places.items()
        if len(places) != 1
    }


def _native_phones(candidate: dict) -> list[str]:
    raw_values = candidate.get("sourcePhones") or []
    if isinstance(raw_values, str):
        raw_values = [raw_values]
    if not isinstance(raw_values, list):
        return []
    output = []
    seen_digits = set()
    for raw in raw_values:
        text = str(raw or "").strip()
        if not text or len(text) > 80:
            continue
        digits = re.sub(r"\D", "", text)
        if not (8 <= len(digits) <= 15) or digits in seen_digits:
            continue
        seen_digits.add(digits)
        output.append(text)
    return output


def _practical_claims(candidate: dict) -> dict[str, bool]:
    tags = candidate.get("sourcePracticalTags") or {}
    if not isinstance(tags, dict):
        return {}
    output: dict[str, bool] = {}

    credit_cards = str(tags.get("payment:credit_cards") or "").strip().casefold()
    if credit_cards == "yes":
        output["practical.card_available"] = True
    elif credit_cards == "no":
        output["practical.card_available"] = False

    internet_access = str(tags.get("internet_access") or "").strip().casefold()
    if internet_access == "wlan":
        output["practical.wifi_available"] = True
    elif internet_access == "no":
        output["practical.wifi_available"] = False

    wheelchair = str(tags.get("wheelchair") or "").strip().casefold()
    if wheelchair == "yes":
        output["practical.barrier_free"] = True
    elif wheelchair == "no":
        output["practical.barrier_free"] = False

    return output


def resolve_verified_osm_native_metadata(db, stamp: str):
    reviewed_rows = _reviewed_verified_osm(db)
    candidates, candidate_collisions, native_collisions = _candidate_indexes()
    binding_collisions = _binding_collisions(reviewed_rows)
    known = _known_fields(db)

    counts = Counter()
    fields = Counter()
    changed_places = set()

    for pid, candidate_provider_id, source_record_id in reviewed_rows:
        pid = str(pid)
        candidate_provider_id = str(candidate_provider_id)
        if candidate_provider_id in binding_collisions:
            counts["reviewed_binding_provider_collision"] += 1
            continue
        if candidate_provider_id in candidate_collisions:
            counts["retained_candidate_id_collision"] += 1
            continue
        candidate = candidates.get(candidate_provider_id)
        if candidate is None:
            counts["retained_candidate_missing"] += 1
            continue

        # Exact identity join: retained_verified_osm_identity.py stores the historical
        # verified OSM candidate ID as source_records.provider_id. Reuse the same exact
        # key here; never fall back to name, distance, coordinates, or fuzzy matching.
        if str(candidate.get("id") or "").strip() != candidate_provider_id:
            counts["candidate_provider_id_mismatch"] += 1
            continue

        native_source_id = str(candidate.get("sourceId") or "").strip()
        if not native_source_id:
            counts["missing_native_source_id"] += 1
            continue
        if native_source_id in native_collisions:
            counts["retained_native_source_id_collision"] += 1
            continue

        raw_phones = _native_phones(candidate)
        practical = _practical_claims(candidate)
        raw_practical = candidate.get("sourcePracticalTags") or {}
        if raw_phones:
            counts["reviewed_rows_with_native_phone"] += 1
        if len(raw_phones) > 1:
            counts["multiple_native_phones_deferred"] += 1
        if raw_practical:
            counts["reviewed_rows_with_native_practical_tags"] += 1
        if practical:
            counts["reviewed_rows_with_mappable_native_practical"] += 1

        claims: dict[str, object] = dict(practical)
        if len(raw_phones) == 1:
            claims["contact.telephone"] = raw_phones[0]

        for field_key, value in claims.items():
            if (pid, field_key) in known:
                counts[f"already_known_{field_key}"] += 1
                continue
            # False is meaningful for explicit OSM `no`; do not use truthiness here.
            if value is None or (isinstance(value, str) and not value.strip()):
                continue
            observation_id = core.observation(
                db,
                pid,
                source_record_id,
                field_key,
                value,
                "known",
                stamp[:10],
                rule=RULE_VERSION,
            )
            core.resolve(
                db,
                pid,
                field_key,
                observation_id,
                "known",
                "OpenStreetMap",
                stamp,
            )
            db.execute(
                "UPDATE field_resolutions SET rule_version=? WHERE place_id=? AND field_key=? AND observation_id=?",
                (RULE_VERSION, pid, field_key, observation_id),
            )
            known.add((pid, field_key))
            fields[field_key] += 1
            changed_places.add(pid)

        # Preserve the exact candidate/native IDs and source-native metadata as reviewed
        # provenance even when all mapped canonical fields were already known from
        # higher-priority sources.
        provenance = {
            "candidateId": candidate_provider_id,
            "nativeSourceId": native_source_id,
            "sourcePhones": raw_phones,
            "sourcePracticalTags": raw_practical,
            "policy": {
                "exactReviewedCandidateIdOnly": True,
                "nativeSourceIdUniqueRequired": True,
                "missingOnly": True,
                "networkRequests": 0,
                "identityChanges": 0,
                "singleNativePhoneRequired": True,
                "explicitPracticalTagsOnly": True,
                "ruleVersion": RULE_VERSION,
            },
        }
        core.add_field(
            db,
            pid,
            source_record_id,
            "provenance.osm_native_metadata_overlay",
            provenance,
            "reviewed",
            "OpenStreetMap",
            stamp[:10],
            stamp,
            resolve_field=False,
        )
        counts["reviewed_rows_processed"] += 1

    return {
        "ruleVersion": RULE_VERSION,
        "reviewedVerifiedOsmBindings": len(reviewed_rows),
        "processed": counts["reviewed_rows_processed"],
        "reviewedRowsWithNativePhone": counts["reviewed_rows_with_native_phone"],
        "multipleNativePhonesDeferred": counts["multiple_native_phones_deferred"],
        "reviewedRowsWithNativePracticalTags": counts["reviewed_rows_with_native_practical_tags"],
        "reviewedRowsWithMappableNativePractical": counts["reviewed_rows_with_mappable_native_practical"],
        "placesWithNewFields": len(changed_places),
        "resolvedFields": sum(fields.values()),
        "fieldCounts": dict(sorted(fields.items())),
        "skipped": {
            key: value
            for key, value in sorted(counts.items())
            if key not in {
                "reviewed_rows_processed",
                "reviewed_rows_with_native_phone",
                "multiple_native_phones_deferred",
                "reviewed_rows_with_native_practical_tags",
                "reviewed_rows_with_mappable_native_practical",
            } and value
        },
        "networkRequests": 0,
        "identityChanges": 0,
        "exactReviewedCandidateIdOnly": True,
        "nativeSourceIdUniqueRequired": True,
        "missingOnly": True,
        "singleNativePhoneRequired": True,
        "explicitPracticalTagsOnly": True,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    db = sqlite3.connect(args.database)
    db.execute("PRAGMA foreign_keys=ON")
    try:
        db.execute("BEGIN IMMEDIATE")
        summary = resolve_verified_osm_native_metadata(db, core.now_iso())
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print(json.dumps({"status": "pass", **summary}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
