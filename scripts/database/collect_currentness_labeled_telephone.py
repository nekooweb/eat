#!/usr/bin/env python3
"""Collect a unique explicit telephone from retained currentness branch pages.

Eligible rows must already be publishable/non-conflict and must carry a retained
multi-source identityConsensus with an exact `currentIndependentPage.url`. The same page
is fetched again, must independently reconfirm the retained name + location using the
currentness reviewer, and must contain exactly one `TEL`/`電話`-labelled Japanese number.
No ID-only row can be upgraded here and canonical writes remain import-time missing-only.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import sqlite3
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import collect_official_labeled_telephone as telephone
import collect_official_practical_fields as practical
import review_id_only_currentness_sources_v2 as v2
import review_id_only_currentness_sources_v3 as v3

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RULE_VERSION = "source-basic-web-field-evidence-v2"
PARSER_VERSION = "retained-currentness-labeled-telephone-v1"
IDENTITY_RULE = "retained_multisource_currentness_page"


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def known_phones(db):
    return {
        str(pid)
        for pid, in db.execute(
            "SELECT place_id FROM field_resolutions WHERE field_key='contact.telephone' AND resolution_state='known'"
        )
    }


def selected_targets(db):
    states = {str(pid): str(state) for pid, state in db.execute("SELECT place_id,identity_state FROM catalog_entries")}
    conflicts = {
        str(pid) for pid, in db.execute(
            "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
        )
    }
    phones = known_phones(db)
    basic = load_json(DATA / "google_basic_source_matches.json")
    counts = Counter()
    targets = []
    seen_url = {}

    for row in basic.get("rows") or []:
        pid = str(row.get("googlePlaceId") or "").strip()
        if not pid:
            continue
        consensus = row.get("identityConsensus") or {}
        consensus_policy = consensus.get("policy") or {}
        current = consensus.get("currentIndependentPage") or {}
        url = str(current.get("url") or "").strip()
        if not consensus or not url:
            continue
        counts["rows_with_retained_currentness_page"] += 1
        if states.get(pid) not in ("verified", "source_matched"):
            counts["identity_not_publishable"] += 1
            continue
        if pid in conflicts:
            counts["identity_conflict"] += 1
            continue
        if pid in phones:
            counts["telephone_already_known"] += 1
            continue
        if consensus_policy.get("sourceMatchedOnly") is not True or consensus_policy.get("currentnessRequired") is not True:
            counts["identity_consensus_policy_not_strict"] += 1
            continue
        if consensus_policy.get("proximityOnlyBindingAllowed") is not False:
            counts["identity_consensus_allows_proximity_only"] += 1
            continue
        if not url.startswith("https://"):
            counts["currentness_url_not_https"] += 1
            continue
        if url in seen_url and seen_url[url] != pid:
            counts["shared_currentness_url_deferred"] += 1
            continue
        seen_url[url] = pid
        overture = consensus.get("overtureSupport") or {}
        targets.append({
            "pid": pid,
            "name": str(row.get("name") or "").strip(),
            "address": str(row.get("address") or "").strip(),
            "lat": row.get("lat"),
            "lng": row.get("lng"),
            "url": url,
            "matchLevel": row.get("matchLevel"),
            "verification": row.get("verification"),
            "retainedContentHash": current.get("contentHash"),
            "expected": {
                "name": str(row.get("name") or "").strip(),
                "address": str(row.get("address") or "").strip(),
                "lat": row.get("lat"),
                "lng": row.get("lng"),
            },
            "overture": overture,
        })
    counts["target_rows"] = len(targets)
    return targets, counts


def identity_check(target, page):
    v2.best_name_match = v3.best_name_match
    review = v2.currentness_check(page, target)
    check = review.get("bestCheck") or {}
    accepted = bool(
        review.get("accepted") is True
        and check.get("locationConfirmed") is True
        and float(check.get("nameSimilarity") or 0) >= 0.72
    )
    return {
        "accepted": accepted,
        "identityRule": IDENTITY_RULE,
        "preExistingSourceMatchedIdentity": True,
        "freshNameAndLocationReconfirmed": accepted,
        "proximityOnlyBindingAllowed": False,
        "retainedConsensusRule": target.get("matchLevel"),
        "retainedVerification": target.get("verification"),
        "currentnessReason": review.get("reason"),
        "pageName": check.get("pageName"),
        "pageAddress": check.get("pageAddress"),
        "matchedExpectedName": check.get("matchedExpectedName"),
        "pageNameSimilarity": check.get("nameSimilarity"),
        "pageAddressSimilarity": check.get("addressSimilarity"),
        "postalMatch": check.get("postalMatch"),
        "minimumGeoDistanceMeters": check.get("geoDistanceMeters"),
        "locationConfirmed": check.get("locationConfirmed"),
    }, review


def evidence_row(target, page, check, phone, snippet):
    final_url = str(page.get("finalUrl") or page.get("url") or target["url"])
    provider_id = "currentness-page:" + hashlib.sha256(final_url.encode("utf-8")).hexdigest()[:20]
    retrieved = str(page.get("retrievedAt") or utc_now())
    return {
        "googlePlaceId": target["pid"],
        "sourceProvider": "official",
        "sourceProviderId": provider_id,
        "missingBefore": ["telephone"],
        "identityCheck": check,
        "webEvidence": {
            "sourceUrl": target["url"],
            "finalUrl": final_url,
            "retrievedAt": retrieved,
            "contentHash": page.get("contentHash"),
            "parserVersion": PARSER_VERSION,
            "rawHtmlPersisted": False,
            "discovery": {
                "method": "retained_multisource_currentness_page",
                "retainedConsensusRule": target.get("matchLevel"),
                "currentPageFetchedAgain": True,
                "nameAndLocationReconfirmedAgain": True,
                "telephoneParserVersion": telephone.PHONE_PARSER_VERSION,
                "labelRequired": True,
                "singleDistinctLabeledNumberRequired": True,
                "evidenceSnippet": snippet,
            },
        },
        "fieldClaims": {"telephone": phone},
        "checkedAt": retrieved[:10],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    db = sqlite3.connect(args.database)
    targets, counts = selected_targets(db)
    db.close()

    pages = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(12, args.workers))) as pool:
        futures = {pool.submit(practical.fetch_visible_page, target["url"]): target for target in targets}
        for future in concurrent.futures.as_completed(futures):
            target = futures[future]
            try:
                pages[target["pid"]] = future.result()
            except Exception as exc:
                pages[target["pid"]] = {"url": target["url"], "ok": False, "blocked": type(exc).__name__}

    rows = []
    for target in targets:
        page = pages.get(target["pid"]) or {}
        if not page.get("ok"):
            counts[f"page_skip_{page.get('blocked') or 'unknown'}"] += 1
            continue
        counts["pages_ok"] += 1
        check, review = identity_check(target, page)
        if check.get("accepted") is not True:
            counts[f"identity_recheck_{review.get('reason') or 'failed'}"] += 1
            continue
        counts["identity_reconfirmed"] += 1
        phone, snippet, reason = telephone.explicit_labeled_telephone(page.get("visibleText") or "")
        if not phone:
            counts[f"phone_{reason}"] += 1
            continue
        rows.append(evidence_row(target, page, check, phone, snippet or ""))
        counts["telephone_evidence"] += 1

    # immutable snapshot identity, no cross-snapshot merge here
    deduped = {}
    for row in rows:
        ev = row.get("webEvidence") or {}
        key = (row["googlePlaceId"], ev.get("finalUrl"), ev.get("contentHash"))
        deduped.setdefault(key, row)
    rows = [deduped[key] for key in sorted(deduped)]

    output = {
        "schemaVersion": 2,
        "ruleVersion": RULE_VERSION,
        "checkedAt": utc_now()[:10],
        "policy": {
            "paidDataApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "sourceBackedIdentityRequired": True,
            "rawHtmlPersisted": False,
            "robotsRespected": True,
            "restrictedAccessBypass": False,
            "retainedMultisourceCurrentnessPageOnly": True,
            "freshNameAndLocationReconfirmationRequired": True,
            "explicitTelephoneLabelRequired": True,
            "singleDistinctLabeledNumberRequired": True,
            "canonicalResolution": "import_time_missing_only",
            "multiSnapshotEvidenceByPlaceId": True,
            "snapshotIdentity": ["googlePlaceId", "finalUrl", "contentHash"],
            "crossSnapshotClaimMerge": False,
        },
        "summary": {
            "rows": len(rows),
            "places": len({row["googlePlaceId"] for row in rows}),
            "fieldCounts": {"telephone": len(rows)} if rows else {},
            "fetchCounts": dict(sorted(counts.items())),
        },
        "rows": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
