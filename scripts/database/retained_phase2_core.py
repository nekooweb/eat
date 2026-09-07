#!/usr/bin/env python3
"""Phase-2 retained evidence importers for the Eat SQLite master.

These inputs were previously generated as JS/JSON overlays. They are migrated as
versioned evidence/observations without changing current field resolutions. Provider
URLs are provenance, not identity primary keys; only native Hot Pepper IDs participate
in provider-ID collision discovery here.
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import master_import_core as core

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"


def read_assignment(path: Path, variable: str):
    text = path.read_text(encoding="utf-8")
    prefix = f"window.{variable}="
    start = text.find(prefix)
    if start < 0:
        raise RuntimeError(f"cannot find {variable} in {path}")
    value_start = start + len(prefix)
    end = text.find(";", value_start)
    if end < 0:
        raise RuntimeError(f"cannot parse {variable} in {path}")
    return json.loads(text[value_start:end])


def load_inputs():
    return {
        "source_facts": read_assignment(DATA / "source_facts.js", "SOURCE_FACTS"),
        "source_provenance": read_assignment(DATA / "source_provenance.js", "SOURCE_PROVENANCE"),
        "hotpepper_rich": read_assignment(DATA / "hotpepper_rich_metadata.js", "HOTPEPPER_RICH_METADATA"),
        "detail_evidence": core.read_json(DATA / "google_inventory_detail_evidence.json"),
    }


def native_identity_rows(inputs):
    """Return only native provider identity keys suitable for collision detection."""
    rows = []
    for row in inputs["hotpepper_rich"].get("rows", []):
        if row.get("googlePlaceId") and row.get("hotpepperId"):
            rows.append((f"Hot Pepper|{row['hotpepperId']}", row["googlePlaceId"]))
    for parent in inputs["source_facts"].get("rows", []):
        pid = parent.get("googlePlaceId")
        for fact in parent.get("sourceFacts", []):
            if fact.get("provider") == "Hot Pepper" and fact.get("hotpepperId") and pid:
                rows.append((f"Hot Pepper|{fact['hotpepperId']}", pid))
    return rows


def provenance_by_place_provider(doc):
    index = {}
    for row in doc.get("rows", []):
        pid = row.get("googlePlaceId")
        if not pid:
            continue
        by_provider = {}
        for link in row.get("sourceLinks", []):
            provider = link.get("provider")
            if provider:
                by_provider.setdefault(provider, []).append(link)
        index[pid] = by_provider
    return index


def synthetic_provider_id(kind: str, place_id: str, provider: str, payload) -> str:
    digest = core.sha256_text(core.canonical_json(payload))[:20]
    return f"retained:{kind}:{place_id}:{provider}:{digest}"


def source_fact_fields(fact):
    mapping = {
        "sourceName": "name",
        "address": "address",
        "cuisine": "cuisine",
        "tags": "tags",
        "lunch": "budget.lunch.range",
        "dinner": "budget.dinner.range",
        "dishes": "dishes.raw",
        "openingHoursRaw": "hours.raw",
        "closedDays": "closure.days.raw",
        "closedNote": "closure.raw",
        "hyakumeiten": "award.hyakumeiten",
        "hyakumeitenYear": "award.hyakumeiten_year",
        "hyakumeitenCategory": "award.hyakumeiten_category",
        "priceDerivations": "budget.derivation.raw",
        "hotpepperMatchConfidence": "binding.hotpepper_confidence.raw",
        "hotpepperMatchScore": "binding.hotpepper_score.raw",
    }
    for source_key, field_key in mapping.items():
        if source_key in fact and core.nonempty(fact.get(source_key)):
            yield field_key, fact.get(source_key)


def import_source_facts(db, doc, provenance_doc, conflict_keys, stamp):
    prov_index = provenance_by_place_provider(provenance_doc)
    counts = Counter()
    for parent in doc.get("rows", []):
        pid = parent.get("googlePlaceId")
        if not pid:
            continue
        for fact in parent.get("sourceFacts", []):
            provider = fact.get("provider") or "retained-source"
            links = prov_index.get(pid, {}).get(provider, [])
            source_url = links[0].get("url") if len(links) == 1 else None
            if provider == "Hot Pepper" and fact.get("hotpepperId"):
                provider_id = str(fact["hotpepperId"])
                source_key = f"Hot Pepper|{provider_id}"
                binding_state = "conflict" if source_key in conflict_keys else "candidate"
            else:
                provider_id = synthetic_provider_id("fact", pid, provider, fact)
                binding_state = "candidate"
            payload = {
                "placeId": pid,
                "sourceFact": fact,
                "retainedSourceLinks": links,
            }
            observed = fact.get("checkedAt") or doc.get("checkedAt") or stamp[:10]
            srid = core.source_record(
                db,
                provider,
                provider_id,
                payload,
                source_url,
                observed,
                "retained_source_fact_overlay",
                "retained provider-level fact overlay; resolution deferred",
                stamp,
            )
            core.upsert_binding(
                db,
                pid,
                srid,
                binding_state,
                "retained_exact_attached_source_fact",
                fact.get("hotpepperMatchConfidence"),
                None,
                stamp,
            )
            for field_key, value in source_fact_fields(fact):
                core.add_field(
                    db, pid, srid, field_key, value, binding_state,
                    provider, observed, stamp, resolve_field=False,
                )
            core.add_field(
                db, pid, srid, "source.claimed_fields", fact.get("claimedFields") or [],
                binding_state, provider, observed, stamp, resolve_field=False,
            )
            counts[binding_state] += 1
    return counts


def import_provenance(db, doc, stamp):
    counts = Counter()
    for row in doc.get("rows", []):
        pid = row.get("googlePlaceId")
        if not pid:
            continue
        for link in row.get("sourceLinks", []):
            provider = link.get("provider") or "retained-source"
            provider_id = synthetic_provider_id("provenance", pid, provider, link)
            observed = link.get("checkedAt") or row.get("sourceLastCheckedAt") or stamp[:10]
            srid = core.source_record(
                db,
                provider,
                provider_id,
                {"placeId": pid, "sourceLink": link},
                link.get("url"),
                observed,
                "retained_source_provenance_link",
                "public retained provenance link; URL is evidence, not identity key",
                stamp,
            )
            core.upsert_binding(
                db, pid, srid, "candidate", "retained_provenance_attachment", None, None, stamp,
            )
            core.add_field(
                db, pid, srid, "provenance.claimed_fields", link.get("fields") or [],
                "candidate", provider, observed, stamp, resolve_field=False,
            )
            if link.get("priceEvidenceClass"):
                core.add_field(
                    db, pid, srid, "provenance.price_evidence_class", link.get("priceEvidenceClass"),
                    "candidate", provider, observed, stamp, resolve_field=False,
                )
            counts[provider] += 1
    return counts


def rich_fields(row):
    mapping = {
        "hotpepperName": "rich.name",
        "nameKana": "rich.name_kana",
        "hotpepperAddress": "rich.address",
        "hotpepperLocation": "rich.coordinates",
        "hotpepperArea": "rich.area",
        "hotpepperGenre": "rich.cuisine_source",
        "hotpepperBudget": "rich.budget_source",
        "acceptedCreditCards": "practical.accepted_credit_cards",
        "specialFeatures": "practical.special_features",
        "mobileCouponAvailable": "practical.mobile_coupon_available",
        "hotpepperKtaiCouponRaw": "rich.mobile_coupon_raw",
        "nearestStation": "practical.nearest_station",
        "accessText": "practical.access",
        "mobileAccessText": "practical.mobile_access",
        "budgetMemo": "rich.budget_memo",
        "sourceCatch": "rich.catch",
        "lunchAvailable": "practical.lunch_available",
        "capacity": "practical.capacity",
        "partyCapacity": "practical.party_capacity",
        "hotpepperOpeningHoursText": "rich.hours_raw",
        "hotpepperClosedText": "rich.closure_raw",
        "amenities": "practical.amenities",
        "sourceServiceText": "practical.service_text_raw",
        "couponUrl": "provenance.coupon_url",
        "hotpepperReviewMode": "binding.hotpepper_review_mode",
    }
    for source_key, field_key in mapping.items():
        if source_key in row and core.nonempty(row.get(source_key)):
            yield field_key, row.get(source_key)


def import_hotpepper_rich(db, doc, conflict_keys, stamp):
    counts = Counter()
    for row in doc.get("rows", []):
        pid = row.get("googlePlaceId")
        hp_id = row.get("hotpepperId")
        if not pid or not hp_id:
            continue
        source_key = f"Hot Pepper|{hp_id}"
        binding_state = "conflict" if source_key in conflict_keys else "reviewed"
        observed = row.get("checkedAt") or doc.get("checkedAt") or stamp[:10]
        srid = core.source_record(
            db,
            "Hot Pepper",
            str(hp_id),
            row,
            row.get("hotpepperUrl"),
            observed,
            "retained_hotpepper_rich_metadata",
            "reviewed retained Hot Pepper rich metadata; core resolution unchanged",
            stamp,
        )
        core.upsert_binding(
            db, pid, srid, binding_state,
            f"retained_hotpepper_rich_{row.get('hotpepperReviewMode') or 'reviewed'}",
            "reviewed", None, stamp,
        )
        for field_key, value in rich_fields(row):
            core.add_field(
                db, pid, srid, field_key, value, binding_state,
                "Hot Pepper", observed, stamp, resolve_field=False,
            )
        counts[binding_state] += 1
    return counts


def import_detail_evidence(db, doc, stamp):
    counts = Counter()
    item_count = 0
    for row in doc.get("rows", []):
        pid = row.get("googlePlaceId")
        if not pid:
            continue
        for kind, field_key in (
            ("recommendedDishes", "dish.recommendation.evidence"),
            ("featuredDishes", "dish.featured.evidence"),
        ):
            for item in row.get(kind, []) or []:
                provider = item.get("provider") or "retained-detail-evidence"
                payload = {"placeId": pid, "kind": kind, "item": item}
                provider_id = synthetic_provider_id("dish", pid, provider, payload)
                observed = item.get("checkedAt") or doc.get("checkedAt") or stamp[:10]
                srid = core.source_record(
                    db,
                    provider,
                    provider_id,
                    payload,
                    item.get("sourceUrl"),
                    observed,
                    "retained_dish_evidence",
                    "retained source-backed dish evidence; semantic resolution deferred",
                    stamp,
                )
                core.upsert_binding(
                    db, pid, srid, "candidate", "retained_dish_evidence_attachment", None, None, stamp,
                )
                core.add_field(
                    db, pid, srid, field_key, item,
                    "candidate", provider, observed, stamp, resolve_field=False,
                )
                counts[kind] += 1
                item_count += 1
    counts["items"] = item_count
    return counts


def import_all(db, inputs, conflict_keys, stamp):
    fact_counts = import_source_facts(
        db, inputs["source_facts"], inputs["source_provenance"], conflict_keys, stamp
    )
    provenance_counts = import_provenance(db, inputs["source_provenance"], stamp)
    rich_counts = import_hotpepper_rich(db, inputs["hotpepper_rich"], conflict_keys, stamp)
    dish_counts = import_detail_evidence(db, inputs["detail_evidence"], stamp)
    return {
        "sourceFacts": dict(fact_counts),
        "provenanceLinks": dict(provenance_counts),
        "hotPepperRich": dict(rich_counts),
        "dishEvidence": dict(dish_counts),
    }
