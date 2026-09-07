#!/usr/bin/env python3
"""Audit unresolved lunch-budget gaps on reviewed Hot Pepper identities.

This is a zero-network diagnostic. It never writes SQLite and never changes identity or
field resolution. The goal is to distinguish a real resolver omission from retained
payloads that only contain single-value, open-ended or otherwise non-finite lunch text.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import import_hotpepper_rich_metadata as rich
import resolve_hotpepper_source_fact_budgets as fact_budget


def reviewed_hotpepper_bindings(db: sqlite3.Connection) -> dict[str, str]:
    by_id = defaultdict(set)
    for hp_id, pid in db.execute(
        """
        SELECT sr.provider_id,sb.place_id
        FROM source_records sr
        JOIN source_bindings sb ON sb.source_record_id=sr.source_record_id
        WHERE sr.provider='Hot Pepper'
          AND sr.acquisition_method='retained_hotpepper_artifact'
          AND sb.binding_state='reviewed'
        """
    ):
        by_id[str(hp_id)].add(pid)
    return {hp_id: next(iter(pids)) for hp_id, pids in by_id.items() if len(pids) == 1}


def unresolved_lunch_places(db: sqlite3.Connection) -> set[str]:
    publishable = {
        pid for pid, state in db.execute(
            "SELECT place_id,identity_state FROM catalog_entries WHERE identity_state IN ('verified','source_matched')"
        )
    }
    conflict = {
        pid for pid, in db.execute(
            "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
        )
    }
    known = {
        pid for pid, in db.execute(
            """
            SELECT DISTINCT place_id FROM field_resolutions
            WHERE resolution_state='known'
              AND field_key IN ('budget.lunch.range','budget.lunch.legacy_range')
            """
        )
    }
    return publishable - conflict - known


def source_fact_rows(db: sqlite3.Connection):
    out = defaultdict(list)
    for hp_id, pid, payload_json, source_url in db.execute(
        """
        SELECT sr.provider_id,sb.place_id,sr.payload_json,sr.source_url
        FROM source_records sr
        JOIN source_bindings sb ON sb.source_record_id=sr.source_record_id
        WHERE sr.provider='Hot Pepper'
          AND sr.acquisition_method='retained_source_fact_overlay'
        ORDER BY sb.place_id,sr.provider_id,sr.source_record_id
        """
    ):
        try:
            payload = json.loads(payload_json)
        except Exception:
            continue
        out[(pid, str(hp_id))].append((payload, source_url))
    return out


def rich_budget_rows(db: sqlite3.Connection):
    out = defaultdict(list)
    for hp_id, pid, value_json, source_url in db.execute(
        """
        SELECT sr.provider_id,o.place_id,o.value_json,sr.source_url
        FROM source_records sr
        JOIN source_bindings sb ON sb.source_record_id=sr.source_record_id
        JOIN field_observations o
          ON o.source_record_id=sr.source_record_id AND o.place_id=sb.place_id
        WHERE sr.provider='Hot Pepper'
          AND sr.acquisition_method='retained_hotpepper_rich_metadata'
          AND sb.binding_state='reviewed'
          AND o.field_key='rich.budget_source'
          AND o.field_state='known'
        ORDER BY o.place_id,sr.provider_id,o.observation_id
        """
    ):
        try:
            value = json.loads(value_json) if value_json is not None else None
        except Exception:
            value = None
        out[(pid, str(hp_id))].append((value, source_url))
    return out


def normalize_text(value) -> str:
    return unicodedata.normalize("NFKC", str(value or "")).replace(",", "").strip()


def classify_lunch_text(raw) -> dict:
    text = normalize_text(raw)
    result = {
        "class": "empty",
        "hasLunchLabel": False,
        "hasFiniteRangeShape": False,
        "numbers": [],
    }
    if not text:
        return result
    hit = re.search(r"ランチ|lunch", text, re.I)
    result["hasLunchLabel"] = bool(hit)
    numbers = [int(x) for x in re.findall(r"(?<!\d)(\d{2,6})(?!\d)", text)]
    result["numbers"] = numbers[:8]
    strict = rich.finite_labeled_budget_range(text, "lunch")
    if strict is not None:
        result["class"] = "strict_finite_labeled_range"
        result["hasFiniteRangeShape"] = True
        return result
    if not hit:
        result["class"] = "no_lunch_label"
        return result
    segment = text[hit.end():]
    other = re.search(r"ディナー|dinner", segment, re.I)
    if other:
        segment = segment[:other.start()]
    if re.search(r"\d{2,6}\s*円?\s*[~〜～\-]\s*\d{2,6}", segment):
        result["class"] = "range_like_but_not_strict"
        result["hasFiniteRangeShape"] = True
    elif re.search(r"\d{2,6}\s*円?\s*(?:以下|まで)", segment):
        result["class"] = "upper_bounded_only"
    elif re.search(r"\d{2,6}\s*円?\s*(?:以上|から|〜|～|~)", segment):
        result["class"] = "open_ended_or_single_lower"
    elif re.search(r"\d{2,6}\s*円", segment):
        result["class"] = "single_value"
    elif numbers:
        result["class"] = "numeric_unstructured"
    else:
        result["class"] = "lunch_label_without_numeric_budget"
    return result


def valid_source_fact_lunch(fact: dict) -> bool:
    lunch = fact.get("lunch")
    claims = set(fact.get("claimedFields") or [])
    classes = set(fact.get("priceEvidenceClasses") or [])
    return (
        "lunchBudget" in claims
        and "explicit_range" in classes
        and fact_budget.valid_finite_range(lunch)
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("database", type=Path)
    ap.add_argument("--output", type=Path)
    args = ap.parse_args()

    db = sqlite3.connect(args.database)
    try:
        reviewed = reviewed_hotpepper_bindings(db)
        unresolved = unresolved_lunch_places(db)
        facts = source_fact_rows(db)
        rich_rows = rich_budget_rows(db)
        names = {
            pid: json.loads(value_json)
            for pid, value_json in db.execute(
                """
                SELECT fr.place_id,fo.value_json
                FROM field_resolutions fr
                JOIN field_observations fo ON fo.observation_id=fr.observation_id
                WHERE fr.field_key='name' AND fr.resolution_state='known'
                """
            )
            if value_json is not None
        }
    finally:
        db.close()

    targets = []
    for hp_id, pid in sorted(reviewed.items(), key=lambda item: (item[1], item[0])):
        if pid not in unresolved:
            continue
        targets.append((pid, hp_id))

    counts = Counter()
    examples = defaultdict(list)
    resolver_gaps = []
    rows = []
    for pid, hp_id in targets:
        fact_list = facts.get((pid, hp_id), [])
        rich_list = rich_rows.get((pid, hp_id), [])
        fact_classes = Counter()
        strict_fact = False
        source_fact_summary = []
        for payload, source_url in fact_list:
            fact = payload.get("sourceFact") or {}
            lunch = fact.get("lunch")
            claims = sorted(set(fact.get("claimedFields") or []))
            evidence = sorted(set(fact.get("priceEvidenceClasses") or []))
            eligible = valid_source_fact_lunch(fact)
            strict_fact = strict_fact or eligible
            if eligible:
                cls = "eligible_explicit_range"
            elif lunch is None:
                cls = "no_lunch_value"
            elif not fact_budget.valid_finite_range(lunch):
                cls = "non_finite_or_invalid_lunch_value"
            elif "lunchBudget" not in claims:
                cls = "finite_value_without_lunch_claim"
            elif "explicit_range" not in evidence:
                cls = "finite_value_without_explicit_range_evidence"
            else:
                cls = "other_source_fact_gap"
            fact_classes[cls] += 1
            source_fact_summary.append({
                "class": cls,
                "lunch": lunch,
                "claimedFields": claims,
                "priceEvidenceClasses": evidence,
                "hasHttpsProvenance": bool(
                    isinstance(source_url, str) and source_url.startswith("https://www.hotpepper.jp/")
                ) or any(
                    isinstance((link or {}).get("url"), str)
                    and (link or {}).get("url", "").startswith("https://www.hotpepper.jp/")
                    for link in payload.get("retainedSourceLinks") or []
                ),
            })

        rich_classes = Counter()
        rich_summary = []
        strict_rich = False
        for value, _source_url in rich_list:
            average = value.get("average") if isinstance(value, dict) else None
            classified = classify_lunch_text(average)
            rich_classes[classified["class"]] += 1
            if classified["class"] == "strict_finite_labeled_range":
                strict_rich = True
            rich_summary.append({
                "class": classified["class"],
                "hasLunchLabel": classified["hasLunchLabel"],
                "hasFiniteRangeShape": classified["hasFiniteRangeShape"],
                "numberCount": len(classified["numbers"]),
            })

        if strict_fact or strict_rich:
            bucket = "resolver_gap_strict_evidence_present"
            resolver_gaps.append({
                "googlePlaceId": pid,
                "hotpepperId": hp_id,
                "name": names.get(pid),
                "strictSourceFact": strict_fact,
                "strictRichAverage": strict_rich,
            })
        elif any(k != "no_lunch_value" for k in fact_classes) or any(
            k not in {"empty", "no_lunch_label"} for k in rich_classes
        ):
            bucket = "retained_non_strict_lunch_evidence"
        else:
            bucket = "no_retained_lunch_budget_evidence"
        counts[bucket] += 1
        for key, value in fact_classes.items():
            counts[f"source_fact:{key}"] += value
        for key, value in rich_classes.items():
            counts[f"rich_average:{key}"] += value
        if len(examples[bucket]) < 12:
            examples[bucket].append({
                "googlePlaceId": pid,
                "hotpepperId": hp_id,
                "name": names.get(pid),
                "sourceFactClasses": dict(fact_classes),
                "richAverageClasses": dict(rich_classes),
            })
        rows.append({
            "googlePlaceId": pid,
            "hotpepperId": hp_id,
            "classification": bucket,
            "sourceFacts": source_fact_summary,
            "richBudgetEvidence": rich_summary,
        })

    output = {
        "schemaVersion": 1,
        "ruleVersion": "hotpepper-lunch-gap-audit-v1",
        "policy": {
            "networkRequests": 0,
            "databaseWrites": 0,
            "identityChanges": 0,
            "fieldResolutionChanges": 0,
            "strictFiniteRangeRuleUnchanged": True,
        },
        "summary": {
            "reviewedHotPepperIds": len(reviewed),
            "unresolvedLunchPlaces": len(unresolved),
            "reviewedHotPepperLunchTargets": len(targets),
            "resolverGapCount": len(resolver_gaps),
            "counts": dict(sorted(counts.items())),
        },
        "resolverGaps": resolver_gaps,
        "examples": {key: value for key, value in sorted(examples.items())},
        "rows": rows,
    }
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
