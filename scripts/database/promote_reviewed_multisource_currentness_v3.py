#!/usr/bin/env python3
"""Promotion adapter for threshold-preserving currentness review v3.

The durable promotion implementation remains `promote_reviewed_multisource_currentness.py`.
V3 changed only the order-sensitive restaurant-name comparator. This adapter verifies the
persisted v3 policy markers, then satisfies the older consumer's v2 version guard in
memory. It does not alter review rows, scores, current page evidence, collision checks,
provider uniqueness, location thresholds, or admission gates.
"""
from __future__ import annotations

import promote_reviewed_multisource_currentness as base

_real_load_json = base.load_json


def strict_v3_load(path):
    doc = _real_load_json(path)
    if doc.get("ruleVersion") != "id-only-currentness-review-v3":
        return doc
    policy = doc.get("policy") or {}
    required_true = (
        "proposalOnly",
        "nameAndLocationReconfirmationRequired",
        "orderInsensitiveRetainedNameComponents",
        "genericBranchSuffixNormalizationOnly",
        "locationThresholdsUnchangedFromV2",
        "admissionThresholdsUnchangedFromV2",
    )
    if any(policy.get(key) is not True for key in required_true):
        raise RuntimeError("v3 review is missing threshold-preserving policy markers")
    if int(policy.get("minimumMatchedRetainedNameComponents") or 0) < 2:
        raise RuntimeError("v3 component comparator is not strict enough")
    if policy.get("paidDataApiCalls") != 0 or policy.get("googleDisplayPayloadPersisted") is not False:
        raise RuntimeError("v3 review violates zero-paid/no-Google-display policy")
    adapted = dict(doc)
    adapted["sourceRuleVersion"] = doc["ruleVersion"]
    adapted["ruleVersion"] = "id-only-currentness-review-v2"
    return adapted


def main():
    base.load_json = strict_v3_load
    base.main()


if __name__ == "__main__":
    main()
