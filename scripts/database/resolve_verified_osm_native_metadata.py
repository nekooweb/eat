#!/usr/bin/env python3
"""Resolve residual fields from exact reviewed historical OSM identity mappings.

The repository retains a historical verified mapping from native OSM source IDs
(`node/...`, `way/...`, `relation/...`) to frozen Google Place IDs. This resolver runs
late in the master build and may only fill still-missing fields for bindings that are
currently `reviewed` under `retained_verified_osm_identity_qc`.

No identity matching is performed here. The native provider ID must join exactly to the
current retained OSM candidate's `sourceId`, and any provider-ID collision is deferred.
Telephone is accepted only when the retained OSM row contains exactly one distinct valid
source-native number. Practical fields are limited to three unambiguous OSM tag values:
`payment:credit_cards=yes/no`, `internet_access=wlan/no`, and `wheelchair=yes/no`.
Ambiguous values such as `wheelchair=limited` remain provenance only.
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
RULE_VERSION = "verified-osm-native-metadata-v1"


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


def _candidate_index() -> tuple[dict[str, dict], set[str]]:
    rows = retained_osm.parse_osm_rows()
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        native_id = str(row.get("sourceId") or "").strip()
        if native_id:
            grouped[native_id].append(row)
    collisions = {native_id for native_id, values in grouped.items() if len(values) != 1}
    return {
        native_id: values[0]
        for native_id, values in grouped.items()
        if native_id not in collisions
    }, collisions


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
    candidates, candidate_collisions = _candidate_index()
    binding_collisions = _binding_collisions(reviewed_rows)
    known = _known_fields(db)

    counts = Counter()
    fields = Counter()
    changed_places = set()

    for pid, native_provider_id, source_record_id in reviewed_rows:
        pid = str(pid)
        native_provider_id = str(native_provider_id)
        if native_provider_id in binding_collisions:
            counts["reviewed_binding_provider_collision"] += 1
            continue
        if native_provider_id in candidate_collisions:
            counts["retained_candidate_provider_collision"] += 1
            continue
        candidate = candidates.get(native_provider_id)
        if candidate is None:
            counts["retained_candidate_missing"] += 1
            continue

        # Exact join only: the reviewed source record provider ID and the retained
        # candidate native source ID must be byte-for-byte identical.
        if str(candidate.get("sourceId") or "").strip() != native_provider_id:
            counts["native_provider_id_mismatch"] += 1
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

        # Preserve the exact native metadata snapshot as reviewed provenance even when
        # all mapped canonical fields were already known from higher-priority sources.
        provenance = {
            "sourceId": native_provider_id,
            "sourcePhones": raw_phones,
            "sourcePracticalTags": raw_practical,
            "policy": {
                "exactReviewedNativeIdOnly": True,
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
        "exactReviewedNativeIdOnly": True,
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
