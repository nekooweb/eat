#!/usr/bin/env python3
"""Compare deployed named runtime with the SQLite shadow recommendation export.

During bulk completion the shadow is allowed to add catalog members only when the
selected name comes from an explicitly approved, reviewed recovery method. Current
public non-conflict rows must never disappear.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RUNTIME = DATA / "google_inventory_runtime.js"
APPROVED_SAFE_RECOVERY_METHODS = {
    "retained_verified_official_identity_index",
}


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

    inventory = json.loads((DATA / "area1_google_ids.json").read_text(encoding="utf-8"))
    frozen_order = inventory.get("googlePlaceIds") or []
    if len(frozen_order) != 2804 or len(set(frozen_order)) != 2804:
        raise RuntimeError("frozen catalog baseline is invalid")

    db = sqlite3.connect(args.database)
    conflict_ids = {
        row[0] for row in db.execute(
            "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
        )
    }

    safe_recovery = {}
    for pid, method, binding_state, identity_state in db.execute(
        """SELECT r.place_id,sr.acquisition_method,sb.binding_state,ce.identity_state
           FROM field_resolutions r
           JOIN field_observations o ON o.observation_id=r.observation_id
           JOIN source_records sr ON sr.source_record_id=o.source_record_id
           JOIN source_bindings sb
             ON sb.place_id=o.place_id AND sb.source_record_id=o.source_record_id
           JOIN catalog_entries ce ON ce.place_id=r.place_id
           WHERE r.field_key='name' AND r.resolution_state='known'"""
    ):
        if method in APPROVED_SAFE_RECOVERY_METHODS and binding_state == "reviewed":
            safe_recovery[pid] = {
                "method": method,
                "identityState": identity_state,
            }
    db.close()

    current_only = public_set - shadow_set
    shadow_only = shadow_set - public_set
    expected_current_only = conflict_ids & public_set
    unsafe_additions = {
        pid for pid in shadow_only
        if pid not in safe_recovery
        or safe_recovery[pid]["identityState"] not in ("source_matched", "verified")
        or pid in conflict_ids
    }
    expected_shadow_order = [pid for pid in frozen_order if pid in shadow_set]

    failures = []
    if current_only != expected_current_only:
        failures.append(
            "runtime/shadow removals are not exactly current conflict bindings: "
            f"current_only={len(current_only)} expected={len(expected_current_only)}"
        )
    if unsafe_additions:
        failures.append(
            f"shadow introduced {len(unsafe_additions)} IDs without approved reviewed recovery: "
            f"{sorted(unsafe_additions)[:10]}"
        )
    if shadow_ids != expected_shadow_order:
        failures.append("shadow recommendation order does not preserve frozen catalog order")

    methods = {}
    for pid in sorted(shadow_only):
        method = safe_recovery.get(pid, {}).get("method", "unapproved")
        methods[method] = methods.get(method, 0) + 1

    summary = {
        "status": "fail" if failures else "pass",
        "currentPublicRows": len(public_ids),
        "shadowRecommendationRows": len(shadow_ids),
        "currentOnlyRows": len(current_only),
        "expectedConflictRemovals": len(expected_current_only),
        "safeAddedRows": len(shadow_only) - len(unsafe_additions),
        "unsafeAddedRows": len(unsafe_additions),
        "safeAdditionMethods": dict(sorted(methods.items())),
        "currentOnlyPlaceIds": sorted(current_only),
        "safeAddedPlaceIds": sorted(shadow_only - unsafe_additions),
        "failures": failures,
    }
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
