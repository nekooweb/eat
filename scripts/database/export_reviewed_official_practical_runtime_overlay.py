#!/usr/bin/env python3
"""Export already-reviewed official practical web evidence for public runtime.

Offline only. This applies the same evidence-policy checks as the SQLite importer and
removes any Place ID currently involved in the retained cross-source conflict model.
It never creates identity and never fetches a webpage.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import build_master
import import_official_practical_web_evidence as official
import master_import_core as core
import retained_osm_identity as osm_identity
import retained_phase2 as phase2

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
DEFAULT_OUTPUT = DATA / "reviewed_official_practical_runtime_overlay.json"
RULE_VERSION = "reviewed-official-practical-runtime-v1"
SOURCES = (
    (DATA / "official_practical_web_evidence.json", "official_landing"),
    (DATA / "official_practical_detail_web_evidence.json", "official_same_origin_detail"),
)


def _conflict_places(id_set: set[str]) -> tuple[set[str], set[str]]:
    basics = core.read_json(DATA / "google_basic_source_matches.json")
    hotpepper = core.read_json(DATA / "hotpepper_catalog_facts.json")
    phase2_inputs = phase2.load_inputs()
    osm_native_rows = osm_identity.native_identity_rows(id_set)
    _basic_conflicts, conflict_keys, all_sources = build_master.retained_conflict_index(
        basics, hotpepper, phase2_inputs, osm_native_rows
    )
    places = set().union(*(all_sources[key] for key in conflict_keys)) if conflict_keys else set()
    return conflict_keys, places


def _validate_doc(doc: dict, label: str) -> None:
    if doc.get("ruleVersion") != official.RULE_VERSION:
        raise RuntimeError(f"{label}: unexpected ruleVersion {doc.get('ruleVersion')!r}")
    policy = doc.get("policy") or {}
    expected = {
        "paidDataApiCalls": 0,
        "googleDisplayPayloadPersisted": False,
        "reviewedOfficialIdentityRequired": True,
        "explicitLabelRequired": True,
        "explicitPositiveOrNegativeRequired": True,
        "absenceNeverMeansFalse": True,
        "rawHtmlPersisted": False,
        "robotsRespected": True,
        "restrictedAccessBypass": False,
    }
    for key, value in expected.items():
        if policy.get(key) != value:
            raise RuntimeError(f"{label}: policy mismatch for {key}")


def build_overlay() -> dict:
    inventory = core.read_json(DATA / "area1_google_ids.json")
    ids = inventory.get("googlePlaceIds") or []
    id_set = set(ids)
    if len(ids) != 2804 or len(id_set) != 2804 or inventory.get("count") != 2804:
        raise RuntimeError("frozen catalog must contain exactly 2,804 unique Place IDs")
    conflict_keys, conflict_places = _conflict_places(id_set)

    rows = []
    counts = {
        "inputRows": 0,
        "acceptedRows": 0,
        "conflictDeferred": 0,
        "outsideCatalog": 0,
        "noClaims": 0,
    }
    field_counts: dict[str, int] = {}
    seen = set()

    for evidence_path, source_kind in SOURCES:
        if not evidence_path.exists():
            continue
        doc = core.read_json(evidence_path)
        _validate_doc(doc, source_kind)
        for row in doc.get("rows") or []:
            counts["inputRows"] += 1
            pid = str(row.get("googlePlaceId") or "").strip()
            evidence = row.get("webEvidence") or {}
            source_url = str(evidence.get("sourceUrl") or "").strip()
            final_url = str(evidence.get("finalUrl") or source_url).strip()
            content_hash = str(evidence.get("contentHash") or "").strip()
            snapshot = (pid, final_url, content_hash)
            if not pid or snapshot in seen:
                raise RuntimeError(f"invalid/duplicate official practical snapshot: {pid or '<missing>'} {final_url}")
            seen.add(snapshot)
            if pid not in id_set:
                counts["outsideCatalog"] += 1
                continue
            if pid in conflict_places:
                counts["conflictDeferred"] += 1
                continue
            identity_check = row.get("identityCheck") or {}
            if identity_check.get("accepted") is not True or identity_check.get("identityRule") != "retained_verified_official_page":
                raise RuntimeError(f"invalid official practical identity check: {pid}")
            if not official.valid_https(source_url) or not official.valid_https(final_url):
                raise RuntimeError(f"invalid official practical https URL: {pid}")
            if not official.HASH_RE.fullmatch(content_hash):
                raise RuntimeError(f"invalid official practical content hash: {pid}")

            claims = row.get("practicalClaims") or {}
            snippets = row.get("evidenceSnippets") or {}
            invalid_keys = set(claims) - official.ALLOWED_FIELDS
            if invalid_keys:
                raise RuntimeError(f"unsupported official practical fields: {sorted(invalid_keys)}")
            normalized = {}
            normalized_snippets = {}
            for field_key, value in claims.items():
                if not isinstance(value, bool):
                    raise RuntimeError(f"official practical claim must be boolean: {pid} {field_key}")
                snippet = str(snippets.get(field_key) or "").strip()
                if not snippet or len(snippet) > 180:
                    raise RuntimeError(f"official practical claim lacks bounded snippet: {pid} {field_key}")
                normalized[field_key] = value
                normalized_snippets[field_key] = snippet
                field_counts[field_key] = field_counts.get(field_key, 0) + 1
            if not normalized:
                counts["noClaims"] += 1
                continue
            rows.append({
                "googlePlaceId": pid,
                "provider": "official",
                "sourceKind": source_kind,
                "sourceUrl": source_url,
                "finalUrl": final_url,
                "checkedAt": str(evidence.get("retrievedAt") or row.get("checkedAt") or "").strip() or None,
                "contentHash": content_hash,
                "identityCheck": identity_check,
                "practicalClaims": normalized,
                "evidenceSnippets": normalized_snippets,
                "ruleVersion": official.RULE_VERSION,
            })
            counts["acceptedRows"] += 1

    rows.sort(key=lambda item: (item["googlePlaceId"], item["finalUrl"], item["contentHash"]))
    return {
        "schemaVersion": 1,
        "ruleVersion": RULE_VERSION,
        "checkedAt": inventory.get("checkedAt"),
        "policy": {
            "sourceBackedOnly": True,
            "reviewedOfficialIdentityRequired": True,
            "retainedConflictPlacesDeferred": True,
            "explicitBooleanClaimsOnly": True,
            "absenceNeverMeansFalse": True,
            "sameEvidencePolicyAsSQLiteImporter": True,
            "networkRequests": 0,
            "paidGoogleDataApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "identityChanges": 0,
            "missingOnlyAtRuntime": True,
        },
        "summary": {
            "catalogTotal": 2804,
            "retainedConflictSourceKeys": len(conflict_keys),
            "retainedConflictPlaces": len(conflict_places),
            **counts,
            "fieldCounts": dict(sorted(field_counts.items())),
        },
        "rows": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    payload = build_overlay()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
