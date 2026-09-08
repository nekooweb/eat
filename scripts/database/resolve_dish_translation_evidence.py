#!/usr/bin/env python3
"""Resolve retained source-native dish evidence into canonical Chinese dish fields.

Source pages are NOT required to contain Chinese. The retained evidence layer keeps
source-native dish text (normally Japanese) together with provenance; this resolver
accepts only already-source-backed semantic evidence whose `nameZh` translation has
passed the deterministic dish normalizer, and materializes Chinese arrays in SQLite.

No network requests are made and no cuisine/name/brand inference is performed here.
"""
from __future__ import annotations

import json
import re
import sqlite3
from collections import Counter, defaultdict

import master_import_core as core

RULE_VERSION = "dish-source-translation-zh-v1"
RESOLVER_PROVIDER = "dish_evidence_resolver"
RESOLVER_PRIORITY = 85
RECOMMENDATION_CLASSES = {"source_recommendation_text"}
FEATURED_CLASSES = {
    "retained_source_menu_item",
    "provider_promotional_dish_text",
    "structured_menu_item",
    "source_menu_text",
}

_HAN = re.compile(r"[\u3400-\u9fff]")
_KANA = re.compile(r"[\u3040-\u30ff]")


def valid_zh_label(value) -> bool:
    if not isinstance(value, str):
        return False
    text = value.strip()
    return bool(text) and len(text) <= 32 and bool(_HAN.search(text)) and not bool(_KANA.search(text))


def source_original(item: dict) -> str:
    return str(item.get("nameOriginal") or item.get("nameJa") or "").strip()


def accepted_item(field_key: str, item) -> dict | None:
    if not isinstance(item, dict):
        return None
    name_zh = str(item.get("nameZh") or "").strip()
    evidence_class = str(item.get("evidenceClass") or "").strip()
    if not valid_zh_label(name_zh):
        return None
    if field_key == "dish.recommendation.evidence":
        if evidence_class not in RECOMMENDATION_CLASSES:
            return None
    elif field_key == "dish.featured.evidence":
        if evidence_class not in FEATURED_CLASSES:
            return None
    else:
        return None
    source_url = str(item.get("sourceUrl") or "").strip()
    if not source_url.startswith(("http://", "https://")):
        return None
    return {
        "nameZh": name_zh,
        "nameOriginal": source_original(item) or name_zh,
        "provider": str(item.get("provider") or "retained-detail-evidence"),
        "sourceUrl": source_url,
        "checkedAt": str(item.get("checkedAt") or ""),
        "evidenceClass": evidence_class,
        "evidenceRule": str(item.get("evidenceRule") or ""),
    }


def _dedupe(items: list[dict], limit: int = 6) -> list[dict]:
    by_name: dict[str, dict] = {}
    for item in items:
        old = by_name.get(item["nameZh"])
        if old is None or item.get("checkedAt", "") > old.get("checkedAt", ""):
            by_name[item["nameZh"]] = item
    return sorted(
        by_name.values(),
        key=lambda x: (x.get("checkedAt", ""), x["nameZh"]),
        reverse=True,
    )[:limit]


def _resolve_canonical(db, place_id: str, field_key: str, observation_id: str, stamp: str):
    """Prefer validated source-backed translations over the legacy snapshot.

    The normal core resolver assigns priority by source provider. This derived field is
    an aggregate over already validated evidence from multiple providers, so it uses a
    fixed priority above the legacy snapshot while remaining below direct official
    identity fields. It cannot affect identity because it only writes dish field keys.
    """
    db.execute(
        """
        INSERT INTO field_resolutions(
          place_id,field_key,observation_id,resolution_state,rule_version,resolver_priority,resolved_at
        ) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(place_id,field_key) DO UPDATE SET
          observation_id=excluded.observation_id,
          resolution_state=excluded.resolution_state,
          rule_version=excluded.rule_version,
          resolver_priority=excluded.resolver_priority,
          resolved_at=excluded.resolved_at
        """,
        (place_id, field_key, observation_id, "known", RULE_VERSION, RESOLVER_PRIORITY, stamp),
    )


def resolve_source_backed_dishes(
    db: sqlite3.Connection,
    id_set: set[str],
    conflict_places: set[str],
    stamp: str,
):
    identities = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    before_identity = dict(identities)
    grouped: dict[str, dict[str, list[dict]]] = defaultdict(lambda: {"recommended": [], "featured": []})
    counts = Counter()

    query = """
        SELECT o.place_id,o.field_key,o.value_json,coalesce(o.observed_at,''),o.observation_id
        FROM field_observations o
        JOIN source_records sr ON sr.source_record_id=o.source_record_id
        WHERE sr.acquisition_method='retained_dish_evidence'
          AND o.field_key IN ('dish.recommendation.evidence','dish.featured.evidence')
          AND o.field_state='known'
        ORDER BY o.place_id,o.field_key,o.observed_at,o.observation_id
    """
    for pid, field_key, value_json, observed_at, observation_id in db.execute(query):
        counts["evidence_observations"] += 1
        if pid not in id_set:
            counts["outside_catalog"] += 1
            continue
        if identities.get(pid) not in ("verified", "source_matched"):
            counts["identity_not_publishable"] += 1
            continue
        if pid in conflict_places:
            counts["identity_conflict"] += 1
            continue
        try:
            raw = json.loads(value_json) if value_json is not None else None
        except Exception:
            counts["invalid_json"] += 1
            continue
        item = accepted_item(field_key, raw)
        if not item:
            counts["rejected_semantic_or_translation"] += 1
            continue
        item["observedAt"] = observed_at
        item["observationId"] = observation_id
        target = "recommended" if field_key == "dish.recommendation.evidence" else "featured"
        grouped[pid][target].append(item)
        counts[f"accepted_{target}_evidence"] += 1
        if source_original(raw):
            counts["accepted_with_source_original"] += 1

    resolved_places = {"recommended": 0, "featured": 0}
    resolved_items = {"recommended": 0, "featured": 0}
    for pid in sorted(grouped):
        for target, field_key in (
            ("recommended", "recommended_dishes.zh"),
            ("featured", "featured_dishes.zh"),
        ):
            evidence = _dedupe(grouped[pid][target])
            if not evidence:
                continue
            names = [item["nameZh"] for item in evidence]
            observed = max((item.get("checkedAt") or item.get("observedAt") or stamp[:10])[:10] for item in evidence)
            payload = {
                "placeId": pid,
                "targetField": field_key,
                "ruleVersion": RULE_VERSION,
                "languagePolicy": "source-native evidence translated/normalized to zh-CN; source need not contain Chinese",
                "items": evidence,
            }
            srid = core.source_record(
                db,
                RESOLVER_PROVIDER,
                f"{pid}:{field_key}:{RULE_VERSION}",
                payload,
                None,
                observed,
                "derived_dish_translation_resolution",
                "deterministic translation/normalization derived solely from retained source-backed dish evidence",
                stamp,
            )
            core.upsert_binding(
                db,
                pid,
                srid,
                "reviewed",
                "derived_from_validated_source_backed_dish_evidence",
                "deterministic",
                None,
                stamp,
            )
            oid = core.observation(
                db,
                pid,
                srid,
                field_key,
                names,
                "known",
                observed,
                rule=RULE_VERSION,
            )
            _resolve_canonical(db, pid, field_key, oid, stamp)
            resolved_places[target] += 1
            resolved_items[target] += len(names)

    after_identity = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    if before_identity != after_identity:
        raise RuntimeError("dish translation resolver must not change identity state")

    counts["recommended_places_resolved"] = resolved_places["recommended"]
    counts["featured_places_resolved"] = resolved_places["featured"]
    counts["recommended_items_resolved"] = resolved_items["recommended"]
    counts["featured_items_resolved"] = resolved_items["featured"]
    return counts
