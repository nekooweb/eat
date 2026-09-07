#!/usr/bin/env python3
"""Resolve explicit Hot Pepper source-fact budget ranges through reviewed native IDs.

This resolver performs no network requests and never changes identity. A retained
Hot Pepper source-fact observation remains candidate evidence unless its native
Hot Pepper ID is already uniquely reviewed in the base Hot Pepper artifact for the
same frozen Place ID. Only explicitly claimed finite lunch/dinner ranges carrying
`explicit_range` evidence are eligible, and only when the canonical budget is missing.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

import master_import_core as core

RULE_VERSION = "hotpepper-source-fact-budget-v1"
ACQUISITION_METHOD = "derived_hotpepper_source_fact_budget_v1"
BINDING_METHOD = "field_only_from_reviewed_hotpepper_native_id"
TARGETS = {
    "budget.lunch.range": "lunchBudget",
    "budget.dinner.range": "dinnerBudget",
}
EQUIVALENTS = {
    "budget.lunch.range": ("budget.lunch.range", "budget.lunch.legacy_range"),
    "budget.dinner.range": ("budget.dinner.range", "budget.dinner.legacy_range"),
}


def reviewed_base_bindings(db: sqlite3.Connection) -> dict[str, set[str]]:
    output: dict[str, set[str]] = defaultdict(set)
    for provider_id, place_id in db.execute(
        """
        SELECT sr.provider_id,sb.place_id
        FROM source_records sr
        JOIN source_bindings sb ON sb.source_record_id=sr.source_record_id
        WHERE sr.provider='Hot Pepper'
          AND sr.acquisition_method='retained_hotpepper_artifact'
          AND sb.binding_state='reviewed'
        ORDER BY sr.provider_id,sb.place_id
        """
    ):
        output[str(provider_id)].add(place_id)
    return output


def known_fields(db: sqlite3.Connection) -> set[tuple[str, str]]:
    return {
        (pid, field_key)
        for pid, field_key in db.execute(
            "SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'"
        )
    }


def target_missing(known: set[tuple[str, str]], pid: str, target: str) -> bool:
    return not any((pid, key) in known for key in EQUIVALENTS[target])


def valid_finite_range(value) -> bool:
    if not isinstance(value, list) or len(value) != 2:
        return False
    low, high = value
    if isinstance(low, bool) or isinstance(high, bool):
        return False
    if not isinstance(low, (int, float)) or not isinstance(high, (int, float)):
        return False
    return 0 <= low <= high <= 200000


def hotpepper_https_links(payload: dict) -> list[str]:
    links = []
    for item in payload.get("retainedSourceLinks") or []:
        url = str((item or {}).get("url") or "").strip()
        if url.startswith("https://www.hotpepper.jp/") and url not in links:
            links.append(url)
    return links


def source_rows(db: sqlite3.Connection):
    rows = []
    for (
        source_record_id,
        provider_id,
        source_url,
        payload_json,
        place_id,
        binding_state,
        observation_id,
        field_key,
        value_json,
        observed_at,
    ) in db.execute(
        """
        SELECT sr.source_record_id,sr.provider_id,sr.source_url,sr.payload_json,
               sb.place_id,sb.binding_state,o.observation_id,o.field_key,o.value_json,o.observed_at
        FROM source_records sr
        JOIN source_bindings sb ON sb.source_record_id=sr.source_record_id
        JOIN field_observations o
          ON o.source_record_id=sr.source_record_id AND o.place_id=sb.place_id
        WHERE sr.provider='Hot Pepper'
          AND sr.acquisition_method='retained_source_fact_overlay'
          AND o.field_state='known'
          AND o.field_key IN ('budget.lunch.range','budget.dinner.range')
        ORDER BY sb.place_id,sr.provider_id,o.field_key,sr.source_record_id
        """
    ):
        payload = json.loads(payload_json)
        value = json.loads(value_json) if value_json is not None else None
        rows.append({
            "sourceRecordId": source_record_id,
            "providerId": str(provider_id),
            "sourceUrl": source_url,
            "payload": payload,
            "placeId": place_id,
            "bindingState": binding_state,
            "observationId": observation_id,
            "fieldKey": field_key,
            "value": value,
            "observedAt": observed_at,
        })
    return rows


def resolve_budgets(db: sqlite3.Connection, stamp: str):
    identities = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    conflict_places = {
        row[0] for row in db.execute(
            "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
        )
    }
    base = reviewed_base_bindings(db)
    known = known_fields(db)
    rows = source_rows(db)
    identity_before = dict(identities)
    counts = Counter()
    resolved_places = set()

    for row in rows:
        pid = row["placeId"]
        target = row["fieldKey"]
        claim = TARGETS[target]
        payload = row["payload"]
        fact = payload.get("sourceFact") or {}
        claims = set(fact.get("claimedFields") or [])
        evidence_classes = set(fact.get("priceEvidenceClasses") or [])

        if identities.get(pid) not in ("verified", "source_matched"):
            counts["identity_not_publishable"] += 1
            continue
        if pid in conflict_places or row["bindingState"] == "conflict":
            counts["identity_conflict"] += 1
            continue
        if base.get(row["providerId"], set()) != {pid}:
            counts["base_binding_not_unique_reviewed_match"] += 1
            continue
        if claim not in claims:
            counts["missing_explicit_budget_claim"] += 1
            continue
        if "explicit_range" not in evidence_classes:
            counts["missing_explicit_range_evidence"] += 1
            continue
        if not valid_finite_range(row["value"]):
            counts["invalid_range"] += 1
            continue
        if not target_missing(known, pid, target):
            counts["already_known"] += 1
            continue

        links = hotpepper_https_links(payload)
        source_url = row.get("sourceUrl")
        if isinstance(source_url, str) and source_url.startswith("https://www.hotpepper.jp/"):
            if source_url not in links:
                links.insert(0, source_url)
        if not links:
            counts["missing_hotpepper_https_provenance"] += 1
            continue

        derived_payload = {
            "placeId": pid,
            "fieldKey": target,
            "value": row["value"],
            "hotpepperId": row["providerId"],
            "sourceObservationId": row["observationId"],
            "sourceRecordId": row["sourceRecordId"],
            "sourceLinks": links,
            "claimedFields": sorted(claims),
            "priceEvidenceClasses": sorted(evidence_classes),
            "reviewedNativeBinding": True,
            "selectionPolicy": "explicit_range_missing_only_no_identity_change",
            "ruleVersion": RULE_VERSION,
        }
        provider_id = f"source-fact-budget:{pid}:{target}:{row['observationId']}"
        derived_source = core.source_record(
            db,
            "Hot Pepper",
            provider_id,
            derived_payload,
            links[0],
            row.get("observedAt") or stamp[:10],
            ACQUISITION_METHOD,
            "field-only budget resolution from retained Hot Pepper source fact after exact reviewed native-ID gate; no new API call",
            stamp,
        )
        core.upsert_binding(
            db,
            pid,
            derived_source,
            "reviewed",
            BINDING_METHOD,
            "field_only_not_identity",
            None,
            stamp,
        )
        oid = core.observation(
            db,
            pid,
            derived_source,
            target,
            row["value"],
            "known",
            row.get("observedAt") or stamp[:10],
            derived_from=row["observationId"],
            rule=RULE_VERSION,
        )
        core.resolve(db, pid, target, oid, "known", "Hot Pepper", stamp)
        known.add((pid, target))
        counts[target] += 1
        resolved_places.add(pid)

    identity_after = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    if identity_after != identity_before:
        raise RuntimeError("Hot Pepper source-fact budget resolver changed identity state")

    return {
        "ruleVersion": RULE_VERSION,
        "candidateBudgetObservations": len(rows),
        "reviewedBaseHotPepperIds": len(base),
        "resolvedFields": sum(counts[key] for key in TARGETS),
        "resolvedPlaces": len(resolved_places),
        "fieldCounts": {key: counts[key] for key in sorted(TARGETS) if counts[key]},
        "skipped": {
            key: value
            for key, value in sorted(counts.items())
            if key not in TARGETS and value
        },
        "networkRequests": 0,
        "identityChanges": 0,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    db = sqlite3.connect(args.database)
    db.execute("PRAGMA foreign_keys=ON")
    try:
        db.execute("BEGIN IMMEDIATE")
        summary = resolve_budgets(db, core.now_iso())
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print(json.dumps({"status": "pass", **summary}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
