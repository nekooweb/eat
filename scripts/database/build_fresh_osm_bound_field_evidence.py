#!/usr/bin/env python3
"""Build bounded durable field evidence from one reusable fresh OSM public snapshot.

The fresh area snapshot is never treated as identity evidence here. A row is eligible
only when its native OSM element ID exactly matches an already-reviewed OpenStreetMap
binding in the current master and that native ID is not reused by another place. Only
currently missing canonical task fields are emitted. No network requests or identity
writes occur in this stage.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

RULE_VERSION = "fresh-osm-bound-field-evidence-v2"
SUPPORTED = ("address", "coordinates", "cuisine", "hours.raw")
EQUIVALENTS = {
    "address": ("address",),
    "coordinates": ("coordinates",),
    "cuisine": ("cuisine",),
    "hours.raw": ("hours.raw", "hours.reference.legacy", "hours.normalized.legacy"),
}
LEGACY_OSM_ID_RE = re.compile(r"^osm-([nwr])-(\d+)$", re.I)
OSM_KIND = {"n": "node", "w": "way", "r": "relation"}


def canonical_osm_id(value: object) -> str:
    """Normalize current native IDs and retained legacy row IDs to kind/numeric-id.

    Fresh snapshots expose native IDs such as ``node/6817614546``. The retained
    historical QC layer used internal row IDs such as ``osm-n-6817614546`` even
    though the corresponding OSM candidate carries ``sourceId=node/6817614546``.
    Both forms identify the same native OSM element and must canonicalize before an
    exact reviewed-binding join. No fuzzy/location matching is introduced here.
    """
    text = str(value or "").strip().lower()
    legacy = LEGACY_OSM_ID_RE.fullmatch(text)
    if legacy:
        return f"{OSM_KIND[legacy.group(1)]}/{int(legacy.group(2))}"
    if text.startswith("osm:"):
        text = text[4:]
    if text.startswith("openstreetmap:"):
        text = text[len("openstreetmap:"):]
    parts = text.split("/", 1)
    if len(parts) != 2 or parts[0] not in {"node", "way", "relation"} or not parts[1].isdigit():
        return ""
    return f"{parts[0]}/{int(parts[1])}"


def nonempty(value: object) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict, tuple, set)):
        return bool(value)
    return True


def known_fields(db: sqlite3.Connection) -> set[tuple[str, str]]:
    return {
        (pid, key)
        for pid, key in db.execute(
            "SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'"
        )
    }


def field_missing(known: set[tuple[str, str]], pid: str, key: str) -> bool:
    return not any((pid, alt) in known for alt in EQUIVALENTS.get(key, (key,)))


def reviewed_osm_bindings(db: sqlite3.Connection) -> tuple[dict[str, str], set[str], int]:
    """Return collision-free canonical native OSM id -> place id reviewed bindings."""
    places: dict[str, set[str]] = defaultdict(set)
    pairs = 0
    for pid, provider_id, identity_state in db.execute(
        """
        SELECT sb.place_id,sr.provider_id,ce.identity_state
        FROM source_bindings sb
        JOIN source_records sr ON sr.source_record_id=sb.source_record_id
        JOIN catalog_entries ce ON ce.place_id=sb.place_id
        WHERE sr.provider='OpenStreetMap' AND sb.binding_state='reviewed'
        """
    ):
        if identity_state not in {"verified", "source_matched"}:
            continue
        native = canonical_osm_id(provider_id)
        if not native:
            continue
        places[native].add(str(pid))
        pairs += 1
    collisions = {native for native, pids in places.items() if len(pids) != 1}
    unique = {native: next(iter(pids)) for native, pids in places.items() if len(pids) == 1}
    return unique, collisions, pairs


def build(database: Path, snapshot_path: Path, output: Path) -> dict:
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    if snapshot.get("ruleVersion") != "fresh-osm-rich-public-snapshot-v1":
        raise RuntimeError("unexpected fresh OSM snapshot ruleVersion")
    policy = snapshot.get("policy") or {}
    if policy.get("googleDataIncluded") is not False or policy.get("rawOverpassResponsePersisted") is not False:
        raise RuntimeError("fresh OSM snapshot boundary invalid")
    rows = snapshot.get("rows") or []
    if not isinstance(rows, list):
        raise RuntimeError("fresh OSM snapshot rows must be a list")

    db = sqlite3.connect(database)
    try:
        reviewed, collisions, reviewed_pair_count = reviewed_osm_bindings(db)
        known = known_fields(db)
        current_states = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    finally:
        db.close()

    fresh_by_id: dict[str, dict] = {}
    duplicate_fresh = set()
    for row in rows:
        native = canonical_osm_id(row.get("providerId"))
        if not native:
            continue
        if native in fresh_by_id:
            duplicate_fresh.add(native)
        fresh_by_id[native] = row

    output_rows = []
    fields = Counter()
    skipped = Counter()
    for native, pid in sorted(reviewed.items()):
        if native in collisions or native in duplicate_fresh:
            skipped["native_id_collision"] += 1
            continue
        if current_states.get(pid) not in {"verified", "source_matched"}:
            skipped["identity_not_publishable"] += 1
            continue
        row = fresh_by_id.get(native)
        if row is None:
            skipped["not_in_fresh_snapshot"] += 1
            continue
        candidate_fields = {
            "address": str(row.get("address") or "").strip() or None,
            "coordinates": (
                {"lat": row.get("lat"), "lng": row.get("lng")}
                if isinstance(row.get("lat"), (int, float)) and isinstance(row.get("lng"), (int, float))
                else None
            ),
            "cuisine": str(row.get("cuisine") or "").strip() or None,
            "hours.raw": str(row.get("openingHoursRaw") or "").strip() or None,
        }
        missing = {
            key: value for key, value in candidate_fields.items()
            if nonempty(value) and field_missing(known, pid, key)
        }
        if not missing:
            skipped["no_missing_supported_field"] += 1
            continue
        for key in missing:
            fields[key] += 1
        source_url = str(row.get("sourceUrl") or "").strip()
        row_hash = hashlib.sha256(
            json.dumps({"providerId": native, "sourceUrl": source_url, "fields": missing}, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        output_rows.append({
            "googlePlaceId": pid,
            "provider": "OpenStreetMap",
            "providerId": native,
            "sourceUrl": source_url,
            "retrievedAt": snapshot.get("retrievedAt"),
            "acquisitionContentHash": snapshot.get("responseHash"),
            "evidenceContentHash": row_hash,
            "fields": missing,
            "provenance": {
                "snapshotRuleVersion": snapshot.get("ruleVersion"),
                "bindingRequirement": "existing reviewed exact native OSM binding",
                "idNormalization": "native node/way/relation plus retained osm-n/w/r compatibility",
            },
        })

    doc = {
        "schemaVersion": 1,
        "ruleVersion": RULE_VERSION,
        "checkedAt": snapshot.get("retrievedAt"),
        "source": "OpenStreetMap public Overpass",
        "policy": {
            "paidGoogleDataApiCalls": 0,
            "googleHistoricalDisplayContentDurable": False,
            "rawOverpassResponsePersisted": False,
            "networkRequestsThisStage": 0,
            "identityChanges": 0,
            "proximityOnlyIdentityBindingAllowed": False,
            "exactReviewedBindingOnly": True,
            "missingOnly": True,
        },
        "rows": output_rows,
        "summary": {
            "rows": len(output_rows),
            "fieldCounts": dict(sorted(fields.items())),
            "reviewedOsmBindingPairsScanned": reviewed_pair_count,
            "uniqueReviewedNativeOsmIds": len(reviewed),
            "freshSnapshotRows": len(rows),
            "skipped": dict(sorted(skipped.items())),
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return doc["summary"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--snapshot", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    args = ap.parse_args()
    summary = build(args.database, args.snapshot, args.output)
    print(json.dumps({"status": "pass", **summary}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
