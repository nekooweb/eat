#!/usr/bin/env python3
"""Collect missing fields from retained/reviewed official-page identities.

This collector does not use Google display data or call Google APIs. It starts from
`official_candidate_index.json`, but only for Place IDs whose corresponding retained
official binding is currently `reviewed` in the SQLite master. The current public HTTPS
page is fetched through the robots-aware v4 fetcher and must still match the retained
official restaurant name before field claims are emitted.

Raw HTML is never persisted. Durable claims keep stable URL, retrieval timestamp,
content SHA-256 and parser version. V2 output is snapshot-based, so later scans may
append a changed official-page snapshot for the same Place ID while canonical field
resolution remains import-time missing-only.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import sqlite3
from collections import Counter
from pathlib import Path

import reconcile_private_google_hints as names
import reconcile_private_official_web_consensus_v4 as web

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RULE_VERSION = "source-basic-web-field-evidence-v2"
IDENTITY_RULE = "retained_verified_official_page"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def known_index(db):
    return {
        (pid, key)
        for pid, key in db.execute(
            "SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'"
        )
    }


def missing_fields(known, pid):
    equivalents = {
        "address": ("address",),
        "coordinates": ("coordinates",),
        "cuisine": ("cuisine",),
        "hours": ("hours.raw", "hours.reference.legacy", "hours.normalized.legacy"),
        "lunch_budget": ("budget.lunch.range", "budget.lunch.legacy_range"),
        "dinner_budget": ("budget.dinner.range", "budget.dinner.legacy_range"),
        "telephone": ("contact.telephone",),
    }
    return [
        kind for kind, keys in equivalents.items()
        if not any((pid, key) in known for key in keys)
    ]


def selected_official_bindings(db) -> set[str]:
    return {
        pid for pid, in db.execute(
            """SELECT DISTINCT sb.place_id
               FROM source_bindings sb
               JOIN source_records sr ON sr.source_record_id=sb.source_record_id
               WHERE sr.acquisition_method='retained_verified_official_identity_index'
                 AND sb.binding_state='reviewed'"""
        )
    }


def normalized_cuisine(fact: dict, page: dict):
    raw = fact.get("cuisine")
    if isinstance(raw, list):
        raw = " ".join(str(item) for item in raw if item)
    if raw:
        mapped = web.cuisine_signal(str(raw))
        if mapped:
            return mapped
    return page.get("visibleCuisine") or None


def fact_candidates(page: dict, retained_name: str):
    output = []
    for fact in page.get("structuredFacts") or []:
        fact_name = str(fact.get("name") or "").strip()
        if not fact_name:
            continue
        similarity = names.similarity(retained_name, fact_name)
        output.append((similarity, fact))
    output.sort(key=lambda item: (-item[0], -len(str(item[1].get("address") or ""))))
    return output


def select_page_fact(page: dict, retained_name: str):
    candidates = fact_candidates(page, retained_name)
    title = str(page.get("title") or "").strip()
    title_similarity = names.similarity(retained_name, title) if title else 0.0

    if candidates and candidates[0][0] >= 0.72:
        similarity, fact = candidates[0]
        # If two different structured business nodes are similarly plausible, do not
        # choose one automatically (common on chain/store-list pages).
        runner = candidates[1][0] if len(candidates) > 1 else 0.0
        if len(candidates) > 1 and runner >= 0.72 and similarity - runner < 0.08:
            return None, {
                "accepted": False,
                "reason": "ambiguous_structured_business_nodes",
                "bestNameSimilarity": round(similarity, 6),
                "runnerNameSimilarity": round(runner, 6),
                "titleNameSimilarity": round(title_similarity, 6),
            }
        return fact, {
            "accepted": True,
            "identityRule": IDENTITY_RULE,
            "retainedOfficialBindingReviewed": True,
            "pageNameMatchMethod": "jsonld_business_name",
            "pageNameSimilarity": round(similarity, 6),
            "titleNameSimilarity": round(title_similarity, 6),
        }

    # Visible-page fallback is intentionally stricter because the page could be a group
    # home page. It may contribute hours/cuisine only when the title strongly identifies
    # the retained official business; visible address requires an even stronger title.
    if title_similarity >= 0.88:
        fact = {
            "name": title,
            "address": page.get("visibleAddress") if title_similarity >= 0.92 else "",
            "openingHoursRaw": [page["visibleHours"]] if page.get("visibleHours") else [],
            "cuisine": page.get("visibleCuisine"),
            "priceRange": "",
            "telephone": "",
            "geo": None,
        }
        return fact, {
            "accepted": True,
            "identityRule": IDENTITY_RULE,
            "retainedOfficialBindingReviewed": True,
            "pageNameMatchMethod": "strong_page_title",
            "pageNameSimilarity": round(title_similarity, 6),
            "titleNameSimilarity": round(title_similarity, 6),
        }

    return None, {
        "accepted": False,
        "reason": "current_page_name_not_specific_enough",
        "bestNameSimilarity": round(candidates[0][0], 6) if candidates else 0.0,
        "titleNameSimilarity": round(title_similarity, 6),
    }


def claims_from_fact(fact: dict, page: dict, missing: set[str]):
    claims = {}
    address = str(fact.get("address") or "").strip()
    if "address" in missing and address:
        claims["address"] = address

    opening = list(fact.get("openingHoursRaw") or [])
    if not opening and page.get("visibleHours"):
        opening = [page["visibleHours"]]
    if "hours" in missing and opening:
        claims["openingHoursRaw"] = opening

    cuisine = normalized_cuisine(fact, page)
    if "cuisine" in missing and cuisine:
        claims["cuisineNormalized"] = cuisine

    geo = fact.get("geo")
    if "coordinates" in missing and isinstance(geo, dict):
        lat, lng = geo.get("lat"), geo.get("lng")
        if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
            claims["geo"] = {"lat": float(lat), "lng": float(lng)}

    price = str(fact.get("priceRange") or "").strip()
    if ("lunch_budget" in missing or "dinner_budget" in missing) and price:
        # Raw only. Do not guess whether a generic official priceRange means lunch or dinner.
        claims["priceRange"] = price

    telephone = str(fact.get("telephone") or "").strip()
    if "telephone" in missing and telephone:
        claims["telephone"] = telephone
    return claims


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--max-pages", type=int, default=250)
    args = ap.parse_args()

    index_doc = load_json(DATA / "official_candidate_index.json")
    db = sqlite3.connect(args.database)
    states = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    conflict_places = {
        pid for pid, in db.execute(
            "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
        )
    }
    reviewed_official = selected_official_bindings(db)
    known = known_index(db)
    db.close()

    counts = Counter()
    targets = []
    seen_pid = set()
    seen_url = set()
    for record in index_doc.get("records") or []:
        pid = str(record.get("googlePlaceId") or "").strip()
        page_url = web.normalize_url(record.get("pageUrl"))
        retained_name = str(record.get("name") or "").strip()
        if not pid or pid in seen_pid:
            continue
        seen_pid.add(pid)
        if states.get(pid) not in ("verified", "source_matched"):
            counts["identity_not_publishable"] += 1
            continue
        if pid in conflict_places:
            counts["identity_conflict"] += 1
            continue
        if pid not in reviewed_official:
            counts["official_binding_not_reviewed"] += 1
            continue
        missing = missing_fields(known, pid)
        if not missing:
            counts["already_field_complete"] += 1
            continue
        if not page_url:
            counts["invalid_or_blocked_page_url"] += 1
            continue
        if page_url in seen_url:
            # One page describing multiple restaurants cannot safely provide canonical
            # fields to all of them without store-specific structured nodes.
            counts["shared_page_url_deferred"] += 1
            continue
        seen_url.add(page_url)
        targets.append({
            "pid": pid,
            "name": retained_name,
            "pageUrl": page_url,
            "missing": missing,
            "checkedAt": record.get("checkedAt") or index_doc.get("checkedAt"),
        })

    targets = targets[: max(0, args.max_pages)]
    counts["target_rows"] = len(targets)
    counts["telephone_completion_target_enabled"] = 1
    pages = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(12, args.workers))) as pool:
        future_map = {pool.submit(web.fetch_page, target["pageUrl"]): target for target in targets}
        for future in concurrent.futures.as_completed(future_map):
            target = future_map[future]
            try:
                pages[target["pid"]] = future.result()
            except Exception as exc:
                pages[target["pid"]] = {
                    "url": target["pageUrl"], "ok": False,
                    "blocked": type(exc).__name__, "status": None,
                }

    rows = []
    field_counts = Counter()
    for target in targets:
        page = pages.get(target["pid"]) or {}
        if not page.get("ok"):
            counts[f"page_skip_{page.get('blocked') or 'unknown'}"] += 1
            continue
        counts["pages_ok"] += 1
        fact, identity_check = select_page_fact(page, target["name"])
        if not fact or identity_check.get("accepted") is not True:
            counts[identity_check.get("reason") or "page_identity_not_reconfirmed"] += 1
            continue
        claims = claims_from_fact(fact, page, set(target["missing"]))
        if not claims:
            counts["verified_page_without_missing_field_claim"] += 1
            continue
        for key in claims:
            field_counts[key] += 1
        final_url = str(page.get("finalUrl") or page.get("url") or "")
        source_provider_id = "official-index:" + hashlib.sha256(target["pageUrl"].encode("utf-8")).hexdigest()[:20]
        rows.append({
            "googlePlaceId": target["pid"],
            "sourceProvider": "official",
            "sourceProviderId": source_provider_id,
            "missingBefore": sorted(target["missing"]),
            "identityCheck": identity_check,
            "webEvidence": {
                "sourceUrl": page.get("url"),
                "finalUrl": final_url,
                "retrievedAt": page.get("retrievedAt"),
                "contentHash": page.get("contentHash"),
                "parserVersion": web.PARSER_VERSION,
                "rawHtmlPersisted": False,
                "retainedOfficialIndexCheckedAt": target.get("checkedAt"),
            },
            "fieldClaims": claims,
            "checkedAt": (page.get("retrievedAt") or web.utc_now())[:10],
        })
        counts["new_evidence_rows"] += 1

    output = {
        "schemaVersion": 2,
        "ruleVersion": RULE_VERSION,
        "checkedAt": web.utc_now()[:10],
        "policy": {
            "paidDataApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "sourceBackedIdentityRequired": True,
            "httpsExistingSourceUrlsOnly": True,
            "rawHtmlPersisted": False,
            "robotsRespected": True,
            "restrictedAccessBypass": False,
            "telephoneIncludedInCompletionTargets": True,
            "multiSnapshotEvidenceByPlaceId": True,
            "snapshotIdentity": ["googlePlaceId", "finalUrl", "contentHash"],
            "crossSnapshotClaimMerge": False,
            "canonicalResolution": "import_time_missing_only",
        },
        "summary": {
            "rows": len(rows),
            "places": len({row["googlePlaceId"] for row in rows}),
            "fieldCounts": dict(sorted(field_counts.items())),
            "fetchCounts": dict(sorted(counts.items())),
        },
        "rows": sorted(
            rows,
            key=lambda row: (
                row["googlePlaceId"],
                str((row.get("webEvidence") or {}).get("finalUrl") or ""),
                str((row.get("webEvidence") or {}).get("contentHash") or ""),
            ),
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
