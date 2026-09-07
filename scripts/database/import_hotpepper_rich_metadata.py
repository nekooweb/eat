#!/usr/bin/env python3
"""Resolve fine-grained fields from retained reviewed Hot Pepper rich metadata.

The rich metadata source records are already imported by retained_phase2. This pass
reuses those exact source records instead of storing a duplicate payload. It requires
the same Hot Pepper ID to have an independently reviewed base Hot Pepper binding to the
same frozen Place ID, never changes identity, performs no network request, and resolves
missing fields only.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import master_import_core as core

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RICH_PATH = DATA / "hotpepper_rich_metadata.js"
RULE_VERSION = "hotpepper-rich-field-v1"

AMENITY_FIELDS = {
    "courseAvailable": "practical.course_available",
    "allYouCanDrink": "practical.free_drink_available",
    "allYouCanEat": "practical.free_food_available",
    "privateRoom": "practical.private_room_available",
    "cardAccepted": "practical.card_available",
    "parkingAvailable": "practical.parking_available",
    "wifiAvailable": "practical.wifi_available",
    "barrierFree": "practical.barrier_free",
    "childrenWelcome": "practical.children_welcome",
    "englishMenu": "practical.english_menu",
    "horigotatsu": "practical.horigotatsu",
    "karaoke": "practical.karaoke",
    "lateNightAfter23": "practical.late_night_after_23",
    "liveShow": "practical.live_show",
    "petAllowed": "practical.pet_allowed",
    "tatami": "practical.tatami",
    "tvProjector": "practical.tv_projector",
    "charterAvailable": "practical.charter_available",
    "bandPerformance": "practical.band_performance",
}


def load_rich_document() -> dict:
    text = RICH_PATH.read_text(encoding="utf-8")
    marker = "window.HOTPEPPER_RICH_METADATA="
    start = text.find(marker)
    if start < 0:
        raise RuntimeError("cannot find Hot Pepper rich metadata assignment")
    value, _end = json.JSONDecoder().raw_decode(text[start + len(marker):].lstrip())
    if not isinstance(value, dict) or not isinstance(value.get("rows"), list):
        raise RuntimeError("invalid Hot Pepper rich metadata document")
    return value


def reviewed_base_bindings(db: sqlite3.Connection) -> dict[str, set[str]]:
    mapping: dict[str, set[str]] = defaultdict(set)
    for provider_id, place_id in db.execute(
        """
        SELECT sr.provider_id,sb.place_id
        FROM source_records sr
        JOIN source_bindings sb ON sb.source_record_id=sr.source_record_id
        WHERE sr.provider='Hot Pepper'
          AND sr.acquisition_method='retained_hotpepper_artifact'
          AND sb.binding_state='reviewed'
        ORDER BY sr.provider_id,sb.place_id
        """
    ):
        mapping[str(provider_id)].add(place_id)
    return mapping


def retained_rich_sources(db: sqlite3.Connection) -> dict[tuple[str, str], list[tuple[str, str]]]:
    mapping: dict[tuple[str, str], list[tuple[str, str]]] = defaultdict(list)
    for place_id, provider_id, source_record_id, observed_at in db.execute(
        """
        SELECT sb.place_id,sr.provider_id,sr.source_record_id,coalesce(sr.observed_at,'')
        FROM source_records sr
        JOIN source_bindings sb ON sb.source_record_id=sr.source_record_id
        WHERE sr.provider='Hot Pepper'
          AND sr.acquisition_method='retained_hotpepper_rich_metadata'
          AND sb.binding_state='reviewed'
        ORDER BY sb.place_id,sr.provider_id,sr.source_record_id
        """
    ):
        mapping[(place_id, str(provider_id))].append((source_record_id, observed_at))
    return mapping


def known_resolution_set(db: sqlite3.Connection) -> set[tuple[str, str]]:
    return {
        (pid, field_key)
        for pid, field_key in db.execute(
            "SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'"
        )
    }


def finite_labeled_budget_range(raw: str | None, label: str):
    """Parse only explicit finite ranges adjacent to a lunch/dinner label."""
    if not isinstance(raw, str) or not raw.strip():
        return None
    text = unicodedata.normalize("NFKC", raw).replace(",", "")
    label_pattern = "ランチ" if label == "lunch" else "ディナー"
    other_pattern = "ディナー" if label == "lunch" else "ランチ"
    hit = re.search(label_pattern, text)
    if not hit:
        return None
    segment = text[hit.end():]
    other = re.search(other_pattern, segment)
    if other:
        segment = segment[:other.start()]
    segment = re.split(r"[/／\n|]", segment, maxsplit=1)[0]
    match = re.search(r"(\d{2,6})\s*円?\s*[~〜～\-]\s*(\d{2,6})\s*円", segment)
    if not match:
        return None
    low, high = int(match.group(1)), int(match.group(2))
    if high < low or high > 200000:
        return None
    return {
        "currency": "JPY",
        "lower": low,
        "upper": high,
        "lowerInclusive": True,
        "upperInclusive": True,
        "evidenceType": "explicit_labeled_hotpepper_average_range",
        "label": label,
        "rawText": raw,
    }


def _resolve_missing(
    db,
    known: set[tuple[str, str]],
    pid: str,
    source_record_id: str,
    field_key: str,
    value,
    observed: str,
    stamp: str,
    *,
    derived_from: str | None = None,
):
    if (pid, field_key) in known:
        return False
    if not core.nonempty(value) and value is not False:
        return False
    oid = core.observation(
        db,
        pid,
        source_record_id,
        field_key,
        value,
        "known",
        observed,
        derived_from=derived_from,
        rule=RULE_VERSION,
    )
    core.resolve(db, pid, field_key, oid, "known", "Hot Pepper", stamp)
    db.execute(
        "UPDATE field_resolutions SET rule_version=? WHERE place_id=? AND field_key=? AND observation_id=?",
        (RULE_VERSION, pid, field_key, oid),
    )
    known.add((pid, field_key))
    return True


def _existing_observation(db, pid: str, srid: str, field_key: str):
    row = db.execute(
        """
        SELECT observation_id,value_json,coalesce(observed_at,'')
        FROM field_observations
        WHERE place_id=? AND source_record_id=? AND field_key=? AND field_state='known'
        ORDER BY observation_id LIMIT 1
        """,
        (pid, srid, field_key),
    ).fetchone()
    if row is None:
        return None, None, None
    try:
        value = json.loads(row[1]) if row[1] is not None else None
    except Exception:
        value = None
    return row[0], value, row[2]


def resolve_rich_metadata(db: sqlite3.Connection, id_set: set[str], conflict_places: set[str], stamp: str):
    doc = load_rich_document()
    base = reviewed_base_bindings(db)
    rich_sources = retained_rich_sources(db)
    known = known_resolution_set(db)
    identity_before = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))

    counts = Counter()
    practical_counts = Counter()
    budget_counts = Counter()

    for row in doc.get("rows", []):
        pid = str(row.get("googlePlaceId") or "").strip()
        hp_id = str(row.get("hotpepperId") or "").strip()
        if not pid or pid not in id_set or not hp_id:
            counts["invalid_identity_key"] += 1
            continue
        if base.get(hp_id, set()) != {pid}:
            counts["base_binding_not_unique_reviewed_match"] += 1
            continue
        if pid in conflict_places:
            counts["identity_conflict"] += 1
            continue
        source_rows = rich_sources.get((pid, hp_id), [])
        if len(source_rows) != 1:
            counts["retained_rich_source_not_unique"] += 1
            continue
        srid, source_observed = source_rows[0]
        observed = str(row.get("checkedAt") or source_observed or doc.get("checkedAt") or stamp[:10])[:10]

        raw_hours_oid, raw_hours, _ = _existing_observation(db, pid, srid, "rich.hours_raw")
        raw_closure_oid, raw_closure, _ = _existing_observation(db, pid, srid, "rich.closure_raw")
        raw_lunch_oid, raw_lunch, _ = _existing_observation(db, pid, srid, "practical.lunch_available")
        raw_amenities_oid, raw_amenities, _ = _existing_observation(db, pid, srid, "practical.amenities")
        _budget_oid, raw_budget, _ = _existing_observation(db, pid, srid, "rich.budget_source")

        hours_equivalents = {"hours.raw", "hours.reference.legacy", "hours.normalized.legacy"}
        if not any((pid, key) in known for key in hours_equivalents):
            if _resolve_missing(
                db, known, pid, srid, "hours.raw", raw_hours,
                observed, stamp, derived_from=raw_hours_oid
            ):
                counts["hours_resolved"] += 1

        if _resolve_missing(
            db, known, pid, srid, "closure.raw", raw_closure,
            observed, stamp, derived_from=raw_closure_oid
        ):
            counts["closure_resolved"] += 1

        if isinstance(raw_lunch, bool) and _resolve_missing(
            db, known, pid, srid, "practical.lunch_available", raw_lunch,
            observed, stamp, derived_from=raw_lunch_oid
        ):
            practical_counts["practical.lunch_available"] += 1

        amenities = raw_amenities if isinstance(raw_amenities, dict) else {}
        for source_key, output_field in sorted(AMENITY_FIELDS.items()):
            value = amenities.get(source_key)
            if not isinstance(value, bool):
                continue
            if _resolve_missing(
                db, known, pid, srid, output_field, value,
                observed, stamp, derived_from=raw_amenities_oid
            ):
                practical_counts[output_field] += 1
        smoking = amenities.get("smokingPolicy")
        if isinstance(smoking, str) and smoking.strip() and _resolve_missing(
            db, known, pid, srid, "practical.smoking_policy", smoking.strip(),
            observed, stamp, derived_from=raw_amenities_oid
        ):
            practical_counts["practical.smoking_policy"] += 1

        average = raw_budget.get("average") if isinstance(raw_budget, dict) else None
        for label, field_key in (
            ("lunch", "budget.lunch.range"),
            ("dinner", "budget.dinner.range"),
        ):
            parsed = finite_labeled_budget_range(average, label)
            if parsed is None:
                continue
            if _resolve_missing(
                db, known, pid, srid, field_key, parsed,
                observed, stamp, derived_from=_budget_oid
            ):
                budget_counts[field_key] += 1

        counts["resolved_source_rows"] += 1

    identity_after = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    if identity_after != identity_before:
        raise RuntimeError("Hot Pepper rich resolver changed identity state")

    return {
        "ruleVersion": RULE_VERSION,
        "richRows": len(doc.get("rows", [])),
        "reviewedBaseHotPepperIds": len(base),
        "retainedRichSourcePairs": len(rich_sources),
        "resolvedSourceRows": counts["resolved_source_rows"],
        "hoursResolved": counts["hours_resolved"],
        "closureResolved": counts["closure_resolved"],
        "practicalResolved": sum(practical_counts.values()),
        "practicalFieldCounts": dict(sorted(practical_counts.items())),
        "budgetResolved": sum(budget_counts.values()),
        "budgetFieldCounts": dict(sorted(budget_counts.items())),
        "skipped": {
            key: value
            for key, value in sorted(counts.items())
            if key not in {"resolved_source_rows", "hours_resolved", "closure_resolved"} and value
        },
        "networkRequests": 0,
        "newSourceRecords": 0,
        "identityChanges": 0,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    db = sqlite3.connect(args.database)
    db.execute("PRAGMA foreign_keys=ON")
    try:
        id_set = {row[0] for row in db.execute("SELECT place_id FROM catalog_entries")}
        conflict_places = {
            row[0] for row in db.execute(
                "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
            )
        }
        db.execute("BEGIN IMMEDIATE")
        summary = resolve_rich_metadata(db, id_set, conflict_places, core.now_iso())
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print(json.dumps({"status": "pass", **summary}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
