#!/usr/bin/env python3
"""Import public-web field evidence for already source-backed restaurant identities.

The input is generated only after a public HTTPS page independently agrees with the
currently source-backed restaurant identity, or from an already retained/reviewed
official-page identity whose current page still matches that retained official name.
This importer performs no network requests. It never upgrades an ID-only identity; it
only adds field observations to an identity that is already publishable and non-conflict
in the SQLite master.
"""
from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

import master_import_core as core

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
EVIDENCE_PATH = DATA / "source_basic_web_field_evidence.json"
RULE_VERSION = "source-basic-web-field-evidence-v1"
ACQUISITION_METHOD = "public_source_basic_web_field_evidence_v1"
BINDING_METHOD = "field_only_from_public_web_after_existing_identity_check"
HASH_RE = re.compile(r"^[0-9a-f]{64}$")
ALLOWED_IDENTITY_RULES = {
    "official_name_plus_structured_address",
    "official_name_plus_phone",
    "official_name_plus_geo",
    "retained_verified_official_page",
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


def import_evidence(db, id_set: set[str], conflict_places: set[str], stamp: str):
    if not EVIDENCE_PATH.exists():
        return {"inputRows": 0, "acceptedRows": 0, "resolvedFields": 0, "fieldCounts": {}}
    doc = core.read_json(EVIDENCE_PATH)
    policy = doc.get("policy") or {}
    if doc.get("ruleVersion") != RULE_VERSION:
        raise RuntimeError(f"unexpected source-basic web evidence ruleVersion: {doc.get('ruleVersion')}")
    if policy.get("paidDataApiCalls") != 0:
        raise RuntimeError("source-basic web evidence must use zero paid data API calls")
    if policy.get("googleDisplayPayloadPersisted") is not False:
        raise RuntimeError("source-basic web evidence must not persist Google display payloads")
    if policy.get("sourceBackedIdentityRequired") is not True:
        raise RuntimeError("source-basic web evidence must require a pre-existing source-backed identity")
    if policy.get("rawHtmlPersisted") is not False or policy.get("robotsRespected") is not True:
        raise RuntimeError("source-basic web evidence access policy is incomplete")

    counts = Counter()
    accepted = 0
    seen = set()
    for row in doc.get("rows") or []:
        pid = str(row.get("googlePlaceId") or "").strip()
        if not pid or pid in seen:
            raise RuntimeError(f"invalid/duplicate source-basic web evidence Place ID: {pid or '<missing>'}")
        seen.add(pid)
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
        identity_check = row.get("identityCheck") or {}
        if identity_check.get("accepted") is not True:
            counts["identity_check_not_accepted"] += 1
            continue
        if identity_check.get("identityRule") not in ALLOWED_IDENTITY_RULES:
            counts["identity_rule_invalid"] += 1
            continue

        payload = {
            "placeId": pid,
            "sourceProvider": row.get("sourceProvider"),
            "sourceProviderId": row.get("sourceProviderId"),
            "missingBefore": row.get("missingBefore") or [],
            "identityCheck": identity_check,
            "webEvidence": evidence,
            "fieldClaims": row.get("fieldClaims") or {},
            "ruleVersion": RULE_VERSION,
        }
        provider_id = f"source-basic-web:{pid}:{core.sha256_text(final_url)[:18]}:{content_hash[:12]}"
        srid = core.source_record(
            db,
            "official-web",
            provider_id,
            payload,
            final_url,
            retrieved_at,
            ACQUISITION_METHOD,
            "public HTTPS page tied to an independently source-backed/reviewed official identity; robots respected; raw HTML not retained",
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
        if cuisine:
            fields.append(("cuisine", cuisine, True))
        geo = normalized_geo(claims.get("geo"))
        if geo:
            fields.append(("coordinates", geo, True))
        price_range = claims.get("priceRange")
        if isinstance(price_range, str) and price_range.strip():
            fields.append(("budget.web_price_range_raw", price_range.strip(), False))
        telephone = claims.get("telephone")
        if isinstance(telephone, str) and telephone.strip():
            fields.append(("contact.telephone", telephone.strip(), False))
        fields.append(("source_websites", [final_url], False))
        fields.append(("provenance.public_web_content_hash", content_hash, False))

        for field_key, value, canonical in fields:
            oid = core.add_field(
                db,
                pid,
                srid,
                field_key,
                value,
                "reviewed",
                "official" if canonical else "official-web",
                retrieved_at,
                stamp,
                resolve_field=canonical,
            )
            if canonical and oid is not None:
                counts[field_key] += 1
        accepted += 1

    return {
        "inputRows": len(doc.get("rows") or []),
        "acceptedRows": accepted,
        "resolvedFields": sum(counts[key] for key in ("address", "hours.raw", "cuisine", "coordinates")),
        "fieldCounts": {
            key: counts[key]
            for key in ("address", "hours.raw", "cuisine", "coordinates")
            if counts[key]
        },
        "skipped": {
            key: value for key, value in sorted(counts.items())
            if key not in {"address", "hours.raw", "cuisine", "coordinates"}
        },
        "ruleVersion": RULE_VERSION,
    }
