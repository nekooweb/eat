#!/usr/bin/env python3
"""Incremental fail-closed final reviewer for Official/Retained dish evidence.

This v2 reviewer is designed for the production-union closeout.  It treats the
already-materialized final review files as the reviewed baseline, then considers
only proposal files that are not already represented by each baseline record's
sourceProposalRefs.  New independent inputs can therefore only keep an accepted
result when they agree with the baseline; disagreements downgrade to candidate.
When all independent reviewed inputs accept, their safe evidence is unioned.

The script is offline.  It performs no collection and no paid API calls.
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
R_SEM = re.compile(r"おすすめ|お勧め|お薦め|おススメ|名物|看板|人気|大人気|一番人気|人気No\.?1|自慢|イチオシ|一押し|定番|ご好評|自信作|自信の一品|一番の売り商品|一番のおすすめ|代名詞|signature|specialty|recommended|house specialty|best seller", re.I)
BAD_SOURCE = re.compile(r"customer|consumer|user[ ._-]*review|review[ ._-]*prose", re.I)
BAD_URL_PATH = re.compile(r"/(?:dtlrvwlst|rvw|reviews?)(?:/|$)", re.I)
BAD_IDENTITY = re.compile(r"unresolved|unverified|not safely|not established|could not|cannot|unable|access limited|source unavailable|不明|未確認", re.I)


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
    host = (u.hostname or "").lower()
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
    c = str(raw.get("classification") or "").strip()
    if c in {"R", "F"}:
        return "accepted_evidence"
    if c in {"C", "candidate"}:
        return "candidate"
    if c in {"no_evidence", "blocked", "skipped_already_complete"}:
        return c
    return "no_evidence"


def ref_paths(record: dict) -> set[str]:
    out = set()
    for ref in record.get("sourceProposalRefs") or []:
        if isinstance(ref, str):
            out.add(ref)
        elif isinstance(ref, dict) and ref.get("path"):
            out.add(ref["path"])
    return out


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
            e = copy.deepcopy(ev)
            e["checkedAt"] = e.get("checkedAt") or TODAY
            e["note"] = e.get("note") or "Exact identity evidence retained from reviewed input."
            safe_identity.append(e)
    rec["identity"]["evidence"] = safe_identity
    if terminal == "accepted_evidence" and rec["identity"].get("state") != "verified":
        terminal = rec["status"] = "candidate"
    safe_dishes = []
    if terminal == "accepted_evidence":
        for dish in rec.get("dishProposals", []) or []:
            cls = dish.get("classification")
            if cls not in {"R", "F"}:
                continue
            url = dish.get("sourceUrl") or ""
            if dish.get("sourceScope") != "branch" or not valid_url(url):
                continue
            if BAD_SOURCE.search(" ".join(str(dish.get(k, "")) for k in ["evidenceClass", "sourceOrigin", "sourceKind", "notes"])):
                continue
            native = dish.get("nameOriginal") or ""
            text = dish.get("evidenceText") or ""
            if not native or not text or re.sub(r"\s+", "", native) not in re.sub(r"\s+", "", text):
                continue
            provider = norm_provider(dish.get("provider") or "", url, dish.get("sourceOrigin") or "")
            if not provider:
                continue
            if cls == "R" and (not R_SEM.search(dish.get("recommendationSemantics") or "") or not R_SEM.search(text)):
                continue
            d = copy.deepcopy(dish)
            d["provider"] = provider
            d["checkedAt"] = d.get("checkedAt") or TODAY
            d["confidence"] = d.get("confidence") if d.get("confidence") in {"high", "medium"} else "medium"
            d["targetField"] = "recommendedDishes" if cls == "R" else "featuredDishes"
            safe_dishes.append(d)
        if not safe_identity or not safe_dishes:
            terminal = rec["status"] = "candidate"
    rec["dishProposals"] = safe_dishes if terminal == "accepted_evidence" else []
    rec.setdefault("attemptedSources", [])
    rec.setdefault("blocker", None)
    refs = list(rec.get("sourceProposalRefs") or [])
    if source_ref and source_ref not in ref_paths(rec):
        refs.append(source_ref)
    rec["sourceProposalRefs"] = refs
    rec["reviewReasoning"] = "Final v2 fail-closed review; exact-branch, provenance, native-text containment and R/F semantics re-applied offline."
    return rec


def full_record_from_old(record: dict, source_ref: str) -> dict:
    terminal = normalize_status(record)
    name = record.get("restaurantName") or record.get("name") or ""
    identities, dishes, attempted = [], [], set()
    for ev in record.get("evidence", []) or []:
        url = ev.get("sourceUrl") or ""
        if url:
            attempted.add(url)
        ident = ev.get("identityEvidence") or {}
        branch_exact = isinstance(ident, dict) and ident.get("branchMatch") == "exact"
        if branch_exact and valid_url(url):
            identities.append({"provider": ev.get("provider") or "reviewed_source", "sourceUrl": url,
                               "checkedAt": ev.get("checkedAt") or TODAY,
                               "evidenceType": ev.get("sourceKind") or "exact_branch_source",
                               "note": ev.get("notes") or ev.get("evidenceText") or "Exact branch evidence retained from worker proposal."})
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
        if cls == "R" and not R_SEM.search(text):
            continue
        dishes.append({"targetField": "recommendedDishes" if cls == "R" else "featuredDishes",
                       "classification": cls, "nameOriginal": native, "nameZhCandidate": ev.get("nameZhCandidate"),
                       "evidenceClass": ev.get("sourceKind") or ("official_branch_recommendation" if cls == "R" else "official_branch_menu_item"),
                       "recommendationSemantics": text if cls == "R" else None, "provider": provider,
                       "sourceUrl": url, "checkedAt": ev.get("checkedAt") or TODAY, "sourceScope": "branch",
                       "evidenceText": text, "confidence": "high" if "first_party" in (ev.get("sourceOrigin") or "").lower() else "medium",
                       "notes": ev.get("notes") or "Converted from legacy worker proposal."})
    rec = {"googlePlaceId": record.get("googlePlaceId"), "restaurantName": name, "status": terminal,
           "identity": {"state": "verified" if identities else "unverified", "sourceAliases": [], "evidence": identities},
           "dishProposals": dishes, "attemptedSources": sorted(attempted),
           "blocker": record.get("blocker") if terminal == "blocked" else None,
           "notes": record.get("notes") or "Converted from legacy worker proposal.", "sourceProposalRefs": [source_ref]}
    return sanitize_full_record(rec, terminal, source_ref)


def compact_records(doc: dict, source_ref: str):
    checked = (doc.get("generatedAt") or TODAY)[:10]
    out = []
    for item in doc.get("acceptedRecords", []) or []:
        url = item.get("sourceUrl") or ""
        raw_provider = item.get("provider") or ""
        provider = norm_provider(raw_provider, url, "first_party" if raw_provider == "official" else "")
        identity = []
        if provider and valid_url(url):
            identity = [{"provider": raw_provider or provider, "sourceUrl": url, "checkedAt": checked,
                         "evidenceType": "exact_retained_branch_binding",
                         "note": "Exact frozen Place-ID retained-source binding from compact worker proposal."}]
        dishes = []
        for d in item.get("dishes", []) or []:
            cls = d.get("class")
            native = d.get("nameOriginal") or ""
            sem = d.get("semantics") or ""
            text = f"{native} {sem}".strip()
            if cls not in {"R", "F"} or not native or not provider or not valid_url(url):
                continue
            if cls == "R" and not R_SEM.search(sem):
                continue
            dishes.append({"targetField": "recommendedDishes" if cls == "R" else "featuredDishes",
                           "classification": cls, "nameOriginal": native, "nameZhCandidate": d.get("nameZhCandidate"),
                           "evidenceClass": "retained_structured_recommendation" if cls == "R" else "retained_structured_menu_item",
                           "recommendationSemantics": sem if cls == "R" else None, "provider": provider,
                           "sourceUrl": url, "checkedAt": checked, "sourceScope": "branch", "evidenceText": text,
                           "confidence": "medium", "notes": item.get("note") or "Expanded from compact-v1 retained proposal."})
        rec = {"googlePlaceId": item.get("googlePlaceId"), "restaurantName": item.get("restaurantName") or "",
               "status": "accepted_evidence", "identity": {"state": "verified" if identity else "unverified", "sourceAliases": [], "evidence": identity},
               "dishProposals": dishes, "attemptedSources": [url] if url else [], "blocker": None,
               "notes": item.get("note") or "Expanded from compact-v1 retained proposal.", "sourceProposalRefs": [source_ref]}
        out.append(sanitize_full_record(rec, "accepted_evidence", source_ref))
    for key, status in [("candidateRecords", "candidate"), ("noEvidenceRecords", "no_evidence"), ("blockedRecords", "blocked")]:
        for item in doc.get(key, []) or []:
            out.append({"googlePlaceId": item.get("googlePlaceId"), "restaurantName": item.get("restaurantName") or "",
                        "status": status, "identity": {"state": "unverified", "sourceAliases": [], "evidence": []},
                        "dishProposals": [], "attemptedSources": [item.get("sourceUrl")] if item.get("sourceUrl") else [],
                        "blocker": item.get("blocker") if status == "blocked" else None,
                        "notes": item.get("blocker") or item.get("reason") or "Expanded terminal outcome from compact-v1 proposal.",
                        "sourceProposalRefs": [source_ref]})
    return out


def row_records(doc: dict, source_ref: str):
    """Convert the independent main-branch rows[] proposal schema fail-closed."""
    checked_default = str(doc.get("checkedAt") or TODAY)[:10]
    out = []
    for row in doc.get("rows", []) or []:
        terminal = normalize_status(row)
        provider_raw = row.get("provider") or ""
        row_url = row.get("sourceUrl") or ""
        ident_note = row.get("identityEvidence") or ""
        if isinstance(ident_note, dict):
            ident_note = json.dumps(ident_note, ensure_ascii=False, sort_keys=True)
        branch_exact = bool(str(ident_note).strip()) and not BAD_IDENTITY.search(str(ident_note)) and valid_url(row_url)
        identity = []
        if branch_exact:
            identity = [{"provider": provider_raw or "reviewed_source", "sourceUrl": row_url,
                         "checkedAt": row.get("checkedAt") or checked_default,
                         "evidenceType": "exact_branch_identity_from_rows_proposal", "note": str(ident_note)}]
        dishes = []
        attempted = {row_url} if row_url else set()
        if terminal == "accepted_evidence" and branch_exact:
            for d in row.get("dishes", []) or []:
                cls = d.get("classification") or (row.get("classification") if row.get("classification") in {"R", "F"} else None)
                native = d.get("nameNative") or d.get("nameOriginal") or ""
                text = d.get("evidenceTextNative") or d.get("evidenceText") or ""
                url = d.get("sourceUrl") or row_url
                if url:
                    attempted.add(url)
                provider = norm_provider(d.get("provider") or provider_raw, url, "")
                if cls not in {"R", "F"} or not native or not text or not provider or not valid_url(url):
                    continue
                if re.sub(r"\s+", "", native) not in re.sub(r"\s+", "", text):
                    continue
                if BAD_SOURCE.search(" ".join(str(d.get(k, "")) for k in ["evidenceClass", "notes"])):
                    continue
                if cls == "R" and not R_SEM.search(text):
                    continue
                dishes.append({"targetField": "recommendedDishes" if cls == "R" else "featuredDishes",
                               "classification": cls, "nameOriginal": native,
                               "nameZhCandidate": d.get("nameZhCandidate"),
                               "evidenceClass": d.get("evidenceClass") or ("rows_explicit_recommendation" if cls == "R" else "rows_source_menu_item"),
                               "recommendationSemantics": text if cls == "R" else None,
                               "provider": provider, "sourceUrl": url,
                               "checkedAt": d.get("checkedAt") or row.get("checkedAt") or checked_default,
                               "sourceScope": "branch", "evidenceText": text, "confidence": "medium",
                               "notes": d.get("notes") or row.get("notes") or "Converted from independent rows[] proposal."})
        rec = {"googlePlaceId": row.get("googlePlaceId"), "restaurantName": row.get("restaurantName") or row.get("name") or "",
               "status": terminal, "identity": {"state": "verified" if identity else "unverified", "sourceAliases": [], "evidence": identity},
               "dishProposals": dishes, "attemptedSources": sorted(attempted),
               "blocker": row.get("notes") if terminal == "blocked" else None,
               "notes": row.get("notes") or "Converted from independent rows[] proposal.", "sourceProposalRefs": [source_ref]}
        out.append(sanitize_full_record(rec, terminal, source_ref))
    return out


def iter_source_records(marker: str):
    base = ROOT / "data/agent_proposals" / marker
    for path in sorted(base.glob("S*.json")):
        doc = load(path)
        ref = str(path.relative_to(ROOT))
        m = re.search(r"S(\d)", path.name)
        if not m:
            continue
        shard = int(m.group(1))
        if doc.get("recordEncoding") == "compact-v1":
            for rec in compact_records(doc, ref):
                yield rec, ref, shard
            continue
        if isinstance(doc.get("rows"), list):
            for rec in row_records(doc, ref):
                yield rec, ref, shard
            continue
        for raw in doc.get("records", []) or []:
            if raw.get("status") in SAFE_STATUS:
                yield sanitize_full_record(raw, normalize_status(raw), ref), ref, shard
            elif raw.get("assignmentStatus") is not None:
                yield full_record_from_old(raw, ref), ref, shard


def merge_unique_dicts(records: list[dict], field: str, key_fields: tuple[str, ...]) -> list[dict]:
    seen, out = set(), []
    for rec in records:
        for item in rec.get(field, []) or []:
            key = tuple(str(item.get(k) or "") for k in key_fields)
            if key in seen:
                continue
            seen.add(key)
            out.append(copy.deepcopy(item))
    return out


def merge_accepted(records: list[dict], source_refs: list[str]) -> dict:
    base = copy.deepcopy(records[0])
    base["status"] = "accepted_evidence"
    identity_evidence = []
    seen_identity = set()
    dishes = []
    seen_dishes = set()
    attempted = set()
    refs = []
    seen_refs = set()
    for rec in records:
        for ev in rec.get("identity", {}).get("evidence", []) or []:
            key = (ev.get("provider"), ev.get("sourceUrl"), ev.get("evidenceType"), ev.get("note"))
            if key not in seen_identity:
                seen_identity.add(key); identity_evidence.append(copy.deepcopy(ev))
        for d in rec.get("dishProposals", []) or []:
            key = (d.get("classification"), d.get("nameOriginal"), d.get("provider"), d.get("sourceUrl"), d.get("evidenceText"))
            if key not in seen_dishes:
                seen_dishes.add(key); dishes.append(copy.deepcopy(d))
        attempted.update(x for x in rec.get("attemptedSources", []) or [] if x)
        for r in rec.get("sourceProposalRefs", []) or []:
            k = r if isinstance(r, str) else json.dumps(r, ensure_ascii=False, sort_keys=True)
            if k not in seen_refs:
                seen_refs.add(k); refs.append(copy.deepcopy(r))
    for source_ref in source_refs:
        if source_ref not in {r for r in refs if isinstance(r, str)}:
            refs.append(source_ref)
    base["identity"] = copy.deepcopy(base.get("identity") or {})
    base["identity"]["state"] = "verified"
    base["identity"].setdefault("sourceAliases", [])
    base["identity"]["evidence"] = identity_evidence
    base["dishProposals"] = dishes
    base["attemptedSources"] = sorted(attempted)
    base["sourceProposalRefs"] = refs
    base["reviewReasoning"] = "Final v2 consensus: all unrepresented independent reviewed inputs accepted; safe evidence unioned fail-closed."
    return base


def consensus_status(statuses: list[str]) -> str:
    if not statuses:
        return "no_evidence"
    if len(set(statuses)) > 1:
        return "candidate"
    return statuses[0]


def main():
    source_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    plan = load(ROOT / "data/dish_batch_plan.json")
    assignments = [r for r in plan["rows"] if r.get("lane") in LANE_MARKER]
    counts = Counter(r["lane"] for r in assignments)
    if counts != Counter({"official_crawl": 219, "retained_source_mining": 318}):
        raise SystemExit(f"Unexpected current Official/Retained denominator: {dict(counts)}")

    by_id = defaultdict(list)
    for marker in ["DISH-R-OFFICIAL", "DISH-R-RETAINED"]:
        for rec, ref, shard in iter_source_records(marker):
            if rec.get("googlePlaceId"):
                by_id[(marker, shard, rec["googlePlaceId"])].append((rec, ref))

    baseline = {}
    for marker in ["DISH-R-OFFICIAL", "DISH-R-RETAINED"]:
        for path in sorted((ROOT / "data/agent_reviews" / marker).glob("S*.json")):
            try:
                doc = load(path)
            except Exception:
                continue
            m = re.search(r"S(\d)", path.name)
            if not m:
                continue
            shard = int(m.group(1))
            for rec in doc.get("records", []) or []:
                if rec.get("googlePlaceId"):
                    baseline[(marker, shard, rec["googlePlaceId"])] = sanitize_full_record(rec, normalize_status(rec), str(path.relative_to(ROOT)))

    reviews = []
    total_status = Counter()
    downgrade_log = []
    new_input_stats = Counter()
    translation_candidates = defaultdict(set)

    for lane, marker in LANE_MARKER.items():
        outdir = ROOT / "data/agent_reviews" / marker
        for shard in range(8):
            shard_rows = [r for r in assignments if r["lane"] == lane and r["shard"] == shard]
            records = []
            for row in shard_rows:
                key = (marker, shard, row["googlePlaceId"])
                base_rec = baseline.get(key)
                represented = ref_paths(base_rec) if base_rec else set()
                proposals = by_id.get(key, [])
                extras = [(rec, ref) for rec, ref in proposals if ref not in represented]
                if base_rec:
                    new_input_stats["baseline_rows"] += 1
                new_input_stats["extra_proposal_records"] += len(extras)
                reviewed_inputs = [base_rec] if base_rec else []
                reviewed_inputs += [rec for rec, _ in extras]
                if not reviewed_inputs:
                    raise SystemExit(f"Missing final review coverage: {key}")
                statuses = [r["status"] for r in reviewed_inputs]
                terminal = consensus_status(statuses)
                if terminal == "accepted_evidence":
                    reviewed = merge_accepted(reviewed_inputs, [ref for _, ref in extras])
                else:
                    reviewed = copy.deepcopy(base_rec or reviewed_inputs[0])
                    reviewed["status"] = terminal
                    reviewed["dishProposals"] = []
                    reviewed["sourceProposalRefs"] = list(reviewed.get("sourceProposalRefs") or [])
                    existing = ref_paths(reviewed)
                    for _, ref in extras:
                        if ref not in existing:
                            reviewed["sourceProposalRefs"].append(ref); existing.add(ref)
                    reviewed["attemptedSources"] = sorted({x for r in reviewed_inputs for x in (r.get("attemptedSources") or []) if x})
                    reviewed["reviewReasoning"] = "Final v2 consensus downgraded or retained non-accepted terminal state because independent reviewed inputs did not unanimously accept."
                reviewed["restaurantName"] = row["name"]
                reviewed["googlePlaceId"] = row["googlePlaceId"]
                if base_rec and base_rec.get("status") == "accepted_evidence" and reviewed["status"] != "accepted_evidence":
                    downgrade_log.append({"googlePlaceId": row["googlePlaceId"], "name": row["name"], "marker": marker,
                                          "shard": shard, "reason": "new unrepresented independent proposal disagreed with prior accepted final review"})
                if reviewed["status"] == "accepted_evidence":
                    for dish in reviewed.get("dishProposals", []):
                        zh = dish.get("nameZhCandidate")
                        if chinese_label(zh):
                            translation_candidates[dish.get("nameOriginal")].add(zh)
                total_status[reviewed["status"]] += 1
                records.append(reviewed)

            c = Counter(r["status"] for r in records)
            doc = {"schemaVersion": 2, "proposalOnly": False, "marker": marker, "shard": f"S{shard}",
                   "agentRunId": f"FINAL-V2-{marker}:S{shard}:20260915", "sourceQueue": "data/dish_batch_plan.json",
                   "sourceQueueCommit": source_commit, "generatedAt": "2026-09-15T23:00:00+09:00", "reviewedAt": TODAY,
                   "reviewedBy": "final-dish-integration v2 incremental fail-closed review",
                   "summary": {"assignedRows": len(shard_rows), "reviewedRows": len(records),
                               "acceptedEvidenceRows": c["accepted_evidence"], "candidateRows": c["candidate"],
                               "noEvidenceRows": c["no_evidence"], "blockedRows": c["blocked"],
                               "skippedAlreadyCompleteRows": c["skipped_already_complete"]},
                   "records": records,
                   "policyAttestation": {"paidGoogleDataApiCalls": 0, "canonicalMasterEditedDirectly": False,
                                         "proximityOnlyIdentityBindingUsed": False,
                                         "recommendationWithoutExplicitSemanticsAdded": False,
                                         "accessRestrictionBypassUsed": False,
                                         "unrepresentedIndependentInputsRequireConsensus": True}}
            path = outdir / f"S{shard}.json"
            dump(path, doc)
            reviews.append({"path": str(path.relative_to(ROOT)), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})

    if sum(total_status.values()) != 537:
        raise SystemExit(f"Review coverage mismatch: {total_status}")
    translations = {native: {"nameZh": next(iter(vals)), "rationale": "Single consistent proposal-provided exact normalization validated by final v2 review."}
                    for native, vals in translation_candidates.items() if native and len(vals) == 1}
    manifest = {"schemaVersion": 3, "approvalState": "approved",
                "reviewer": "final-dish-integration v2 incremental fail-closed review", "reviewedAt": TODAY,
                "startingCommit": source_commit,
                "assignmentSnapshot": {"sourceQueue": "data/dish_batch_plan.json", "sourceQueueCommit": source_commit,
                                       "rows": [{"googlePlaceId": r["googlePlaceId"], "name": r["name"], "lane": r["lane"], "shard": r["shard"]} for r in assignments]},
                "reviewedFiles": reviews, "translations": translations,
                "terminalStatusCounts": dict(total_status), "centralDowngrades": downgrade_log,
                "incrementalInputStats": dict(new_input_stats),
                "policy": {"paidGoogleDataApiCalls": 0, "canonicalHandEdits": False,
                           "newIndependentAcceptanceRequiresAgreementWithReviewedBaseline": True,
                           "unsafeTranslationPolicy": "translation-pending"}}
    dump(ROOT / "data/agent_reviews/official-retained-completion.json", manifest)
    summary = {"assignments": len(assignments), "laneCounts": dict(counts), "terminalStatusCounts": dict(total_status),
               "centralDowngrades": downgrade_log, "deterministicTranslations": len(translations),
               "reviewedFiles": len(reviews), "incrementalInputStats": dict(new_input_stats)}
    dump(ROOT / "_audit/final/official-retained-review-summary.json", summary)
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
