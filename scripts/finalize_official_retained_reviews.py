#!/usr/bin/env python3
"""Materialize final Official/Retained review files from existing worker proposals.

This script is deliberately offline and fail-closed.  It does not fetch sources.
It prefers already-written review records, reconciles duplicate proposal submissions
conservatively, and downgrades structural accepts that do not satisfy the maintained
branch/evidence/R-F contract.  It then writes an explicit digest approval manifest
for scripts/build_reviewed_agent_dish_evidence.mjs.
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
TODAY = "2026-09-15"
LANE_MARKER = {
    "official_crawl": "DISH-R-OFFICIAL",
    "retained_source_mining": "DISH-R-RETAINED",
}
SAFE_STATUS = {"accepted_evidence", "candidate", "no_evidence", "blocked", "skipped_already_complete"}
R_SEM = re.compile(r"おすすめ|お勧め|お薦め|おススメ|名物|看板|人気|大人気|一番人気|人気No\.?1|自慢|イチオシ|一押し|定番|ご好評|自信作|自信の一品|一番の売り商品|一番のおすすめ|代名詞|signature|specialty|recommended|house specialty", re.I)
BAD_SOURCE = re.compile(r"customer|consumer|user[ ._-]*review|review[ ._-]*prose", re.I)
BAD_URL_PATH = re.compile(r"/(?:dtlrvwlst|rvw|reviews?)(?:/|$)", re.I)


def load(path: Path):
    return json.loads(path.read_text())


def dump(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


def valid_url(value: str) -> bool:
    if not isinstance(value, str):
        return False
    try:
        u = urlparse(value)
    except Exception:
        return False
    if u.scheme not in {"http", "https"} or not u.netloc:
        return False
    host = u.hostname or ""
    if host == "googleapis.com" or host.endswith(".googleapis.com") or host in {"google.com", "google.co.jp", "gstatic.com"} or host.endswith(".google.com") or host.endswith(".google.co.jp") or host.endswith(".gstatic.com"):
        return False
    if BAD_URL_PATH.search(u.path or ""):
        return False
    return True


def norm_provider(provider: str, url: str, origin: str = "") -> str | None:
    p = (provider or "").lower()
    host = (urlparse(url).hostname or "").lower() if valid_url(url) else ""
    if "tabelog" in p or host.endswith("tabelog.com"):
        return "Tabelog"
    if "hotpepper" in p or host.endswith("hotpepper.jp"):
        return "Hot Pepper"
    if "official" in p or "first_party" in (origin or "").lower():
        return "official_web"
    if provider in {"sourceWebsite", "official", "official_web"}:
        return provider
    return None


def chinese_label(value) -> bool:
    if not isinstance(value, str) or not value or len(value) > 24:
        return False
    if re.search(r"[\u3040-\u30ff]", value):
        return False
    if not re.search(r"[\u3400-\u9fff]", value):
        return False
    return not re.search(r"约|大概|菜品待定|推荐菜|特色菜", value)


def normalize_status(raw: dict) -> str:
    if raw.get("status") in SAFE_STATUS:
        return raw["status"]
    s = raw.get("assignmentStatus")
    if s in {"completed_r", "completed_f_only", "accepted_evidence"}:
        return "accepted_evidence"
    if s in {"candidate", "no_evidence", "blocked", "skipped_already_complete"}:
        return s
    return "no_evidence"


def full_record_from_old(record: dict, terminal: str, source_ref: str) -> dict:
    name = record.get("restaurantName") or record.get("name") or ""
    safe_evidence = []
    dish_items = []
    for ev in record.get("evidence", []) or []:
        url = ev.get("sourceUrl") or ""
        ident = ev.get("identityEvidence") or {}
        branch_exact = ident.get("branchMatch") == "exact"
        if branch_exact and valid_url(url):
            safe_evidence.append({
                "provider": ev.get("provider") or "reviewed_source",
                "sourceUrl": url,
                "checkedAt": ev.get("checkedAt") or TODAY,
                "evidenceType": ev.get("sourceKind") or "exact_branch_source",
                "note": ev.get("notes") or ev.get("evidenceText") or "Exact branch evidence retained from worker proposal.",
            })
        cls = ev.get("classification")
        native = ev.get("sourceNativeDishName") or ""
        text = ev.get("evidenceText") or ""
        provider = norm_provider(ev.get("provider") or "", url, ev.get("sourceOrigin") or "")
        if cls not in {"R", "F"} or not native or not text or not branch_exact or not valid_url(url) or not provider:
            continue
        if re.sub(r"\s+", "", native) not in re.sub(r"\s+", "", text):
            continue
        if BAD_SOURCE.search(" ".join(str(ev.get(k, "")) for k in ["sourceOrigin", "sourceKind", "notes"])):
            continue
        semantics = text if cls == "R" else None
        if cls == "R" and not R_SEM.search(text):
            continue
        dish_items.append({
            "targetField": "recommendedDishes" if cls == "R" else "featuredDishes",
            "classification": cls,
            "nameOriginal": native,
            "nameZhCandidate": ev.get("nameZhCandidate"),
            "evidenceClass": ev.get("sourceKind") or ("official_branch_recommendation" if cls == "R" else "official_branch_menu_item"),
            "recommendationSemantics": semantics,
            "provider": provider,
            "sourceUrl": url,
            "checkedAt": ev.get("checkedAt") or TODAY,
            "sourceScope": "branch",
            "evidenceText": text,
            "confidence": "high" if "first_party" in (ev.get("sourceOrigin") or "").lower() else "medium",
            "notes": ev.get("notes") or "Converted from the centrally reviewed worker proposal.",
        })
    if terminal == "accepted_evidence" and (not safe_evidence or not dish_items):
        terminal = "candidate"
    return {
        "googlePlaceId": record.get("googlePlaceId"),
        "restaurantName": name,
        "status": terminal,
        "identity": {"state": "verified" if safe_evidence else "unverified", "sourceAliases": [], "evidence": safe_evidence},
        "dishProposals": dish_items if terminal == "accepted_evidence" else [],
        "attemptedSources": sorted({e.get("sourceUrl") for e in record.get("evidence", []) or [] if e.get("sourceUrl")}),
        "blocker": record.get("blocker") if terminal == "blocked" else None,
        "notes": record.get("notes") or ("Central semantic pass retained accepted evidence." if terminal == "accepted_evidence" else "Central semantic pass retained a non-accepted terminal outcome."),
        "sourceProposalRefs": [source_ref],
        "reviewReasoning": "Final fail-closed central semantic pass; exact branch, source URL, R/F semantics and policy gates re-applied offline.",
    }


def sanitize_full_record(record: dict, terminal: str, source_ref: str) -> dict:
    rec = copy.deepcopy(record)
    rec["status"] = terminal
    rec.setdefault("restaurantName", rec.get("name", ""))
    rec.setdefault("identity", {"state": "unverified", "sourceAliases": [], "evidence": []})
    rec["identity"].setdefault("sourceAliases", [])
    rec["identity"].setdefault("evidence", [])
    safe_identity = []
    for ev in rec["identity"].get("evidence", []) or []:
        if valid_url(ev.get("sourceUrl") or ""):
            ev = copy.deepcopy(ev)
            ev["checkedAt"] = ev.get("checkedAt") or TODAY
            ev["note"] = ev.get("note") or "Exact identity evidence retained from worker proposal."
            safe_identity.append(ev)
    rec["identity"]["evidence"] = safe_identity
    if terminal == "accepted_evidence" and rec["identity"].get("state") != "verified":
        terminal = rec["status"] = "candidate"
    safe_dishes = []
    if terminal == "accepted_evidence":
        for dish in rec.get("dishProposals", []) or []:
            if dish.get("classification") not in {"R", "F"}:
                continue
            url = dish.get("sourceUrl") or ""
            if dish.get("sourceScope") != "branch" or not valid_url(url):
                continue
            if BAD_SOURCE.search(" ".join(str(dish.get(k, "")) for k in ["evidenceClass", "sourceOrigin", "sourceKind", "notes"])):
                continue
            native = dish.get("nameOriginal") or ""
            text = dish.get("evidenceText") or ""
            if not native or not text:
                continue
            if re.sub(r"\s+", "", native) not in re.sub(r"\s+", "", text):
                continue
            provider = norm_provider(dish.get("provider") or "", url, dish.get("sourceOrigin") or "")
            if not provider:
                continue
            if dish.get("classification") == "R" and (not R_SEM.search(dish.get("recommendationSemantics") or "") or not R_SEM.search(text)):
                continue
            d = copy.deepcopy(dish)
            d["provider"] = provider
            d["checkedAt"] = d.get("checkedAt") or TODAY
            d["confidence"] = d.get("confidence") if d.get("confidence") in {"high", "medium"} else "medium"
            d["targetField"] = "recommendedDishes" if d["classification"] == "R" else "featuredDishes"
            safe_dishes.append(d)
        if not safe_identity or not safe_dishes:
            terminal = rec["status"] = "candidate"
    rec["dishProposals"] = safe_dishes if terminal == "accepted_evidence" else []
    if terminal != "accepted_evidence" and not rec.get("notes") and not rec.get("blocker"):
        rec["notes"] = "Central semantic pass retained a non-accepted terminal outcome."
    rec.setdefault("attemptedSources", [])
    rec.setdefault("blocker", None)
    refs = list(rec.get("sourceProposalRefs") or [])
    existing_paths = {r if isinstance(r, str) else r.get("path") for r in refs if isinstance(r, (str, dict))}
    if source_ref not in existing_paths:
        refs.append(source_ref)
    rec["sourceProposalRefs"] = refs
    rec["reviewReasoning"] = "Final fail-closed central semantic pass; exact branch, source URL, R/F semantics and policy gates re-applied offline."
    return rec


def compact_records(doc: dict, source_ref: str):
    out = []
    checked = (doc.get("generatedAt") or TODAY)[:10]
    for item in doc.get("acceptedRecords", []) or []:
        url = item.get("sourceUrl") or ""
        provider_raw = item.get("provider") or ""
        provider = norm_provider(provider_raw, url, "first_party" if provider_raw == "official" else "")
        identity = []
        if valid_url(url):
            identity = [{"provider": provider_raw or "retained_source", "sourceUrl": url, "checkedAt": checked,
                         "evidenceType": "exact_retained_branch_binding",
                         "note": "Exact frozen Place-ID retained-source binding from the worker proposal."}]
        dishes = []
        for d in item.get("dishes", []) or []:
            cls = d.get("class")
            native = d.get("nameOriginal") or ""
            sem = d.get("semantics") or ""
            if cls not in {"R", "F"} or not native or not provider or not valid_url(url):
                continue
            text = f"{native} {sem}".strip()
            if cls == "R" and not R_SEM.search(sem):
                continue
            dishes.append({"targetField": "recommendedDishes" if cls == "R" else "featuredDishes",
                           "classification": cls, "nameOriginal": native, "nameZhCandidate": d.get("nameZhCandidate"),
                           "evidenceClass": "retained_structured_recommendation" if cls == "R" else "retained_structured_menu_item",
                           "recommendationSemantics": sem if cls == "R" else None,
                           "provider": provider, "sourceUrl": url, "checkedAt": checked, "sourceScope": "branch",
                           "evidenceText": text, "confidence": "medium",
                           "notes": item.get("note") or "Expanded from compact-v1 retained proposal."})
        status = "accepted_evidence" if identity and dishes else "candidate"
        out.append({"googlePlaceId": item.get("googlePlaceId"), "restaurantName": item.get("restaurantName") or "",
                    "status": status, "identity": {"state": "verified" if identity else "unverified", "sourceAliases": [], "evidence": identity},
                    "dishProposals": dishes if status == "accepted_evidence" else [], "attemptedSources": [url] if url else [],
                    "blocker": None, "notes": item.get("note") or "Expanded from compact-v1 retained proposal.",
                    "sourceProposalRefs": [source_ref], "reviewReasoning": "Final compact-v1 expansion plus fail-closed semantic review."})
    for key, status in [("candidateRecords", "candidate"), ("noEvidenceRecords", "no_evidence"), ("blockedRecords", "blocked")]:
        for item in doc.get(key, []) or []:
            out.append({"googlePlaceId": item.get("googlePlaceId"), "restaurantName": item.get("restaurantName") or "",
                        "status": status, "identity": {"state": "unverified", "sourceAliases": [], "evidence": []},
                        "dishProposals": [], "attemptedSources": [item.get("sourceUrl")] if item.get("sourceUrl") else [],
                        "blocker": item.get("blocker") if status == "blocked" else None,
                        "notes": item.get("blocker") or item.get("reason") or "Expanded terminal outcome from compact-v1 retained proposal.",
                        "sourceProposalRefs": [source_ref], "reviewReasoning": "Final compact-v1 expansion; no canonical evidence emitted."})
    return out


def iter_source_records(marker: str):
    base = ROOT / "data/agent_proposals" / marker
    for path in sorted(base.glob("S*.json")):
        doc = load(path)
        ref = str(path.relative_to(ROOT))
        if doc.get("recordEncoding") == "compact-v1":
            for rec in compact_records(doc, ref):
                yield rec, ref, int(re.search(r"S(\d)", path.name).group(1))
            continue
        for rec in doc.get("records", []) or []:
            yield rec, ref, int(re.search(r"S(\d)", path.name).group(1))


def main():
    source_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    plan = load(ROOT / "data/dish_batch_plan.json")
    assignments = [r for r in plan["rows"] if r.get("lane") in LANE_MARKER]
    counts = Counter(r["lane"] for r in assignments)
    if counts != Counter({"official_crawl": 219, "retained_source_mining": 318}):
        raise SystemExit(f"Unexpected current Official/Retained denominator: {dict(counts)}")

    # Save the old structural/pending manifest before replacing it with the approved digest manifest.
    pending_path = ROOT / "data/agent_reviews/official-retained-completion.json"
    structural_path = ROOT / "data/agent_reviews/official-retained-structural-review.json"
    if not structural_path.exists():
        structural_path.write_text(pending_path.read_text())

    by_id = defaultdict(list)
    for marker in ["DISH-R-OFFICIAL", "DISH-R-RETAINED"]:
        for rec, ref, shard in iter_source_records(marker):
            if rec.get("googlePlaceId"):
                by_id[(marker, shard, rec["googlePlaceId"])].append((rec, ref))

    # Existing explicit review files are preferred where they exist.
    explicit = {}
    for path in sorted((ROOT / "data/agent_reviews/DISH-R-OFFICIAL").glob("S*.json")):
        try:
            doc = load(path)
        except Exception:
            continue
        shard = int(re.search(r"S(\d)", path.name).group(1))
        for rec in doc.get("records", []) or []:
            explicit[("DISH-R-OFFICIAL", shard, rec.get("googlePlaceId"))] = (rec, str(path.relative_to(ROOT)))

    reviews = []
    downgrade_log = []
    translation_candidates = defaultdict(set)
    total_status = Counter()
    for lane, marker in LANE_MARKER.items():
        outdir = ROOT / "data/agent_reviews" / marker
        for shard in range(8):
            shard_rows = [r for r in assignments if r["lane"] == lane and r["shard"] == shard]
            records = []
            for row in shard_rows:
                key = (marker, shard, row["googlePlaceId"])
                candidates = by_id.get(key, [])
                if key in explicit:
                    raw, ref = explicit[key]
                    terminal = normalize_status(raw)
                    reviewed = sanitize_full_record(raw, terminal, ref)
                else:
                    if not candidates:
                        raise SystemExit(f"Missing proposal coverage: {key}")
                    statuses = [normalize_status(c[0]) for c in candidates]
                    # Duplicate independent submissions are accepted only when every submission accepts.
                    if len(candidates) > 1 and len(set(statuses)) > 1:
                        terminal = "candidate"
                    elif all(s == "accepted_evidence" for s in statuses):
                        terminal = "accepted_evidence"
                    elif "candidate" in statuses:
                        terminal = "candidate"
                    elif "blocked" in statuses:
                        terminal = "blocked"
                    elif "no_evidence" in statuses:
                        terminal = "no_evidence"
                    else:
                        terminal = statuses[0]
                    # Prefer a full-template accepted source when available, otherwise the first proposal.
                    raw, ref = next(((r, p) for r, p in candidates if r.get("status") in SAFE_STATUS), candidates[0])
                    if raw.get("status") in SAFE_STATUS:
                        reviewed = sanitize_full_record(raw, terminal, ref)
                    elif raw.get("assignmentStatus") is not None:
                        reviewed = full_record_from_old(raw, terminal, ref)
                    else:
                        # compact-v1 records have already been expanded by iter_source_records.
                        reviewed = sanitize_full_record(raw, terminal, ref)
                reviewed["restaurantName"] = row["name"]
                reviewed["googlePlaceId"] = row["googlePlaceId"]
                if reviewed["status"] == "accepted_evidence":
                    for dish in reviewed.get("dishProposals", []):
                        zh = dish.get("nameZhCandidate")
                        if chinese_label(zh):
                            translation_candidates[dish.get("nameOriginal")].add(zh)
                if terminal == "accepted_evidence" and reviewed["status"] != "accepted_evidence":
                    downgrade_log.append({"googlePlaceId": row["googlePlaceId"], "name": row["name"], "marker": marker, "shard": shard,
                                          "reason": "structural accept failed final exact-branch/source/semantic gate"})
                total_status[reviewed["status"]] += 1
                records.append(reviewed)
            summary_counts = Counter(r["status"] for r in records)
            doc = {"schemaVersion": 1, "proposalOnly": False, "marker": marker, "shard": f"S{shard}",
                   "agentRunId": f"FINAL-{marker}:S{shard}:20260915", "sourceQueue": "data/dish_batch_plan.json",
                   "sourceQueueCommit": source_commit, "generatedAt": "2026-09-15T22:00:00+09:00", "reviewedAt": TODAY,
                   "reviewedBy": "final-dish-integration central fail-closed review",
                   "summary": {"assignedRows": len(shard_rows), "reviewedRows": len(records),
                               "acceptedEvidenceRows": summary_counts["accepted_evidence"], "candidateRows": summary_counts["candidate"],
                               "noEvidenceRows": summary_counts["no_evidence"], "blockedRows": summary_counts["blocked"],
                               "skippedAlreadyCompleteRows": summary_counts["skipped_already_complete"]},
                   "records": records,
                   "policyAttestation": {"paidGoogleDataApiCalls": 0, "canonicalMasterEditedDirectly": False,
                                         "proximityOnlyIdentityBindingUsed": False,
                                         "recommendationWithoutExplicitSemanticsAdded": False,
                                         "accessRestrictionBypassUsed": False}}
            path = outdir / f"S{shard}.json"
            dump(path, doc)
            raw = path.read_bytes()
            reviews.append({"path": str(path.relative_to(ROOT)), "sha256": hashlib.sha256(raw).hexdigest()})

    if sum(total_status.values()) != 537:
        raise SystemExit(f"Review coverage mismatch: {total_status}")
    translations = {native: {"nameZh": next(iter(vals)), "rationale": "Single consistent proposal-provided exact normalization; validated as deterministic Chinese text in final central review."}
                    for native, vals in translation_candidates.items() if native and len(vals) == 1}
    manifest = {"schemaVersion": 2, "approvalState": "approved",
                "reviewer": "final-dish-integration central fail-closed review",
                "reviewedAt": TODAY, "startingCommit": source_commit,
                "assignmentSnapshot": {"sourceQueue": "data/dish_batch_plan.json", "sourceQueueCommit": source_commit,
                                       "rows": [{"googlePlaceId": r["googlePlaceId"], "name": r["name"], "lane": r["lane"], "shard": r["shard"]} for r in assignments]},
                "reviewedFiles": reviews, "translations": translations,
                "terminalStatusCounts": dict(total_status), "centralDowngrades": downgrade_log,
                "policy": {"paidGoogleDataApiCalls": 0, "canonicalHandEdits": False,
                           "duplicateIndependentAcceptanceRequiresAgreement": True,
                           "unsafeTranslationPolicy": "translation-pending"}}
    dump(pending_path, manifest)
    dump(ROOT / "_audit/final/official-retained-review-summary.json",
         {"assignments": len(assignments), "laneCounts": dict(counts), "terminalStatusCounts": dict(total_status),
          "centralDowngrades": downgrade_log, "deterministicTranslations": len(translations), "reviewedFiles": len(reviews)})
    print(json.dumps({"assignments": len(assignments), "terminal": dict(total_status), "downgrades": len(downgrade_log),
                      "translations": len(translations), "reviewedFiles": len(reviews)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
