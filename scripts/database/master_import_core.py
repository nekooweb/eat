#!/usr/bin/env python3
"""Build/update the local Eat SQLite master database from retained repository inputs.

No network requests are made. Existing deployed canonical state is migrated as a
historical resolved snapshot so the database cannot regress while direct source
records gradually replace it. Source records and observations are content-addressed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
MIGRATIONS = ROOT / "database" / "migrations"
PARSER_VERSION = "master-import-v1"
RESOLVER_VERSION = "initial-retained-v1"
SOURCE_PRIORITY = {
    "official": 90,
    "Hot Pepper": 70,
    "legacy_resolved_snapshot": 60,
    "Overture Maps": 40,
    "OpenStreetMap": 30,
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def canonical_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def read_production():
    text = (DATA / "production_area1.js").read_text(encoding="utf-8")
    prefix = "window.PRODUCTION_RESTAURANTS="
    marker = ";\nwindow.PRODUCTION_STATS="
    start = text.find(prefix)
    end = text.find(marker, start)
    if start < 0 or end < 0:
        raise RuntimeError("cannot parse data/production_area1.js")
    return json.loads(text[start + len(prefix):end])


def nonempty(value) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict)):
        return bool(value)
    return True


def parse_budget_range(raw):
    """Normalize provider budget bands without inventing an open upper bound."""
    if not raw:
        return None
    import re

    text = str(raw).replace(",", "").replace("円", "").strip()
    match = re.search(r"(\d+)\s*[～〜~\-]\s*(\d+)", text)
    if match:
        low, high = int(match.group(1)), int(match.group(2))
        if high < low:
            return None
        return {
            "currency": "JPY",
            "lower": low,
            "upper": high,
            "lowerInclusive": True,
            "upperInclusive": True,
            "evidenceType": "provider_budget_band",
            "rawText": str(raw),
        }
    match = re.search(r"(\d+)\s*以下", text)
    if match:
        return {
            "currency": "JPY",
            "lower": 0,
            "upper": int(match.group(1)),
            "lowerInclusive": True,
            "upperInclusive": True,
            "evidenceType": "provider_budget_band",
            "rawText": str(raw),
        }
    match = re.search(r"(\d+)\s*以上", text)
    if match:
        return {
            "currency": "JPY",
            "lower": int(match.group(1)),
            "upper": None,
            "lowerInclusive": True,
            "upperInclusive": False,
            "evidenceType": "provider_budget_band",
            "rawText": str(raw),
        }
    return None


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA synchronous=NORMAL")
    return db


def apply_migrations(db: sqlite3.Connection) -> None:
    migrations = sorted(MIGRATIONS.glob("*.sql"))
    if not migrations:
        raise RuntimeError("no database migrations found")
    for migration in migrations:
        db.executescript(migration.read_text(encoding="utf-8"))
    db.commit()


def upsert_catalog(db, place_id, scope, snapshot, state, stamp):
    current = db.execute(
        "SELECT identity_state FROM catalog_entries WHERE place_id=?", (place_id,)
    ).fetchone()
    if current is None:
        db.execute(
            "INSERT INTO catalog_entries(place_id,scope,membership_snapshot,identity_state,created_at,updated_at) VALUES(?,?,?,?,?,?)",
            (place_id, scope, snapshot, state, stamp, stamp),
        )
        return
    if state == "id_only" and current[0] != "id_only":
        state = current[0]
    db.execute(
        "UPDATE catalog_entries SET scope=?,membership_snapshot=?,identity_state=?,updated_at=? WHERE place_id=?",
        (scope, snapshot, state, stamp, place_id),
    )


def source_record(db, provider, provider_id, payload, url, observed_at, acquisition, permission, stamp):
    payload_json = canonical_json(payload)
    content_hash = sha256_text(payload_json)
    source_record_id = sha256_text("\0".join([provider, str(provider_id), content_hash]))
    db.execute(
        """INSERT OR IGNORE INTO source_records(
          source_record_id,provider,provider_id,source_url,observed_at,ingested_at,
          acquisition_method,parser_version,permission_basis,content_hash,payload_json
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
        (
            source_record_id, provider, str(provider_id), url, observed_at, stamp,
            acquisition, PARSER_VERSION, permission, content_hash, payload_json,
        ),
    )
    return source_record_id


def upsert_binding(db, place_id, source_record_id, state, method, confidence, distance, stamp):
    db.execute(
        """INSERT INTO source_bindings(
          place_id,source_record_id,binding_state,binding_method,confidence,source_distance_m,reviewed_at
        ) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(place_id,source_record_id) DO UPDATE SET
          binding_state=excluded.binding_state,
          binding_method=excluded.binding_method,
          confidence=excluded.confidence,
          source_distance_m=excluded.source_distance_m,
          reviewed_at=excluded.reviewed_at""",
        (place_id, source_record_id, state, method, confidence, distance, stamp),
    )


def observation(db, place_id, source_record_id, field_key, value, state, observed_at, derived_from=None, rule=None):
    value_json = canonical_json(value) if value is not None else None
    material = "\0".join(
        [place_id, source_record_id, field_key, state, value_json or "null", derived_from or "", rule or ""]
    )
    oid = sha256_text(material)
    db.execute(
        """INSERT OR IGNORE INTO field_observations(
          observation_id,place_id,source_record_id,field_key,value_json,field_state,observed_at,
          parser_version,derived_from_observation_id,transformation_rule_version
        ) VALUES(?,?,?,?,?,?,?,?,?,?)""",
        (
            oid, place_id, source_record_id, field_key, value_json, state, observed_at,
            PARSER_VERSION, derived_from, rule,
        ),
    )
    return oid


def resolve(db, place_id, field_key, observation_id, state, provider, stamp):
    priority = SOURCE_PRIORITY.get(provider, 10)
    current = db.execute(
        "SELECT resolution_state,resolver_priority FROM field_resolutions WHERE place_id=? AND field_key=?",
        (place_id, field_key),
    ).fetchone()

    if state == "unknown":
        if current is not None:
            return
        observation_id = None
        priority = 0
    elif state == "conflict":
        if current is not None and current[0] == "known" and current[1] > priority:
            return
        observation_id = None
    elif state == "known":
        if current is not None and current[0] == "known" and current[1] > priority:
            return
    else:
        observation_id = None if state != "known" else observation_id

    db.execute(
        """INSERT INTO field_resolutions(
          place_id,field_key,observation_id,resolution_state,rule_version,resolver_priority,resolved_at
        ) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(place_id,field_key) DO UPDATE SET
          observation_id=excluded.observation_id,
          resolution_state=excluded.resolution_state,
          rule_version=excluded.rule_version,
          resolver_priority=excluded.resolver_priority,
          resolved_at=excluded.resolved_at""",
        (place_id, field_key, observation_id, state, RESOLVER_VERSION, priority, stamp),
    )


def add_field(db, place_id, source_record_id, field_key, value, binding_state, provider, observed_at, stamp, *, resolve_field=True):
    state = "conflict" if binding_state == "conflict" else ("known" if nonempty(value) else "unknown")
    stored_value = None if state == "unknown" else value
    oid = observation(db, place_id, source_record_id, field_key, stored_value, state, observed_at)
    if resolve_field and binding_state in ("reviewed", "conflict"):
        resolve(db, place_id, field_key, oid if state == "known" else None, state, provider, stamp)
    return oid


def upgrade_identity(db, place_id, binding_state, has_name, stamp):
    current = db.execute("SELECT identity_state FROM catalog_entries WHERE place_id=?", (place_id,)).fetchone()[0]
    if binding_state == "conflict":
        target = "conflict" if current in ("id_only", "source_matched", "conflict") else current
    elif binding_state == "reviewed" and has_name and current == "id_only":
        target = "source_matched"
    else:
        target = current
    if target != current:
        db.execute("UPDATE catalog_entries SET identity_state=?,updated_at=? WHERE place_id=?", (target, stamp, place_id))


def import_legacy_canonical(db, rows, id_set, stamp):
    counts = Counter()
    provider = "legacy_resolved_snapshot"
    for row in rows:
        pid = row.get("googlePlaceId")
        if not pid:
            continue
        if pid not in id_set:
            payload_json = canonical_json(row)
            exception_id = sha256_text("legacy-outside-catalog\0" + pid + "\0" + payload_json)
            db.execute(
                """INSERT OR IGNORE INTO retained_exceptions(
                  exception_id,exception_type,external_key,payload_json,recorded_at
                ) VALUES(?,?,?,?,?)""",
                (exception_id, "legacy_core_outside_frozen_catalog", pid, payload_json, stamp),
            )
            counts["exception"] += 1
            continue

        srid = source_record(
            db, provider, pid, row, None, stamp[:10],
            "retained_legacy_canonical_snapshot",
            "migration reference only; preserves pre-refactor resolved state",
            stamp,
        )
        upsert_binding(
            db, pid, srid, "reviewed", "legacy_strict_verified_identity",
            "historical_verified", row.get("distanceMeters"), stamp,
        )
        fields = {
            "name": row.get("name"),
            "address": row.get("address"),
            "coordinates": {"lat": row.get("lat"), "lng": row.get("lng")}
            if row.get("lat") is not None and row.get("lng") is not None else None,
            "distance_m": row.get("distanceMeters"),
            "cuisine": row.get("cuisine"),
            "tags": row.get("tags") or None,
            "budget.lunch.legacy_range": row.get("lunch"),
            "budget.dinner.legacy_range": row.get("dinner"),
            "recommended_dishes.legacy": row.get("recommendedDishes") or None,
            "featured_dishes.legacy": row.get("featuredDishes") or None,
            "dishes.legacy": row.get("dishes") or None,
            "hours.normalized.legacy": row.get("openingHours"),
            "hours.reference.legacy": row.get("hoursReference"),
            "award.hyakumeiten": True if row.get("hyakumeiten") else None,
            "award.hyakumeiten_year": row.get("hyakumeitenYear"),
            "award.hyakumeiten_category": row.get("hyakumeitenCategory"),
            "legacy.sources": row.get("sources") or None,
        }
        for key, value in fields.items():
            add_field(db, pid, srid, key, value, "reviewed", provider, stamp[:10], stamp)
        db.execute(
            "UPDATE catalog_entries SET identity_state='verified',updated_at=? WHERE place_id=?",
            (stamp, pid),
        )
        counts["inside"] += 1
    return counts


def import_basic(db, doc, conflict_keys, stamp):
    counts = Counter()
    for row in doc.get("rows", []):
        pid = row["googlePlaceId"]
        provider = row["provider"]
        provider_id = str(row["providerId"])
        source_key = f"{provider}|{provider_id}"
        binding_state = "conflict" if source_key in conflict_keys else "reviewed"
        url = next((u for u in row.get("websites", []) if isinstance(u, str) and u), None)
        observed = row.get("sourceCheckedAt") or doc.get("checkedAt") or stamp[:10]
        srid = source_record(
            db, provider, provider_id, row, url, observed,
            "retained_repository_basic_match", "retained independent-source fields", stamp,
        )
        upsert_binding(
            db, pid, srid, binding_state,
            row.get("verification") or "retained_binding",
            row.get("matchLevel"), row.get("distanceMeters"), stamp,
        )
        fields = {
            "name": row.get("name"),
            "address": row.get("address"),
            "coordinates": {"lat": row.get("lat"), "lng": row.get("lng")}
            if row.get("lat") is not None and row.get("lng") is not None else None,
            "distance_m": row.get("distanceMeters"),
            "cuisine": row.get("cuisine"),
            "source_websites": row.get("websites") or None,
        }
        for key, value in fields.items():
            add_field(db, pid, srid, key, value, binding_state, provider, observed, stamp)
        upgrade_identity(db, pid, binding_state, nonempty(row.get("name")), stamp)
        counts[binding_state] += 1
    return counts


def import_hotpepper(db, doc, conflict_keys, stamp):
    counts = Counter()
    for row in doc.get("rows", []):
        pid = row["googlePlaceId"]
        provider = "Hot Pepper"
        provider_id = str(row["hotpepperId"])
        source_key = f"{provider}|{provider_id}"
        binding = row.get("binding") or {}
        binding_state = (
            "conflict" if source_key in conflict_keys
            else "reviewed" if binding.get("autoEligible") is True and binding.get("confidence") in ("high", "reviewed")
            else "candidate"
        )
        facts = row.get("facts") or {}
        urls = facts.get("urls") or {}
        url = urls.get("pc") if isinstance(urls, dict) else None
        observed = doc.get("checkedAt") or stamp[:10]
        srid = source_record(
            db, provider, provider_id, row, url, observed,
            "retained_hotpepper_artifact", "retained Hot Pepper source artifact; no new API call", stamp,
        )
        upsert_binding(
            db, pid, srid, binding_state, "retained_hotpepper_binding",
            binding.get("confidence"), binding.get("distanceMeters"), stamp,
        )
        raw_fields = {
            "name": facts.get("name"),
            "name_kana": facts.get("nameKana"),
            "address": facts.get("address"),
            "coordinates": {"lat": facts.get("lat"), "lng": facts.get("lng")}
            if facts.get("lat") is not None and facts.get("lng") is not None else None,
            "cuisine_source": facts.get("genre"),
            "sub_cuisine_source": facts.get("subGenre"),
            "budget.raw": facts.get("budget"),
            "budget.memo": facts.get("budgetMemo"),
            "hours.raw": facts.get("openingHoursText"),
            "closure.raw": facts.get("closedText"),
            "lunch_availability.raw": facts.get("lunchAvailabilityText"),
            "access.raw": facts.get("access"),
            "station.raw": facts.get("stationName"),
            "source_urls": facts.get("urls"),
            "catch.raw": facts.get("catch"),
            "course.raw": facts.get("course"),
            "free_drink.raw": facts.get("freeDrink"),
            "free_food.raw": facts.get("freeFood"),
            "private_room.raw": facts.get("privateRoom"),
            "payment_card.raw": facts.get("card"),
            "smoking.raw": facts.get("nonSmoking"),
            "parking.raw": facts.get("parking"),
        }
        for key, value in raw_fields.items():
            add_field(db, pid, srid, key, value, binding_state, provider, observed, stamp)

        genre = facts.get("genre")
        if isinstance(genre, dict) and nonempty(genre.get("name")):
            add_field(db, pid, srid, "cuisine", genre.get("name"), binding_state, provider, observed, stamp)

        budget_name = (facts.get("budget") or {}).get("name") if isinstance(facts.get("budget"), dict) else None
        normalized_budget = parse_budget_range(budget_name)
        if normalized_budget is not None:
            evidence_state = "conflict" if binding_state == "conflict" else "known"
            raw_oid = observation(
                db, pid, srid, "budget.raw.source", facts.get("budget"), evidence_state, observed,
            )
            norm_oid = observation(
                db, pid, srid, "budget.dinner.range", normalized_budget, evidence_state, observed,
                derived_from=raw_oid, rule="hotpepper-budget-band-v1",
            )
            if binding_state in ("reviewed", "conflict"):
                resolve(
                    db, pid, "budget.dinner.range",
                    norm_oid if evidence_state == "known" else None,
                    evidence_state, provider, stamp,
                )

        upgrade_identity(db, pid, binding_state, nonempty(facts.get("name")), stamp)
        counts[binding_state] += 1
    return counts


def build(output: Path, reset: bool = False):
    if reset and output.exists():
        output.unlink()
    if reset:
        for suffix in ("-wal", "-shm"):
            sidecar = Path(str(output) + suffix)
            if sidecar.exists():
                sidecar.unlink()

    inventory = read_json(DATA / "area1_google_ids.json")
    basics = read_json(DATA / "google_basic_source_matches.json")
    hotpepper = read_json(DATA / "hotpepper_catalog_facts.json")
    production = read_production()
    ids = inventory.get("googlePlaceIds") or []
    id_set = set(ids)
    if len(ids) != 2804 or len(id_set) != 2804 or inventory.get("count") != 2804:
        raise RuntimeError("frozen catalog must contain exactly 2,804 unique Place IDs")

    basic_keys = [f"{r['provider']}|{r['providerId']}" for r in basics.get("rows", [])]
    conflict_keys = {key for key, count in Counter(basic_keys).items() if count > 1}
    if len(conflict_keys) != 5:
        raise RuntimeError(f"expected 5 retained provider-ID collision groups, found {len(conflict_keys)}")

    stamp = now_iso()
    source_commit = os.environ.get("GITHUB_SHA") or "repository-working-tree"
    run_id = uuid.uuid4().hex
    db = connect(output)
    try:
        apply_migrations(db)
        db.execute("BEGIN IMMEDIATE")
        db.execute(
            "INSERT INTO ingestion_runs(run_id,started_at,source_commit,parser_version,status) VALUES(?,?,?,?,?)",
            (run_id, stamp, source_commit, PARSER_VERSION, "running"),
        )
        snapshot = canonical_json({
            "checkedAt": inventory.get("checkedAt"),
            "method": inventory.get("method"),
            "count": inventory.get("count"),
        })
        for pid in ids:
            upsert_catalog(db, pid, inventory.get("scope") or "TOKYO/地区1️⃣", snapshot, "id_only", stamp)

        legacy_counts = import_legacy_canonical(db, production, id_set, stamp)
        basic_counts = import_basic(db, basics, conflict_keys, stamp)
        hp_counts = import_hotpepper(db, hotpepper, conflict_keys, stamp)

        summary = {
            "catalog": db.execute("SELECT count(*) FROM catalog_entries").fetchone()[0],
            "identityStates": dict(db.execute("SELECT identity_state,count(*) FROM catalog_entries GROUP BY identity_state")),
            "sourceRecords": db.execute("SELECT count(*) FROM source_records").fetchone()[0],
            "sourceBindings": db.execute("SELECT count(*) FROM source_bindings").fetchone()[0],
            "observations": db.execute("SELECT count(*) FROM field_observations").fetchone()[0],
            "resolutions": db.execute("SELECT count(*) FROM field_resolutions").fetchone()[0],
            "legacyCanonical": dict(legacy_counts),
            "basicBindings": dict(basic_counts),
            "hotPepperBindings": dict(hp_counts),
            "conflictSourceKeys": len(conflict_keys),
            "hoursRawObserved": db.execute("SELECT count(*) FROM field_observations WHERE field_key='hours.raw' AND value_json IS NOT NULL").fetchone()[0],
            "closuresRawObserved": db.execute("SELECT count(*) FROM field_observations WHERE field_key='closure.raw' AND value_json IS NOT NULL").fetchone()[0],
            "budgetRangesKnown": db.execute("SELECT count(*) FROM field_resolutions WHERE field_key='budget.dinner.range' AND resolution_state='known'").fetchone()[0],
            "exceptions": db.execute("SELECT count(*) FROM retained_exceptions").fetchone()[0],
        }
        db.execute(
            "UPDATE ingestion_runs SET completed_at=?,status='succeeded',summary_json=? WHERE run_id=?",
            (now_iso(), canonical_json(summary), run_id),
        )
        db.commit()
        return summary
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "_local" / "eat-main.sqlite")
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args()
    summary = build(args.output, reset=args.reset)
    print(canonical_json({"status": "pass", "database": str(args.output), **summary}))


if __name__ == "__main__":
    main()
