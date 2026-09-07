#!/usr/bin/env python3
"""Summarize the retained Overture candidate snapshot without network access.

The output is diagnostic metadata only: row count, spatial extent, field coverage and
Overture-ID uniqueness. It does not copy restaurant names/addresses into the report.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "overture_area1_candidates.json"


def nonempty(value) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, dict)):
        return bool(value)
    return True


def safe_metadata(value):
    """Keep only small non-row source metadata needed to reproduce the snapshot scope."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [safe_metadata(x) for x in value[:20]]
    if isinstance(value, dict):
        return {str(k): safe_metadata(v) for k, v in list(value.items())[:40]}
    return str(value)[:500]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    ap.add_argument("--output", type=Path)
    args = ap.parse_args()

    doc = json.loads(args.input.read_text(encoding="utf-8"))
    rows = doc.get("rows") or []
    if not isinstance(rows, list):
        raise RuntimeError("Overture snapshot rows must be a list")

    lats, lngs = [], []
    ids = []
    coverage = Counter()
    top_keys = Counter()
    nested_key_samples = Counter()
    for row in rows:
        if not isinstance(row, dict):
            continue
        top_keys.update(row.keys())
        oid = str(row.get("overtureId") or row.get("providerId") or row.get("id") or "").strip()
        if oid:
            ids.append(oid)
        lat, lng = row.get("lat"), row.get("lng")
        if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
            lats.append(float(lat)); lngs.append(float(lng))
        for key in (
            "name", "address", "addresses", "lat", "lng", "websites", "website", "phones", "phone",
            "categories", "basicCategory", "basic_category", "taxonomy", "sources", "confidence"
        ):
            if nonempty(row.get(key)):
                coverage[key] += 1
        for key, value in row.items():
            if isinstance(value, dict):
                for child in value.keys():
                    nested_key_samples[f"{key}.{child}"] += 1

    if not lats or not lngs:
        raise RuntimeError("retained Overture snapshot has no usable coordinates")

    output = {
        "schemaVersion": 1,
        "ruleVersion": "retained-overture-snapshot-summary-v1",
        "policy": {"networkRequests": 0, "restaurantDisplayPayloadCopied": False},
        "snapshotMetadata": {
            "release": safe_metadata(doc.get("release")),
            "scope": safe_metadata(doc.get("scope")),
            "source": safe_metadata(doc.get("source")),
        },
        "summary": {
            "rows": len(rows),
            "overtureIdsPresent": len(ids),
            "uniqueOvertureIds": len(set(ids)),
            "duplicateOvertureIds": len(ids) - len(set(ids)),
            "extent": {
                "west": min(lngs), "south": min(lats),
                "east": max(lngs), "north": max(lats),
            },
            "coordinateRows": len(lats),
            "fieldCoverage": dict(sorted(coverage.items())),
            "topLevelKeys": sorted(top_keys),
            "nestedKeyShapes": sorted(nested_key_samples)[:100],
            "sourceMetadataKeys": sorted(k for k in doc.keys() if k != "rows"),
        },
    }
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"status":"pass", **output["summary"]}, sort_keys=True))


if __name__ == "__main__":
    main()
