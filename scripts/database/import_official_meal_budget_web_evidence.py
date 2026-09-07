#!/usr/bin/env python3
"""Import explicit official-page lunch/dinner budget evidence into the SQLite master.

Evidence must come from a reviewed retained official identity, pass current-page identity
reconfirmation, carry an HTTPS URL/content hash, and contain a finite explicitly labeled
meal budget range. The importer is network-free, never changes identity, keeps every
snapshot as an observation, and resolves canonical budgets missing-only at import time.
When several snapshots exist, the newest evidence is processed first.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import master_import_core as core

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
EVIDENCE_PATH = DATA / "official_meal_budget_web_evidence.json"
RULE_VERSION = "official-meal-budget-web-evidence-v1"
PARSER_VERSION = "official-meal-budget-web-v1"
ACQUISITION_METHOD = "public_official_meal_budget_evidence_v1"
BINDING_METHOD = "field_only_from_reviewed_official_meal_budget_page"
HASH_RE = re.compile(r"^[0-9a-f]{64}$")
TARGETS = {
    "lunch": "budget.lunch.range",
    "dinner": "budget.dinner.range",
}
EQUIVALENTS = {
    "lunch": ("budget.lunch.range", "budget.lunch.legacy_range"),
    "dinner": ("budget.dinner.range", "budget.dinner.legacy_range"),
}
ALLOWED_PAGE_MATCH_METHODS = {"jsonld_business_name", "strong_page_title"}


def valid_https(value) -> bool:
    return isinstance(value, str) and value.startswith("https://")


def known_index(db) -> set[tuple[str, str]]:
    return {
        (pid, key)
        for pid, key in db.execute(
            "SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'"
        )
    }


def reviewed_official_places(db) -> set[str]:
    return {
        pid for pid, in db.execute(
            """SELECT DISTINCT sb.place_id
               FROM source_bindings sb
               JOIN source_records sr ON sr.source_record_id=sb.source_record_id
               WHERE sr.acquisition_method='retained_verified_official_identity_index'
                 AND sb.binding_state='reviewed'"""
        )
    }


def missing(known: set[tuple[str, str]], pid: str, meal: str) -> bool:
    return not any((pid, key) in known for key in EQUIVALENTS[meal])


def valid_claim(claim, meal: str) -> bool:
    if not isinstance(claim, dict):
        return False
    low, high = claim.get("lower"), claim.get("upper")
    if isinstance(low, bool) or isinstance(high, bool):
        return False
    if not isinstance(low, int) or not isinstance(high, int):
        return False
    if not (100 <= low <= high <= 200000):
        return False
    return (
        claim.get("currency") == "JPY"
        and claim.get("lowerInclusive") is True
        and claim.get("upperInclusive") is True
        and claim.get("evidenceType") == "explicit_official_meal_budget_range"
        and claim.get("meal") == meal
        and isinstance(claim.get("rawText"), str)
        and 0 < len(claim["rawText"].strip()) <= 180
    )


def validate_document(doc: dict) -> None:
    if doc.get("ruleVersion") != RULE_VERSION or doc.get("parserVersion") != PARSER_VERSION:
        raise RuntimeError("unexpected official meal-budget evidence version")
    policy = doc.get("policy") or {}
    required = {
        "paidDataApiCalls": 0,
        "googleDisplayPayloadPersisted": False,
        "reviewedOfficialIdentityRequired": True,
        "explicitMealLabelRequired": True,
        "explicitBudgetCueRequired": True,
        "finiteRangeOnly": True,
        "genericPriceRangePromoted": False,
        "rawHtmlPersisted": False,
        "robotsRespected": True,
        "restrictedAccessBypass": False,
    }
    for key, expected in required.items():
        if policy.get(key) != expected:
            raise RuntimeError(f"official meal-budget evidence policy mismatch: {key}")


def import_evidence(db, id_set: set[str], conflict_places: set[str], stamp: str):
    if not EVIDENCE_PATH.exists():
        return {
            "inputSnapshots": 0, "acceptedSnapshots": 0, "resolvedFields": 0,
            "fieldCounts": {}, "networkRequests": 0, "identityChanges": 0,
        }
    doc = core.read_json(EVIDENCE_PATH)
    validate_document(doc)
    reviewed_official = reviewed_official_places(db)
    known = known_index(db)
    identity_before = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    counts = Counter()
    seen_snapshots = set()

    rows = sorted(
        doc.get("rows") or [],
        key=lambda row: (
            str((row.get("webEvidence") or {}).get("retrievedAt") or row.get("checkedAt") or ""),
            str(row.get("googlePlaceId") or ""),
        ),
        reverse=True,
    )
    for row in rows:
        pid = str(row.get("googlePlaceId") or "").strip()
        evidence = row.get("webEvidence") or {}
        source_url = str(evidence.get("sourceUrl") or "").strip()
        final_url = str(evidence.get("finalUrl") or source_url).strip()
        content_hash = str(evidence.get("contentHash") or "").strip()
        snapshot_key = (pid, final_url, content_hash)
        if not pid or snapshot_key in seen_snapshots:
            raise RuntimeError(f"invalid/duplicate official meal-budget evidence snapshot: {snapshot_key}")
        seen_snapshots.add(snapshot_key)
        if pid not in id_set:
            counts["outside_catalog"] += 1
            continue
        state = identity_before.get(pid)
        if state not in ("verified", "source_matched"):
            counts["identity_not_publishable"] += 1
            continue
        if pid in conflict_places:
            counts["identity_conflict"] += 1
            continue
        if pid not in reviewed_official:
            counts["official_binding_not_reviewed"] += 1
            continue
        if not valid_https(source_url) or not valid_https(final_url):
            counts["invalid_https"] += 1
            continue
        if not HASH_RE.fullmatch(content_hash):
            counts["invalid_content_hash"] += 1
            continue
        if evidence.get("parserVersion") != PARSER_VERSION or evidence.get("rawHtmlPersisted") is not False:
            counts["invalid_web_evidence_contract"] += 1
            continue

        identity_check = row.get("identityCheck") or {}
        if (
            identity_check.get("accepted") is not True
            or identity_check.get("identityRule") != "retained_verified_official_page"
            or identity_check.get("retainedOfficialBindingReviewed") is not True
            or identity_check.get("pageNameMatchMethod") not in ALLOWED_PAGE_MATCH_METHODS
        ):
            counts["identity_check_invalid"] += 1
            continue

        claims = row.get("budgetClaims") or {}
        snippets = row.get("evidenceSnippets") or {}
        valid_claims = {}
        for meal in TARGETS:
            claim = claims.get(meal)
            if claim is None:
                continue
            if not valid_claim(claim, meal):
                counts[f"invalid_{meal}_claim"] += 1
                continue
            snippet = snippets.get(meal)
            if not isinstance(snippet, str) or not snippet.strip() or len(snippet) > 180:
                counts[f"invalid_{meal}_snippet"] += 1
                continue
            valid_claims[meal] = claim
        if not valid_claims:
            counts["no_valid_claim"] += 1
            continue

        retrieved_at = str(evidence.get("retrievedAt") or row.get("checkedAt") or stamp).strip()
        payload = {
            "placeId": pid,
            "sourceProvider": "official",
            "sourceProviderId": row.get("sourceProviderId"),
            "identityCheck": identity_check,
            "webEvidence": evidence,
            "budgetClaims": valid_claims,
            "evidenceSnippets": {meal: snippets[meal] for meal in valid_claims},
            "ruleVersion": RULE_VERSION,
        }
        provider_id = (
            f"official-meal-budget:{pid}:"
            f"{core.sha256_text(final_url)[:16]}:{content_hash[:16]}"
        )
        srid = core.source_record(
            db,
            "official-web",
            provider_id,
            payload,
            final_url,
            retrieved_at,
            ACQUISITION_METHOD,
            "explicit meal-budget range from current reviewed official HTTPS page; robots respected; raw HTML not retained",
            stamp,
        )
        core.upsert_binding(
            db,
            pid,
            srid,
            "reviewed",
            BINDING_METHOD,
            "retained_verified_official_page",
            None,
            stamp,
        )

        for meal, claim in valid_claims.items():
            field_key = TARGETS[meal]
            oid = core.observation(
                db,
                pid,
                srid,
                field_key,
                claim,
                "known",
                retrieved_at,
                rule=RULE_VERSION,
            )
            if missing(known, pid, meal):
                core.resolve(db, pid, field_key, oid, "known", "official", stamp)
                db.execute(
                    "UPDATE field_resolutions SET rule_version=? WHERE place_id=? AND field_key=? AND observation_id=?",
                    (RULE_VERSION, pid, field_key, oid),
                )
                known.add((pid, field_key))
                counts[field_key] += 1
            else:
                counts[f"already_known_at_import:{field_key}"] += 1
        counts["accepted_snapshots"] += 1

    identity_after = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    if identity_after != identity_before:
        raise RuntimeError("official meal-budget evidence importer changed identity state")

    return {
        "ruleVersion": RULE_VERSION,
        "inputSnapshots": len(rows),
        "acceptedSnapshots": counts["accepted_snapshots"],
        "resolvedFields": sum(counts[field] for field in TARGETS.values()),
        "fieldCounts": {
            field: counts[field] for field in TARGETS.values() if counts[field]
        },
        "skipped": {
            key: value for key, value in sorted(counts.items())
            if key not in set(TARGETS.values()) | {"accepted_snapshots"} and value
        },
        "networkRequests": 0,
        "identityChanges": 0,
        "importTimeMissingOnly": True,
    }
