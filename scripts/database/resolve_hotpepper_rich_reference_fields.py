#!/usr/bin/env python3
"""Resolve additional reviewed Hot Pepper rich reference/practical fields.

All source observations already exist in the SQLite master via retained_phase2_core.
This pass creates no source records, performs no network requests, requires the same
unique reviewed Hot Pepper base binding, skips identity conflicts, and resolves fields
missing-only. It intentionally does not promote provider genre/area/catch copy into
canonical cuisine or identity fields.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
from collections import Counter
from pathlib import Path

import import_hotpepper_rich_metadata as rich
import master_import_core as core

RULE_VERSION = "hotpepper-rich-reference-v1"
HTTPS_RE = re.compile(r"^https://[^\s]+$", re.I)

FIELD_SPECS = (
    # raw field key, output field key, validator label
    ("practical.capacity", "practical.capacity", "positive_int"),
    ("practical.party_capacity", "practical.party_capacity", "positive_int"),
    ("practical.accepted_credit_cards", "practical.accepted_credit_cards", "cards"),
    ("practical.mobile_coupon_available", "practical.mobile_coupon_available", "bool"),
    ("rich.name_kana", "name.kana", "short_text"),
    ("practical.mobile_access", "access.mobile_reference", "text"),
    ("provenance.coupon_url", "provenance.coupon_url", "https"),
    ("rich.budget_memo", "budget.memo", "text"),
)


def valid_value(value, kind: str):
    if kind == "positive_int":
        return value if isinstance(value, int) and not isinstance(value, bool) and 0 < value <= 10000 else None
    if kind == "bool":
        return value if isinstance(value, bool) else None
    if kind == "cards":
        if not isinstance(value, list) or not value:
            return None
        cleaned = []
        seen = set()
        for item in value:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            code = str(item.get("code") or "").strip()
            if not name:
                continue
            key = (code, name)
            if key in seen:
                continue
            seen.add(key)
            cleaned.append({k: v for k, v in (("code", code), ("name", name)) if v})
        return cleaned or None
    if kind in {"short_text", "text"}:
        if not isinstance(value, str):
            return None
        text = " ".join(value.split()).strip()
        limit = 240 if kind == "short_text" else 1200
        return text if text and len(text) <= limit else None
    if kind == "https":
        if not isinstance(value, str):
            return None
        text = value.strip()
        return text if len(text) <= 500 and HTTPS_RE.match(text) else None
    return None


def resolve_missing(db, known, pid, srid, field_key, value, observed, stamp, parent_oid):
    if (pid, field_key) in known:
        return False
    oid = core.observation(
        db,
        pid,
        srid,
        field_key,
        value,
        "known",
        observed,
        derived_from=parent_oid,
        rule=RULE_VERSION,
    )
    core.resolve(db, pid, field_key, oid, "known", "Hot Pepper", stamp)
    selected = db.execute(
        "SELECT observation_id,resolution_state FROM field_resolutions WHERE place_id=? AND field_key=?",
        (pid, field_key),
    ).fetchone()
    if selected and selected[0] == oid and selected[1] == "known":
        db.execute(
            "UPDATE field_resolutions SET rule_version=? WHERE place_id=? AND field_key=? AND observation_id=?",
            (RULE_VERSION, pid, field_key, oid),
        )
        known.add((pid, field_key))
        return True
    return False


def resolve_fields(db: sqlite3.Connection, id_set: set[str], conflict_places: set[str], stamp: str):
    doc = rich.load_rich_document()
    base = rich.reviewed_base_bindings(db)
    sources = rich.retained_rich_sources(db)
    known = rich.known_resolution_set(db)
    identity_before = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    counts = Counter()
    skipped = Counter()

    for row in doc.get("rows") or []:
        pid = str(row.get("googlePlaceId") or "").strip()
        hp_id = str(row.get("hotpepperId") or "").strip()
        if not pid or pid not in id_set or not hp_id:
            skipped["invalid_identity_key"] += 1
            continue
        if base.get(hp_id, set()) != {pid}:
            skipped["base_binding_not_unique_reviewed_match"] += 1
            continue
        if pid in conflict_places:
            skipped["identity_conflict"] += 1
            continue
        source_rows = sources.get((pid, hp_id), [])
        if len(source_rows) != 1:
            skipped["retained_rich_source_not_unique"] += 1
            continue
        srid, source_observed = source_rows[0]
        observed = str(row.get("checkedAt") or source_observed or doc.get("checkedAt") or stamp[:10])[:10]

        for raw_field, output_field, kind in FIELD_SPECS:
            raw_oid, raw_value, raw_observed = rich._existing_observation(db, pid, srid, raw_field)
            if raw_oid is None:
                skipped[f"raw_missing:{raw_field}"] += 1
                continue
            value = valid_value(raw_value, kind)
            if value is None:
                skipped[f"invalid:{raw_field}"] += 1
                continue
            if (pid, output_field) in known:
                skipped[f"already_known:{output_field}"] += 1
                continue
            if resolve_missing(
                db, known, pid, srid, output_field, value,
                raw_observed or observed, stamp, raw_oid
            ):
                counts[output_field] += 1
            else:
                skipped[f"higher_priority_preserved:{output_field}"] += 1

    identity_after = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    if identity_after != identity_before:
        raise RuntimeError("Hot Pepper rich reference resolver changed identity state")

    return {
        "ruleVersion": RULE_VERSION,
        "richRows": len(doc.get("rows") or []),
        "resolvedFields": sum(counts.values()),
        "fieldCounts": dict(sorted(counts.items())),
        "skipped": {key: value for key, value in sorted(skipped.items()) if value},
        "networkRequests": 0,
        "newSourceRecords": 0,
        "identityChanges": 0,
        "providerClassificationPromotedToCanonicalCuisine": False,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    db = sqlite3.connect(args.database)
    db.execute("PRAGMA foreign_keys=ON")
    try:
        id_set = {str(row[0]) for row in db.execute("SELECT place_id FROM catalog_entries")}
        conflict_places = {
            str(row[0]) for row in db.execute(
                "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
            )
        }
        db.execute("BEGIN IMMEDIATE")
        summary = resolve_fields(db, id_set, conflict_places, core.now_iso())
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print(json.dumps({"status": "pass", **summary}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
