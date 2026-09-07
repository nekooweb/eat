#!/usr/bin/env python3
"""Refine v6 by distinguishing unique store facts on a shared official listing URL.

This remains a private, non-promoting diagnostic. A shared official URL is not sufficient
by itself. Multiple Place IDs may survive the URL-reuse quarantine only when each maps
to a different discriminating official store fact and independent native source keys are
not reused across Place IDs.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

import diagnose_private_official_detail_consensus_v6 as v6

RULE_VERSION = "private-official-listing-diagnostic-v6-1"


def fact_fingerprint(candidate: dict) -> str:
    fact = candidate.get("fact") or {}
    geo = fact.get("geo") if isinstance(fact.get("geo"), dict) else {}
    payload = {
        "name": v6.base.normalize(fact.get("name")),
        "address": v6.base.normalize(fact.get("address")),
        "telephoneHash": str(fact.get("telephoneHash") or ""),
        "lat": round(float(geo["lat"]), 5) if isinstance(geo.get("lat"), (int, float)) else None,
        "lng": round(float(geo["lng"]), 5) if isinstance(geo.get("lng"), (int, float)) else None,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()[:24]


def has_rule_discriminator(candidate: dict) -> bool:
    match = candidate.get("match") or {}
    fact = candidate.get("fact") or {}
    rule = match.get("identityRule")
    if rule == "official_name_plus_structured_address":
        return bool(fact.get("address") and (match.get("addressSupportingMembers") or 0) >= 1)
    if rule == "official_name_plus_phone":
        return bool(fact.get("telephoneHash") and (match.get("phoneSupportingMembers") or 0) >= 1)
    if rule == "official_name_plus_geo":
        geo = fact.get("geo") if isinstance(fact.get("geo"), dict) else None
        dist = match.get("minimumGeoDistanceMeters")
        return bool(geo and isinstance(dist, (int, float)) and dist <= 45)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--initial", type=Path, required=True)
    ap.add_argument("--retry", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--max-landing-pages", type=int, default=250)
    ap.add_argument("--max-detail-pages", type=int, default=500)
    args = ap.parse_args()

    contexts, counts = v6.build_contexts(args.database, args.initial, args.retry)
    landing_urls = []
    for context in contexts:
        for url in context["urls"]:
            if url not in landing_urls:
                landing_urls.append(url)
    landing_urls = landing_urls[:max(0, args.max_landing_pages)]
    allowed_landing = set(landing_urls)
    counts["landing_pages_scheduled"] = len(landing_urls)
    landing_pages = v6.fetch_many(landing_urls, args.workers, with_links=True)
    for page in landing_pages.values():
        if page.get("ok"):
            counts["landing_pages_ok"] += 1
        else:
            counts[f"landing_skip_{page.get('blocked') or 'unknown'}"] += 1

    matches_by_pid = defaultdict(list)
    hop1_jobs = []
    for context in contexts:
        for url in context["urls"]:
            if url not in allowed_landing:
                continue
            page = landing_pages.get(url) or {}
            if not page.get("ok"):
                continue
            direct = v6.page_candidate(page, context, 0, None)
            if direct:
                matches_by_pid[context["pid"]].append((context, direct))
                counts["landing_direct_matches"] += 1
            for link in v6.rank_links(page, context["members"], v6.MAX_HOP1_PER_CONTEXT):
                hop1_jobs.append((context, url, link))
    counts["hop1_links_selected"] = len(hop1_jobs)

    hop1_urls = []
    for _context, _landing, link in hop1_jobs:
        if link["url"] not in hop1_urls:
            hop1_urls.append(link["url"])
    hop1_urls = hop1_urls[:max(0, args.max_detail_pages)]
    allowed_hop1 = set(hop1_urls)
    hop1_pages = v6.fetch_many(hop1_urls, args.workers, with_links=True)
    for page in hop1_pages.values():
        if page.get("ok"):
            counts["hop1_pages_ok"] += 1
        else:
            counts[f"hop1_skip_{page.get('blocked') or 'unknown'}"] += 1

    hop2_jobs = []
    for context, landing_url, link in hop1_jobs:
        if link["url"] not in allowed_hop1:
            continue
        page = hop1_pages.get(link["url"]) or {}
        if not page.get("ok"):
            continue
        if v6.host_key(str(page.get("finalUrl") or page.get("url") or "")) != v6.host_key(landing_url):
            counts["hop1_cross_origin_redirect"] += 1
            continue
        candidate = v6.page_candidate(page, context, 1, link)
        if candidate:
            matches_by_pid[context["pid"]].append((context, candidate))
            counts["hop1_matches"] += 1
            continue
        for child in v6.rank_links(page, context["members"], v6.MAX_HOP2_PER_CONTEXT):
            if v6.host_key(child["url"]) != v6.host_key(landing_url):
                continue
            hop2_jobs.append((context, landing_url, link, child))
    counts["hop2_links_selected"] = len(hop2_jobs)

    remaining = max(0, args.max_detail_pages - len(hop1_urls))
    hop2_urls = []
    for _context, _landing, _parent, child in hop2_jobs:
        if child["url"] not in hop2_urls:
            hop2_urls.append(child["url"])
    hop2_urls = hop2_urls[:remaining]
    allowed_hop2 = set(hop2_urls)
    hop2_pages = v6.fetch_many(hop2_urls, args.workers, with_links=False)
    for page in hop2_pages.values():
        if page.get("ok"):
            counts["hop2_pages_ok"] += 1
        else:
            counts[f"hop2_skip_{page.get('blocked') or 'unknown'}"] += 1

    for context, landing_url, parent, child in hop2_jobs:
        if child["url"] not in allowed_hop2:
            continue
        page = hop2_pages.get(child["url"]) or {}
        if not page.get("ok"):
            continue
        if v6.host_key(str(page.get("finalUrl") or page.get("url") or "")) != v6.host_key(landing_url):
            counts["hop2_cross_origin_redirect"] += 1
            continue
        link_meta = {
            "parentUrl": parent["url"],
            "parentLabel": parent.get("label") or "",
            "url": child["url"],
            "label": child.get("label") or "",
            "score": child.get("score"),
            "reasons": child.get("reasons") or [],
        }
        candidate = v6.page_candidate(page, context, 2, link_meta)
        if candidate:
            matches_by_pid[context["pid"]].append((context, candidate))
            counts["hop2_matches"] += 1

    provisional = []
    for pid, matches in sorted(matches_by_pid.items()):
        best_by_component = {}
        for context, candidate in matches:
            index = context["componentIndex"]
            current = best_by_component.get(index)
            if current is None or candidate["score"] > current["score"]:
                best_by_component[index] = candidate
        ranked = sorted(best_by_component.values(), key=lambda c: (-c["score"], c["depth"], c["finalUrl"]))
        if not ranked:
            continue
        if len(ranked) > 1 and ranked[0]["score"] - ranked[1]["score"] < 0.10:
            counts["ambiguous_confirmed_components"] += 1
            continue
        top = ranked[0]
        fp = fact_fingerprint(top)
        provisional.append({
            "googlePlaceId": pid,
            "rule": "official_same_origin_unique_store_fact",
            "providerCount": top["providerCount"],
            "providers": top["providers"],
            "detailDepth": top["depth"],
            "officialUrl": top["finalUrl"],
            "officialFactFingerprint": fp,
            "contentHash": top["contentHash"],
            "retrievedAt": top["retrievedAt"],
            "match": top["match"],
            "officialFact": top["fact"],
            "independentSourceKeys": top["independentSourceKeys"],
            "clusterScore": top.get("clusterScore"),
            "linkEvidence": top.get("link") or {},
            "hasRuleDiscriminator": has_rule_discriminator(top),
        })

    by_url = defaultdict(list)
    for row in provisional:
        by_url[row["officialUrl"]].append(row)

    url_safe = set()
    for url, rows in by_url.items():
        if len(rows) == 1:
            url_safe.add((rows[0]["googlePlaceId"], url))
            continue
        counts["shared_official_listing_urls"] += 1
        fingerprints = [row["officialFactFingerprint"] for row in rows]
        if len(fingerprints) != len(set(fingerprints)):
            counts["shared_url_duplicate_fact_deferred"] += len(rows)
            continue
        if not all(row["hasRuleDiscriminator"] for row in rows):
            counts["shared_url_weak_fact_deferred"] += len(rows)
            continue
        for row in rows:
            url_safe.add((row["googlePlaceId"], url))
            counts["shared_url_unique_store_fact_accepted"] += 1

    after_url = [row for row in provisional if (row["googlePlaceId"], row["officialUrl"]) in url_safe]
    native_users = defaultdict(set)
    for row in after_url:
        for source in row["independentSourceKeys"]:
            native_users[(source["provider"], source["providerId"])].add(row["googlePlaceId"])

    final = []
    for row in after_url:
        if not row["hasRuleDiscriminator"]:
            counts["weak_rule_discriminator_deferred"] += 1
            continue
        if any(len(native_users[(s["provider"], s["providerId"])]) > 1 for s in row["independentSourceKeys"]):
            counts["native_source_collision_deferred"] += 1
            continue
        row.pop("hasRuleDiscriminator", None)
        final.append(row)
    counts["strong_listing_fact_candidates"] = len(final)

    output = {
        "schemaVersion": 1,
        "ruleVersion": RULE_VERSION,
        "policy": {
            "newGoogleApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "promotionPerformed": False,
            "privateHistoricalHintsDurable": False,
            "proximityOnlyBindingAllowed": False,
            "minimumIndependentProviders": 2,
            "publicOfficialPageRequired": True,
            "sameOriginOnly": True,
            "sharedOfficialUrlRequiresUniqueStoreFact": True,
            "maxDepth": 2,
            "rawHtmlPersisted": False,
            "robotsRespected": True,
            "restrictedAccessBypass": False,
        },
        "summary": {
            "strongCandidates": len(final),
            "counts": dict(sorted(counts.items())),
        },
        "candidates": sorted(final, key=lambda row: row["googlePlaceId"]),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
