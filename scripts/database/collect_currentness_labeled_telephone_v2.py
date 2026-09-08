#!/usr/bin/env python3
"""Currentness-page telephone collector with v5 branch-body identity recheck support.

The base collector remains unchanged for v3/v4 identities. For identities admitted by
`reviewed-multisource-currentness-v5`, the exact retained branch page is fetched again and
revalidated with the same strict v5 branch-body fallback before any TEL/電話 claim is
accepted. This does not broaden the target set or change telephone parsing.
"""
from __future__ import annotations

import collect_currentness_labeled_telephone as base
import review_id_only_currentness_sources_v2 as v2
import review_id_only_currentness_sources_v3 as v3
import review_id_only_currentness_sources_v5 as v5

PARSER_VERSION = "retained-currentness-labeled-telephone-v2"


def identity_check_v2(target, page):
    if target.get("matchLevel") != "reviewed-multisource-currentness-v5":
        return base._ORIGINAL_IDENTITY_CHECK(target, page)

    v2.best_name_match = v3.best_name_match
    review = v5.branch_body_currentness_check(page, target)
    check = review.get("bestCheck") or {}
    accepted = bool(
        review.get("accepted") is True
        and check.get("locationConfirmed") is True
        and float(check.get("nameSimilarity") or 0) >= 0.72
    )
    body = check.get("branchBodyEvidence") or {}
    if check.get("method") == "visible_branch_body_brand_locality_plus_strong_location":
        accepted = bool(
            accepted
            and body.get("branchSpecificUrl") is True
            and body.get("matchedDistinctiveNameComponents")
            and body.get("matchedLocalityFragments")
        )
    return {
        "accepted": accepted,
        "identityRule": base.IDENTITY_RULE,
        "preExistingSourceMatchedIdentity": True,
        "freshNameAndLocationReconfirmed": accepted,
        "proximityOnlyBindingAllowed": False,
        "retainedConsensusRule": target.get("matchLevel"),
        "retainedVerification": target.get("verification"),
        "currentnessReason": review.get("reason"),
        "currentnessMethod": check.get("method"),
        "pageName": check.get("pageName"),
        "pageAddress": check.get("pageAddress"),
        "matchedExpectedName": check.get("matchedExpectedName"),
        "pageNameSimilarity": check.get("nameSimilarity"),
        "pageAddressSimilarity": check.get("addressSimilarity"),
        "postalMatch": check.get("postalMatch"),
        "minimumGeoDistanceMeters": check.get("geoDistanceMeters"),
        "locationConfirmed": check.get("locationConfirmed"),
        "branchBodyEvidence": body or None,
    }, review


def main():
    base._ORIGINAL_IDENTITY_CHECK = base.identity_check
    base.identity_check = identity_check_v2
    base.PARSER_VERSION = PARSER_VERSION
    base.main()


if __name__ == "__main__":
    main()
