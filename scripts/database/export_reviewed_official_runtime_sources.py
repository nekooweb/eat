#!/usr/bin/env python3
"""Export reviewed official source URLs for runtime consumption.

This is intentionally a source-URL overlay only. It reuses the same retained
cross-layer collision logic and retained official identity normalization as the
SQLite master build, then emits only official_candidate_index rows that SQLite
would bind as `reviewed` (never conflict-deferred rows).

The overlay must not change public names, coordinates, identity state, or other
restaurant fields. The JS runtime may only append its reviewed URLs to an
already-published named row's sourceWebsites list.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import build_master
import master_import_core as core
import retained_official_identity as official_identity
import retained_osm_identity as osm_identity
import retained_phase2 as phase2

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
DEFAULT_OUTPUT = DATA / "reviewed_official_runtime_sources.json"


def build_overlay() -> dict:
    inventory = core.read_json(DATA / "area1_google_ids.json")
    basics = core.read_json(DATA / "google_basic_source_matches.json")
    hotpepper = core.read_json(DATA / "hotpepper_catalog_facts.json")
    phase2_inputs = phase2.load_inputs()

    ids = inventory.get("googlePlaceIds") or []
    id_set = set(ids)
    if len(ids) != 2804 or len(id_set) != 2804 or inventory.get("count") != 2804:
        raise RuntimeError("frozen catalog must contain exactly 2,804 unique Place IDs")

    osm_native_rows = osm_identity.native_identity_rows(id_set)
    basic_conflicts, conflict_keys, all_sources = build_master.retained_conflict_index(
        basics,
        hotpepper,
        phase2_inputs,
        osm_native_rows,
    )
    conflict_places = (
        set().union(*(all_sources[key] for key in conflict_keys))
        if conflict_keys
        else set()
    )

    index_doc, official_rows = official_identity.load_index()
    overlay_rows = []
    conflict_deferred = []
    outside_catalog = 0

    for row in official_rows:
        pid = row["googlePlaceId"]
        if pid not in id_set:
            outside_catalog += 1
            continue
        if pid in conflict_places:
            conflict_deferred.append(
                {
                    "googlePlaceId": pid,
                    "pageUrl": row["pageUrl"],
                    "reason": "cross_layer_retained_identity_conflict",
                }
            )
            continue

        urls = []
        for value in [row["pageUrl"], *(row.get("menuUrls") or [])]:
            value = str(value or "").strip()
            if value and value not in urls:
                urls.append(value)

        overlay_rows.append(
            {
                "googlePlaceId": pid,
                "officialName": row["name"],
                "pageUrl": row["pageUrl"],
                "menuUrls": row.get("menuUrls") or [],
                "sourceWebsites": urls,
                "checkedAt": row.get("checkedAt") or index_doc.get("checkedAt"),
                "reviewState": "reviewed",
                "acquisitionMethod": official_identity.ACQUISITION_METHOD,
                "bindingMethod": official_identity.BINDING_METHOD,
                "verification": {
                    "independentPageFetch": True,
                    "officialHostCandidate": True,
                    "nameMatched": True,
                    "paidDataApiCalls": 0,
                },
            }
        )

    overlay_rows.sort(key=lambda item: item["googlePlaceId"])
    conflict_deferred.sort(key=lambda item: item["googlePlaceId"])

    if any(row["googlePlaceId"] in conflict_places for row in overlay_rows):
        raise RuntimeError("reviewed official runtime overlay leaked a conflict place")
    if len({row["googlePlaceId"] for row in overlay_rows}) != len(overlay_rows):
        raise RuntimeError("reviewed official runtime overlay contains duplicate Place IDs")

    summary = {
        "catalogTotal": 2804,
        "officialCandidateIndexRows": len(official_rows),
        "reviewedRows": len(overlay_rows),
        "reviewedRowsWithMenuUrls": sum(bool(row["menuUrls"]) for row in overlay_rows),
        "conflictDeferredRows": len(conflict_deferred),
        "outsideCatalogRows": outside_catalog,
        "basicConflictSourceKeys": len(basic_conflicts),
        "allRetainedConflictSourceKeys": len(conflict_keys),
        "allRetainedConflictPlaces": len(conflict_places),
    }

    # Keep this synchronized with the SQLite contract's current retained-official
    # baseline. If the source/collision model changes, regenerate and review rather
    # than silently publishing a changed trust boundary.
    if summary["officialCandidateIndexRows"] != 194:
        raise RuntimeError(
            f"official candidate index baseline changed: expected 194, found {summary['officialCandidateIndexRows']}"
        )
    if summary["conflictDeferredRows"] != 1:
        raise RuntimeError(
            f"official reviewed/conflict baseline changed: expected 1 deferred row, found {summary['conflictDeferredRows']}"
        )

    return {
        "schemaVersion": 1,
        "checkedAt": index_doc.get("checkedAt"),
        "policy": {
            "source": "retained independently fetched official_candidate_index only",
            "sameCollisionLogicAsSQLiteMaster": True,
            "reviewedRowsOnly": True,
            "conflictRowsPublished": False,
            "networkRequests": 0,
            "paidGoogleDataApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "runtimeMutationAllowed": ["sourceWebsites"],
            "runtimeNameMutationAllowed": False,
            "runtimeCoordinateMutationAllowed": False,
            "runtimeIdentityMutationAllowed": False,
            "dishEvidencePromotionByOverlayAllowed": False,
        },
        "summary": summary,
        "rows": overlay_rows,
        "conflictDeferred": conflict_deferred,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    payload = build_overlay()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(payload["summary"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
