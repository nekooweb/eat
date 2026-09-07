#!/usr/bin/env python3
"""Import explicit practical facts from reviewed official-page web evidence.

No network requests are made here. Identity must already be publishable and non-conflict.
Only explicitly labeled boolean claims are accepted; import is missing-only and never
changes identity state.
"""
from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

import master_import_core as core

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
EVIDENCE_PATH = DATA / "official_practical_web_evidence.json"
RULE_VERSION = "official-practical-web-evidence-v1"
ACQUISITION_METHOD = "official_practical_web_evidence_v1"
BINDING_METHOD = "field_only_from_reviewed_official_page"
HASH_RE = re.compile(r"^[0-9a-f]{64}$")
ALLOWED_FIELDS = {
    "practical.card_available",
    "practical.parking_available",
    "practical.wifi_available",
    "practical.private_room_available",
    "practical.barrier_free",
    "practical.children_welcome",
    "practical.english_menu",
}


def valid_https(value) -> bool:
    return isinstance(value, str) and value.startswith("https://")


def import_evidence(db, id_set: set[str], conflict_places: set[str], stamp: str):
    if not EVIDENCE_PATH.exists():
        return {"inputRows": 0, "acceptedRows": 0, "resolvedFields": 0, "fieldCounts": {}}
    doc = core.read_json(EVIDENCE_PATH)
    policy = doc.get("policy") or {}
    if doc.get("ruleVersion") != RULE_VERSION:
        raise RuntimeError(f"unexpected official practical ruleVersion: {doc.get('ruleVersion')}")
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
            raise RuntimeError(f"official practical evidence policy mismatch: {key}")

    known = {(pid, key) for pid, key in db.execute("SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'")}
    counts = Counter()
    seen = set()
    accepted = 0
    identity_before = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))

    for row in doc.get("rows") or []:
        pid = str(row.get("googlePlaceId") or "").strip()
        if not pid or pid in seen:
            raise RuntimeError(f"invalid/duplicate official practical Place ID: {pid or '<missing>'}")
        seen.add(pid)
        if pid not in id_set:
            counts["outside_catalog"] += 1
            continue
        state_row = db.execute("SELECT identity_state FROM catalog_entries WHERE place_id=?", (pid,)).fetchone()
        state = state_row[0] if state_row else None
        if state not in ("verified", "source_matched"):
            counts["identity_not_publishable"] += 1
            continue
        if pid in conflict_places:
            counts["identity_conflict"] += 1
            continue

        identity_check = row.get("identityCheck") or {}
        if identity_check.get("accepted") is not True or identity_check.get("identityRule") != "retained_verified_official_page":
            counts["identity_check_invalid"] += 1
            continue
        evidence = row.get("webEvidence") or {}
        source_url = str(evidence.get("sourceUrl") or "").strip()
        final_url = str(evidence.get("finalUrl") or source_url).strip()
        content_hash = str(evidence.get("contentHash") or "").strip()
        retrieved_at = str(evidence.get("retrievedAt") or row.get("checkedAt") or stamp).strip()
        if not valid_https(source_url) or not valid_https(final_url):
            counts["invalid_https"] += 1
            continue
        if not HASH_RE.fullmatch(content_hash):
            counts["invalid_content_hash"] += 1
            continue

        claims = row.get("practicalClaims") or {}
        snippets = row.get("evidenceSnippets") or {}
        invalid_keys = set(claims) - ALLOWED_FIELDS
        if invalid_keys:
            raise RuntimeError(f"unsupported official practical fields: {sorted(invalid_keys)}")
        normalized = {}
        for field_key, value in claims.items():
            if not isinstance(value, bool):
                raise RuntimeError(f"official practical claim must be boolean: {pid} {field_key}")
            snippet = str(snippets.get(field_key) or "").strip()
            if not snippet or len(snippet) > 180:
                raise RuntimeError(f"official practical claim lacks bounded evidence snippet: {pid} {field_key}")
            normalized[field_key] = value
        if not normalized:
            counts["no_claims"] += 1
            continue

        provider_id = f"official-practical:{pid}:{core.sha256_text(final_url)[:18]}:{content_hash[:12]}"
        payload = {
            "placeId": pid,
            "identityCheck": identity_check,
            "webEvidence": evidence,
            "practicalClaims": normalized,
            "evidenceSnippets": {key: snippets[key] for key in normalized},
            "ruleVersion": RULE_VERSION,
        }
        srid = core.source_record(
            db, "official-web", provider_id, payload, final_url, retrieved_at,
            ACQUISITION_METHOD,
            "explicit labeled practical facts from a reviewed official restaurant page; robots respected; raw HTML not retained",
            stamp,
        )
        core.upsert_binding(
            db, pid, srid, "reviewed", BINDING_METHOD, "retained_verified_official_page", None, stamp
        )
        for field_key, value in sorted(normalized.items()):
            if (pid, field_key) in known:
                counts[f"already_known:{field_key}"] += 1
                continue
            oid = core.add_field(
                db, pid, srid, field_key, value, "reviewed", "official", retrieved_at, stamp,
                resolve_field=True,
            )
            if oid is not None:
                known.add((pid, field_key))
                counts[field_key] += 1
        accepted += 1

    identity_after = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    if identity_after != identity_before:
        raise RuntimeError("official practical importer changed identity state")
    return {
        "inputRows": len(doc.get("rows") or []),
        "acceptedRows": accepted,
        "resolvedFields": sum(counts[key] for key in ALLOWED_FIELDS),
        "fieldCounts": {key: counts[key] for key in sorted(ALLOWED_FIELDS) if counts[key]},
        "skipped": {key: value for key, value in sorted(counts.items()) if key not in ALLOWED_FIELDS},
        "ruleVersion": RULE_VERSION,
        "importTimeMissingOnly": True,
        "networkRequests": 0,
        "identityChanges": 0,
    }
