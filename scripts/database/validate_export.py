#!/usr/bin/env python3
"""Validate shadow catalog/recommendation exports against the SQLite master."""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    parser.add_argument("catalog", type=Path)
    parser.add_argument("recommendation", type=Path)
    args = parser.parse_args()

    inventory = json.loads((DATA / "area1_google_ids.json").read_text(encoding="utf-8"))
    expected_order = inventory.get("googlePlaceIds") or []
    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    recommendation = json.loads(args.recommendation.read_text(encoding="utf-8"))
    failures = []

    def expect(condition, message):
        if not condition:
            failures.append(message)

    catalog_rows = catalog.get("rows") or []
    recommendation_rows = recommendation.get("rows") or []
    catalog_ids = [row.get("placeId") for row in catalog_rows]
    recommendation_ids = [row.get("placeId") for row in recommendation_rows]

    expect(len(expected_order) == 2804 and len(set(expected_order)) == 2804, "frozen inventory baseline invalid")
    expect(catalog.get("rowCount") == 2804 and len(catalog_rows) == 2804, f"catalog row count={len(catalog_rows)}")
    expect(catalog_ids == expected_order, "catalog export does not exactly preserve frozen Place ID order")
    expect(len(recommendation_ids) == len(set(recommendation_ids)), "recommendation export has duplicate Place IDs")
    expect(all(pid in set(expected_order) for pid in recommendation_ids), "recommendation contains ID outside catalog")
    expect(recommendation.get("rowCount") == len(recommendation_rows), "recommendation rowCount mismatch")

    db = sqlite3.connect(args.database)
    db.execute("PRAGMA foreign_keys=ON")
    try:
        expected_eligible = []
        for pid in expected_order:
            state_row = db.execute("SELECT identity_state FROM catalog_entries WHERE place_id=?", (pid,)).fetchone()
            name_row = db.execute("""
                SELECT o.value_json
                FROM field_resolutions r
                JOIN field_observations o ON o.observation_id=r.observation_id
                WHERE r.place_id=? AND r.field_key='name' AND r.resolution_state='known'
            """, (pid,)).fetchone()
            has_conflict = db.execute(
                "SELECT 1 FROM source_bindings WHERE place_id=? AND binding_state='conflict' LIMIT 1",
                (pid,),
            ).fetchone() is not None
            name = json.loads(name_row[0]) if name_row else None
            if state_row and state_row[0] in ("verified", "source_matched") and isinstance(name, str) and name.strip() and not has_conflict:
                expected_eligible.append(pid)

        expect(recommendation_ids == expected_eligible, f"recommendation IDs differ from DB eligibility: export={len(recommendation_ids)} expected={len(expected_eligible)}")

        for row in recommendation_rows:
            expect(row.get("publicationEligible") is True, f"ineligible recommendation row: {row.get('placeId')}")
            expect(not row.get("exclusionReasons"), f"recommendation has exclusion reason: {row.get('placeId')}")
            expect(isinstance(row.get("name"), str) and row["name"].strip(), f"recommendation missing name: {row.get('placeId')}")
            expect(row.get("name") != "Google Maps 餐厅", f"placeholder leaked into recommendation: {row.get('placeId')}")

        id_only_rows = [row for row in catalog_rows if row.get("identityState") == "id_only"]
        expect(all(row.get("name") is None for row in id_only_rows), "id-only catalog row has published name")
        expect(all(row.get("publicationEligible") is False for row in id_only_rows), "id-only catalog row marked eligible")

        conflict_ids = {
            row[0] for row in db.execute("SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'")
        }
        expect(not (conflict_ids & set(recommendation_ids)), "conflict binding Place ID leaked into recommendation")

        forbidden_top_keys = {"payload_json", "rawPayload", "permissionBasis", "permission_basis"}
        for row in catalog_rows:
            expect(not (forbidden_top_keys & set(row)), f"raw/private key leaked into catalog: {row.get('placeId')}")

        summary = {
            "status": "fail" if failures else "pass",
            "catalogRows": len(catalog_rows),
            "recommendationRows": len(recommendation_rows),
            "expectedEligible": len(expected_eligible),
            "idOnlyRows": len(id_only_rows),
            "conflictBindingPlaces": len(conflict_ids),
            "failures": failures,
        }
        print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    finally:
        db.close()

    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
