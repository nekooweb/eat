#!/usr/bin/env python3
"""Import public-web field evidence for already source-backed restaurant identities.

The input is generated only after a public HTTPS page independently agrees with the
currently source-backed restaurant identity, from an already retained/reviewed official
page whose current page still matches that retained official name, or from the exact
current independent branch page already retained by a reviewed multi-source currentness
identity consensus. This importer performs no network requests. It never upgrades an
ID-only identity; it only adds field observations to an identity that is already
publishable and non-conflict in the SQLite master.

V2 allows multiple verified page snapshots for the same Place ID. Snapshot identity is
`(Place ID, final URL, content hash)`. Canonical fields are checked again at import time,
so a later snapshot can fill a still-missing field but can never replace an already-known
canonical resolution. V1 durable evidence remains readable during migration.
"""
from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

import master_import_core as core

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
EVIDENCE_PATH = DATA / "source_basic_web_field_evidence.json"
RULE_VERSION = "source-basic-web-field-evidence-v2"
LEGACY_RULE_VERSION = "source-basic-web-field-evidence-v1"
ACQUISITION_METHODS = {
    LEGACY_RULE_VERSION: "public_source_basic_web_field_evidence_v1",
    RULE_VERSION: "public_source_basic_web_field_evidence_v2",
}
BINDING_METHOD = "field_only_from_public_web_after_existing_identity_check"
HASH_RE = re.compile(r"^[0-9a-f]{64}$")
ALLOWED_IDENTITY_RULES = {
    "official_name_plus_structured_address",
    "official_name_plus_phone",
    "official_name_plus_geo",
    "retained_verified_official_page",
    "retained_multisource_currentness_page",
}
CANONICAL_EQUIVALENTS = {
    "address": ("address",),
    "hours.raw": ("hours.raw", "hours.reference.legacy", "hours.normalized.legacy"),
    "cuisine": ("cuisine",),
    "coordinates": ("coordinates",),
    "contact.telephone": ("contact.telephone",),
}


def valid_https(value) -> bool:
    return isinstance(value, str) and value.startswith("https://")


def normalized_cuisine(value):
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def normalized_hours(value):
    if isinstance(value, str) and value.strip():
        return value.strip()
    if isinstance(value, list):
        values = [str(x).strip() for x in value if str(x).strip()]
        return values or None
    return None


def normalized_geo(value):
    if not isinstance(value, dict):
        return None
    lat, lng = value.get("lat"), value.get("lng")
    if isinstance(lat, bool) or isinstance(lng, bool):
        return None
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return {"lat": float(lat), "lng": float(lng)}


def normalized_telephone(value):
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text or len(text) > 80:
        return None
    digits = re.sub(r"\D", "", text)
    if len(digits) < 8 or len(digits) > 15:
        return None
    # Preserve the public source's formatting for display/provenance. The digit
    # check is validation only; it does not invent a reformatted number.
    return text


def known_resolution_index(db) -> set[tuple[str, str]]:
    return {
        (pid, field_key)
        for pid, field_key in db.execute(
            "SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'"
        )
    }


def canonical_missing(known: set[tuple[str, str]], pid: str, field_key: str) -> bool:
    return not any((pid, key) in known for key in CANONICAL_EQUIVALENTS[field_key])


def import_evidence(db, id_set: set[str], conflict_places: set[str], stamp: str):
    if not EVIDENCE_PATH.exists():
        return {"inputRows": 0, "acceptedRows": 0, "resolvedFields": 0, "fieldCounts": {}}
    doc = core.read_json(EVIDENCE_PATH)
    doc_version = str(doc.get("ruleVersion") or "")
    if doc_version not in ACQUISITION_METHODS:
        raise RuntimeError(f"unexpected source-basic web evidence ruleVersion: {doc_version}")
    policy = doc.get("policy") or {}
    if policy.get("paidDataApiCalls") != 0:
        raise RuntimeError("source-basic web evidence must use zero paid data API calls")
    if policy.get("googleDisplayPayloadPersisted") is not False:
        raise RuntimeError("source-basic web evidence must not persist Google display payloads")
    if policy.get("sourceBackedIdentityRequired") is not True:
        raise RuntimeError("source-basic web evidence must require a pre-existing source-backed identity")
    if policy.get("rawHtmlPersisted") is not False or policy.get("robotsRespected") is not True:
        raise RuntimeError("source-basic web evidence access policy is incomplete")
    if doc_version == RULE_VERSION:
        if policy.get("multiSnapshotEvidenceByPlaceId") is not True:
            raise RuntimeError("v2 source-basic web evidence must allow multi-snapshot provenance")
        if policy.get("crossSnapshotClaimMerge") is not False:
            raise RuntimeError("v2 source-basic web evidence must forbid cross-snapshot claim merges")
        if policy.get("snapshotIdentity") != ["googlePlaceId", "finalUrl", "contentHash"]:
            raise RuntimeError("v2 source-basic web evidence snapshot identity is invalid")

    counts = Counter()
    accepted = 0
    seen_snapshots = set()
    known = known_resolution_index(db)
    acquisition_method = ACQUISITION_METHODS[doc_version]

    for row in doc.get("rows") or []:
        pid = str(row.get("googlePlaceId") or "").strip()
        if not pid:
            raise RuntimeError("source-basic web evidence row is missing Place ID")
        if pid not in id_set:
            counts["outside_catalog"] += 1
            continue
        state_row = db.execute(
            "SELECT identity_state FROM catalog_entries WHERE place_id=?", (pid,)
        ).fetchone()
        state = state_row[0] if state_row else None
        if state not in ("verified", "source_matched"):
            counts["identity_not_publishable"] += 1
            continue
        if pid in conflict_places:
            counts["identity_conflict"] += 1
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
        snapshot = (pid, final_url, content_hash)
        if snapshot in seen_snapshots:
            raise RuntimeError(f"duplicate source-basic web evidence snapshot: {snapshot}")
        seen_snapshots.add(snapshot)

        identity_check = row.get("identityCheck") or {}
        if identity_check.get("accepted") is not True:
            counts["identity_check_not_accepted"] += 1
            continue
        if identity_check.get("identityRule") not in ALLOWED_IDENTITY_RULES:
            counts["identity_rule_invalid"] += 1
            continue
        if identity_check.get("identityRule") == "retained_multisource_currentness_page":
            if identity_check.get("preExistingSourceMatchedIdentity") is not True:
                counts["currentness_identity_precondition_missing"] += 1
                continue
            if identity_check.get("freshNameAndLocationReconfirmed") is not True:
                counts["currentness_page_reconfirmation_missing"] += 1
                continue
            if identity_check.get("proximityOnlyBindingAllowed") is not False:
                counts["currentness_page_identity_policy_invalid"] += 1
                continue

        payload = {
            "placeId": pid,
            "sourceProvider": row.get("sourceProvider"),
            "sourceProviderId": row.get("sourceProviderId"),
            "missingBefore": row.get("missingBefore") or [],
            "identityCheck": identity_check,
            "webEvidence": evidence,
            "fieldClaims": row.get("fieldClaims") or {},
            "ruleVersion": doc_version,
        }
        provider_id = f"source-basic-web:{pid}:{core.sha256_text(final_url)[:18]}:{content_hash[:12]}"
        srid = core.source_record(
            db,
            "official-web",
            provider_id,
            payload,
            final_url,
            retrieved_at,
            acquisition_method,
            "public HTTPS page tied to an independently source-backed identity; robots respected; raw HTML not retained",
            stamp,
        )
        core.upsert_binding(
            db,
            pid,
            srid,
            "reviewed",
            BINDING_METHOD,
            identity_check.get("identityRule"),
            identity_check.get("minimumGeoDistanceMeters"),
            stamp,
        )

        claims = row.get("fieldClaims") or {}
        fields = []
        address = claims.get("address")
        if isinstance(address, str) and address.strip():
            fields.append(("address", address.strip(), True))
        hours = normalized_hours(claims.get("openingHoursRaw"))
        if hours is not None:
            fields.append(("hours.raw", hours, True))
        cuisine = normalized_cuisine(claims.get("cuisineNormalized"))
        if cuisine is not None:
            fields.append(("cuisine", cuisine, True))
        geo = normalized_geo(claims.get("geo"))
        if geo is not None:
            fields.append(("coordinates", geo, True))
        price = claims.get("priceRange")
        if isinstance(price, str) and price.strip():
            fields.append(("budget.raw.price_range", price.strip(), False))
        telephone = normalized_telephone(claims.get("telephone"))
        if telephone is not None:
            fields.append(("contact.telephone", telephone, True))

        for field_key, value, canonical in fields:
            if canonical and not canonical_missing(known, pid, field_key):
                counts[f"already_known_at_import:{field_key}"] += 1
                continue
            core.field_observation(
                db,
                pid,
                field_key,
                value,
                srid,
                "explicit" if canonical else "raw",
                1.0 if canonical else 0.75,
                stamp,
            )
            if canonical:
                core.resolve_missing(db, pid, field_key, value, srid, RULE_VERSION, stamp)
                for equivalent in CANONICAL_EQUIVALENTS[field_key]:
                    known.add((pid, equivalent))
                counts[field_key] += 1
            else:
                counts[field_key] += 1
        accepted += 1

    return {
        "inputRows": len(doc.get("rows") or []),
        "acceptedRows": accepted,
        "acceptedSnapshots": accepted,
        "uniqueSnapshotKeys": len(seen_snapshots),
        "resolvedFields": sum(counts[key] for key in CANONICAL_EQUIVALENTS),
        "fieldCounts": {key: counts[key] for key in CANONICAL_EQUIVALENTS if counts[key]},
        "skipped": {key: value for key, value in sorted(counts.items()) if key not in CANONICAL_EQUIVALENTS and not key.startswith("budget.raw")},
        "ruleVersion": doc_version,
        "currentRuleVersion": RULE_VERSION,
        "networkRequests": 0,
        "importTimeMissingOnly": True,
        "multiSnapshotCompatible": True,
        "telephoneCanonicalMissingOnly": True,
    }
