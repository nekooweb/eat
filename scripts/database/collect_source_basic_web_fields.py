#!/usr/bin/env python3
"""Collect missing fields from public pages already attached to source-backed identities.

No Google display data or Google API is used. The restaurant name/address/coordinates
used for page verification come from the independent source row already stored in
`google_basic_source_matches.json`. Public-page access and parsing reuse the v4
robots-aware official-web collector. Raw HTML is never written to disk.

Evidence is append-only at the verified page snapshot level. A Place ID may retain
multiple snapshots when the final URL or content hash changes. Claims are merged only
inside the exact same `(Place ID, final URL, content hash)` snapshot, while SQLite
canonical resolution remains import-time missing-only.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

import reconcile_private_google_hints as base
import reconcile_private_official_web_consensus_v4 as web

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RULE_VERSION = "source-basic-web-field-evidence-v2"
LEGACY_RULE_VERSION = "source-basic-web-field-evidence-v1"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def known_index(db):
    return {
        (pid, key)
        for pid, key in db.execute(
            "SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'"
        )
    }


def field_missing(known, pid, kind):
    equivalents = {
        "address": ("address",),
        "coordinates": ("coordinates",),
        "cuisine": ("cuisine",),
        "hours": ("hours.raw", "hours.reference.legacy", "hours.normalized.legacy"),
        "lunch_budget": ("budget.lunch.range", "budget.lunch.legacy_range"),
        "dinner_budget": ("budget.dinner.range", "budget.dinner.legacy_range"),
        "telephone": ("contact.telephone",),
    }[kind]
    return not any((pid, key) in known for key in equivalents)


def source_member(row: dict, overture_by_id: dict[str, dict]) -> dict:
    provider = str(row.get("provider") or "")
    provider_id = str(row.get("providerId") or "")
    if provider == "Overture Maps" and provider_id in overture_by_id:
        full = dict(overture_by_id[provider_id])
        # Durable basic values are the identity anchor; full Overture row contributes
        # native phone/website metadata for page verification only.
        full.update({
            "provider": provider,
            "providerId": provider_id,
            "name": row.get("name") or full.get("name"),
            "address": row.get("address") or full.get("address"),
            "lat": row.get("lat") if isinstance(row.get("lat"), (int, float)) else full.get("lat"),
            "lng": row.get("lng") if isinstance(row.get("lng"), (int, float)) else full.get("lng"),
            "websites": row.get("websites") or full.get("websites") or [],
        })
        return full
    return {
        "provider": provider,
        "providerId": provider_id,
        "name": row.get("name") or "",
        "address": row.get("address") or "",
        "lat": row.get("lat"),
        "lng": row.get("lng"),
        "cuisine": row.get("cuisine"),
        "websites": row.get("websites") or [],
        "raw": {},
    }


def normalize_cuisine(fact, page):
    raw = fact.get("cuisine")
    if isinstance(raw, list):
        raw = " ".join(str(x) for x in raw if x)
    label = web.cuisine_signal(str(raw or "")) if raw else None
    return label or page.get("visibleCuisine") or None


def snapshot_key(row: dict) -> tuple[str, str, str]:
    pid = str(row.get("googlePlaceId") or "").strip()
    evidence = row.get("webEvidence") or {}
    final_url = str(evidence.get("finalUrl") or evidence.get("sourceUrl") or "").strip()
    content_hash = str(evidence.get("contentHash") or "").strip()
    return pid, final_url, content_hash


def merge_same_snapshot(current: dict, incoming: dict) -> int:
    current_claims = dict(current.get("fieldClaims") or {})
    incoming_claims = dict(incoming.get("fieldClaims") or {})
    added = 0
    for key, value in incoming_claims.items():
        if key not in current_claims and value not in (None, "", [], {}):
            current_claims[key] = value
            added += 1
    if added:
        current["fieldClaims"] = current_claims
        current["missingBefore"] = sorted(
            set(current.get("missingBefore") or []) | set(incoming.get("missingBefore") or [])
        )
    return added


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--output", type=Path, default=DATA / "source_basic_web_field_evidence.json")
    ap.add_argument("--existing", type=Path, default=DATA / "source_basic_web_field_evidence.json")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--max-pages", type=int, default=800)
    args = ap.parse_args()

    basics = load_json(DATA / "google_basic_source_matches.json")
    existing_doc = load_json(args.existing) if args.existing.exists() else {"rows": []}
    existing_version = str(existing_doc.get("ruleVersion") or "")
    if existing_version and existing_version not in {LEGACY_RULE_VERSION, RULE_VERSION}:
        raise RuntimeError(f"unsupported existing source-basic web evidence version: {existing_version}")
    existing_rows = [dict(row) for row in (existing_doc.get("rows") or []) if row.get("googlePlaceId")]
    existing_by_pid = defaultdict(list)
    for row in existing_rows:
        existing_by_pid[str(row["googlePlaceId"])].append(row)

    overture_by_id = {
        str(row.get("providerId")): row
        for row in base.overture_rows()
        if row.get("providerId")
    }

    db = sqlite3.connect(args.database)
    states = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    conflicts = {
        row[0] for row in db.execute(
            "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
        )
    }
    known = known_index(db)
    db.close()

    targets = []
    counts = Counter()
    counts["existing_evidence_rows"] = len(existing_rows)
    counts["places_with_existing_evidence"] = len(existing_by_pid)
    for row in basics.get("rows") or []:
        pid = str(row.get("googlePlaceId") or "")
        if states.get(pid) not in ("verified", "source_matched") or pid in conflicts:
            continue
        missing = [
            kind for kind in (
                "address", "coordinates", "cuisine", "hours",
                "lunch_budget", "dinner_budget", "telephone"
            )
            if field_missing(known, pid, kind)
        ]
        if not missing:
            continue
        member = source_member(row, overture_by_id)
        if not isinstance(member.get("lat"), (int, float)) or not isinstance(member.get("lng"), (int, float)):
            continue
        urls = web.candidate_urls(member)
        if not urls:
            continue
        if pid in existing_by_pid:
            counts["rescan_targets_with_existing_evidence"] += 1
        targets.append({"pid": pid, "basic": row, "member": member, "missing": missing, "urls": urls})

    unique_urls = []
    for target in targets:
        for url in target["urls"]:
            if url not in unique_urls:
                unique_urls.append(url)
    unique_urls = unique_urls[: max(0, args.max_pages)]
    allowed_urls = set(unique_urls)
    counts["target_rows"] = len(targets)
    counts["unique_pages"] = len(unique_urls)
    counts["telephone_completion_target_enabled"] = 1

    pages = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(12, args.workers))) as pool:
        futures = {pool.submit(web.fetch_page, url): url for url in unique_urls}
        for future in concurrent.futures.as_completed(futures):
            url = futures[future]
            try:
                pages[url] = future.result()
            except Exception as exc:
                pages[url] = {"url": url, "ok": False, "blocked": type(exc).__name__}
    counts["pages_ok"] = sum(1 for page in pages.values() if page.get("ok"))
    for page in pages.values():
        if not page.get("ok"):
            counts[f"page_skip_{page.get('blocked') or 'unknown'}"] += 1

    collected = [dict(row) for row in existing_rows]
    snapshot_index = {}
    for index, row in enumerate(collected):
        key = snapshot_key(row)
        if not all(key):
            raise RuntimeError(f"existing source-basic web evidence has incomplete snapshot key: {key}")
        if key in snapshot_index:
            raise RuntimeError(f"duplicate existing source-basic web snapshot: {key}")
        snapshot_index[key] = index

    new_field_counts = Counter()
    for target in targets:
        member = target["member"]
        page_matches = []
        for url in target["urls"]:
            if url not in allowed_urls:
                continue
            page = pages.get(url) or {}
            if not page.get("ok"):
                continue
            match, fact = web.best_page_fact(page, [(member, {})])
            if match and fact:
                page_matches.append((match["score"], match, fact, page))
        if not page_matches:
            counts["no_verified_page"] += 1
            continue
        page_matches.sort(key=lambda item: (-item[0], -item[1]["maxSourceNameSimilarity"], item[3]["finalUrl"]))
        _score, match, fact, page = page_matches[0]
        missing = set(target["missing"])
        opening = list(fact.get("openingHoursRaw") or [])
        if not opening and page.get("visibleHours"):
            opening = [page["visibleHours"]]
        cuisine = normalize_cuisine(fact, page)
        address = str(fact.get("address") or page.get("visibleAddress") or "").strip()
        claims = {}
        if "address" in missing and address:
            claims["address"] = address
            new_field_counts["address"] += 1
        if "hours" in missing and opening:
            claims["openingHoursRaw"] = opening
            new_field_counts["hours.raw"] += 1
        if "cuisine" in missing and cuisine:
            claims["cuisineNormalized"] = cuisine
            new_field_counts["cuisine"] += 1
        if "coordinates" in missing and isinstance(fact.get("geo"), dict):
            claims["geo"] = fact["geo"]
            new_field_counts["coordinates"] += 1
        if ("lunch_budget" in missing or "dinner_budget" in missing) and str(fact.get("priceRange") or "").strip():
            claims["priceRange"] = str(fact.get("priceRange")).strip()
            new_field_counts["budget.web_price_range_raw"] += 1
        if "telephone" in missing and str(fact.get("telephone") or "").strip():
            claims["telephone"] = str(fact.get("telephone")).strip()
            new_field_counts["contact.telephone"] += 1
        if not claims:
            counts["verified_page_without_missing_field_claim"] += 1
            continue

        incoming = {
            "googlePlaceId": target["pid"],
            "sourceProvider": target["basic"].get("provider"),
            "sourceProviderId": target["basic"].get("providerId"),
            "missingBefore": sorted(missing),
            "identityCheck": {"accepted": True, **match},
            "webEvidence": {
                "sourceUrl": page.get("url"),
                "finalUrl": page.get("finalUrl"),
                "retrievedAt": page.get("retrievedAt"),
                "contentHash": page.get("contentHash"),
                "parserVersion": web.PARSER_VERSION,
                "rawHtmlPersisted": False,
            },
            "fieldClaims": claims,
            "checkedAt": (page.get("retrievedAt") or web.utc_now())[:10],
        }
        key = snapshot_key(incoming)
        current_index = snapshot_index.get(key)
        if current_index is not None:
            added = merge_same_snapshot(collected[current_index], incoming)
            if added:
                counts["same_snapshot_claims_extended"] += added
            else:
                counts["same_snapshot_already_present"] += 1
            continue

        had_prior_place = target["pid"] in existing_by_pid
        collected.append(incoming)
        snapshot_index[key] = len(collected) - 1
        counts["new_snapshot_rows"] += 1
        counts["new_snapshot_for_existing_place" if had_prior_place else "new_snapshot_for_new_place"] += 1

    rows = sorted(
        collected,
        key=lambda row: (
            str(row.get("googlePlaceId") or ""),
            str((row.get("webEvidence") or {}).get("retrievedAt") or row.get("checkedAt") or ""),
            str((row.get("webEvidence") or {}).get("finalUrl") or ""),
            str((row.get("webEvidence") or {}).get("contentHash") or ""),
        ),
    )
    durable_field_counts = Counter()
    durable_places = set()
    for row in rows:
        durable_places.add(str(row.get("googlePlaceId") or ""))
        for key in (row.get("fieldClaims") or {}):
            durable_field_counts[key] += 1

    payload = {
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
            "places": len(durable_places),
            "fieldCounts": dict(sorted(durable_field_counts.items())),
            "newFieldClaims": dict(sorted(new_field_counts.items())),
            "fetchCounts": dict(sorted(counts.items())),
        },
        "rows": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", **payload["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
