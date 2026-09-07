#!/usr/bin/env python3
"""Generate shadow catalog/recommendation exports from the SQLite master.

This exporter is not wired to Pages yet. It intentionally publishes resolved fields and
coverage/status metadata only; raw source payloads and unresolved evidence stay local.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
SCHEMA_VERSION = 1
ELIGIBILITY_VERSION = "shadow-recommendation-v1"

PRACTICAL_EXPORT_FIELDS = {
    "practical.accepted_credit_cards": "acceptedCreditCards",
    "practical.special_features": "specialFeatures",
    "practical.mobile_coupon_available": "mobileCouponAvailable",
    "practical.nearest_station": "nearestStation",
    "practical.access": "access",
    "practical.mobile_access": "mobileAccess",
    "practical.lunch_available": "lunchAvailable",
    "practical.capacity": "capacity",
    "practical.party_capacity": "partyCapacity",
    "practical.amenities": "amenities",
}


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path):
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def read_inventory_ids():
    doc = json.loads((DATA / "area1_google_ids.json").read_text(encoding="utf-8"))
    ids = doc.get("googlePlaceIds") or []
    if len(ids) != 2804 or len(set(ids)) != 2804:
        raise RuntimeError("frozen catalog is not exactly 2,804 unique IDs")
    return doc, ids


def load_resolutions(db):
    values = {}
    states = {}
    for place_id, field_key, resolution_state, value_json in db.execute("""
        SELECT r.place_id,r.field_key,r.resolution_state,o.value_json
        FROM field_resolutions r
        LEFT JOIN field_observations o ON o.observation_id=r.observation_id
    """):
        states[(place_id, field_key)] = resolution_state
        if resolution_state == "known" and value_json is not None:
            values[(place_id, field_key)] = json.loads(value_json)
    return values, states


def first_value(values, place_id, *field_keys):
    for field_key in field_keys:
        key = (place_id, field_key)
        if key in values:
            return values[key]
    return None


def build_exports(database: Path, outdir: Path):
    inventory, ordered_ids = read_inventory_ids()
    db = sqlite3.connect(database)
    db.execute("PRAGMA foreign_keys=ON")
    try:
        identity = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
        values, _states = load_resolutions(db)
        conflict_places = {
            row[0] for row in db.execute(
                "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
            )
        }
        source_counts = dict(db.execute(
            "SELECT place_id,count(*) FROM source_bindings GROUP BY place_id"
        ))
        observation_counts = dict(db.execute(
            "SELECT place_id,count(*) FROM field_observations GROUP BY place_id"
        ))

        catalog_rows = []
        recommendation_rows = []
        exclusions = Counter()

        for place_id in ordered_ids:
            state = identity.get(place_id)
            if state is None:
                raise RuntimeError(f"catalog ID absent from database: {place_id}")

            name = first_value(values, place_id, "name")
            address = first_value(values, place_id, "address")
            coordinates = first_value(values, place_id, "coordinates")
            cuisine = first_value(values, place_id, "cuisine")
            distance_m = first_value(values, place_id, "distance_m")
            lunch_budget = first_value(values, place_id, "budget.lunch.range", "budget.lunch.legacy_range")
            dinner_budget = first_value(values, place_id, "budget.dinner.range", "budget.dinner.legacy_range")
            hours_raw = first_value(values, place_id, "hours.raw")
            closure_raw = first_value(values, place_id, "closure.raw")
            hours_reference = first_value(values, place_id, "hours.reference.legacy")
            opening_hours_legacy = first_value(values, place_id, "hours.normalized.legacy")
            recommended = first_value(values, place_id, "recommended_dishes.legacy") or []
            featured = first_value(values, place_id, "featured_dishes.legacy") or []

            practical = {}
            for field_key, public_key in PRACTICAL_EXPORT_FIELDS.items():
                value = first_value(values, place_id, field_key)
                if value is not None:
                    practical[public_key] = value

            reasons = []
            if state not in ("verified", "source_matched"):
                reasons.append("identity_not_publishable")
            if not isinstance(name, str) or not name.strip():
                reasons.append("missing_name")
            if place_id in conflict_places:
                reasons.append("identity_conflict")
            reasons = list(dict.fromkeys(reasons))
            for reason in reasons:
                exclusions[reason] += 1
            eligible = not reasons

            missing = []
            for key, value in (
                ("name", name),
                ("address", address),
                ("coordinates", coordinates),
                ("cuisine", cuisine),
                ("dinnerBudget", dinner_budget),
                ("hours", hours_raw or hours_reference or opening_hours_legacy),
            ):
                if value is None or value == "" or value == [] or value == {}:
                    missing.append(key)

            row = {
                "placeId": place_id,
                "identityState": state,
                "publicationEligible": eligible,
                "exclusionReasons": reasons,
                "name": name if isinstance(name, str) and name.strip() else None,
                "address": address,
                "coordinates": coordinates,
                "distanceMeters": distance_m,
                "cuisine": cuisine,
                "lunchBudget": lunch_budget,
                "dinnerBudget": dinner_budget,
                "hoursRaw": hours_raw,
                "closureRaw": closure_raw,
                "hoursReference": hours_reference,
                "openingHoursLegacy": opening_hours_legacy,
                "recommendedDishes": recommended,
                "featuredDishes": featured,
                "practical": practical,
                "missingFields": missing,
                "evidenceCounts": {
                    "sourceRecords": source_counts.get(place_id, 0),
                    "observations": observation_counts.get(place_id, 0),
                },
            }
            catalog_rows.append(row)
            if eligible:
                recommendation_rows.append(row)

        db_fingerprint = sha256_file(database)
        generated_at = now_iso()
        common = {
            "schemaVersion": SCHEMA_VERSION,
            "generatedAt": generated_at,
            "databaseSha256": db_fingerprint,
            "catalogSnapshotCheckedAt": inventory.get("checkedAt"),
            "eligibilityVersion": ELIGIBILITY_VERSION,
        }
        catalog_doc = {
            **common,
            "exportType": "catalog",
            "rowCount": len(catalog_rows),
            "rows": catalog_rows,
        }
        recommendation_doc = {
            **common,
            "exportType": "recommendation",
            "rowCount": len(recommendation_rows),
            "exclusionCounts": dict(sorted(exclusions.items())),
            "rows": recommendation_rows,
        }

        outdir.mkdir(parents=True, exist_ok=True)
        catalog_path = outdir / "catalog.shadow.json"
        recommendation_path = outdir / "recommendation.shadow.json"
        catalog_path.write_text(json.dumps(catalog_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        recommendation_path.write_text(json.dumps(recommendation_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        summary = {
            "status": "pass",
            "catalogRows": len(catalog_rows),
            "recommendationRows": len(recommendation_rows),
            "excludedRows": len(catalog_rows) - len(recommendation_rows),
            "exclusionCounts": dict(sorted(exclusions.items())),
            "catalogPath": str(catalog_path),
            "recommendationPath": str(recommendation_path),
            "databaseSha256": db_fingerprint,
        }
        return summary
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    parser.add_argument("--outdir", type=Path, required=True)
    args = parser.parse_args()
    summary = build_exports(args.database, args.outdir)
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
