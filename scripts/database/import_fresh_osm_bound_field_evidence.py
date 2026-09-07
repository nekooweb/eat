#!/usr/bin/env python3
"""Import durable fresh OSM field evidence for existing reviewed native bindings only.

This importer is network-free, identity-neutral and missing-only. It rechecks the exact
reviewed OpenStreetMap native-ID binding at import time so stale evidence cannot create
or upgrade identity bindings.
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

import master_import_core as core
from build_fresh_osm_bound_field_evidence import canonical_osm_id

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
DEFAULT_EVIDENCE = DATA / "fresh_osm_bound_field_evidence.json"
RULE_VERSION = "fresh-osm-bound-field-evidence-v2"
ACQUISITION_METHOD = "fresh_osm_reviewed_bound_field_evidence"
BINDING_METHOD = "field_only_existing_reviewed_native_osm_binding"
EQUIVALENTS = {
    "address": ("address",),
    "coordinates": ("coordinates",),
    "cuisine": ("cuisine",),
    "hours.raw": ("hours.raw", "hours.reference.legacy", "hours.normalized.legacy"),
}
SUPPORTED = set(EQUIVALENTS)


def _known_fields(db) -> set[tuple[str, str]]:
    return {
        (pid, key)
        for pid, key in db.execute(
            "SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'"
        )
    }


def _missing(known: set[tuple[str, str]], pid: str, key: str) -> bool:
    return not any((pid, alt) in known for alt in EQUIVALENTS.get(key, (key,)))


def _reviewed_native_index(db) -> tuple[dict[str, set[str]], dict[str, str]]:
    native_places: dict[str, set[str]] = defaultdict(set)
    identity = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    for pid, provider_id in db.execute(
        """
        SELECT sb.place_id,sr.provider_id
        FROM source_bindings sb
        JOIN source_records sr ON sr.source_record_id=sb.source_record_id
        WHERE sr.provider='OpenStreetMap' AND sb.binding_state='reviewed'
        """
    ):
        native = canonical_osm_id(provider_id)
        if native:
            native_places[native].add(str(pid))
    return native_places, identity


def import_evidence(db, id_set: set[str], conflict_places: set[str], stamp: str, evidence_path: Path = DEFAULT_EVIDENCE):
    if not evidence_path.exists():
        return {
            "ruleVersion": RULE_VERSION, "inputRows": 0, "acceptedRows": 0,
            "resolvedFields": 0, "fieldCounts": {}, "skipped": {"evidence_file_missing": 1},
            "networkRequests": 0, "identityChanges": 0, "importTimeMissingOnly": True,
        }
    doc = json.loads(evidence_path.read_text(encoding="utf-8"))
    if doc.get("ruleVersion") != RULE_VERSION:
        raise RuntimeError("unexpected fresh OSM bound evidence ruleVersion")
    policy = doc.get("policy") or {}
    if policy.get("exactReviewedBindingOnly") is not True or policy.get("missingOnly") is not True:
        raise RuntimeError("fresh OSM bound evidence policy boundary invalid")
    if policy.get("identityChanges") != 0 or policy.get("googleHistoricalDisplayContentDurable") is not False:
        raise RuntimeError("fresh OSM bound evidence identity/Google boundary invalid")

    native_places, identity = _reviewed_native_index(db)
    known = _known_fields(db)
    counts = Counter()
    fields = Counter()
    accepted_places = set()

    for row in doc.get("rows") or []:
        pid = str(row.get("googlePlaceId") or "").strip()
        native = canonical_osm_id(row.get("providerId"))
        if not pid or pid not in id_set:
            counts["outside_catalog"] += 1
            continue
        if pid in conflict_places or identity.get(pid) not in {"verified", "source_matched"}:
            counts["identity_not_publishable"] += 1
            continue
        if not native or native_places.get(native) != {pid}:
            counts["reviewed_native_binding_mismatch"] += 1
            continue
        if row.get("provider") != "OpenStreetMap":
            counts["provider_mismatch"] += 1
            continue
        source_url = str(row.get("sourceUrl") or "").strip()
        if source_url != f"https://www.openstreetmap.org/{native}":
            counts["source_url_mismatch"] += 1
            continue
        values = row.get("fields") or {}
        if not isinstance(values, dict) or any(key not in SUPPORTED for key in values):
            counts["unsupported_field"] += 1
            continue

        payload = {
            "googlePlaceId": pid,
            "osmNativeSourceId": native,
            "fields": values,
            "retrievedAt": row.get("retrievedAt"),
            "acquisitionContentHash": row.get("acquisitionContentHash"),
            "evidenceContentHash": row.get("evidenceContentHash"),
            "provenance": row.get("provenance") or {},
            "policy": {
                "identityChangeAllowed": False,
                "networkRequests": 0,
                "missingOnly": True,
                "exactReviewedBindingOnly": True,
                "ruleVersion": RULE_VERSION,
            },
        }
        observed = str(row.get("retrievedAt") or stamp)[:10]
        srid = core.source_record(
            db,
            "OpenStreetMapFreshReviewed",
            native,
            payload,
            source_url,
            observed,
            ACQUISITION_METHOD,
            "fresh public OSM fields reused only after exact existing reviewed native binding",
            stamp,
        )
        core.upsert_binding(
            db, pid, srid, "reviewed", BINDING_METHOD,
            "field_only_not_identity", None, stamp,
        )

        row_resolved = 0
        for key, value in sorted(values.items()):
            if not core.nonempty(value):
                continue
            if not _missing(known, pid, key):
                counts[f"already_known_{key}"] += 1
                continue
            oid = core.observation(db, pid, srid, key, value, "known", observed, rule=RULE_VERSION)
            core.resolve(db, pid, key, oid, "known", "OpenStreetMap", stamp)
            db.execute(
                "UPDATE field_resolutions SET rule_version=? WHERE place_id=? AND field_key=? AND observation_id=?",
                (RULE_VERSION, pid, key, oid),
            )
            known.add((pid, key))
            fields[key] += 1
            row_resolved += 1
        core.add_field(
            db, pid, srid, "provenance.fresh_osm_reviewed_binding",
            {"sourceId": native, "retrievedAt": row.get("retrievedAt"), "evidenceContentHash": row.get("evidenceContentHash")},
            "reviewed", "OpenStreetMap", observed, stamp, resolve_field=False,
        )
        counts["accepted_rows"] += 1
        if row_resolved:
            accepted_places.add(pid)

    return {
        "ruleVersion": RULE_VERSION,
        "inputRows": len(doc.get("rows") or []),
        "acceptedRows": counts["accepted_rows"],
        "resolvedPlaces": len(accepted_places),
        "resolvedFields": sum(fields.values()),
        "fieldCounts": dict(sorted(fields.items())),
        "skipped": {k: v for k, v in sorted(counts.items()) if k != "accepted_rows" and v},
        "networkRequests": 0,
        "identityChanges": 0,
        "importTimeMissingOnly": True,
        "exactReviewedBindingOnly": True,
    }


def main() -> None:
    import argparse
    import sqlite3

    ap = argparse.ArgumentParser()
    ap.add_argument("database", type=Path)
    ap.add_argument("--evidence", type=Path, default=DEFAULT_EVIDENCE)
    args = ap.parse_args()
    db = sqlite3.connect(args.database)
    db.execute("PRAGMA foreign_keys=ON")
    try:
        ids = {row[0] for row in db.execute("SELECT place_id FROM catalog_entries")}
        conflicts = {row[0] for row in db.execute("SELECT place_id FROM catalog_entries WHERE identity_state='conflict'")}
        db.execute("BEGIN IMMEDIATE")
        summary = import_evidence(db, ids, conflicts, core.now_iso(), args.evidence)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print(json.dumps({"status": "pass", **summary}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
