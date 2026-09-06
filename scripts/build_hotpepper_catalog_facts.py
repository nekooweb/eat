#!/usr/bin/env python3
"""Persist source-native Hot Pepper facts for every reviewed benchmark binding.

This builder consumes the already-collected short-lived Hot Pepper detail artifact
and the durable binding ledger. It makes no API request and persists no Google
response/display content. Facts remain source-specific and never admit a catalog
identity into production by themselves.
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def nonempty(value):
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def clean_dict(value):
    if not isinstance(value, dict):
        return None
    out = {}
    for key, item in value.items():
        item = nonempty(item)
        if item is not None and item != [] and item != {}:
            out[key] = item
    return out or None


def main():
    if len(sys.argv) != 4:
        raise SystemExit(
            "usage: build_hotpepper_catalog_facts.py "
            "BINDINGS.json DETAILS.json OUTPUT.json"
        )

    bindings_path = Path(sys.argv[1])
    details_path = Path(sys.argv[2])
    output_path = Path(sys.argv[3])

    bindings_payload = load_json(bindings_path)
    details_payload = load_json(details_path)
    bindings = bindings_payload.get("bindings") or []
    details = details_payload.get("rows") or []

    detail_by_hp = {
        row.get("hotpepperId"): row
        for row in details
        if row.get("hotpepperId")
    }

    bindings_by_hp = defaultdict(list)
    for binding in bindings:
        hp_id = binding.get("hotpepperId")
        gp_id = binding.get("googlePlaceId")
        if hp_id and gp_id:
            bindings_by_hp[hp_id].append(binding)

    duplicate_hp_ids = sorted(
        hp_id for hp_id, rows in bindings_by_hp.items()
        if len({row.get("googlePlaceId") for row in rows}) > 1
    )

    rows = []
    missing_details = []
    collision_skipped = []

    for binding in bindings:
        gp_id = binding.get("googlePlaceId")
        hp_id = binding.get("hotpepperId")
        if not gp_id or not hp_id:
            continue
        if hp_id in duplicate_hp_ids:
            collision_skipped.append({
                "googlePlaceId": gp_id,
                "hotpepperId": hp_id,
            })
            continue

        detail = detail_by_hp.get(hp_id)
        if not detail:
            missing_details.append({
                "googlePlaceId": gp_id,
                "hotpepperId": hp_id,
            })
            continue

        source_facts = {
            "name": nonempty(detail.get("name")),
            "nameKana": nonempty(detail.get("nameKana")),
            "address": nonempty(detail.get("address")),
            "stationName": nonempty(detail.get("stationName")),
            "lat": detail.get("lat"),
            "lng": detail.get("lng"),
            "genre": clean_dict(detail.get("genre")),
            "subGenre": clean_dict(detail.get("subGenre")),
            "budget": clean_dict(detail.get("budget")),
            "budgetMemo": nonempty(detail.get("budgetMemo")),
            "catch": nonempty(detail.get("catch")),
            "openingHoursText": nonempty(detail.get("open")),
            "closedText": nonempty(detail.get("close")),
            "lunchAvailabilityText": nonempty(detail.get("lunch")),
            "urls": clean_dict(detail.get("urls")),
            "access": nonempty(detail.get("access")),
            "course": nonempty(detail.get("course")),
            "freeDrink": nonempty(detail.get("freeDrink")),
            "freeFood": nonempty(detail.get("freeFood")),
            "privateRoom": nonempty(detail.get("privateRoom")),
            "card": nonempty(detail.get("card")),
            "nonSmoking": nonempty(detail.get("nonSmoking")),
            "parking": nonempty(detail.get("parking")),
        }
        source_facts = {
            key: value for key, value in source_facts.items()
            if value is not None and value != [] and value != {}
        }

        rows.append({
            "googlePlaceId": gp_id,
            "hotpepperId": hp_id,
            "binding": {
                "confidence": binding.get("confidence"),
                "autoEligible": bool(binding.get("autoEligible")),
                "currentProduction": bool(binding.get("currentProduction")),
                "distanceMeters": binding.get("distanceMeters"),
                "nameSimilarity": binding.get("nameSimilarity"),
                "addressSimilarity": binding.get("addressSimilarity"),
                "postalMatch": bool(binding.get("postalMatch")),
                "combinedScore": binding.get("combinedScore"),
                "seedSource": binding.get("seedSource"),
            },
            "facts": source_facts,
        })

    rows.sort(key=lambda row: row["googlePlaceId"])
    field_counts = Counter()
    for row in rows:
        for field in row["facts"]:
            field_counts[field] += 1

    summary = {
        "bindingRows": len(bindings),
        "detailRows": len(details),
        "persistedFactRows": len(rows),
        "currentProductionFactRows": sum(
            1 for row in rows if row["binding"]["currentProduction"]
        ),
        "inventoryOnlyFactRows": sum(
            1 for row in rows if not row["binding"]["currentProduction"]
        ),
        "missingDetailRows": len(missing_details),
        "duplicateHotpepperIds": len(duplicate_hp_ids),
        "collisionSkippedRows": len(collision_skipped),
        "fieldCounts": dict(sorted(field_counts.items())),
    }

    payload = {
        "schemaVersion": 1,
        "source": "Hot Pepper Gourmet Web Service",
        "sourceArtifactRun": 34030943605,
        "checkedAt": bindings_payload.get("checkedAt") or "2026-09-06",
        "policy": {
            "apiCalls": 0,
            "usesExistingArtifactOnly": True,
            "productionAdmission": False,
            "transientGoogleDisplayPayloadPersisted": False,
            "imagesPersisted": False,
            "factsRemainSourceSpecific": True,
        },
        "summary": summary,
        "duplicateHotpepperIds": duplicate_hp_ids,
        "missingDetails": missing_details,
        "collisionSkipped": collision_skipped,
        "rows": rows,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
