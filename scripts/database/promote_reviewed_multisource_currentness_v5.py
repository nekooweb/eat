#!/usr/bin/env python3
"""Promotion adapter for strict branch-body currentness v5.

V5 changes only the current-page name evidence fallback. Before delegating to the v4
collision-checked promoter, this adapter verifies that every body-fallback admission row
came from a branch-specific URL, has a distinctive retained name component, has a
locality fragment derived from the expected address, and retains v4's strong location
rule. Historical Hot Pepper and Overture gates are not modified.
"""
from __future__ import annotations

import promote_reviewed_multisource_currentness_v4 as base

REAL_LOAD_JSON = base.load_json
PROMOTION_RULE_VERSION = "reviewed-multisource-currentness-v5"


def validate_v5_review(doc: dict):
    if doc.get("ruleVersion") != "id-only-currentness-review-v5":
        return
    policy = doc.get("policy") or {}
    required_true = (
        "proposalOnly",
        "nameAndLocationReconfirmationRequired",
        "historicalHotPepperGateUnchanged",
        "overtureBase20mGateRetained",
        "overtureAddressOffsetRequiresStreetCoreMatch",
        "overtureAddressOffsetRequiresNameComponents",
        "branchBodyFallbackEnabled",
        "branchBodyFallbackRequiresBranchSpecificUrl",
        "branchBodyFallbackRequiresDistinctiveNameComponent",
        "branchBodyFallbackRequiresAddressDerivedLocality",
        "v4HotPepperGateUnchanged",
        "v4OvertureGatesUnchanged",
    )
    if any(policy.get(key) is not True for key in required_true):
        raise RuntimeError("v5 review is missing strict inherited/current-page policy markers")
    if policy.get("paidDataApiCalls") != 0 or policy.get("googleDisplayPayloadPersisted") is not False:
        raise RuntimeError("v5 review violates zero-paid/no-Google-display policy")
    if policy.get("proximityOnlyAdmissionAllowed") is not False:
        raise RuntimeError("v5 review would allow proximity-only admission")
    if int(policy.get("overtureAddressOffsetMaximumMeters") or 0) != 60:
        raise RuntimeError("v5 review changed v4 Overture offset maximum")
    if float(policy.get("overtureAddressOffsetRequiresRunnerUpMargin") or 0) != 0.15:
        raise RuntimeError("v5 review changed v4 runner-up margin")

    for row in doc.get("rows") or []:
        if row.get("admissionReady") is not True:
            continue
        review = row.get("currentnessReview") or {}
        check = review.get("bestCheck") or {}
        body = check.get("branchBodyEvidence")
        if not body:
            continue
        if check.get("method") != "visible_branch_body_brand_locality_plus_strong_location":
            raise RuntimeError("unexpected v5 branch-body currentness method")
        if body.get("branchSpecificUrl") is not True:
            raise RuntimeError("v5 body fallback is not branch-specific")
        if not body.get("matchedDistinctiveNameComponents"):
            raise RuntimeError("v5 body fallback lacks distinctive retained name evidence")
        if not body.get("matchedLocalityFragments"):
            raise RuntimeError("v5 body fallback lacks address-derived locality evidence")
        if check.get("locationConfirmed") is not True:
            raise RuntimeError("v5 body fallback lacks confirmed location")
        address_sim = float(check.get("addressSimilarity") or 0)
        geo = check.get("geoDistanceMeters")
        strong_location = bool(
            check.get("postalMatch") is True
            or address_sim >= 0.78
            or (geo is not None and float(geo) <= 30)
        )
        if not strong_location:
            raise RuntimeError("v5 body fallback does not meet strong-location threshold")
        if float(check.get("nameSimilarity") or 0) < 0.72:
            raise RuntimeError("v5 body fallback compatibility name score is too low")


def strict_v5_load(path):
    doc = REAL_LOAD_JSON(path)
    if doc.get("ruleVersion") != "id-only-currentness-review-v5":
        return doc
    validate_v5_review(doc)
    adapted = dict(doc)
    adapted["sourceRuleVersion"] = doc["ruleVersion"]
    adapted["ruleVersion"] = "id-only-currentness-review-v4"
    return adapted


def main():
    base.load_json = strict_v5_load
    base.RULE_VERSION = PROMOTION_RULE_VERSION
    base.main()


if __name__ == "__main__":
    main()
