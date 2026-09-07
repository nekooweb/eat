#!/usr/bin/env python3
"""Recover ID-only restaurants by independent multi-source consensus.

Historical Google Places rows are consumed only as short-lived private hints that attach
an independent-source cluster to the frozen Place ID. Durable output contains only the
Place ID compatibility key and independent Hot Pepper / OSM / Overture fields.

The v3 rule is intentionally stricter about *independent-source agreement* than about a
single source's proximity to the historical hint. A row is never promoted from distance
alone: at least two different providers must agree on the business identity.
"""
from __future__ import annotations

import argparse
import json
import math
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

import reconcile_private_google_hints as base
import reconcile_private_address_consensus_v2 as v2

RULE_VERSION = "private-multisource-consensus-v3"
ALLOWED_PROVIDERS = {"Hot Pepper", "OpenStreetMap", "Overture Maps"}
PROVIDER_PRIORITY = {"Hot Pepper": 0, "OpenStreetMap": 1, "Overture Maps": 2}


def native_key(row: dict) -> tuple[str, str]:
    return str(row.get("provider") or ""), str(row.get("providerId") or "")


def stable_domain(url: str) -> str:
    try:
        parsed = urlparse(str(url or ""))
    except Exception:
        return ""
    host = (parsed.hostname or "").lower().removeprefix("www.")
    if not host:
        return ""
    parts = host.split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


def domains(row: dict) -> set[str]:
    values = []
    values.extend(row.get("websites") or [])
    raw = row.get("raw") or {}
    for key in ("website", "contactWebsite", "url"):
        if raw.get(key):
            values.append(raw.get(key))
    return {d for d in (stable_domain(v) for v in values) if d}


def source_pair_metrics(left: dict, right: dict) -> dict:
    ln = v2.address_numbers(left.get("address"))
    rn = v2.address_numbers(right.get("address"))
    lp = base.postcode(left.get("address"))
    rp = base.postcode(right.get("address"))
    lw = v2.ward(left.get("address"))
    rw = v2.ward(right.get("address"))
    shared_domains = sorted(domains(left) & domains(right))
    return {
        "distanceMeters": round(base.haversine(left["lat"], left["lng"], right["lat"], right["lng"]), 3),
        "nameSimilarity": round(base.similarity(left.get("name"), right.get("name")), 6),
        "addressNumberMatch": bool(len(ln) >= 2 and len(rn) >= 2 and ln == rn),
        "addressNumberConflict": bool(len(ln) >= 2 and len(rn) >= 2 and ln != rn),
        "postcodeMatch": bool(lp and rp and lp == rp),
        "wardMatch": bool(lw and rw and lw == rw),
        "addressSimilarity": round(v2.address_similarity(left.get("address"), right.get("address")), 6),
        "sharedDomains": shared_domains,
    }


def pair_is_same_business(metrics: dict) -> bool:
    if metrics["addressNumberConflict"]:
        return False
    dist = metrics["distanceMeters"]
    name = metrics["nameSimilarity"]
    if metrics["sharedDomains"] and name >= 0.72 and dist <= 45:
        return True
    if metrics["addressNumberMatch"] and (metrics["postcodeMatch"] or metrics["wardMatch"]) and name >= 0.82 and dist <= 40:
        return True
    if metrics["addressNumberMatch"] and name >= 0.88 and dist <= 30:
        return True
    if name >= 0.94 and dist <= 25:
        return True
    if name >= 0.985 and dist <= 40:
        return True
    return False


def componentize(candidates: list[tuple[dict, dict]]) -> list[list[tuple[dict, dict]]]:
    n = len(candidates)
    edges = [[] for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            left, right = candidates[i][0], candidates[j][0]
            if left["provider"] == right["provider"]:
                continue
            if pair_is_same_business(source_pair_metrics(left, right)):
                edges[i].append(j)
                edges[j].append(i)
    seen = set()
    components = []
    for start in range(n):
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        ids = []
        while stack:
            cur = stack.pop()
            ids.append(cur)
            for nxt in edges[cur]:
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
        members = [candidates[i] for i in ids]
        if len({row["provider"] for row, _ev in members}) >= 2:
            components.append(members)
    return components


def best_per_provider(members: list[tuple[dict, dict]]) -> list[tuple[dict, dict]]:
    grouped = defaultdict(list)
    for item in members:
        grouped[item[0]["provider"]].append(item)
    output = []
    for provider, items in grouped.items():
        items.sort(
            key=lambda item: (
                -item[1]["nameSimilarity"],
                -int(item[1].get("addressCoreMatch", False)),
                item[1]["distanceMeters"],
                str(item[0].get("providerId") or ""),
            )
        )
        output.append(items[0])
    return sorted(output, key=lambda item: PROVIDER_PRIORITY.get(item[0]["provider"], 9))


def cluster_metrics(members: list[tuple[dict, dict]]) -> dict:
    members = best_per_provider(members)
    pair_metrics = []
    for i in range(len(members)):
        for j in range(i + 1, len(members)):
            pair_metrics.append(source_pair_metrics(members[i][0], members[j][0]))
    hint_names = [ev["nameSimilarity"] for _row, ev in members]
    hint_distances = [ev["distanceMeters"] for _row, ev in members]
    address_core = sum(1 for _row, ev in members if ev.get("addressCoreMatch"))
    structured_hint = sum(
        1 for _row, ev in members
        if ev.get("addressNumberMatch") and (ev.get("postcodeMatch") or ev.get("wardMatch"))
    )
    mutual_names = [m["nameSimilarity"] for m in pair_metrics]
    mutual_distances = [m["distanceMeters"] for m in pair_metrics]
    source_address_support = sum(
        1 for m in pair_metrics
        if m["addressNumberMatch"] and (m["postcodeMatch"] or m["wardMatch"] or m["addressSimilarity"] >= 0.82)
    )
    shared_domains = sorted({d for m in pair_metrics for d in m["sharedDomains"]})
    providers = sorted({row["provider"] for row, _ev in members})
    max_hint_name = max(hint_names, default=0.0)
    avg_hint_name = sum(hint_names) / len(hint_names) if hint_names else 0.0
    avg_mutual_name = sum(mutual_names) / len(mutual_names) if mutual_names else 0.0
    min_hint_distance = min(hint_distances, default=9999.0)
    max_hint_distance = max(hint_distances, default=9999.0)
    max_mutual_distance = max(mutual_distances, default=9999.0)
    provider_bonus = min(0.08, max(0, len(providers) - 2) * 0.08)
    addr_bonus = min(0.12, 0.06 * structured_hint + 0.04 * source_address_support)
    domain_bonus = 0.08 if shared_domains else 0.0
    spatial_bonus = max(0.0, 0.08 * (1.0 - min(min_hint_distance, 60.0) / 60.0))
    score = (
        0.43 * max_hint_name
        + 0.12 * avg_hint_name
        + 0.25 * avg_mutual_name
        + provider_bonus
        + addr_bonus
        + domain_bonus
        + spatial_bonus
    )
    return {
        "providers": providers,
        "providerCount": len(providers),
        "maxHintNameSimilarity": round(max_hint_name, 6),
        "averageHintNameSimilarity": round(avg_hint_name, 6),
        "averageMutualNameSimilarity": round(avg_mutual_name, 6),
        "minimumHintDistanceMeters": round(min_hint_distance, 3),
        "maximumHintDistanceMeters": round(max_hint_distance, 3),
        "maximumMutualDistanceMeters": round(max_mutual_distance, 3),
        "hintAddressCoreMembers": address_core,
        "hintStructuredAddressMembers": structured_hint,
        "sourceAddressSupportingPairs": source_address_support,
        "sharedDomains": shared_domains,
        "score": round(score, 6),
        "members": members,
    }


def qualifies(metrics: dict) -> tuple[bool, str | None]:
    provider_count = metrics["providerCount"]
    max_hint = metrics["maxHintNameSimilarity"]
    avg_mutual = metrics["averageMutualNameSimilarity"]
    min_hint_dist = metrics["minimumHintDistanceMeters"]
    max_mutual_dist = metrics["maximumMutualDistanceMeters"]
    hint_addr = metrics["hintStructuredAddressMembers"]
    source_addr = metrics["sourceAddressSupportingPairs"]
    shared_domain = bool(metrics["sharedDomains"])

    if provider_count >= 3:
        if max_hint >= 0.42 and avg_mutual >= 0.86 and min_hint_dist <= 50 and max_mutual_dist <= 45 and (hint_addr >= 1 or shared_domain):
            return True, "three_provider_independent_consensus"
    if shared_domain and max_hint >= 0.48 and avg_mutual >= 0.82 and min_hint_dist <= 45 and max_mutual_dist <= 45:
        return True, "shared_domain_independent_consensus"
    if hint_addr >= 1 and source_addr >= 1 and max_hint >= 0.52 and avg_mutual >= 0.86 and min_hint_dist <= 45 and max_mutual_dist <= 40:
        return True, "two_provider_structured_address_consensus"
    if hint_addr >= 2 and max_hint >= 0.48 and avg_mutual >= 0.90 and min_hint_dist <= 40 and max_mutual_dist <= 30:
        return True, "two_provider_dual_hint_address_consensus"
    return False, None


def choose_cluster(components: list[list[tuple[dict, dict]]]):
    scored = []
    for component in components:
        metrics = cluster_metrics(component)
        ok, rule = qualifies(metrics)
        if ok:
            scored.append((metrics["score"], rule, metrics))
    scored.sort(key=lambda item: (-item[0], -item[2]["maxHintNameSimilarity"], item[2]["minimumHintDistanceMeters"]))
    if not scored:
        return None, {"reason": "no_qualifying_independent_cluster"}
    top = scored[0]
    runner = scored[1][0] if len(scored) > 1 else 0.0
    margin = top[0] - runner
    if len(scored) > 1 and margin < 0.08:
        return None, {
            "reason": "ambiguous_independent_clusters",
            "topScore": round(top[0], 6),
            "runnerScore": round(runner, 6),
            "scoreMargin": round(margin, 6),
        }
    if top[0] < 0.64:
        return None, {"reason": "independent_cluster_score_below_gate", "topScore": round(top[0], 6)}
    return (top[1], top[2]), {
        "topScore": round(top[0], 6),
        "runnerScore": round(runner, 6),
        "scoreMargin": round(margin, 6),
        "qualifyingClusters": len(scored),
    }


def durable_source_row(row: dict) -> dict:
    out = v2.independent_row(row)
    url = v2.provider_source_url(row)
    if url:
        out["sourceUrl"] = url
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--initial", type=Path, required=True)
    ap.add_argument("--retry", type=Path, required=True)
    ap.add_argument("--private-output", type=Path, required=True)
    ap.add_argument("--durable-output", type=Path, required=True)
    args = ap.parse_args()

    db = sqlite3.connect(args.database)
    id_only = {row[0] for row in db.execute("SELECT place_id FROM catalog_entries WHERE identity_state='id_only'")}
    conflict_places = {row[0] for row in db.execute("SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'")}
    bound = defaultdict(set)
    for provider, provider_id, pid in db.execute(
        """SELECT sr.provider,sr.provider_id,sb.place_id
           FROM source_bindings sb JOIN source_records sr ON sr.source_record_id=sb.source_record_id
           WHERE sb.binding_state IN ('reviewed','conflict')"""
    ):
        bound[(provider, str(provider_id))].add(pid)
    db.close()

    hints = base.load_google_hints(args.initial, args.retry)
    provider_rows = {
        "Hot Pepper": base.hotpepper_rows(),
        "OpenStreetMap": base.osm_rows(),
        "Overture Maps": base.overture_rows(),
    }
    grids = {provider: base.build_grid(rows) for provider, rows in provider_rows.items()}

    counts = Counter()
    private_rows = []
    durable_rows = []
    used_native = set()

    for pid in sorted(id_only):
        hint = hints.get(pid)
        if hint is None:
            counts["no_historical_hint"] += 1
            continue
        if hint.get("businessStatus") not in (None, "OPERATIONAL"):
            counts["historical_non_operational"] += 1
            continue
        if pid in conflict_places:
            counts["identity_conflict_deferred"] += 1
            continue

        candidates = []
        for provider, (grid, step) in grids.items():
            local = []
            for row in base.nearby(grid, step, hint["lat"], hint["lng"]):
                ev = v2.enriched_evidence(hint, row)
                if ev["distanceMeters"] > 100:
                    continue
                native = native_key(row)
                if native in bound and bound[native] != {pid}:
                    continue
                local.append((row, ev))
            local.sort(
                key=lambda item: (
                    item[1]["distanceMeters"],
                    -item[1]["nameSimilarity"],
                    str(item[0].get("providerId") or ""),
                )
            )
            candidates.extend(local[:18])

        components = componentize(candidates)
        if components:
            counts["has_independent_multisource_cluster"] += 1
        choice, diag = choose_cluster(components)
        if choice is None:
            counts[diag.get("reason", "not_selected")] += 1
            continue

        rule, metrics = choice
        members = best_per_provider(metrics["members"])
        available = [item for item in members if native_key(item[0]) not in used_native]
        if len({row["provider"] for row, _ev in available}) < 2:
            counts["native_source_reuse_deferred"] += 1
            continue
        chosen_row, _chosen_ev = sorted(
            available,
            key=lambda item: (
                PROVIDER_PRIORITY.get(item[0]["provider"], 9),
                -item[1]["nameSimilarity"],
                item[1]["distanceMeters"],
            ),
        )[0]
        chosen_native = native_key(chosen_row)
        used_native.add(chosen_native)

        support = []
        for row, _ev in members:
            support.append({
                "provider": row["provider"],
                "providerId": str(row["providerId"]),
                "name": row["name"],
                "address": row.get("address") or "",
                "lat": row["lat"],
                "lng": row["lng"],
            })

        counts[rule] += 1
        private_rows.append({
            "googlePlaceId": pid,
            "rule": rule,
            "chosenProvider": chosen_row["provider"],
            "chosenProviderId": chosen_row["providerId"],
            "metrics": {
                key: value for key, value in metrics.items() if key != "members"
            },
            **diag,
        })
        durable_rows.append({
            "googlePlaceId": pid,
            **durable_source_row(chosen_row),
            "verification": "reviewed_independent_multisource_consensus_using_expiring_private_hint",
            "matchLevel": RULE_VERSION,
            "matchRule": rule,
            "independentConsensus": {
                "providerCount": metrics["providerCount"],
                "providers": metrics["providers"],
                "averageMutualNameSimilarity": metrics["averageMutualNameSimilarity"],
                "maximumMutualDistanceMeters": metrics["maximumMutualDistanceMeters"],
                "sourceAddressSupportingPairs": metrics["sourceAddressSupportingPairs"],
                "sharedDomains": metrics["sharedDomains"],
                "supportingSources": support,
            },
            "sourceCheckedAt": "2026-09-07",
        })

    private_doc = {
        "schemaVersion": 1,
        "ruleVersion": RULE_VERSION,
        "policy": {
            "newGoogleApiCalls": 0,
            "privateGoogleHintsOnly": True,
            "durableGoogleDisplayPayload": False,
            "minimumIndependentProviders": 2,
        },
        "summary": dict(sorted(counts.items())),
        "selected": len(private_rows),
        "rows": private_rows,
    }
    durable_doc = {
        "schemaVersion": 1,
        "ruleVersion": RULE_VERSION,
        "policy": {
            "newGoogleApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "durableFieldsIndependentSourceOnly": True,
            "proximityOnlyBindingAllowed": False,
            "minimumIndependentProviders": 2,
        },
        "summary": {
            "rows": len(durable_rows),
            "providers": dict(sorted(Counter(row["provider"] for row in durable_rows).items())),
            **dict(sorted(counts.items())),
        },
        "rows": sorted(durable_rows, key=lambda row: row["googlePlaceId"]),
    }
    args.private_output.parent.mkdir(parents=True, exist_ok=True)
    args.durable_output.parent.mkdir(parents=True, exist_ok=True)
    args.private_output.write_text(json.dumps(private_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.durable_output.write_text(json.dumps(durable_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", "ruleVersion": RULE_VERSION, **durable_doc["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
