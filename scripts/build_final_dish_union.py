#!/usr/bin/env python3
"""Build the exact final approved dish-evidence union.

The eight shard branches were independently validated from the same PR #67 base.
For each shard, this script computes only the monotonic evidence-key delta against
that common base, verifies the expected per-shard R/F item counts, then unions those
deltas with the newly approved Official/Retained adapter output.
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

FIELDS = ("recommendedDishes", "featuredDishes")
EXPECTED = {
    0: (2, 2), 1: (6, 7), 2: (6, 7), 3: (1, 6),
    4: (2, 2), 5: (3, 5), 6: (5, 1), 7: (11, 3),
}


def load(path):
    return json.loads(Path(path).read_text())


def key(pid, field, dish):
    return json.dumps([pid, field, dish.get("nameZh"), dish.get("provider"), dish.get("sourceUrl"), dish.get("evidenceClass") or ""], ensure_ascii=False, separators=(",", ":"))


def index(doc):
    out = {}
    for row in doc.get("rows", []):
        for field in FIELDS:
            for dish in row.get(field, []) or []:
                k = key(row["googlePlaceId"], field, dish)
                if k in out:
                    raise SystemExit(f"duplicate evidence key in input: {k}")
                out[k] = (row, field, dish)
    return out


def add_item(rows, row, field, dish):
    pid = row["googlePlaceId"]
    target = rows.setdefault(pid, {"googlePlaceId": pid, "name": row.get("name"), "recommendedDishes": [], "featuredDishes": []})
    if not target.get("name") and row.get("name"):
        target["name"] = row["name"]
    target[field].append(dish)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--official-retained", required=True)
    ap.add_argument("--shard-dir", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--audit", required=True)
    args = ap.parse_args()

    base = load(args.base)
    base_idx = index(base)
    approved_rows = {}
    shard_stats = {}
    all_shard_keys = set()

    for s in range(8):
        doc = load(Path(args.shard_dir) / f"S{s}.json")
        idx = index(doc)
        missing = set(base_idx) - set(idx)
        if missing:
            raise SystemExit(f"S{s} lost {len(missing)} PR67-base evidence keys")
        delta = [v for k, v in idx.items() if k not in base_idx]
        r = sum(1 for _, field, _ in delta if field == "recommendedDishes")
        f = sum(1 for _, field, _ in delta if field == "featuredDishes")
        if (r, f) != EXPECTED[s]:
            raise SystemExit(f"S{s} canonical delta mismatch: {(r, f)} != {EXPECTED[s]}")
        shard_stats[f"S{s}"] = {"R": r, "F": f, "total": len(delta)}
        for row, field, dish in delta:
            k = key(row["googlePlaceId"], field, dish)
            if k in all_shard_keys:
                raise SystemExit(f"cross-shard duplicate canonical evidence key: {k}")
            all_shard_keys.add(k)
            add_item(approved_rows, row, field, dish)

    if sum(v["R"] for v in shard_stats.values()) != 36 or sum(v["F"] for v in shard_stats.values()) != 33:
        raise SystemExit("S0-S7 aggregate canonical delta is not 36 R + 33 F")

    official = load(args.official_retained)
    official_idx = index(official)
    overlap = all_shard_keys & set(official_idx)
    if overlap:
        raise SystemExit(f"Official/Retained approved evidence overlaps shard evidence keys: {len(overlap)}")
    for row, field, dish in official_idx.values():
        add_item(approved_rows, row, field, dish)

    rows = sorted(approved_rows.values(), key=lambda r: r["googlePlaceId"])
    for row in rows:
        for field in FIELDS:
            row[field].sort(key=lambda d: (d.get("nameZh") or "", d.get("provider") or "", d.get("sourceUrl") or ""))
    out = {
        "schemaVersion": 4,
        "checkedAt": "2026-09-15",
        "policy": {
            "paidGoogleDataApiCalls": 0,
            "networkRequests": 0,
            "source": "final union of digest-approved Official/Retained review and validated S0-S7 shard canonical deltas",
            "fullSourceEvidenceRetained": True,
            "evidenceStorageItemLimit": None,
        },
        "summary": {
            "shardRecommendationEvidenceItems": 36,
            "shardFeaturedEvidenceItems": 33,
            "officialRetainedRecommendationEvidenceItems": sum(1 for _, f, _ in official_idx.values() if f == "recommendedDishes"),
            "officialRetainedFeaturedEvidenceItems": sum(1 for _, f, _ in official_idx.values() if f == "featuredDishes"),
            "totalApprovedEvidenceItems": len(all_shard_keys) + len(official_idx),
        },
        "rows": rows,
    }
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
    audit = {"status": "pass", "commonBaseEvidenceItems": len(base_idx), "shards": shard_stats,
             "shardTotals": {"R": 36, "F": 33},
             "officialRetained": {"R": out["summary"]["officialRetainedRecommendationEvidenceItems"],
                                  "F": out["summary"]["officialRetainedFeaturedEvidenceItems"]},
             "totalApprovedEvidenceItems": out["summary"]["totalApprovedEvidenceItems"],
             "crossShardDuplicateKeys": 0, "officialShardOverlapKeys": 0, "paidGoogleDataApiCalls": 0}
    Path(args.audit).write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(audit, ensure_ascii=False))


if __name__ == "__main__":
    main()
