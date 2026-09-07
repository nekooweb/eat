#!/usr/bin/env python3
"""Compare the currently deployed named runtime with the SQLite shadow recommendation export."""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / "data" / "google_inventory_runtime.js"


def parse_assignment(path: Path, variable: str):
    text = path.read_text(encoding="utf-8")
    prefix = f"window.{variable}="
    start = text.find(prefix)
    if start < 0:
        raise RuntimeError(f"missing {variable}")
    value, _end = json.JSONDecoder().raw_decode(text[start + len(prefix):].lstrip())
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    parser.add_argument("recommendation", type=Path)
    args = parser.parse_args()

    public_rows = parse_assignment(RUNTIME, "GOOGLE_INVENTORY_RESTAURANTS")
    shadow = json.loads(args.recommendation.read_text(encoding="utf-8"))
    shadow_rows = shadow.get("rows") or []
    public_ids = [row.get("googlePlaceId") for row in public_rows]
    shadow_ids = [row.get("placeId") for row in shadow_rows]
    public_set = set(public_ids)
    shadow_set = set(shadow_ids)

    db = sqlite3.connect(args.database)
    conflict_ids = {
        row[0] for row in db.execute("SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'")
    }
    db.close()

    old_only = public_set - shadow_set
    shadow_only = shadow_set - public_set
    expected_old_only = conflict_ids & public_set
    expected_order = [pid for pid in public_ids if pid not in expected_old_only]

    failures = []
    if shadow_only:
        failures.append(f"shadow introduced IDs not in current named runtime: {sorted(shadow_only)[:10]}")
    if old_only != expected_old_only:
        failures.append(
            f"runtime/shadow removals are not exactly conflict bindings: old_only={len(old_only)} expected={len(expected_old_only)}"
        )
    if shadow_ids != expected_order:
        failures.append("shadow recommendation order differs after removing conflict IDs from current runtime")

    summary = {
        "status": "fail" if failures else "pass",
        "currentPublicRows": len(public_ids),
        "shadowRecommendationRows": len(shadow_ids),
        "oldOnlyRows": len(old_only),
        "shadowOnlyRows": len(shadow_only),
        "expectedConflictRemovals": len(expected_old_only),
        "oldOnlyPlaceIds": sorted(old_only),
        "failures": failures,
    }
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
