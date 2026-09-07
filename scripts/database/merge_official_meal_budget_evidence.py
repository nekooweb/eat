#!/usr/bin/env python3
"""Merge durable official meal-budget evidence by immutable page snapshot.

Different content hashes are kept as separate snapshots so provenance is never mixed.
Exact duplicate snapshots are deduplicated. The importer processes newest snapshots first
and resolves missing-only, allowing history to remain auditable without overwriting a
canonical value merely because an older page snapshot is still retained.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

RULE_VERSION = "official-meal-budget-web-evidence-v1"
PARSER_VERSION = "official-meal-budget-web-v1"


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validate(doc: dict) -> None:
    if doc.get("ruleVersion") != RULE_VERSION or doc.get("parserVersion") != PARSER_VERSION:
        raise RuntimeError("unexpected official meal-budget evidence version")
    policy = doc.get("policy") or {}
    expected = {
        "paidDataApiCalls": 0,
        "googleDisplayPayloadPersisted": False,
        "reviewedOfficialIdentityRequired": True,
        "explicitMealLabelRequired": True,
        "explicitBudgetCueRequired": True,
        "finiteRangeOnly": True,
        "genericPriceRangePromoted": False,
        "rawHtmlPersisted": False,
        "robotsRespected": True,
        "restrictedAccessBypass": False,
    }
    for key, value in expected.items():
        if policy.get(key) != value:
            raise RuntimeError(f"official meal-budget policy mismatch: {key}")
    seen = set()
    for row in doc.get("rows") or []:
        pid = str(row.get("googlePlaceId") or "").strip()
        ev = row.get("webEvidence") or {}
        key = (pid, str(ev.get("finalUrl") or ev.get("sourceUrl") or ""), str(ev.get("contentHash") or ""))
        if not pid or not key[1] or not key[2] or key in seen:
            raise RuntimeError(f"invalid/duplicate evidence snapshot: {key}")
        seen.add(key)


def snapshot_key(row: dict):
    ev = row.get("webEvidence") or {}
    return (
        str(row.get("googlePlaceId") or ""),
        str(ev.get("finalUrl") or ev.get("sourceUrl") or ""),
        str(ev.get("contentHash") or ""),
    )


def merge(base_doc: dict, incoming_doc: dict):
    validate(base_doc)
    validate(incoming_doc)
    rows = {snapshot_key(row): dict(row) for row in base_doc.get("rows") or []}
    counts = Counter()
    for incoming in incoming_doc.get("rows") or []:
        key = snapshot_key(incoming)
        if key in rows:
            counts["already_present_snapshot"] += 1
            continue
        rows[key] = dict(incoming)
        counts["added_snapshots"] += 1

    output_rows = list(rows.values())
    output_rows.sort(
        key=lambda row: (
            str(row.get("googlePlaceId") or ""),
            str((row.get("webEvidence") or {}).get("retrievedAt") or row.get("checkedAt") or ""),
            str((row.get("webEvidence") or {}).get("contentHash") or ""),
        )
    )
    field_counts = Counter()
    place_ids = set()
    for row in output_rows:
        place_ids.add(str(row.get("googlePlaceId") or ""))
        for meal in (row.get("budgetClaims") or {}):
            field_counts[meal] += 1

    output = dict(base_doc)
    output["checkedAt"] = max(
        str(base_doc.get("checkedAt") or ""),
        str(incoming_doc.get("checkedAt") or ""),
    )
    output["rows"] = output_rows
    output["summary"] = {
        "snapshots": len(output_rows),
        "places": len(place_ids),
        "fieldCounts": dict(sorted(field_counts.items())),
        "lastMerge": dict(sorted(counts.items())),
    }
    validate(output)
    metrics = {
        "status": "pass",
        "baseSnapshots": len(base_doc.get("rows") or []),
        "incomingSnapshots": len(incoming_doc.get("rows") or []),
        "mergedSnapshots": len(output_rows),
        "places": len(place_ids),
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
