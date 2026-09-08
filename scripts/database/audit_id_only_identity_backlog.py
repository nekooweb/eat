#!/usr/bin/env python3
"""Read-only audit of strict SQLite `id_only` identity recovery backlog.

This audit never changes identity or canonical fields. It cross-checks the current master
identity state against retained repository candidate layers so that future promotion work
can distinguish strong multi-source evidence from single-source historical hints.

The strongest audit class intentionally mirrors `scripts/audit_multisource_admission_candidates.mjs`:
- current queue class `inventory_multisource_loaded_review`;
- Hot Pepper binding confidence == high;
- Overture triage in A_priority_review/B_blocker_review;
- Overture cross-source confidence == high;
- Hot Pepper <-> OSM <= 80 m;
- Hot Pepper <-> OSM name Dice >= 0.65;
- Hot Pepper <-> Overture name Dice >= 0.65;
- historical OSM candidate is not closed_permanently.

Even rows satisfying all of those conditions remain audit-only here. Promotion requires a
separate explicit policy and validation step.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"


def load_json(path: Path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def norm(value) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    # Mirror the JS audit's intent conservatively. Removing these generic affixes is
    # only for audit similarity; it never creates an identity binding.
    text = re.sub(r"(?:本店|支店|restaurant|cafe|café|bar|the|店)", "", text, flags=re.I)
    return re.sub(r"[^\w一-龯ぁ-んァ-ヶ]+", "", text, flags=re.UNICODE)


def bigrams(value) -> set[str]:
    text = norm(value)
    if not text:
        return set()
    if len(text) == 1:
        return {text}
    return {text[i : i + 2] for i in range(len(text) - 1)}


def dice(a, b) -> float:
    aa, bb = bigrams(a), bigrams(b)
    if not aa or not bb:
        return 0.0
    return round((2 * len(aa & bb)) / (len(aa) + len(bb)), 3)


def haversine(lat1, lng1, lat2, lng2):
    values = (lat1, lng1, lat2, lng2)
    if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in values):
        return None
    radius = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    value = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    return round(radius * 2 * math.asin(math.sqrt(value)))


def strong_three_source(item: dict, hp: dict):
    source = hp or {}
    facts = source.get("facts") or {}
    osm = item.get("openCandidate") or {}
    overture = item.get("overtureSupport") or {}
    hp_name = facts.get("name")
    osm_name = osm.get("name")
    overture_name = overture.get("name")
    distance = haversine(facts.get("lat"), facts.get("lng"), osm.get("lat"), osm.get("lng"))
    hp_osm_name = dice(hp_name, osm_name)
    hp_overture_name = dice(hp_name, overture_name)
    strong = bool(
        source.get("binding", {}).get("confidence") == "high"
        and overture.get("triage") in {"A_priority_review", "B_blocker_review"}
        and overture.get("crossSourceConfidence") == "high"
        and distance is not None
        and distance <= 80
        and hp_osm_name >= 0.65
        and hp_overture_name >= 0.65
        and osm.get("historicalQcStatus") != "closed_permanently"
    )
    return strong, {
        "hpOsmDistanceMeters": distance,
        "hpOsmNameSimilarity": hp_osm_name,
        "hpOvertureNameSimilarity": hp_overture_name,
    }


def current_id_states(db):
    return dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))


def exact_source_bindings(db):
    output = defaultdict(list)
    for pid, provider, provider_id, acquisition, state, method in db.execute(
        """
        SELECT sb.place_id,sr.provider,sr.provider_id,sr.acquisition_method,
               sb.binding_state,sb.binding_method
        FROM source_bindings sb
        JOIN source_records sr ON sr.source_record_id=sb.source_record_id
        ORDER BY sb.place_id,sr.provider,sr.provider_id
        """
    ):
        output[str(pid)].append({
            "provider": provider,
            "providerId": provider_id,
            "acquisitionMethod": acquisition,
            "bindingState": state,
            "bindingMethod": method,
        })
    return output


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--max-example-rows", type=int, default=100)
    args = ap.parse_args()

    db = sqlite3.connect(args.database)
    states = current_id_states(db)
    bindings = exact_source_bindings(db)
    id_only = {pid for pid, state in states.items() if state == "id_only"}
    db.close()

    queue = load_json(DATA / "area1_enrichment_queue.json", {"items": []}) or {"items": []}
    hotpepper_doc = load_json(DATA / "hotpepper_catalog_facts.json", {"rows": []}) or {"rows": []}
    hp_by_pid = {str(row.get("googlePlaceId")): row for row in hotpepper_doc.get("rows") or []}
    official_doc = load_json(DATA / "official_candidate_index.json", {"records": []}) or {"records": []}
    official_by_pid = defaultdict(list)
    for row in official_doc.get("records") or []:
        pid = str(row.get("googlePlaceId") or "").strip()
        if pid:
            official_by_pid[pid].append(row)

    full_queue = load_json(DATA / "area1_full_collection_queue.json", {"rows": []}) or {"rows": []}
    full_by_pid = defaultdict(list)
    for row in full_queue.get("rows") or []:
        pid = str(row.get("googlePlaceId") or "").strip()
        if pid:
            full_by_pid[pid].append(row)

    queue_by_pid = {
        str(item.get("googlePlaceId")): item
        for item in queue.get("items") or []
        if item.get("googlePlaceId")
    }

    counts = Counter()
    queue_classes = Counter()
    open_confidence = Counter()
    overture_triage = Counter()
    strong_rows = []
    old_high_rows = []
    id_only_with_any_binding = []

    for pid in sorted(id_only):
        item = queue_by_pid.get(pid) or {}
        queue_class = str(item.get("queue") or "missing_from_queue")
        queue_classes[queue_class] += 1
        if item.get("openCandidate"):
            open_confidence[str((item.get("openCandidate") or {}).get("confidence") or "none")] += 1
        if item.get("overtureSupport"):
            overture_triage[str((item.get("overtureSupport") or {}).get("triage") or "none")] += 1

        hp = hp_by_pid.get(pid)
        if hp:
            counts["idOnlyWithHotPepperFacts"] += 1
            if (hp.get("binding") or {}).get("confidence") == "high":
                counts["idOnlyWithHotPepperHighBinding"] += 1
        if official_by_pid.get(pid):
            counts["idOnlyWithOfficialIndexRecord"] += 1
        if item.get("openCandidate"):
            counts["idOnlyWithHistoricalOpenCandidate"] += 1
        if item.get("overtureSupport"):
            counts["idOnlyWithOvertureCrossSupport"] += 1
        if queue_class == "inventory_multisource_loaded_review":
            counts["idOnlyMultisourceLoadedReview"] += 1
            strong, metrics = strong_three_source(item, hp or {})
            if strong:
                counts["idOnlyStrongThreeSource"] += 1
                strong_rows.append({
                    "googlePlaceId": pid,
                    "queue": queue_class,
                    "hotpepper": {
                        "id": (hp or {}).get("hotpepperId"),
                        "confidence": ((hp or {}).get("binding") or {}).get("confidence"),
                        "combinedScore": ((hp or {}).get("binding") or {}).get("combinedScore"),
                        "name": ((hp or {}).get("facts") or {}).get("name"),
                        "address": ((hp or {}).get("facts") or {}).get("address"),
                    },
                    "osm": item.get("openCandidate"),
                    "overture": item.get("overtureSupport"),
                    "reviewMetrics": metrics,
                    "currentBindings": bindings.get(pid, []),
                })

        # Historical single-OSM high threshold audit. These are NEVER auto-promotable
        # solely because of this class; the count is useful to detect latent backlog.
        for row in full_by_pid.get(pid, []):
            candidate = row.get("candidate") or {}
            if (
                row.get("googleStatus") == "operational_food"
                and row.get("matchConfidence") == "high"
                and candidate
                and float(candidate.get("nameSimilarity") or 0) >= 0.92
                and float(candidate.get("distanceMeters") or 999999) <= 60
            ):
                counts["idOnlyHistoricalSingleOsmHighThreshold"] += 1
                old_high_rows.append({
                    "googlePlaceId": pid,
                    "sourceCandidateId": candidate.get("sourceCandidateId"),
                    "sourceName": candidate.get("sourceName"),
                    "distanceMeters": candidate.get("distanceMeters"),
                    "nameSimilarity": candidate.get("nameSimilarity"),
                    "historicalQcStatus": (item.get("openCandidate") or {}).get("historicalQcStatus"),
                    "queue": queue_class,
                    "hasHotPepperFacts": bool(hp),
                    "overtureTriage": (item.get("overtureSupport") or {}).get("triage"),
                })
                break

        current_bindings = bindings.get(pid, [])
        if current_bindings:
            counts["idOnlyWithAnySourceBinding"] += 1
            states_for_pid = Counter(row["bindingState"] for row in current_bindings)
            for state, value in states_for_pid.items():
                counts[f"idOnlyBindingState_{state}"] += value
            id_only_with_any_binding.append({
                "googlePlaceId": pid,
                "bindings": current_bindings,
            })

    # Cross-check the frontend queue universe without assuming it perfectly mirrors
    # strict SQLite identity states.
    queue_inventory = [item for item in queue.get("items") or [] if not item.get("currentProduction")]
    queue_multisource = [item for item in queue_inventory if item.get("queue") == "inventory_multisource_loaded_review"]
    queue_strong = []
    for item in queue_multisource:
        pid = str(item.get("googlePlaceId") or "")
        strong, metrics = strong_three_source(item, hp_by_pid.get(pid) or {})
        if strong:
            queue_strong.append((pid, metrics))

    counts["strictIdOnly"] = len(id_only)
    counts["queueInventoryItems"] = len(queue_inventory)
    counts["queueMultisourceLoadedReview"] = len(queue_multisource)
    counts["queueStrongThreeSource"] = len(queue_strong)
    counts["queueStrongThreeSourceAlsoStrictIdOnly"] = sum(1 for pid, _ in queue_strong if pid in id_only)
    counts["queueStrongThreeSourceNotStrictIdOnly"] = sum(1 for pid, _ in queue_strong if pid not in id_only)

    strong_rows.sort(
        key=lambda row: (
            -(row.get("overture") or {}).get("combinedScore", 0),
            (row.get("reviewMetrics") or {}).get("hpOsmDistanceMeters") or 999999,
            row["googlePlaceId"],
        )
    )
    old_high_rows.sort(key=lambda row: (row.get("distanceMeters") or 999999, -float(row.get("nameSimilarity") or 0), row["googlePlaceId"]))

    output = {
        "schemaVersion": 1,
        "policy": {
            "readOnly": True,
            "paidDataApiCalls": 0,
            "automaticIdentityPromotion": False,
            "singleSourceHistoricalHighIsAuditOnly": True,
            "strongThreeSourceMirrorsExistingAudit": True,
            "strictSQLiteIdOnlyIntersectionRequiredForBacklogCount": True,
        },
        "summary": {
            "counts": dict(sorted(counts.items())),
            "idOnlyQueueClasses": dict(sorted(queue_classes.items())),
            "idOnlyOpenConfidence": dict(sorted(open_confidence.items())),
            "idOnlyOvertureTriage": dict(sorted(overture_triage.items())),
        },
        "strongThreeSourceIdOnly": strong_rows[: args.max_example_rows],
        "historicalSingleOsmHighIdOnly": old_high_rows[: args.max_example_rows],
        "idOnlyWithExistingBindingsExamples": id_only_with_any_binding[: args.max_example_rows],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
