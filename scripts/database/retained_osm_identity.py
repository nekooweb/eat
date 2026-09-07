#!/usr/bin/env python3
"""Reuse historical verified OSM -> Place ID identity QC for bulk recovery.

No network requests are made. google_entities.generated.js contributes only the retained
identity verdict (sourceId/status/Place ID/QC version); durable restaurant fields come
from the independent OpenStreetMap candidate row in area1_osm.js.
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

import master_import_core as core

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
QC_PATH = DATA / "google_entities.generated.js"
OSM_PATH = DATA / "area1_osm.js"
ACQUISITION_METHOD = "retained_verified_osm_identity_qc"
BINDING_METHOD = "retained_historical_verified_osm_place_id_qc"


def parse_qc_rows() -> list[dict]:
    text = QC_PATH.read_text(encoding="utf-8")
    marker = "const rows="
    start = text.find(marker)
    if start < 0:
        raise RuntimeError("cannot find retained QC rows in google_entities.generated.js")
    value, _end = json.JSONDecoder().raw_decode(text[start + len(marker):].lstrip())
    if not isinstance(value, list):
        raise RuntimeError("retained QC rows are not a list")
    return value


def parse_osm_rows() -> list[dict]:
    text = OSM_PATH.read_text(encoding="utf-8")
    marker = "window.RESTAURANTS.push("
    start = text.find(marker)
    if start < 0:
        raise RuntimeError("cannot find OSM candidate push block")
    body = text[start + len(marker):]
    decoder = json.JSONDecoder()
    rows = []
    pos = 0
    while pos < len(body):
        while pos < len(body) and (body[pos].isspace() or body[pos] == ","):
            pos += 1
        if pos >= len(body) or body.startswith(");", pos):
            break
        value, end = decoder.raw_decode(body, pos)
        if not isinstance(value, dict):
            raise RuntimeError(f"unexpected OSM candidate value at offset {pos}")
        rows.append(value)
        pos = end
    if not rows:
        raise RuntimeError("no OSM candidate rows parsed")
    return rows


def load_inputs():
    qc_rows = parse_qc_rows()
    osm_rows = parse_osm_rows()
    osm_by_id = {str(row.get("id") or ""): row for row in osm_rows if row.get("id")}
    return qc_rows, osm_by_id


def verified_pairs(id_set: set[str] | None = None):
    qc_rows, osm_by_id = load_inputs()
    pairs = []
    missing_candidates = []
    seen = set()
    for qc in qc_rows:
        if qc.get("status") != "verified":
            continue
        source_id = str(qc.get("sourceId") or "").strip()
        pid = str(qc.get("googlePlaceId") or "").strip()
        if not source_id or not pid:
            continue
        if id_set is not None and pid not in id_set:
            continue
        pair_key = (source_id, pid)
        if pair_key in seen:
            continue
        seen.add(pair_key)
        candidate = osm_by_id.get(source_id)
        if candidate is None:
            missing_candidates.append(pair_key)
            continue
        pairs.append((source_id, pid, qc, candidate))
    return pairs, missing_candidates


def native_identity_rows(id_set: set[str] | None = None):
    pairs, _missing = verified_pairs(id_set)
    return [(f"OpenStreetMap|{source_id}", pid) for source_id, pid, _qc, _candidate in pairs]


def osm_url(candidate: dict) -> str | None:
    source = str(candidate.get("sourceId") or "").strip()
    if "/" not in source:
        return None
    kind, ident = source.split("/", 1)
    kind = kind.strip().lower()
    ident = ident.strip()
    if kind not in {"node", "way", "relation"} or not ident.isdigit():
        return None
    return f"https://www.openstreetmap.org/{kind}/{ident}"


def import_verified_osm(
    db,
    id_set: set[str],
    conflict_keys: set[str],
    conflict_places: set[str],
    stamp: str,
):
    pairs, missing_candidates = verified_pairs(id_set)
    counts = Counter()
    recovered_ids = []

    for source_id, pid, qc, candidate in pairs:
        source_key = f"OpenStreetMap|{source_id}"
        if source_key in conflict_keys:
            binding_state = "conflict"
        elif pid in conflict_places:
            binding_state = "candidate"
        else:
            binding_state = "reviewed"

        before = db.execute(
            "SELECT identity_state FROM catalog_entries WHERE place_id=?", (pid,)
        ).fetchone()
        before_state = before[0] if before else None
        observed = "2026-09-05"
        payload = {
            "googlePlaceId": pid,
            "retainedIdentityQc": {
                "sourceId": source_id,
                "status": "verified",
                "qcVersion": qc.get("qcVersion"),
                "paidDataApiCallsThisImport": 0,
            },
            "osmCandidate": candidate,
        }
        source_url = osm_url(candidate)
        srid = core.source_record(
            db,
            "OpenStreetMap",
            source_id,
            payload,
            source_url,
            observed,
            ACQUISITION_METHOD,
            "retained historical identity QC plus independent OpenStreetMap fields; no new Google data API call",
            stamp,
        )
        core.upsert_binding(
            db,
            pid,
            srid,
            binding_state,
            BINDING_METHOD,
            "historical_verified_qc" if binding_state == "reviewed" else "quarantined_or_deferred",
            candidate.get("distanceMeters"),
            stamp,
        )

        coordinates = None
        if isinstance(candidate.get("lat"), (int, float)) and isinstance(candidate.get("lng"), (int, float)):
            coordinates = {"lat": candidate["lat"], "lng": candidate["lng"]}
        fields = {
            "name": candidate.get("name"),
            "address": candidate.get("address"),
            "coordinates": coordinates,
            "distance_m": candidate.get("distanceMeters"),
            "cuisine": candidate.get("cuisine"),
            "tags": candidate.get("tags") or None,
            "hours.raw": candidate.get("openingHoursRaw"),
            "source_websites": [source_url] if source_url else None,
        }
        for field_key, value in fields.items():
            core.add_field(
                db,
                pid,
                srid,
                field_key,
                value,
                binding_state,
                "OpenStreetMap",
                observed,
                stamp,
            )
        core.add_field(
            db,
            pid,
            srid,
            "provenance.osm_verified_identity_qc",
            {
                "sourceId": source_id,
                "qcVersion": qc.get("qcVersion"),
                "status": "verified",
            },
            binding_state,
            "OpenStreetMap",
            observed,
            stamp,
            resolve_field=False,
        )

        if binding_state == "reviewed" and core.nonempty(candidate.get("name")):
            core.upgrade_identity(db, pid, binding_state, True, stamp)
            after_state = db.execute(
                "SELECT identity_state FROM catalog_entries WHERE place_id=?", (pid,)
            ).fetchone()[0]
            if before_state == "id_only" and after_state == "source_matched":
                recovered_ids.append(pid)
        counts[binding_state] += 1

    source_to_places = defaultdict(set)
    for source_id, pid, _qc, _candidate in pairs:
        source_to_places[source_id].add(pid)
    mapping_collisions = sum(1 for values in source_to_places.values() if len(values) > 1)

    return {
        "verifiedPairs": len(pairs),
        "reviewed": counts["reviewed"],
        "candidateDeferred": counts["candidate"],
        "conflict": counts["conflict"],
        "missingCandidateRows": len(missing_candidates),
        "mappingCollisionSourceIds": mapping_collisions,
        "identityRecovered": len(recovered_ids),
        "recoveredPlaceIds": recovered_ids,
        "acquisitionMethod": ACQUISITION_METHOD,
    }
