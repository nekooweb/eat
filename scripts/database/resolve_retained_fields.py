#!/usr/bin/env python3
"""Deterministically fill missing canonical fields from retained provider facts.

The resolver is deliberately missing-only. It never changes identity, never overwrites a
known value, and only promotes exact provider facts that already belong to a publishable,
non-conflict Place ID and carry retained HTTPS provenance.
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict

import master_import_core as core

ACQUISITION_METHOD = "derived_retained_field_resolution_v2"
RULE_VERSION = "retained-field-resolver-v2"
BINDING_METHOD = "field_only_from_existing_publishable_identity"
ALLOWED_PROVIDERS = {"official", "Tabelog"}

FIELD_RULES = {
    "address": {"equivalents": ("address",), "claims": {"address"}},
    "cuisine": {"equivalents": ("cuisine",), "claims": {"cuisine"}},
    "hours.raw": {
        "equivalents": ("hours.raw", "hours.reference.legacy", "hours.normalized.legacy"),
        "claims": {"hours"},
    },
    "budget.lunch.range": {
        "equivalents": ("budget.lunch.range", "budget.lunch.legacy_range"),
        "claims": {"budget", "lunchBudget"},
    },
    "budget.dinner.range": {
        "equivalents": ("budget.dinner.range", "budget.dinner.legacy_range"),
        "claims": {"budget", "dinnerBudget"},
    },
    "closure.raw": {"equivalents": ("closure.raw",), "claims": {"closure"}},
    "closure.days.raw": {"equivalents": ("closure.days.raw",), "claims": {"closure"}},
}

PROVIDER_RANK = {"official": 100, "Tabelog": 80}


def https_links(payload: dict) -> list[str]:
    output = []
    for link in payload.get("retainedSourceLinks") or []:
        url = str((link or {}).get("url") or "").strip()
        if url.startswith("https://") and url not in output:
            output.append(url)
    return output


def valid_value(field_key: str, value) -> bool:
    if not core.nonempty(value):
        return False
    if field_key in {"address", "cuisine", "hours.raw", "closure.raw"}:
        return isinstance(value, str) and bool(value.strip())
    if field_key == "closure.days.raw":
        return isinstance(value, list) and bool(value) and all(
            isinstance(item, str) and bool(item.strip()) for item in value
        )
    if field_key in {"budget.lunch.range", "budget.dinner.range"}:
        if not isinstance(value, list) or len(value) < 2:
            return False
        low, high = value[0], value[1]
        if isinstance(low, bool) or isinstance(high, bool):
            return False
        if not isinstance(low, (int, float)) or not isinstance(high, (int, float)):
            return False
        return low >= 0 and high >= low
    return False


def known_fields(db) -> set[tuple[str, str]]:
    return {
        (pid, field_key)
        for pid, field_key in db.execute(
            "SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'"
        )
    }


def field_is_missing(known: set[tuple[str, str]], pid: str, field_key: str) -> bool:
    return not any((pid, equivalent) in known for equivalent in FIELD_RULES[field_key]["equivalents"])


def source_candidates(db):
    candidates = defaultdict(list)
    for (
        observation_id,
        pid,
        field_key,
        value_json,
        provider,
        source_record_id,
        payload_json,
        observed_at,
    ) in db.execute(
        """SELECT o.observation_id,o.place_id,o.field_key,o.value_json,
                  sr.provider,sr.source_record_id,sr.payload_json,sr.observed_at
           FROM field_observations o
           JOIN source_records sr ON sr.source_record_id=o.source_record_id
           WHERE sr.acquisition_method='retained_source_fact_overlay'
             AND o.field_state='known'
             AND o.field_key IN (
               'address','cuisine','hours.raw','budget.lunch.range','budget.dinner.range',
               'closure.raw','closure.days.raw'
             )"""
    ):
        if provider not in ALLOWED_PROVIDERS or value_json is None:
            continue
        payload = json.loads(payload_json)
        source_fact = payload.get("sourceFact") or {}
        claimed = set(source_fact.get("claimedFields") or [])
        rule = FIELD_RULES.get(field_key)
        if not rule or not (claimed & rule["claims"]):
            continue
        links = https_links(payload)
        if not links:
            continue
        value = json.loads(value_json)
        if not valid_value(field_key, value):
            continue
        candidates[(pid, field_key)].append({
            "observationId": observation_id,
            "sourceRecordId": source_record_id,
            "provider": provider,
            "value": value,
            "observedAt": observed_at,
            "links": links,
            "claimedFields": sorted(claimed),
        })
    return candidates


def choose_option(options: list[dict]) -> dict:
    # Stable multi-pass sort: source ID ascending as final tie-break, newest first,
    # then stronger provider first.
    ranked = sorted(options, key=lambda item: item["sourceRecordId"])
    ranked.sort(key=lambda item: str(item.get("observedAt") or ""), reverse=True)
    ranked.sort(key=lambda item: PROVIDER_RANK.get(item["provider"], 0), reverse=True)
    return ranked[0]


def resolve_missing_retained_fields(db, stamp: str):
    identities = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    conflict_places = {
        row[0] for row in db.execute(
            "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
        )
    }
    known = known_fields(db)
    candidates = source_candidates(db)
    resolved = Counter()
    providers = Counter()
    skipped = Counter()

    for (pid, field_key), options in sorted(candidates.items()):
        if identities.get(pid) not in ("verified", "source_matched"):
            skipped["identity_not_publishable"] += 1
            continue
        if pid in conflict_places:
            skipped["identity_conflict"] += 1
            continue
        if not field_is_missing(known, pid, field_key):
            skipped["already_known"] += 1
            continue

        option = choose_option(options)
        payload = {
            "placeId": pid,
            "fieldKey": field_key,
            "value": option["value"],
            "sourceProvider": option["provider"],
            "sourceObservationId": option["observationId"],
            "sourceRecordId": option["sourceRecordId"],
            "sourceLinks": option["links"],
            "claimedFields": option["claimedFields"],
            "selectionPolicy": "missing_only_no_identity_change",
            "ruleVersion": RULE_VERSION,
        }
        provider_id = f"resolver-v2:{pid}:{field_key}:{option['observationId']}"
        derived_source = core.source_record(
            db,
            option["provider"],
            provider_id,
            payload,
            option["links"][0],
            option.get("observedAt") or stamp[:10],
            ACQUISITION_METHOD,
            "derived only from retained provider fact with HTTPS provenance; field-only resolution",
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
        derived_observation = core.observation(
            db,
            pid,
            derived_source,
            field_key,
            option["value"],
            "known",
            option.get("observedAt") or stamp[:10],
            derived_from=option["observationId"],
            rule=RULE_VERSION,
        )
        core.resolve(
            db,
            pid,
            field_key,
            derived_observation,
            "known",
            option["provider"],
            stamp,
        )
        known.add((pid, field_key))
        resolved[field_key] += 1
        providers[option["provider"]] += 1

    return {
        "ruleVersion": RULE_VERSION,
        "resolvedFields": sum(resolved.values()),
        "fieldCounts": dict(sorted(resolved.items())),
        "providerCounts": dict(sorted(providers.items())),
        "candidatePlaceFields": len(candidates),
        "skipped": dict(sorted(skipped.items())),
    }
