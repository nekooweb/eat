#!/usr/bin/env python3
"""Strict currentness review with branch-address-aware Overture support.

V4 fixes two remaining structural issues without allowing proximity-only promotion:
1. reviewed discovery overrides may provide a current official branch URL even when the
   retained Overture website is an excluded directory/aggregator;
2. an Overture point may be up to 60 m from Hot Pepper only when the branch street-address
   core independently agrees, the Overture runner-up margin remains >= 0.15, retained name
   components agree, and a freshly fetched current branch page reconfirms name + location.

The historical frozen-ID <-> Hot Pepper gate is unchanged. The original <=20 m Overture
gate remains valid and preferred. Raw HTML is never persisted and paid Google APIs remain 0.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

import audit_id_only_priority_identity_groups as priority
import collect_official_practical_fields as practical
import review_id_only_currentness_sources as v1
import review_id_only_currentness_sources_v2 as v2
import review_id_only_currentness_sources_v3 as v3

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
OVERRIDE_PATH = DATA / "id_only_currentness_source_overrides.json"
RULE_VERSION = "id-only-currentness-review-v4"


def load_overrides():
    if not OVERRIDE_PATH.exists():
        return {}, None
    doc = json.loads(OVERRIDE_PATH.read_text(encoding="utf-8"))
    policy = doc.get("policy") or {}
    if policy.get("paidDataApiCalls") != 0 or policy.get("googleDisplayPayloadPersisted") is not False:
        raise RuntimeError("currentness discovery overrides violate zero-paid/no-Google-display policy")
    if policy.get("proposalOnly") is not True or policy.get("identityPromotionByThisFile") is not False:
        raise RuntimeError("currentness discovery overrides must remain proposal-only")
    if policy.get("currentPageRevalidationRequired") is not True or policy.get("nameAndLocationReconfirmationRequired") is not True:
        raise RuntimeError("currentness discovery overrides must require fresh name+location review")
    rows = {
        str(row.get("googlePlaceId") or "").strip(): row
        for row in doc.get("rows") or []
        if row.get("googlePlaceId")
    }
    return rows, doc


def normalized_address_core(value: str) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    text = re.sub(r"〒\s*\d{3}[-‐‑–—ー－]?\d{4}", "", text)
    text = text.replace("東京都", "")
    text = re.sub(r"丁目", "-", text)
    text = re.sub(r"番地?", "-", text)
    text = re.sub(r"号", "", text)
    text = re.sub(r"[-‐‑‒–—―ー－]+", "-", text)
    text = re.sub(r"[\s\u3000・･_,，。/\\()（）\[\]【】「」『』&＆]+", "", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text


def street_signature(value: str):
    text = normalized_address_core(value)
    # Keep only a Japanese locality immediately followed by a 2- or 3-part street number.
    match = re.search(r"(千代田区[^0-9]{1,28}?)(\d+)-(\d+)(?:-(\d+))?", text)
    if not match:
        return None
    locality = match.group(1)
    numbers = tuple(x for x in match.groups()[1:] if x is not None)
    return locality, numbers


def branch_address_core_match(a: str, b: str) -> bool:
    if priority.address_similarity(a, b) >= 0.78:
        return True
    left, right = normalized_address_core(a), normalized_address_core(b)
    if left and right and min(len(left), len(right)) >= 10 and (left in right or right in left):
        return True
    lsig, rsig = street_signature(a), street_signature(b)
    if not lsig or not rsig:
        return False
    llocal, lnums = lsig
    rlocal, rnums = rsig
    locality_ok = llocal == rlocal or llocal in rlocal or rlocal in llocal
    return bool(locality_ok and len(lnums) >= 2 and lnums == rnums)


def overture_gate(facts: dict, direct: dict) -> dict:
    best = direct.get("best") or {}
    raw_name = float(best.get("nameSimilarity") or 0)
    effective_name = max(raw_name, v3.component_similarity(str(facts.get("name") or ""), str(best.get("name") or "")))
    distance = float(best.get("distanceMeters") or 999999)
    margin = float(best.get("margin") or 0)
    address_match = branch_address_core_match(str(facts.get("address") or ""), str(best.get("address") or ""))
    base_gate = bool(
        direct.get("strongReviewCandidate")
        and distance <= 20
        and effective_name >= 0.75
        and margin >= 0.15
    )
    address_offset_gate = bool(
        direct.get("strongReviewCandidate")
        and distance <= 60
        and effective_name >= 0.82
        and margin >= 0.15
        and address_match
    )
    return {
        "accepted": base_gate or address_offset_gate,
        "base20mGate": base_gate,
        "branchAddressOffsetGate": address_offset_gate and not base_gate,
        "distanceMeters": round(distance, 1),
        "rawNameSimilarity": round(raw_name, 4),
        "effectiveNameSimilarity": round(effective_name, 4),
        "addressCoreMatch": address_match,
        "rawAddressSimilarity": best.get("addressSimilarity"),
        "margin": round(margin, 4),
        "maximumOffsetMetersWhenAddressCoreMatches": 60,
    }


def validated_override(pid: str, facts: dict, best: dict, override_rows: dict, counts: Counter):
    row = override_rows.get(pid)
    if not row:
        return None, None
    url, reason = v1.independent_https_url(row.get("url"))
    if not url:
        counts[f"override_rejected_{reason}"] += 1
        return None, None
    candidate_name = str(row.get("candidateName") or "").strip()
    aliases = [str(facts.get("name") or ""), str(best.get("name") or "")]
    if candidate_name:
        score = max((v3.component_similarity(candidate_name, alias) for alias in aliases if alias), default=0.0)
        if score < 0.72:
            counts["override_candidate_name_mismatch"] += 1
            return None, None
    return url, {
        "candidateName": candidate_name,
        "url": url,
        "discoveryClass": row.get("discoveryClass"),
        "reason": row.get("reason"),
        "proposalOnly": True,
        "requiresFreshPageRevalidation": True,
    }


def build_targets(database: Path):
    states = v1.load_states(database)
    hp_doc = priority.load_json(DATA / "hotpepper_catalog_facts.json", {"rows": []}) or {"rows": []}
    hp_by_pid = {str(row.get("googlePlaceId")): row for row in hp_doc.get("rows") or []}
    overture_doc = priority.load_json(DATA / "overture_area1_candidates.json", {"rows": []}) or {"rows": []}
    overture_grid = priority.build_overture_grid(overture_doc.get("rows") or [])
    override_rows, override_doc = load_overrides()

    counts = Counter()
    targets = []
    id_only = {pid for pid, state in states.items() if state == "id_only"}
    for pid in sorted(id_only):
        hp = hp_by_pid.get(pid)
        if not hp or (hp.get("binding") or {}).get("confidence") != "high":
            continue
        counts["hotpepper_high_id_only"] += 1
        binding = hp.get("binding") or {}
        facts = hp.get("facts") or {}
        direct = priority.direct_hp_overture({
            "name": facts.get("name"),
            "address": facts.get("address"),
            "lat": facts.get("lat"),
            "lng": facts.get("lng"),
        }, overture_grid)
        if not direct.get("strongReviewCandidate"):
            counts["direct_overture_not_strong"] += 1
            continue
        best = direct.get("best") or {}
        hard_history = bool(
            binding.get("seedSource") == "transient_full_sweep"
            and float(binding.get("distanceMeters") or 999999) <= 15
            and float(binding.get("nameSimilarity") or 0) >= 0.60
            and float(binding.get("combinedScore") or 0) >= 0.74
        )
        gate = overture_gate(facts, direct)
        if gate["base20mGate"]:
            counts["overture_base20m_gate"] += 1
        if gate["branchAddressOffsetGate"]:
            counts["overture_branch_address_offset_gate"] += 1
        if not gate["accepted"]:
            counts["overture_hard_gate_not_met"] += 1

        override_url, override_meta = validated_override(pid, facts, best, override_rows, counts)
        selected_url = override_url
        blocked = []
        if not selected_url:
            for raw_url in best.get("websites") or []:
                candidate_url, reason = v1.independent_https_url(raw_url)
                if candidate_url:
                    selected_url = candidate_url
                    break
                blocked.append(reason)
        if not selected_url:
            counts["no_independent_currentness_url"] += 1
            continue
        if override_url:
            counts["currentness_discovery_override_used"] += 1

        targets.append({
            "googlePlaceId": pid,
            "group": "hotpepper_high_direct_overture_v4",
            "currentnessUrl": selected_url,
            "expected": {
                "name": facts.get("name"),
                "address": facts.get("address"),
                "lat": facts.get("lat"),
                "lng": facts.get("lng"),
            },
            "hotpepper": {"hotpepperId": hp.get("hotpepperId"), "binding": binding},
            "overture": best,
            "hardHistoricalBindingGate": hard_history,
            "hardDirectOvertureGate": gate["accepted"],
            "overtureGateV4": gate,
            "currentnessDiscoveryOverride": override_meta,
            "blockedAlternativeUrlReasons": blocked,
            "overrideSnapshotCheckedAt": (override_doc or {}).get("checkedAt"),
        })
        counts["currentness_targets"] += 1
    return targets, counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    targets, counts = build_targets(args.database)
    v2.best_name_match = v3.best_name_match
    pages = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(10, args.workers))) as pool:
        futures = {pool.submit(practical.fetch_visible_page, row["currentnessUrl"]): row for row in targets}
        for future in concurrent.futures.as_completed(futures):
            target = futures[future]
            try:
                pages[target["googlePlaceId"]] = future.result()
            except Exception as exc:
                pages[target["googlePlaceId"]] = {"url": target["currentnessUrl"], "ok": False, "blocked": type(exc).__name__}

    rows = []
    for target in targets:
        page = pages.get(target["googlePlaceId"]) or {}
        review = v2.currentness_check(page, target)
        if page.get("ok"):
            counts["currentness_pages_ok"] += 1
        else:
            counts[f"currentness_fetch_{page.get('blocked') or 'unknown'}"] += 1
        if review.get("accepted"):
            counts["currentness_confirmed"] += 1
        admission_ready = bool(
            target.get("hardHistoricalBindingGate")
            and target.get("hardDirectOvertureGate")
            and review.get("accepted") is True
        )
        if admission_ready:
            counts["admission_ready"] += 1
        row = dict(target)
        row["sourceAliases"] = v2.aliases_for(target)
        row["currentnessReview"] = review
        row["admissionReady"] = admission_ready
        rows.append(row)

    rows.sort(key=lambda row: (not row["admissionReady"], row["googlePlaceId"]))
    output = {
        "schemaVersion": 1,
        "ruleVersion": RULE_VERSION,
        "policy": {
            "paidDataApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "automaticIdentityPromotion": False,
            "proposalOnly": True,
            "independentHttpsOnly": True,
            "nameAndLocationReconfirmationRequired": True,
            "historicalHotPepperGateUnchanged": True,
            "overtureBase20mGateRetained": True,
            "overtureAddressOffsetMaximumMeters": 60,
            "overtureAddressOffsetRequiresStreetCoreMatch": True,
            "overtureAddressOffsetRequiresNameComponents": True,
            "overtureAddressOffsetRequiresRunnerUpMargin": 0.15,
            "proximityOnlyAdmissionAllowed": False,
            "reviewedOverrideMayRestoreMissingCurrentnessUrl": True,
            "discoveryOverrideIsNeverIdentityEvidence": True,
            "rawHtmlPersisted": False,
        },
        "summary": {"targets": len(targets), "counts": dict(sorted(counts.items()))},
        "rows": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
