#!/usr/bin/env python3
"""Import retained, independently verified official-page identity evidence.

This module performs no network requests. It consumes data/official_candidate_index.json,
which was generated only after an independent HTTPS page fetch classified the host as a
candidate official site and matched the restaurant name. The retained Google Place ID is
used only as the catalog join key; no Google display payload is imported.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

import master_import_core as core

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
INDEX_PATH = DATA / "official_candidate_index.json"
ACQUISITION_METHOD = "retained_verified_official_identity_index"
BINDING_METHOD = "retained_official_page_name_match"

BLOCKED_HOST_FRAGMENTS = (
    "google.com",
    "maps.google.",
    "tabelog.com",
    "hotpepper.jp",
    "gnavi.co.jp",
    "retty.me",
    "tripadvisor.",
    "yelp.",
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "pokepara.jp",
)


def host_of(url: str) -> str:
    try:
        parsed = urlparse(url)
    except Exception:
        return ""
    if parsed.scheme != "https" or not parsed.hostname:
        return ""
    return parsed.hostname.lower().removeprefix("www.")


def normalized_record(row: dict, checked_at: str | None = None) -> dict | None:
    pid = str(row.get("googlePlaceId") or "").strip()
    name = str(row.get("name") or "").strip()
    page_url = str(row.get("pageUrl") or "").strip()
    host = host_of(page_url)
    if not pid or not name or not host:
        return None
    if any(fragment in host for fragment in BLOCKED_HOST_FRAGMENTS):
        return None

    menu_urls = []
    for raw in row.get("menuUrls") or []:
        url = str(raw or "").strip()
        if not url or host_of(url) != host:
            continue
        if url not in menu_urls:
            menu_urls.append(url)

    return {
        "googlePlaceId": pid,
        "name": name,
        "pageUrl": page_url,
        "pageHost": host,
        "menuUrls": menu_urls,
        "checkedAt": str(row.get("checkedAt") or checked_at or "").strip() or None,
    }


def load_index() -> tuple[dict, list[dict]]:
    doc = core.read_json(INDEX_PATH)
    rows = []
    by_pid = defaultdict(list)
    for raw in doc.get("records") or []:
        row = normalized_record(raw, doc.get("checkedAt"))
        if row is None:
            continue
        rows.append(row)
        by_pid[row["googlePlaceId"]].append(row)

    duplicates = {
        pid: items
        for pid, items in by_pid.items()
        if len({(item["name"], item["pageUrl"]) for item in items}) > 1
    }
    if duplicates:
        sample = ", ".join(sorted(duplicates)[:5])
        raise RuntimeError(f"official candidate index contains ambiguous duplicate Place IDs: {sample}")

    deduped = []
    seen = set()
    for row in rows:
        key = (row["googlePlaceId"], row["pageUrl"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    return doc, deduped


def provider_id(row: dict) -> str:
    digest = core.sha256_text(row["pageUrl"])[:20]
    return f"official-index:{row['googlePlaceId']}:{digest}"


def import_index(db, id_set: set[str], conflict_places: set[str], stamp: str):
    doc, rows = load_index()
    counts = Counter()
    recovered_ids = []

    for row in rows:
        pid = row["googlePlaceId"]
        if pid not in id_set:
            counts["outside_catalog"] += 1
            continue

        binding_state = "candidate" if pid in conflict_places else "reviewed"
        before = db.execute(
            "SELECT identity_state FROM catalog_entries WHERE place_id=?", (pid,)
        ).fetchone()
        before_state = before[0] if before else None
        observed = row.get("checkedAt") or doc.get("checkedAt") or stamp[:10]
        payload = {
            "googlePlaceId": pid,
            "name": row["name"],
            "pageUrl": row["pageUrl"],
            "pageHost": row["pageHost"],
            "menuUrls": row["menuUrls"],
            "retainedVerification": {
                "independentPageFetch": True,
                "officialHostCandidate": True,
                "nameMatched": True,
                "paidDataApiCalls": 0,
            },
        }
        srid = core.source_record(
            db,
            "official",
            provider_id(row),
            payload,
            row["pageUrl"],
            observed,
            ACQUISITION_METHOD,
            "retained independently fetched official-page identity evidence; no new paid data API call",
            stamp,
        )
        core.upsert_binding(
            db,
            pid,
            srid,
            binding_state,
            BINDING_METHOD,
            "reviewed_official_name_match" if binding_state == "reviewed" else "deferred_due_identity_conflict",
            None,
            stamp,
        )

        core.add_field(
            db,
            pid,
            srid,
            "name",
            row["name"],
            binding_state,
            "official",
            observed,
            stamp,
        )
        core.add_field(
            db,
            pid,
            srid,
            "source_websites",
            [row["pageUrl"], *row["menuUrls"]],
            binding_state,
            "official",
            observed,
            stamp,
        )
        core.add_field(
            db,
            pid,
            srid,
            "provenance.official_page",
            {
                "url": row["pageUrl"],
                "host": row["pageHost"],
                "checkedAt": observed,
                "nameMatched": True,
            },
            binding_state,
            "official",
            observed,
            stamp,
            resolve_field=False,
        )

        if binding_state == "reviewed":
            core.upgrade_identity(db, pid, binding_state, True, stamp)
            after_state = db.execute(
                "SELECT identity_state FROM catalog_entries WHERE place_id=?", (pid,)
            ).fetchone()[0]
            if before_state == "id_only" and after_state == "source_matched":
                recovered_ids.append(pid)
        counts[binding_state] += 1

    return {
        "inputRows": len(rows),
        "reviewed": counts["reviewed"],
        "conflictDeferred": counts["candidate"],
        "outsideCatalog": counts["outside_catalog"],
        "identityRecovered": len(recovered_ids),
        "recoveredPlaceIds": recovered_ids,
        "acquisitionMethod": ACQUISITION_METHOD,
    }
