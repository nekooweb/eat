#!/usr/bin/env python3
"""Alias-aware v2 currentness review for priority strict id-only candidates.

V1 intentionally proved that currentness location checks were conservative, but it could
miss a real branch page when one source stores a long marketing name and another stores a
short canonical name. V2 keeps every location and admission gate unchanged while allowing
page-name similarity to use the best of independent retained aliases (Hot Pepper,
Overture, and, for audit-only open candidates, OSM).

A page still cannot pass on name alone. It must independently reconfirm either address /
postcode or structured geo within 80 m. This means brand homepages and corporate pages
remain rejected even when they contain a matching brand token.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
from collections import Counter
from pathlib import Path

import audit_id_only_priority_identity_groups as priority
import collect_official_practical_fields as practical
import review_id_only_currentness_sources as v1

RULE_VERSION = "id-only-currentness-review-v2"


def aliases_for(target: dict):
    values = []
    for value in (
        (target.get("expected") or {}).get("name"),
        (target.get("overture") or {}).get("name"),
        ((target.get("overture") or {}).get("brand") or {}).get("names", {}).get("primary")
        if isinstance((target.get("overture") or {}).get("brand"), dict) else None,
        (target.get("openCandidate") or {}).get("name"),
    ):
        text = str(value or "").strip()
        if text and text not in values:
            values.append(text)
    return values


def best_name_match(page_name: str, aliases: list[str]):
    scored = [(priority.similarity(alias, page_name), alias) for alias in aliases if alias]
    if not scored:
        return 0.0, None
    scored.sort(key=lambda item: (-item[0], len(item[1])))
    return scored[0]


def currentness_check(page: dict, target: dict):
    if not page.get("ok"):
        return {
            "accepted": False,
            "reason": page.get("blocked") or "fetch_failed",
            "status": page.get("status"),
        }

    expected = target.get("expected") or {}
    expected_address = expected.get("address") or (target.get("overture") or {}).get("address") or ""
    expected_lat = expected.get("lat")
    expected_lng = expected.get("lng")
    expected_postal = priority.postcode(expected_address)
    aliases = aliases_for(target)
    candidates = []

    for fact in page.get("structuredFacts") or []:
        page_name = str(fact.get("name") or "").strip()
        if not page_name:
            continue
        name_sim, matched_alias = best_name_match(page_name, aliases)
        page_address = str(fact.get("address") or "").strip()
        addr_sim = priority.address_similarity(expected_address, page_address)
        page_postal = priority.postcode(page_address)
        postal_match = bool(expected_postal and page_postal and expected_postal == page_postal)
        geo_distance = v1.page_geo_distance(fact, expected_lat, expected_lng)
        location_ok = bool(
            postal_match
            or addr_sim >= 0.45
            or (geo_distance is not None and geo_distance <= 80)
        )
        candidates.append({
            "method": "jsonld_business_alias_aware",
            "matchedExpectedName": matched_alias,
            "pageName": page_name,
            "pageAddress": page_address,
            "nameSimilarity": round(name_sim, 4),
            "addressSimilarity": round(addr_sim, 4),
            "postalMatch": postal_match,
            "geoDistanceMeters": round(geo_distance, 1) if geo_distance is not None else None,
            "locationConfirmed": location_ok,
            "accepted": bool(name_sim >= 0.72 and location_ok),
        })

    title = str(page.get("title") or "").strip()
    visible_address = str(page.get("visibleAddress") or "").strip()
    if title:
        title_sim, matched_alias = best_name_match(title, aliases)
        addr_sim = priority.address_similarity(expected_address, visible_address)
        visible_postal = priority.postcode(visible_address)
        postal_match = bool(expected_postal and visible_postal and expected_postal == visible_postal)
        candidates.append({
            "method": "title_plus_visible_address_alias_aware",
            "matchedExpectedName": matched_alias,
            "pageName": title,
            "pageAddress": visible_address,
            "nameSimilarity": round(title_sim, 4),
            "addressSimilarity": round(addr_sim, 4),
            "postalMatch": postal_match,
            "geoDistanceMeters": None,
            "locationConfirmed": bool(postal_match or addr_sim >= 0.50),
            "accepted": bool(title_sim >= 0.82 and (postal_match or addr_sim >= 0.50)),
        })

    accepted = [row for row in candidates if row["accepted"]]
    if not accepted:
        best = sorted(
            candidates,
            key=lambda row: (
                not row.get("locationConfirmed"),
                -float(row.get("nameSimilarity") or 0),
                -float(row.get("addressSimilarity") or 0),
                float(row.get("geoDistanceMeters") or 999999),
            ),
        )[:2]
        return {
            "accepted": False,
            "reason": "current_page_did_not_reconfirm_alias_and_location",
            "aliasesChecked": aliases,
            "bestChecks": best,
            "finalUrl": page.get("finalUrl"),
            "retrievedAt": page.get("retrievedAt"),
            "contentHash": page.get("contentHash"),
        }

    accepted.sort(
        key=lambda row: (
            -float(row.get("nameSimilarity") or 0),
            -float(row.get("addressSimilarity") or 0),
            float(row.get("geoDistanceMeters") or 999999),
        )
    )
    return {
        "accepted": True,
        "reason": "current_page_reconfirmed_source_alias_and_location",
        "aliasesChecked": aliases,
        "bestCheck": accepted[0],
        "finalUrl": page.get("finalUrl"),
        "retrievedAt": page.get("retrievedAt"),
        "contentHash": page.get("contentHash"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    targets, counts = v1.build_targets(args.database)
    pages = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(10, args.workers))) as pool:
        futures = {pool.submit(practical.fetch_visible_page, t["currentnessUrl"]): t for t in targets}
        for future in concurrent.futures.as_completed(futures):
            target = futures[future]
            key = target["googlePlaceId"] + "|" + target["group"]
            try:
                pages[key] = future.result()
            except Exception as exc:
                pages[key] = {"url": target["currentnessUrl"], "ok": False, "blocked": type(exc).__name__}

    rows = []
    for target in targets:
        key = target["googlePlaceId"] + "|" + target["group"]
        page = pages.get(key) or {}
        review = currentness_check(page, target)
        if page.get("ok"):
            counts["currentness_pages_ok"] += 1
        else:
            counts[f"currentness_fetch_{page.get('blocked') or 'unknown'}"] += 1
        if review.get("accepted"):
            counts["currentness_confirmed"] += 1
        admission_ready = bool(
            target["group"] == "hotpepper_high_direct_overture"
            and target.get("hardHistoricalBindingGate")
            and target.get("hardDirectOvertureGate")
            and review.get("accepted") is True
        )
        if admission_ready:
            counts["admission_ready"] += 1
        row = dict(target)
        row["sourceAliases"] = aliases_for(target)
        row["currentnessReview"] = review
        row["admissionReady"] = admission_ready
        rows.append(row)

    rows.sort(key=lambda row: (not row["admissionReady"], row["group"], row["googlePlaceId"]))
    output = {
        "schemaVersion": 1,
        "ruleVersion": RULE_VERSION,
        "policy": {
            "paidDataApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "automaticIdentityPromotion": False,
            "proposalOnly": True,
            "independentHttpsOnly": True,
            "aggregatorAndSocialCurrentnessExcluded": True,
            "independentSourceAliasesAllowed": True,
            "nameAndLocationReconfirmationRequired": True,
            "locationThresholdsUnchangedFromV1": True,
            "openOsmOvertureGroupAdmissionReadyDisabled": True,
            "rawHtmlPersisted": False,
        },
        "summary": {"targets": len(targets), "counts": dict(sorted(counts.items()))},
        "rows": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
