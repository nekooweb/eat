#!/usr/bin/env python3
"""Validate canonical Chinese dish fields against source-native evidence."""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
from collections import defaultdict
from pathlib import Path

RECOMMENDATION_CLASSES = {
    "source_recommendation_text",
    "source_pdf_recommendation_text",
}
FEATURED_CLASSES = {
    "retained_source_menu_item",
    "provider_promotional_dish_text",
    "structured_menu_item",
    "source_menu_text",
    "source_pdf_menu_text",
    "tabelog_menu_text",
}
RULE_VERSION = "dish-source-translation-zh-v1"
_HAN = re.compile(r"[\u3400-\u9fff]")
_KANA = re.compile(r"[\u3040-\u30ff]")


def valid_zh(value):
    return isinstance(value, str) and bool(value.strip()) and len(value.strip()) <= 32 and bool(_HAN.search(value)) and not bool(_KANA.search(value))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    db = sqlite3.connect(args.database)
    db.execute("PRAGMA foreign_keys=ON")
    failures = []

    try:
        conflicts = {row[0] for row in db.execute("SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'")}
        identities = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
        expected = defaultdict(lambda: {"recommended": set(), "featured": set()})
        source_original = 0
        accepted_evidence = 0

        for pid, field_key, value_json in db.execute("""
            SELECT o.place_id,o.field_key,o.value_json
            FROM field_observations o
            JOIN source_records sr ON sr.source_record_id=o.source_record_id
            WHERE sr.acquisition_method='retained_dish_evidence'
              AND o.field_key IN ('dish.recommendation.evidence','dish.featured.evidence')
              AND o.field_state='known'
        """):
            if identities.get(pid) not in ("verified", "source_matched") or pid in conflicts:
                continue
            try:
                item = json.loads(value_json) if value_json else None
            except Exception:
                continue
            if not isinstance(item, dict) or not valid_zh(item.get("nameZh")):
                continue
            cls = str(item.get("evidenceClass") or "")
            if field_key == "dish.recommendation.evidence" and cls in RECOMMENDATION_CLASSES:
                expected[pid]["recommended"].add(item["nameZh"].strip())
            elif field_key == "dish.featured.evidence" and cls in FEATURED_CLASSES:
                expected[pid]["featured"].add(item["nameZh"].strip())
            else:
                continue
            accepted_evidence += 1
            if str(item.get("nameOriginal") or item.get("nameJa") or "").strip():
                source_original += 1

        resolved = defaultdict(dict)
        for pid, field_key, value_json, rule_version, acquisition_method in db.execute("""
            SELECT r.place_id,r.field_key,o.value_json,r.rule_version,sr.acquisition_method
            FROM field_resolutions r
            JOIN field_observations o ON o.observation_id=r.observation_id
            JOIN source_records sr ON sr.source_record_id=o.source_record_id
            WHERE r.field_key IN ('recommended_dishes.zh','featured_dishes.zh')
              AND r.resolution_state='known'
        """):
            try:
                values = json.loads(value_json) if value_json else None
            except Exception:
                values = None
            if not isinstance(values, list) or not values or not all(valid_zh(v) for v in values):
                failures.append(f"invalid Chinese canonical dish array: {pid} {field_key}")
                continue
            if len(values) != len(set(values)):
                failures.append(f"duplicate Chinese canonical dish: {pid} {field_key}")
            if rule_version != RULE_VERSION:
                failures.append(f"unexpected dish resolver version: {pid} {field_key} {rule_version}")
            if acquisition_method != "derived_dish_translation_resolution":
                failures.append(f"canonical dish field not derived from translation resolver: {pid} {field_key}")
            target = "recommended" if field_key == "recommended_dishes.zh" else "featured"
            resolved[pid][target] = set(v.strip() for v in values)

        for pid, groups in expected.items():
            for target in ("recommended", "featured"):
                if not groups[target]:
                    continue
                actual = resolved.get(pid, {}).get(target)
                if not actual:
                    failures.append(f"accepted source-backed {target} evidence not materialized: {pid}")
                    continue
                if not actual.issubset(groups[target]):
                    failures.append(f"canonical {target} contains value absent from accepted evidence: {pid}")

        summary = {
            "status": "fail" if failures else "pass",
            "acceptedEvidenceItems": accepted_evidence,
            "acceptedEvidenceWithSourceOriginal": source_original,
            "featuredEvidenceClasses": sorted(FEATURED_CLASSES),
            "recommendationEvidenceClasses": sorted(RECOMMENDATION_CLASSES),
            "recommendedCanonicalPlaces": sum(1 for x in resolved.values() if x.get("recommended")),
            "featuredCanonicalPlaces": sum(1 for x in resolved.values() if x.get("featured")),
            "policy": "source language may be Japanese; database canonical dish labels must be Chinese",
            "failures": failures[:20],
        }
        print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    finally:
        db.close()

    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
