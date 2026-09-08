#!/usr/bin/env python3
"""Merge public-web field evidence without mixing provenance across page snapshots.

V2 keys durable evidence by `(Place ID, final URL, content hash)`. Multiple snapshots may
belong to one Place ID, but claims are extended only when the immutable snapshot key is
identical. V1 one-row-per-Place documents remain accepted as migration input and are
upgraded to V2 on write.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

RULE_VERSION = "source-basic-web-field-evidence-v2"
LEGACY_RULE_VERSION = "source-basic-web-field-evidence-v1"
SUPPORTED = {LEGACY_RULE_VERSION, RULE_VERSION}


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def snapshot_key(row: dict) -> tuple[str, str, str]:
    pid = str(row.get("googlePlaceId") or "").strip()
    ev = row.get("webEvidence") or {}
    final_url = str(ev.get("finalUrl") or ev.get("sourceUrl") or "").strip()
    content_hash = str(ev.get("contentHash") or "").strip()
    return pid, final_url, content_hash


def validate(doc: dict) -> None:
    version = str(doc.get("ruleVersion") or "")
    if version not in SUPPORTED:
        raise RuntimeError(f"unexpected ruleVersion: {version}")
    policy = doc.get("policy") or {}
    if policy.get("paidDataApiCalls") != 0:
        raise RuntimeError("paid data API calls are forbidden")
    if policy.get("googleDisplayPayloadPersisted") is not False:
        raise RuntimeError("Google display payload persistence is forbidden")
    if policy.get("sourceBackedIdentityRequired") is not True:
        raise RuntimeError("source-backed identity is required")
    if policy.get("rawHtmlPersisted") is not False:
        raise RuntimeError("raw HTML persistence is forbidden")
    if policy.get("robotsRespected") is not True:
        raise RuntimeError("robots policy must be enforced")
    if version == RULE_VERSION:
        if policy.get("multiSnapshotEvidenceByPlaceId") is not True:
            raise RuntimeError("v2 evidence must enable multi-snapshot provenance")
        if policy.get("crossSnapshotClaimMerge") is not False:
            raise RuntimeError("v2 evidence must forbid cross-snapshot claim merges")
        if policy.get("snapshotIdentity") != ["googlePlaceId", "finalUrl", "contentHash"]:
            raise RuntimeError("v2 snapshot identity is invalid")

    seen = set()
    seen_pid = set()
    for row in doc.get("rows") or []:
        key = snapshot_key(row)
        pid, final_url, content_hash = key
        if not pid or not final_url or not content_hash:
            raise RuntimeError(f"incomplete evidence snapshot key: {key}")
        if key in seen:
            raise RuntimeError(f"duplicate evidence snapshot: {key}")
        seen.add(key)
        if version == LEGACY_RULE_VERSION:
            if pid in seen_pid:
                raise RuntimeError(f"duplicate Place ID in v1 evidence: {pid}")
            seen_pid.add(pid)


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


def merge(base_doc: dict, incoming_doc: dict) -> tuple[dict, dict]:
    validate(base_doc)
    validate(incoming_doc)
    rows = {}
    for row in base_doc.get("rows") or []:
        key = snapshot_key(row)
        rows[key] = dict(row)

    counts = Counter()
    base_places = {key[0] for key in rows}
    for incoming in incoming_doc.get("rows") or []:
        key = snapshot_key(incoming)
        current = rows.get(key)
        if current is None:
            rows[key] = dict(incoming)
            counts["snapshot_added"] += 1
            if key[0] in base_places:
                counts["snapshot_added_existing_place"] += 1
            else:
                counts["snapshot_added_new_place"] += 1
                base_places.add(key[0])
            continue
        added_claims = merge_same_snapshot(current, incoming)
        if added_claims:
            rows[key] = current
            counts["same_snapshot_claims_extended"] += added_claims
        else:
            counts["snapshot_already_present"] += 1

    output_rows = [
        rows[key]
        for key in sorted(
            rows,
            key=lambda item: (item[0], item[1], item[2]),
        )
    ]
    field_counts = Counter()
    provider_counts = Counter()
    places = set()
    snapshots_per_place = Counter()
    for row in output_rows:
        pid = str(row.get("googlePlaceId") or "")
        places.add(pid)
        snapshots_per_place[pid] += 1
        provider_counts[str(row.get("sourceProvider") or "unknown")] += 1
        for key in (row.get("fieldClaims") or {}):
            field_counts[key] += 1

    output = dict(base_doc)
    output["schemaVersion"] = 2
    output["ruleVersion"] = RULE_VERSION
    output["checkedAt"] = max(
        str(base_doc.get("checkedAt") or ""),
        str(incoming_doc.get("checkedAt") or ""),
    )
    output["policy"] = {
        **(base_doc.get("policy") or {}),
        **(incoming_doc.get("policy") or {}),
        "paidDataApiCalls": 0,
        "googleDisplayPayloadPersisted": False,
        "sourceBackedIdentityRequired": True,
        "rawHtmlPersisted": False,
        "robotsRespected": True,
        "multiSnapshotEvidenceByPlaceId": True,
        "snapshotIdentity": ["googlePlaceId", "finalUrl", "contentHash"],
        "crossSnapshotClaimMerge": False,
        "canonicalResolution": "import_time_missing_only",
    }
    output["rows"] = output_rows
    output["summary"] = {
        "rows": len(output_rows),
        "places": len(places),
        "placesWithMultipleSnapshots": sum(1 for value in snapshots_per_place.values() if value > 1),
        "fieldCounts": dict(sorted(field_counts.items())),
        "providerCounts": dict(sorted(provider_counts.items())),
        "lastMerge": dict(sorted(counts.items())),
    }
    validate(output)
    metrics = {
        "status": "pass",
        "baseRows": len(base_doc.get("rows") or []),
        "incomingRows": len(incoming_doc.get("rows") or []),
        "mergedRows": len(output_rows),
        "mergedPlaces": len(places),
        "placesWithMultipleSnapshots": output["summary"]["placesWithMultipleSnapshots"],
        **dict(sorted(counts.items())),
        "fieldCounts": dict(sorted(field_counts.items())),
    }
    return output, metrics


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base", type=Path)
    ap.add_argument("incoming", type=Path)
    ap.add_argument("output", type=Path)
    args = ap.parse_args()
    base_doc = load(args.base)
    incoming_doc = load(args.incoming)
    output, metrics = merge(base_doc, incoming_doc)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metrics, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
