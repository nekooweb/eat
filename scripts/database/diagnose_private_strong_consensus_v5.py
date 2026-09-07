#!/usr/bin/env python3
"""Diagnose strong independent identity signals left after v3/v4.

Historical Google rows are private linkage hints only. This script does not promote
anything and never writes Google display content. It asks whether unresolved v3
multi-source components contain stronger independent discriminators that justify a
future automatic rule: exact normalized phone shared by >=2 providers, exact allowed
public HTTPS URL shared by >=2 providers, or a non-aggregator domain shared together
with structured-address support.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

import reconcile_private_google_hints as base
import reconcile_private_address_consensus_v2 as v2
import reconcile_private_multisource_consensus_v3 as v3
import reconcile_private_official_web_consensus_v4 as v4

RULE_VERSION = "private-strong-consensus-diagnostic-v5"


def canonical_url(value: str) -> str:
    normalized = v4.normalize_url(value)
    if not normalized:
        return ""
    p = urlparse(normalized)
    path = p.path.rstrip("/") or "/"
    return p._replace(scheme="https", netloc=(p.hostname or "").lower(), path=path, params="", query="", fragment="").geturl()


def row_urls(row: dict) -> set[str]:
    return {u for u in (canonical_url(value) for value in v4.candidate_urls(row)) if u}


def row_domains(row: dict) -> set[str]:
    output = set()
    for url in row_urls(row):
        host = (urlparse(url).hostname or "").lower().removeprefix("www.")
        if host and v4.allowed_host(host):
            output.add(host)
    return output


def shared_signal(members: list[tuple[dict, dict]]):
    members = v3.best_per_provider(members)
    phone_providers = defaultdict(set)
    url_providers = defaultdict(set)
    domain_providers = defaultdict(set)
    for row, _ev in members:
        provider = row["provider"]
        for phone in v4.source_phones(row):
            if len(phone) >= 10:
                phone_providers[phone].add(provider)
        for url in row_urls(row):
            url_providers[url].add(provider)
        for domain in row_domains(row):
            domain_providers[domain].add(provider)
    phones = sorted(k for k, providers in phone_providers.items() if len(providers) >= 2)
    urls = sorted(k for k, providers in url_providers.items() if len(providers) >= 2)
    domains = sorted(k for k, providers in domain_providers.items() if len(providers) >= 2)
    return phones, urls, domains


def strong_rule(metrics: dict, phones: list[str], urls: list[str], domains: list[str]):
    max_hint = metrics["maxHintNameSimilarity"]
    avg_mutual = metrics["averageMutualNameSimilarity"]
    min_hint = metrics["minimumHintDistanceMeters"]
    max_mutual_dist = metrics["maximumMutualDistanceMeters"]
    if phones and max_hint >= 0.45 and avg_mutual >= 0.75 and min_hint <= 60 and max_mutual_dist <= 60:
        return "exact_cross_provider_phone"
    if urls and max_hint >= 0.45 and avg_mutual >= 0.72 and min_hint <= 60 and max_mutual_dist <= 60:
        return "exact_cross_provider_official_url"
    if (
        domains
        and metrics["sourceAddressSupportingPairs"] >= 1
        and metrics["hintStructuredAddressMembers"] >= 1
        and max_hint >= 0.50
        and avg_mutual >= 0.82
        and min_hint <= 55
        and max_mutual_dist <= 50
    ):
        return "domain_plus_structured_address"
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--initial", type=Path, required=True)
    ap.add_argument("--retry", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
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
    candidates_out = []

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
                native = v3.native_key(row)
                if native in bound and bound[native] != {pid}:
                    continue
                local.append((row, ev))
            local.sort(key=lambda item: (item[1]["distanceMeters"], -item[1]["nameSimilarity"], str(item[0].get("providerId") or "")))
            candidates.extend(local[:18])

        components = v3.componentize(candidates)
        if components:
            counts["has_multisource_cluster"] += 1
        strong = []
        for component in components:
            metrics = v3.cluster_metrics(component)
            phones, urls, domains = shared_signal(component)
            if phones:
                counts["components_exact_cross_provider_phone"] += 1
            if urls:
                counts["components_exact_cross_provider_official_url"] += 1
            if domains:
                counts["components_shared_allowed_domain"] += 1
            rule = strong_rule(metrics, phones, urls, domains)
            if rule:
                strong.append((rule, metrics, phones, urls, domains))
        if not strong:
            counts["no_strong_signal"] += 1
            continue
        if len(strong) > 1:
            counts["ambiguous_strong_components"] += 1
            continue
        rule, metrics, phones, urls, domains = strong[0]
        counts[f"strong_{rule}"] += 1
        counts["strong_candidate_place_ids"] += 1
        members = v3.best_per_provider(metrics["members"])
        candidates_out.append({
            "googlePlaceId": pid,
            "rule": rule,
            "providers": metrics["providers"],
            "providerCount": metrics["providerCount"],
            "maxHintNameSimilarity": metrics["maxHintNameSimilarity"],
            "averageMutualNameSimilarity": metrics["averageMutualNameSimilarity"],
            "minimumHintDistanceMeters": metrics["minimumHintDistanceMeters"],
            "maximumMutualDistanceMeters": metrics["maximumMutualDistanceMeters"],
            "hintStructuredAddressMembers": metrics["hintStructuredAddressMembers"],
            "sourceAddressSupportingPairs": metrics["sourceAddressSupportingPairs"],
            "sharedPhoneHashes": [hashlib.sha256(p.encode()).hexdigest()[:16] for p in phones],
            "sharedOfficialUrls": urls,
            "sharedAllowedDomains": domains,
            "independentSourceKeys": [
                {"provider": row["provider"], "providerId": str(row.get("providerId") or "")}
                for row, _ev in members
            ],
        })

    output = {
        "schemaVersion": 1,
        "ruleVersion": RULE_VERSION,
        "policy": {
            "newGoogleApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "promotionPerformed": False,
            "proximityOnlyBindingAllowed": False,
            "privateHistoricalHintsDurable": False,
            "aggregatorDomainConsensusAllowed": False,
        },
        "summary": {
            "idOnly": len(id_only),
            "strongCandidates": len(candidates_out),
            "counts": dict(sorted(counts.items())),
        },
        "candidates": candidates_out,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
