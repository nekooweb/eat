#!/usr/bin/env python3
"""Review current independent webpages for priority strict id-only identity candidates.

This is a proposal-only, zero-paid-API review pass. It does not create bindings or
catalog admissions. It focuses on strict id-only rows with retained Hot Pepper `high`
review candidates that also have a strong direct match to the retained Overture snapshot.
A smaller OSM<->Overture A/B priority group is included for currentness diagnostics but is
never marked admission-ready by this script because its historical frozen-ID<->OSM link
is still review-grade.

For Hot Pepper candidates, `admissionReady` requires all of the following:
- current strict SQLite identity state is `id_only`;
- retained Hot Pepper binding confidence is high and based on the historical full sweep;
- historical Google-seed<->Hot Pepper distance <= 15 m, name similarity >= 0.60,
  combined score >= 0.74;
- fresh retained Hot Pepper<->Overture direct match is strong, distance <= 20 m,
  Overture name similarity >= 0.75 and runner-up margin >= 0.15;
- Overture exposes a non-aggregator independent website;
- the current HTTPS page independently reconfirms the restaurant name plus either its
  address/postcode or structured geo within 80 m.

Generic brand homepages, aggregator pages, Hot Pepper/Tabelog/Gurunavi/social pages,
current pages with only a name, and pages with ambiguous structured business nodes are
not admission-ready. Raw HTML is never persisted.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import math
import re
import sqlite3
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import audit_id_only_priority_identity_groups as priority
import collect_official_practical_fields as practical

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RULE_VERSION = "id-only-currentness-review-v1"

BLOCKED_HOST_SUFFIXES = (
    "tabelog.com", "hotpepper.jp", "owst.jp", "r.gnavi.co.jp", "gnavi.co.jp",
    "retty.me", "tripadvisor.com", "tripadvisor.jp", "yelp.com", "foursquare.com",
    "autoreserve.com", "paypaygourmet.yahoo.co.jp", "loco.yahoo.co.jp", "ekiten.jp",
    "on.omisenomikata.jp", "instagram.com", "facebook.com", "x.com", "twitter.com",
    "youtube.com", "tiktok.com",
)


def independent_https_url(value: str):
    raw = str(value or "").strip()
    if not raw:
        return None, "missing_url"
    try:
        parsed = urlparse(raw if "://" in raw else "https://" + raw)
    except Exception:
        return None, "invalid_url"
    host = (parsed.hostname or "").lower().strip(".")
    if host.startswith("www."):
        host = host[4:]
    if not host:
        return None, "invalid_host"
    if any(host == suffix or host.endswith("." + suffix) for suffix in BLOCKED_HOST_SUFFIXES):
        return None, "blocked_aggregator_or_social"
    # The repository's public web evidence policy is HTTPS-only. Upgrade retained HTTP
    # website metadata; if the server does not support HTTPS, fetch will fail safely.
    path = parsed.path or "/"
    return urlunparse(("https", parsed.netloc, path, parsed.params, parsed.query, "")), "accepted_independent_host"


def page_geo_distance(page_fact: dict, lat, lng):
    geo = page_fact.get("geo") if isinstance(page_fact, dict) else None
    if not isinstance(geo, dict):
        return None
    plat, plng = geo.get("lat"), geo.get("lng")
    if not all(isinstance(v, (int, float)) for v in (plat, plng, lat, lng)):
        return None
    return priority.haversine(float(lat), float(lng), float(plat), float(plng))


def currentness_check(page: dict, expected: dict):
    if not page.get("ok"):
        return {
            "accepted": False,
            "reason": page.get("blocked") or "fetch_failed",
            "status": page.get("status"),
        }

    expected_name = expected.get("name") or ""
    expected_address = expected.get("address") or ""
    expected_lat, expected_lng = expected.get("lat"), expected.get("lng")
    expected_postal = priority.postcode(expected_address)

    candidates = []
    for fact in page.get("structuredFacts") or []:
        fact_name = str(fact.get("name") or "").strip()
        if not fact_name:
            continue
        name_sim = priority.similarity(expected_name, fact_name)
        fact_address = str(fact.get("address") or "").strip()
        addr_sim = priority.address_similarity(expected_address, fact_address)
        fact_postal = priority.postcode(fact_address)
        postal_match = bool(expected_postal and fact_postal and expected_postal == fact_postal)
        geo_distance = page_geo_distance(fact, expected_lat, expected_lng)
        location_ok = bool(
            postal_match
            or addr_sim >= 0.45
            or (geo_distance is not None and geo_distance <= 80)
        )
        candidates.append({
            "method": "jsonld_business",
            "pageName": fact_name,
            "pageAddress": fact_address,
            "nameSimilarity": round(name_sim, 4),
            "addressSimilarity": round(addr_sim, 4),
            "postalMatch": postal_match,
            "geoDistanceMeters": round(geo_distance, 1) if geo_distance is not None else None,
            "locationConfirmed": location_ok,
            "accepted": bool(name_sim >= 0.72 and location_ok),
        })

    # Visible/page-title fallback still requires an independently matching address.
    title = str(page.get("title") or "").strip()
    visible_address = str(page.get("visibleAddress") or "").strip()
    if title:
        title_sim = priority.similarity(expected_name, title)
        addr_sim = priority.address_similarity(expected_address, visible_address)
        visible_postal = priority.postcode(visible_address)
        postal_match = bool(expected_postal and visible_postal and expected_postal == visible_postal)
        candidates.append({
            "method": "title_plus_visible_address",
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
            "reason": "current_page_did_not_reconfirm_name_and_location",
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
    best = accepted[0]
    return {
        "accepted": True,
        "reason": "current_page_reconfirmed_name_and_location",
        "bestCheck": best,
        "finalUrl": page.get("finalUrl"),
        "retrievedAt": page.get("retrievedAt"),
        "contentHash": page.get("contentHash"),
    }


def load_states(database: Path):
    db = sqlite3.connect(database)
    states = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    db.close()
    return states


def build_targets(database: Path):
    states = load_states(database)
    queue = priority.load_json(DATA / "area1_enrichment_queue.json", {"items": []}) or {"items": []}
    queue_by_pid = {
        str(item.get("googlePlaceId")): item
        for item in queue.get("items") or []
        if item.get("googlePlaceId")
    }
    hp_doc = priority.load_json(DATA / "hotpepper_catalog_facts.json", {"rows": []}) or {"rows": []}
    hp_by_pid = {str(row.get("googlePlaceId")): row for row in hp_doc.get("rows") or []}
    overture_doc = priority.load_json(DATA / "overture_area1_candidates.json", {"rows": []}) or {"rows": []}
    overture_rows = overture_doc.get("rows") or []
    overture_grid = priority.build_overture_grid(overture_rows)

    targets = []
    counts = Counter()
    id_only = {pid for pid, state in states.items() if state == "id_only"}

    # Group B first: these are the only rows that may become admission-ready here.
    for pid in sorted(id_only):
        hp = hp_by_pid.get(pid)
        if not hp or (hp.get("binding") or {}).get("confidence") != "high":
            continue
        binding = hp.get("binding") or {}
        facts = hp.get("facts") or {}
        direct = priority.direct_hp_overture({
            "name": facts.get("name"),
            "address": facts.get("address"),
            "lat": facts.get("lat"),
            "lng": facts.get("lng"),
        }, overture_grid)
        if not direct.get("strongReviewCandidate"):
            counts["hp_high_direct_overture_not_strong"] += 1
            continue
        best = direct.get("best") or {}
        website_values = best.get("websites") or []
        selected_url = None
        blocked_reasons = []
        for raw_url in website_values:
            candidate_url, reason = independent_https_url(raw_url)
            if candidate_url:
                selected_url = candidate_url
                break
            blocked_reasons.append(reason)
        if not selected_url:
            counts["hp_high_no_independent_currentness_url"] += 1
            continue
        hard_history = bool(
            binding.get("seedSource") == "transient_full_sweep"
            and float(binding.get("distanceMeters") or 999999) <= 15
            and float(binding.get("nameSimilarity") or 0) >= 0.60
            and float(binding.get("combinedScore") or 0) >= 0.74
        )
        hard_overture = bool(
            direct.get("strongReviewCandidate")
            and float(best.get("distanceMeters") or 999999) <= 20
            and float(best.get("nameSimilarity") or 0) >= 0.75
            and float(best.get("margin") or 0) >= 0.15
        )
        targets.append({
            "googlePlaceId": pid,
            "group": "hotpepper_high_direct_overture",
            "currentnessUrl": selected_url,
            "expected": {
                "name": facts.get("name"),
                "address": facts.get("address"),
                "lat": facts.get("lat"),
                "lng": facts.get("lng"),
            },
            "hotpepper": {
                "hotpepperId": hp.get("hotpepperId"),
                "binding": binding,
            },
            "overture": best,
            "hardHistoricalBindingGate": hard_history,
            "hardDirectOvertureGate": hard_overture,
            "blockedAlternativeUrlReasons": blocked_reasons,
        })
        counts["hp_high_currentness_targets"] += 1

    # Group A: useful currentness evidence, but never admission-ready because the frozen
    # ID<->OSM historical mapping remains review-grade.
    for pid in sorted(id_only):
        item = queue_by_pid.get(pid) or {}
        overture = item.get("overtureSupport") or {}
        if overture.get("triage") not in {"A_priority_review", "B_blocker_review"}:
            continue
        website_values = overture.get("websites") or []
        selected_url = None
        for raw_url in website_values:
            candidate_url, _reason = independent_https_url(raw_url)
            if candidate_url:
                selected_url = candidate_url
                break
        if not selected_url:
            counts["open_cross_priority_no_independent_currentness_url"] += 1
            continue
        open_candidate = item.get("openCandidate") or {}
        targets.append({
            "googlePlaceId": pid,
            "group": "open_overture_cross_priority",
            "currentnessUrl": selected_url,
            "expected": {
                "name": overture.get("name") or open_candidate.get("name"),
                "address": open_candidate.get("address") or "",
                "lat": open_candidate.get("lat"),
                "lng": open_candidate.get("lng"),
            },
            "openCandidate": open_candidate,
            "overture": overture,
            "hardHistoricalBindingGate": False,
            "hardDirectOvertureGate": False,
        })
        counts["open_cross_priority_currentness_targets"] += 1

    return targets, counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    targets, counts = build_targets(args.database)
    pages = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(10, args.workers))) as pool:
        futures = {pool.submit(practical.fetch_visible_page, t["currentnessUrl"]): t for t in targets}
        for future in concurrent.futures.as_completed(futures):
            target = futures[future]
            try:
                pages[target["googlePlaceId"] + "|" + target["group"]] = future.result()
            except Exception as exc:
                pages[target["googlePlaceId"] + "|" + target["group"]] = {
                    "url": target["currentnessUrl"], "ok": False, "blocked": type(exc).__name__
                }

    rows = []
    for target in targets:
        key = target["googlePlaceId"] + "|" + target["group"]
        page = pages.get(key) or {}
        review = currentness_check(page, target["expected"])
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
            "nameAndLocationReconfirmationRequired": True,
            "openOsmOvertureGroupAdmissionReadyDisabled": True,
            "rawHtmlPersisted": False,
        },
        "summary": {
            "targets": len(targets),
            "counts": dict(sorted(counts.items())),
        },
        "rows": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
