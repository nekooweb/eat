#!/usr/bin/env python3
"""Branch-body-aware strict currentness review.

V5 keeps v4's historical Hot Pepper gate, Overture gates, provider semantics and location
thresholds. It only fixes a page-parser blind spot: some real branch pages use a generic
HTML title (for example, "各店舗詳細") while the visible body clearly contains the brand,
branch locality and exact branch address.

The fallback can never pass a brand root. It is available only when:
- the URL is a non-root branch/detail path;
- v2/v3 already found strong branch location evidence (address >= .78, exact postcode,
  or structured geo <= 30 m);
- visible body contains a distinctive retained brand/name component;
- visible body independently contains a locality fragment derived from the expected
  street address;
- all v4 Hot Pepper + Overture hard gates still pass outside this function.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path
from urllib.parse import urlparse

import audit_id_only_priority_identity_groups as priority
import review_id_only_currentness_sources_v2 as v2
import review_id_only_currentness_sources_v3 as v3
import review_id_only_currentness_sources_v4 as v4

RULE_VERSION = "id-only-currentness-review-v5"
GENERIC_NAME_COMPONENTS = {
    "restaurant", "restaurants", "レストラン", "店舗", "店", "公式", "official",
    "シュラスコ", "シュラスコレストラン", "bistro", "ビストロ", "cafe", "カフェ",
    "bar", "バー", "dining", "ダイニング", "izakaya", "居酒屋", "焼肉", "yakitori",
}

_ORIGINAL_CURRENTNESS_CHECK = v2.currentness_check


def compact(value: str) -> str:
    return priority.normalize_name(unicodedata.normalize("NFKC", str(value or "")))


def branch_specific_url(value: str) -> bool:
    try:
        parsed = urlparse(str(value or ""))
    except Exception:
        return False
    path = parsed.path.strip("/")
    if not path:
        return False
    segments = [seg for seg in path.split("/") if seg]
    if len(segments) >= 2:
        return True
    # A single long slug is still branch-specific; a root/index/about path is not.
    slug = segments[0].casefold() if segments else ""
    return len(slug) >= 6 and slug not in {"index", "home", "about", "shop", "store", "restaurant"}


def locality_fragments(address: str) -> list[str]:
    text = unicodedata.normalize("NFKC", str(address or ""))
    text = re.sub(r"〒\s*\d{3}[-ー－]?\d{4}", "", text)
    text = text.replace("東京都", "")
    # Capture the neighborhood before the first street number, after ward/city if present.
    match = re.search(r"(?:区|市)([^0-9０-９]{3,18}?)(?=[0-9０-９])", text)
    if not match:
        return []
    raw = re.sub(r"[\s\u3000・･,，。/\\()（）\[\]【】「」『』&＆-]+", "", match.group(1))
    raw = re.sub(r"(?:丁目|番地|番|号)$", "", raw)
    if len(raw) < 3:
        return []
    out = [raw]
    # Japanese branch pages often omit a leading historical district token: 神田神保町 -> 神保町.
    # Only suffixes of >=3 characters are accepted, never one/two-character locality hints.
    for size in range(3, min(7, len(raw)) + 1):
        token = raw[-size:]
        if token not in out:
            out.append(token)
    return sorted(out, key=lambda token: (-len(token), token))


def distinctive_name_components(target: dict) -> list[str]:
    values = []
    for alias in v2.aliases_for(target):
        for token in v3.name_components(alias):
            normalized = compact(token)
            if len(normalized) < 4 or normalized in GENERIC_NAME_COMPONENTS:
                continue
            if normalized not in values:
                values.append(normalized)
    return values


def strong_location_from_failed_review(review: dict) -> tuple[bool, dict | None]:
    checks = list(review.get("bestChecks") or [])
    best = None
    for check in checks:
        geo = check.get("geoDistanceMeters")
        strong = bool(
            check.get("postalMatch") is True
            or float(check.get("addressSimilarity") or 0) >= 0.78
            or (geo is not None and float(geo) <= 30)
        )
        if strong:
            if best is None or float(check.get("addressSimilarity") or 0) > float(best.get("addressSimilarity") or 0):
                best = check
    return best is not None, best


def branch_body_currentness_check(page: dict, target: dict):
    base = _ORIGINAL_CURRENTNESS_CHECK(page, target)
    if base.get("accepted") is True or not page.get("ok"):
        return base

    final_url = str(page.get("finalUrl") or page.get("url") or target.get("currentnessUrl") or "")
    if not branch_specific_url(final_url):
        return base

    location_ok, location_check = strong_location_from_failed_review(base)
    if not location_ok:
        return base

    visible = compact(page.get("visibleText") or "")
    if not visible:
        return base
    brand_components = distinctive_name_components(target)
    matched_brand = [token for token in brand_components if token in visible]
    localities = locality_fragments((target.get("expected") or {}).get("address") or "")
    matched_locality = [token for token in localities if compact(token) in visible]
    if not matched_brand or not matched_locality:
        return base

    # This is a component-evidence score, not an edit-distance claim. Promotion validates
    # the method and component arrays explicitly; it is kept >= .72 only for compatibility
    # with the existing currentness evidence consumer.
    component_score = min(0.98, 0.82 + 0.04 * min(3, len(matched_brand)) + 0.04 * min(2, len(matched_locality)))
    best_check = {
        "method": "visible_branch_body_brand_locality_plus_strong_location",
        "matchedExpectedName": matched_brand[0],
        "pageName": " + ".join(matched_brand[:3] + matched_locality[:2]),
        "pageAddress": (location_check or {}).get("pageAddress") or str(page.get("visibleAddress") or ""),
        "nameSimilarity": round(component_score, 4),
        "addressSimilarity": (location_check or {}).get("addressSimilarity"),
        "postalMatch": bool((location_check or {}).get("postalMatch")),
        "geoDistanceMeters": (location_check or {}).get("geoDistanceMeters"),
        "locationConfirmed": True,
        "accepted": True,
        "branchBodyEvidence": {
            "branchSpecificUrl": True,
            "matchedDistinctiveNameComponents": matched_brand[:6],
            "matchedLocalityFragments": matched_locality[:6],
            "minimumDistinctiveNameComponentsRequired": 1,
            "minimumLocalityFragmentsRequired": 1,
            "strongLocationThreshold": "postcode OR addressSimilarity>=0.78 OR structuredGeo<=30m",
        },
    }
    return {
        "accepted": True,
        "reason": "current_branch_body_reconfirmed_brand_locality_and_strong_location",
        "aliasesChecked": v2.aliases_for(target),
        "bestCheck": best_check,
        "finalUrl": page.get("finalUrl"),
        "retrievedAt": page.get("retrievedAt"),
        "contentHash": page.get("contentHash"),
        "baseTitleOrJsonLdReview": base,
    }


def output_path_from_argv():
    for index, value in enumerate(sys.argv[:-1]):
        if value == "--output":
            return Path(sys.argv[index + 1])
    return None


def main():
    # v4 resolves v2.currentness_check at runtime. Replace only the page-name fallback;
    # v4 target building and all HP/Overture gates remain untouched.
    v2.best_name_match = v3.best_name_match
    v2.currentness_check = branch_body_currentness_check
    v4.RULE_VERSION = RULE_VERSION
    v4.main()

    output = output_path_from_argv()
    if output and output.exists():
        doc = json.loads(output.read_text(encoding="utf-8"))
        doc["policy"] = {
            **(doc.get("policy") or {}),
            "branchBodyFallbackEnabled": True,
            "branchBodyFallbackRequiresBranchSpecificUrl": True,
            "branchBodyFallbackRequiresDistinctiveNameComponent": True,
            "branchBodyFallbackRequiresAddressDerivedLocality": True,
            "branchBodyFallbackStrongLocationRule": "postcode OR addressSimilarity>=0.78 OR structuredGeo<=30m",
            "v4HotPepperGateUnchanged": True,
            "v4OvertureGatesUnchanged": True,
            "proximityOnlyAdmissionAllowed": False,
        }
        output.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
