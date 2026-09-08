#!/usr/bin/env python3
"""Order-insensitive branch-name review for strict id-only currentness candidates.

V3 changes only the name-comparison layer from v2. Location, historical Hot Pepper,
Overture, provider-collision and source-matched admission gates are unchanged.

Japanese restaurant names often reorder branch/location tokens between sources, e.g.
`飯田橋 あらた` vs `あらた｜飯田橋`, or `... 総本店 神田店` vs `... 神田総本店`.
SequenceMatcher is order-sensitive and incorrectly rejected these. V3 adds a conservative
component-coverage score using source-name components while stripping only generic branch
suffixes. A page still cannot pass on name alone: v2's address/postcode/geo gate remains
mandatory, and promotion remains a separate collision-checked step.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

import audit_id_only_priority_identity_groups as priority
import review_id_only_currentness_sources_v2 as v2

RULE_VERSION = "id-only-currentness-review-v3"
GENERIC_COMPONENTS = {
    "公式", "restaurant", "restaurante", "cafe", "coffee", "bar", "dining",
    "bistro", "ビストロ", "レストラン", "カフェ", "店舗", "shop", "store",
    "本店", "総本店", "支店",
}
SPLIT_RE = re.compile(r"[\s\u3000・･,，。/\\|｜:：;；()（）\[\]【】「」『』&＆+\-_]+")


def name_components(value: str):
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    raw = [part for part in SPLIT_RE.split(text) if part]
    out = []
    for part in raw:
        normalized = priority.normalize_name(part)
        if not normalized:
            continue
        normalized = re.sub(r"(?:総本店|本店|支店|店舗)$", "", normalized)
        if normalized.endswith("店") and len(normalized) >= 3:
            normalized = normalized[:-1]
        if not normalized or normalized in GENERIC_COMPONENTS or len(normalized) < 2:
            continue
        if normalized not in out:
            out.append(normalized)
    return out


def component_similarity(alias: str, page_name: str):
    baseline = priority.similarity(alias, page_name)
    page_norm = priority.normalize_name(page_name)
    components = name_components(alias)
    if not page_norm or not components:
        return baseline
    matched = [token for token in components if token in page_norm]
    if len(components) >= 2 and len(matched) >= 2:
        total = sum(len(token) for token in components)
        covered = sum(len(token) for token in matched)
        coverage = covered / total if total else 0.0
        component_score = min(0.98, 0.72 + 0.26 * coverage)
        return max(baseline, component_score)
    if len(components) == 1 and len(components[0]) >= 6 and components[0] in page_norm:
        return max(baseline, 0.90)
    return baseline


def best_name_match(page_name: str, aliases: list[str]):
    scored = [(component_similarity(alias, page_name), alias) for alias in aliases if alias]
    if not scored:
        return 0.0, None
    scored.sort(key=lambda item: (-item[0], len(item[1])))
    return scored[0]


def output_path_from_argv():
    for index, value in enumerate(sys.argv[:-1]):
        if value == "--output":
            return Path(sys.argv[index + 1])
    return None


def main():
    # v2's currentness_check resolves this global at runtime, so replace only the name
    # comparator and rule label. All location and admission gates remain v2 code paths.
    v2.best_name_match = best_name_match
    v2.RULE_VERSION = RULE_VERSION
    v2.main()

    # Mark the persisted review explicitly so a promotion consumer can distinguish this
    # comparator fix from any threshold relaxation.
    output = output_path_from_argv()
    if output and output.exists():
        doc = json.loads(output.read_text(encoding="utf-8"))
        doc["policy"] = {
            **(doc.get("policy") or {}),
            "orderInsensitiveRetainedNameComponents": True,
            "genericBranchSuffixNormalizationOnly": True,
            "minimumMatchedRetainedNameComponents": 2,
            "locationThresholdsUnchangedFromV2": True,
            "admissionThresholdsUnchangedFromV2": True,
        }
        output.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
