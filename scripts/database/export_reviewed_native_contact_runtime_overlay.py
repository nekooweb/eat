#!/usr/bin/env python3
"""Export reviewed retained Overture/OSM telephone evidence for public runtime.

This is an offline field-only overlay. It reuses the SQLite master's exact retained
identity collision model and native phone validators. It never performs identity
matching, never calls a network/API, and never emits Google display payloads.

Runtime precedence is intentionally aligned with the master build:
  reviewed Overture native phone -> public-web phone -> reviewed OSM native phone.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

import build_master
import import_bound_overture_metadata as overture
import master_import_core as core
import retained_osm_identity as osm_identity
import retained_phase2 as phase2
import resolve_verified_osm_native_metadata as osm_native

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
DEFAULT_OUTPUT = DATA / "reviewed_native_contact_runtime_overlay.json"
RULE_VERSION = "reviewed-native-contact-runtime-v1"


def _conflict_model(id_set: set[str]):
    basics = core.read_json(DATA / "google_basic_source_matches.json")
    hotpepper = core.read_json(DATA / "hotpepper_catalog_facts.json")
    phase2_inputs = phase2.load_inputs()
    osm_native_rows = osm_identity.native_identity_rows(id_set)
    basic_conflicts, conflict_keys, all_sources = build_master.retained_conflict_index(
        basics, hotpepper, phase2_inputs, osm_native_rows
    )
    conflict_places = (
        set().union(*(all_sources[key] for key in conflict_keys))
        if conflict_keys else set()
    )
    return basics, basic_conflicts, conflict_keys, conflict_places


def _overture_rows(basics: dict, conflict_keys: set[str]):
    retained = overture._retained_overture_rows()
    reviewed = []
    for row in basics.get("rows") or []:
        if row.get("provider") != "Overture Maps":
            continue
        provider_id = str(row.get("providerId") or "").strip()
        pid = str(row.get("googlePlaceId") or "").strip()
        if not provider_id or not pid:
            continue
        if f"Overture Maps|{provider_id}" in conflict_keys:
            continue
        reviewed.append((pid, provider_id, row))

    native_places: dict[str, set[str]] = defaultdict(set)
    for pid, provider_id, _row in reviewed:
        native_places[provider_id].add(pid)

    output = []
    counts = Counter()
    for pid, provider_id, basic_row in reviewed:
        if len(native_places[provider_id]) != 1:
            counts["reviewed_native_id_collision"] += 1
            continue
        native = retained.get(provider_id)
        if native is None:
            counts["missing_retained_native_row"] += 1
            continue
        phones = overture._phones(native)
        if not phones:
            counts["no_valid_native_phone"] += 1
            continue
        output.append({
            "googlePlaceId": pid,
            "provider": "Overture Maps",
            "providerId": provider_id,
            "telephone": phones[0],
            "sourceTelephones": phones,
            "sourceUrl": overture._source_url(native),
            "checkedAt": native.get("checkedAt") or basic_row.get("sourceCheckedAt"),
            "binding": {
                "state": "reviewed",
                "method": basic_row.get("verification") or "retained_binding",
                "matchLevel": basic_row.get("matchLevel"),
            },
            "ruleVersion": overture.RULE_VERSION,
        })
        counts["emitted"] += 1
    output.sort(key=lambda item: (item["googlePlaceId"], item["providerId"]))
    return output, counts, len(reviewed), len(retained)


def _osm_rows(id_set: set[str], conflict_keys: set[str], conflict_places: set[str]):
    pairs, missing_candidates = osm_identity.verified_pairs(id_set)
    candidates, candidate_collisions, native_collisions = osm_native._candidate_indexes()

    # Mirror retained_osm_identity.import_verified_osm binding state exactly.
    reviewed_rows = []
    for source_id, pid, qc, candidate in pairs:
        source_key = f"OpenStreetMap|{source_id}"
        if source_key in conflict_keys or pid in conflict_places:
            continue
        reviewed_rows.append((str(pid), str(source_id), qc, candidate))

    provider_places: dict[str, set[str]] = defaultdict(set)
    for pid, provider_id, _qc, _candidate in reviewed_rows:
        provider_places[provider_id].add(pid)
    binding_collisions = {
        provider_id for provider_id, places in provider_places.items() if len(places) != 1
    }

    output = []
    counts = Counter()
    for pid, provider_id, qc, imported_candidate in reviewed_rows:
        if provider_id in binding_collisions:
            counts["reviewed_binding_provider_collision"] += 1
            continue
        if provider_id in candidate_collisions:
            counts["retained_candidate_id_collision"] += 1
            continue
        candidate = candidates.get(provider_id)
        if candidate is None:
            counts["retained_candidate_missing"] += 1
            continue
        if str(candidate.get("id") or "").strip() != provider_id:
            counts["candidate_provider_id_mismatch"] += 1
            continue
        native_source_id = str(candidate.get("sourceId") or "").strip()
        if not native_source_id:
            counts["missing_native_source_id"] += 1
            continue
        if native_source_id in native_collisions:
            counts["retained_native_source_id_collision"] += 1
            continue
        phones = osm_native._native_phones(candidate)
        if len(phones) != 1:
            if len(phones) > 1:
                counts["multiple_native_phones_deferred"] += 1
            else:
                counts["no_valid_native_phone"] += 1
            continue
        output.append({
            "googlePlaceId": pid,
            "provider": "OpenStreetMap",
            "providerId": provider_id,
            "nativeSourceId": native_source_id,
            "telephone": phones[0],
            "sourceTelephones": phones,
            "sourceUrl": osm_identity.osm_url(candidate),
            "checkedAt": "2026-09-05",
            "binding": {
                "state": "reviewed",
                "method": osm_identity.BINDING_METHOD,
                "qcStatus": qc.get("status"),
                "qcVersion": qc.get("qcVersion"),
            },
            "ruleVersion": osm_native.RULE_VERSION,
        })
        counts["emitted"] += 1
    output.sort(key=lambda item: (item["googlePlaceId"], item["providerId"]))
    counts["missing_candidate_pairs"] = len(missing_candidates)
    return output, counts, len(reviewed_rows)


def build_overlay() -> dict:
    inventory = core.read_json(DATA / "area1_google_ids.json")
    ids = inventory.get("googlePlaceIds") or []
    id_set = set(ids)
    if len(ids) != 2804 or len(id_set) != 2804 or inventory.get("count") != 2804:
        raise RuntimeError("frozen catalog must contain exactly 2,804 unique Place IDs")

    basics, basic_conflicts, conflict_keys, conflict_places = _conflict_model(id_set)
    overture_rows, overture_counts, reviewed_overture, retained_overture = _overture_rows(
        basics, conflict_keys
    )
    osm_rows, osm_counts, reviewed_osm = _osm_rows(id_set, conflict_keys, conflict_places)

    if any(row["googlePlaceId"] not in id_set for row in [*overture_rows, *osm_rows]):
        raise RuntimeError("native contact overlay leaked a Place ID outside the frozen catalog")
    if any(row.get("binding", {}).get("state") != "reviewed" for row in [*overture_rows, *osm_rows]):
        raise RuntimeError("native contact overlay leaked a non-reviewed binding")

    return {
        "schemaVersion": 1,
        "ruleVersion": RULE_VERSION,
        "checkedAt": inventory.get("checkedAt"),
        "policy": {
            "sourceBackedOnly": True,
            "reviewedBindingsOnly": True,
            "exactRetainedProviderIdOnly": True,
            "sameCrossLayerCollisionLogicAsSQLiteMaster": True,
            "overturePhoneRule": overture.RULE_VERSION,
            "osmPhoneRule": osm_native.RULE_VERSION,
            "osmSingleNativePhoneRequired": True,
            "nativeFormattingPreserved": True,
            "digitCountValidation": "8..15",
            "networkRequests": 0,
            "paidGoogleDataApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "identityChanges": 0,
            "runtimeMutationAllowed": ["telephone", "telephoneSourceUrl", "telephoneCheckedAt", "telephoneProvider", "telephoneRuleVersion"],
            "runtimePrecedence": ["Overture Maps", "public_web", "OpenStreetMap"],
        },
        "summary": {
            "catalogTotal": 2804,
            "basicConflictSourceKeys": len(basic_conflicts),
            "allRetainedConflictSourceKeys": len(conflict_keys),
            "allRetainedConflictPlaces": len(conflict_places),
            "reviewedOvertureBasicBindings": reviewed_overture,
            "retainedUniqueOvertureRows": retained_overture,
            "overtureTelephoneRows": len(overture_rows),
            "reviewedHistoricalOsmBindings": reviewed_osm,
            "osmTelephoneRows": len(osm_rows),
            "overtureSkipped": {k: v for k, v in sorted(overture_counts.items()) if k != "emitted" and v},
            "osmSkipped": {k: v for k, v in sorted(osm_counts.items()) if k != "emitted" and v},
        },
        "overtureRows": overture_rows,
        "osmRows": osm_rows,
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
