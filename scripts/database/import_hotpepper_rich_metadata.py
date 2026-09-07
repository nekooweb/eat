#!/usr/bin/env python3
"""Import retained reviewed Hot Pepper rich metadata as field-only evidence.

No network requests are made. A rich row is accepted only when the same Hot Pepper ID
is already bound as a reviewed base Hot Pepper source to the same frozen Place ID.
This stage never upgrades identity and never overwrites an already-known resolution.
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
ACQUISITION_METHOD = "retained_hotpepper_rich_metadata_v1"
BINDING_METHOD = "field_only_from_reviewed_hotpepper_binding"
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


def known_resolution_set(db: sqlite3.Connection) -> set[tuple[str, str]]:
    return {
        (pid, field_key)
        for pid, field_key in db.execute(
            "SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'"
        )
    }


def finite_labeled_budget_range(raw: str | None, label: str):
    """Parse only explicit finite ranges adjacent to a lunch/dinner label.

    Single-value averages and open-ended expressions are intentionally rejected.
    """
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
    if low < 0 or high < low or high > 200000:
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


def _raw_observation(db, pid, srid, field_key, value, observed, *, rule=None):
    if not core.nonempty(value) and value is not False:
        return None
    return core.observation(
        db,
        pid,
        srid,
        field_key,
        value,
        "known",
        observed,
        rule=rule,
    )


def _resolve_missing(
    db,
    known: set[tuple[str, str]],
    pid: str,
    srid: str,
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
        srid,
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


def import_rich_metadata(db: sqlite3.Connection, id_set: set[str], conflict_places: set[str], stamp: str):
    doc = load_rich_document()
    base = reviewed_base_bindings(db)
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
        bound_places = base.get(hp_id, set())
        if bound_places != {pid}:
            counts["base_binding_not_unique_reviewed_match"] += 1
            continue
        if pid in conflict_places:
            counts["identity_conflict"] += 1
            continue

        source_url = str(row.get("hotpepperUrl") or "").strip()
        if not source_url.startswith("https://"):
            counts["missing_https_source_url"] += 1
            continue
        observed = str(row.get("checkedAt") or doc.get("checkedAt") or stamp[:10])[:10]
        payload = {
            "googlePlaceId": pid,
            "hotpepperId": hp_id,
            "hotpepperReviewMode": row.get("hotpepperReviewMode"),
            "hotpepperUrl": source_url,
            "couponUrl": row.get("couponUrl"),
            "hotpepperOpeningHoursText": row.get("hotpepperOpeningHoursText"),
            "hotpepperClosedText": row.get("hotpepperClosedText"),
            "hotpepperBudget": row.get("hotpepperBudget"),
            "budgetMemo": row.get("budgetMemo"),
            "lunchAvailable": row.get("lunchAvailable"),
            "acceptedCreditCards": row.get("acceptedCreditCards"),
            "capacity": row.get("capacity"),
            "partyCapacity": row.get("partyCapacity"),
            "amenities": row.get("amenities"),
            "sourceServiceText": row.get("sourceServiceText"),
            "policy": {
                "networkRequests": 0,
                "identityChangeAllowed": False,
                "requiresReviewedBaseBinding": True,
                "missingOnlyResolution": True,
                "ruleVersion": RULE_VERSION,
            },
        }
        srid = core.source_record(
            db,
            "Hot Pepper",
            f"rich:{hp_id}",
            payload,
            source_url,
            observed,
            ACQUISITION_METHOD,
            "retained reviewed Hot Pepper rich artifact; no new API call; field-only reuse",
            stamp,
        )
        core.upsert_binding(
            db,
            pid,
            srid,
            "reviewed",
            BINDING_METHOD,
            "field_only_not_identity",
            None,
            stamp,
        )

        raw_hours = _raw_observation(
            db, pid, srid, "hotpepper.rich.hours.raw", row.get("hotpepperOpeningHoursText"), observed
        )
        raw_closure = _raw_observation(
            db, pid, srid, "hotpepper.rich.closure.raw", row.get("hotpepperClosedText"), observed
        )
        _raw_observation(db, pid, srid, "hotpepper.rich.budget.raw", row.get("hotpepperBudget"), observed)
        _raw_observation(db, pid, srid, "hotpepper.rich.budget_memo.raw", row.get("budgetMemo"), observed)
        raw_lunch = _raw_observation(
            db, pid, srid, "hotpepper.rich.lunch_available.raw", row.get("lunchAvailable"), observed
        )
        raw_amenities = _raw_observation(
            db, pid, srid, "hotpepper.rich.amenities.raw", row.get("amenities"), observed
        )
        _raw_observation(
            db, pid, srid, "hotpepper.rich.source_service_text.raw", row.get("sourceServiceText"), observed
        )
        _raw_observation(
            db, pid, srid, "hotpepper.rich.accepted_cards.raw", row.get("acceptedCreditCards"), observed
        )
        _raw_observation(db, pid, srid, "hotpepper.rich.capacity.raw", row.get("capacity"), observed)
        _raw_observation(db, pid, srid, "hotpepper.rich.party_capacity.raw", row.get("partyCapacity"), observed)

        hours_equivalents = {
            "hours.raw", "hours.reference.legacy", "hours.normalized.legacy"
        }
        if not any((pid, key) in known for key in hours_equivalents):
            if _resolve_missing(
                db, known, pid, srid, "hours.raw", row.get("hotpepperOpeningHoursText"),
                observed, stamp, derived_from=raw_hours
            ):
                counts["hours_resolved"] += 1

        if (pid, "closure.raw") not in known and _resolve_missing(
            db, known, pid, srid, "closure.raw", row.get("hotpepperClosedText"),
            observed, stamp, derived_from=raw_closure
        ):
            counts["closure_resolved"] += 1

        lunch_available = row.get("lunchAvailable")
        if isinstance(lunch_available, bool) and _resolve_missing(
            db, known, pid, srid, "practical.lunch_available", lunch_available,
            observed, stamp, derived_from=raw_lunch
        ):
            practical_counts["practical.lunch_available"] += 1

        amenities = row.get("amenities") or {}
        if isinstance(amenities, dict):
            for source_key, output_field in sorted(AMENITY_FIELDS.items()):
                value = amenities.get(source_key)
                if not isinstance(value, bool):
                    continue
                if _resolve_missing(
                    db, known, pid, srid, output_field, value,
                    observed, stamp, derived_from=raw_amenities
                ):
                    practical_counts[output_field] += 1
            smoking = amenities.get("smokingPolicy")
            if isinstance(smoking, str) and smoking.strip() and _resolve_missing(
                db, known, pid, srid, "practical.smoking_policy", smoking.strip(),
                observed, stamp, derived_from=raw_amenities
            ):
                practical_counts["practical.smoking_policy"] += 1

        budget = row.get("hotpepperBudget") or {}
        average = budget.get("average") if isinstance(budget, dict) else None
        for label, field_key in (
            ("lunch", "budget.lunch.range"),
            ("dinner", "budget.dinner.range"),
        ):
            parsed = finite_labeled_budget_range(average, label)
            if parsed is None:
                continue
            raw_budget = _raw_observation(
                db,
                pid,
                srid,
                f"hotpepper.rich.budget_{label}_explicit.raw",
                average,
                observed,
            )
            if _resolve_missing(
                db, known, pid, srid, field_key, parsed,
                observed, stamp, derived_from=raw_budget
            ):
                budget_counts[field_key] += 1

        counts["imported_rows"] += 1

    identity_after = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    if identity_after != identity_before:
        raise RuntimeError("Hot Pepper rich field importer changed identity state")

    return {
        "ruleVersion": RULE_VERSION,
        "richRows": len(doc.get("rows", [])),
        "reviewedBaseHotPepperIds": len(base),
        "importedRows": counts["imported_rows"],
        "hoursResolved": counts["hours_resolved"],
        "closureResolved": counts["closure_resolved"],
        "practicalResolved": sum(practical_counts.values()),
        "practicalFieldCounts": dict(sorted(practical_counts.items())),
        "budgetResolved": sum(budget_counts.values()),
        "budgetFieldCounts": dict(sorted(budget_counts.items())),
        "skipped": {
            key: value
            for key, value in sorted(counts.items())
            if key not in {"imported_rows", "hours_resolved", "closure_resolved"} and value
        },
        "networkRequests": 0,
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
        summary = import_rich_metadata(db, id_set, conflict_places, core.now_iso())
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print(json.dumps({"status": "pass", **summary}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
