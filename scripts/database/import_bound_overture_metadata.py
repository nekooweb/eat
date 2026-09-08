#!/usr/bin/env python3
"""Resolve missing telephone fields from already reviewed Overture basic bindings.

This stage performs no network requests and never changes identity. It reconnects a
reviewed `Overture Maps` source-basic binding to the exact retained Overture native ID
in `data/overture_area1_candidates.json`, then resolves only a currently-missing
`contact.telephone` value. Native phone text and the full retained Overture row remain
in provenance; no phone is inferred, reformatted, or copied by proximity/name matching.
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict

import master_import_core as core

DATA = core.DATA
RULE_VERSION = "bound-overture-metadata-v1"
ACQUISITION_METHOD = "bound_overture_metadata_overlay_v1"
BINDING_METHOD = "field_only_from_reviewed_basic_overture_binding"


def _reviewed_basic_overture(db) -> dict[tuple[str, str], str]:
    rows = {}
    for pid, provider_id, source_record_id in db.execute(
        """
        SELECT sb.place_id,sr.provider_id,sr.source_record_id
        FROM source_bindings sb
        JOIN source_records sr ON sr.source_record_id=sb.source_record_id
        WHERE sr.provider='Overture Maps'
          AND sr.acquisition_method='retained_repository_basic_match'
          AND sb.binding_state='reviewed'
        ORDER BY sb.place_id,sr.provider_id,sr.source_record_id
        """
    ):
        rows[(pid, str(provider_id))] = source_record_id
    return rows


def _retained_overture_rows() -> dict[str, dict]:
    doc = core.read_json(DATA / "overture_area1_candidates.json")
    rows = {}
    duplicates = set()
    for row in doc.get("rows") or []:
        native_id = str(row.get("overtureId") or "").strip()
        if not native_id:
            continue
        if native_id in rows:
            duplicates.add(native_id)
            continue
        rows[native_id] = row
    for native_id in duplicates:
        rows.pop(native_id, None)
    return rows


def _flatten_strings(value):
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        out = []
        for item in value:
            out.extend(_flatten_strings(item))
        return out
    if isinstance(value, dict):
        out = []
        for item in value.values():
            out.extend(_flatten_strings(item))
        return out
    return []


def _valid_phone(value: str):
    text = str(value or "").strip()
    if not text or len(text) > 80:
        return None
    # Overture phone payloads may contain formatting and country-code prefixes.
    # Validation checks digit count only; source-native formatting is preserved.
    digits = re.sub(r"\D", "", text)
    if len(digits) < 8 or len(digits) > 15:
        return None
    return text


def _phones(row: dict):
    out = []
    seen_digits = set()
    for raw in _flatten_strings(row.get("phones")):
        phone = _valid_phone(raw)
        if not phone:
            continue
        digits = re.sub(r"\D", "", phone)
        if digits in seen_digits:
            continue
        seen_digits.add(digits)
        out.append(phone)
    return out


def _source_url(row: dict):
    for raw in _flatten_strings(row.get("websites")):
        text = str(raw or "").strip()
        if text.startswith("https://") or text.startswith("http://"):
            return text
    return None


def import_bound_overture_metadata(db, stamp: str):
    reviewed = _reviewed_basic_overture(db)
    retained = _retained_overture_rows()
    known = {
        pid for pid, in db.execute(
            "SELECT place_id FROM field_resolutions WHERE field_key='contact.telephone' AND resolution_state='known'"
        )
    }

    native_places: dict[str, set[str]] = defaultdict(set)
    for (pid, provider_id) in reviewed:
        native_places[provider_id].add(pid)

    counts = Counter()
    resolved_places = set()

    for (pid, provider_id), basic_source_record_id in sorted(reviewed.items()):
        if len(native_places[provider_id]) != 1:
            counts["reviewed_native_id_collision"] += 1
            continue
        row = retained.get(provider_id)
        if row is None:
            counts["missing_retained_native_row"] += 1
            continue
        phones = _phones(row)
        if not phones:
            counts["no_valid_native_phone"] += 1
            continue
        counts["reviewed_rows_with_native_phone"] += 1
        if pid in known:
            counts["already_known_contact.telephone"] += 1
            continue

        observed = str(row.get("checkedAt") or stamp[:10])[:10]
        payload = {
            "googlePlaceId": pid,
            "reviewedBasicBinding": {
                "providerId": provider_id,
                "sourceRecordId": basic_source_record_id,
                "bindingState": "reviewed",
            },
            "overtureNativeId": provider_id,
            "nativePhones": phones,
            "retainedOvertureRow": row,
            "policy": {
                "identityChangeAllowed": False,
                "networkRequests": 0,
                "missingOnly": True,
                "exactNativeProviderIdRequired": True,
                "ruleVersion": RULE_VERSION,
            },
        }
        srid = core.source_record(
            db,
            "Overture Maps",
            f"bound-basic-metadata:{provider_id}",
            payload,
            _source_url(row),
            observed,
            ACQUISITION_METHOD,
            "retained Overture row already attached by a reviewed source-basic binding; field-only exact-provider-id reuse",
            stamp,
        )
        core.upsert_binding(
            db,
            pid,
            srid,
            "reviewed",
            BINDING_METHOD,
            "exact_reviewed_native_provider_id",
            None,
            stamp,
        )
        oid = core.observation(
            db,
            pid,
            srid,
            "contact.telephone",
            phones[0],
            "known",
            observed,
            rule=RULE_VERSION,
        )
        core.resolve(db, pid, "contact.telephone", oid, "known", "Overture Maps", stamp)
        db.execute(
            "UPDATE field_resolutions SET rule_version=? WHERE place_id=? AND field_key=? AND observation_id=?",
            (RULE_VERSION, pid, "contact.telephone", oid),
        )
        core.add_field(
            db,
            pid,
            srid,
            "contact.telephones.source",
            phones,
            "reviewed",
            "Overture Maps",
            observed,
            stamp,
            resolve_field=False,
        )
        known.add(pid)
        resolved_places.add(pid)
        counts["contact.telephone"] += 1

    return {
        "ruleVersion": RULE_VERSION,
        "reviewedBasicOvertureBindings": len(reviewed),
        "retainedUniqueOvertureRows": len(retained),
        "reviewedRowsWithNativePhone": counts["reviewed_rows_with_native_phone"],
        "resolvedPlaces": len(resolved_places),
        "resolvedFields": counts["contact.telephone"],
        "fieldCounts": {"contact.telephone": counts["contact.telephone"]} if counts["contact.telephone"] else {},
        "skipped": {
            key: value for key, value in sorted(counts.items())
            if key not in {"reviewed_rows_with_native_phone", "contact.telephone"} and value
        },
        "networkRequests": 0,
        "identityChanges": 0,
        "exactReviewedBindingOnly": True,
        "missingOnly": True,
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
        summary = import_bound_overture_metadata(db, core.now_iso())
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print(json.dumps({"status": "pass", **summary}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
