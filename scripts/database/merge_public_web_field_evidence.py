#!/usr/bin/env python3
"""Merge public-web field evidence without mixing provenance across pages.

The current evidence schema keeps one public page per Place ID. If two collectors produce
facts for the same Place ID from different pages/content hashes, this merger deliberately
keeps the already durable row instead of combining claims whose provenance would become
ambiguous. Same-page/same-content rows may merge missing field claims safely.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

RULE_VERSION = "source-basic-web-field-evidence-v1"


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validate(doc: dict) -> None:
    if doc.get("ruleVersion") != RULE_VERSION:
        raise RuntimeError(f"unexpected ruleVersion: {doc.get('ruleVersion')}")
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
    seen = set()
    for row in doc.get("rows") or []:
        pid = str(row.get("googlePlaceId") or "").strip()
        if not pid or pid in seen:
            raise RuntimeError(f"invalid/duplicate Place ID: {pid or '<missing>'}")
        seen.add(pid)


def evidence_key(row: dict) -> tuple[str, str]:
    ev = row.get("webEvidence") or {}
    return str(ev.get("finalUrl") or ev.get("sourceUrl") or ""), str(ev.get("contentHash") or "")


def merge(base_doc: dict, incoming_doc: dict) -> tuple[dict, dict]:
    validate(base_doc)
    validate(incoming_doc)
    rows = {str(row["googlePlaceId"]): dict(row) for row in base_doc.get("rows") or []}
    counts = Counter()
    for incoming in incoming_doc.get("rows") or []:
        pid = str(incoming["googlePlaceId"])
        current = rows.get(pid)
        if current is None:
            rows[pid] = dict(incoming)
            counts["added"] += 1
            continue
        if evidence_key(current) != evidence_key(incoming):
            counts["different_page_deferred"] += 1
            continue
        current_claims = dict(current.get("fieldClaims") or {})
        incoming_claims = dict(incoming.get("fieldClaims") or {})
        added_claims = 0
        for key, value in incoming_claims.items():
            if key not in current_claims and value not in (None, "", [], {}):
                current_claims[key] = value
                added_claims += 1
        if added_claims:
            current["fieldClaims"] = current_claims
            missing = set(current.get("missingBefore") or []) | set(incoming.get("missingBefore") or [])
            current["missingBefore"] = sorted(missing)
            rows[pid] = current
            counts["same_page_claims_extended"] += added_claims
        else:
            counts["already_present"] += 1

    output_rows = [rows[pid] for pid in sorted(rows)]
    field_counts = Counter()
    provider_counts = Counter()
    for row in output_rows:
        provider_counts[str(row.get("sourceProvider") or "unknown")] += 1
        for key in (row.get("fieldClaims") or {}):
            field_counts[key] += 1
    output = dict(base_doc)
    output["checkedAt"] = max(
        str(base_doc.get("checkedAt") or ""),
        str(incoming_doc.get("checkedAt") or ""),
    )
    output["rows"] = output_rows
    output["summary"] = {
        "rows": len(output_rows),
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
