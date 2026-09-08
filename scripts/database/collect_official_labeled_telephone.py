#!/usr/bin/env python3
"""Collect explicit labeled telephone numbers from reviewed official pages.

This is a zero-paid-API supplemental collector for residual `contact.telephone` gaps.
Only already-publishable, non-conflict restaurants with a reviewed retained official
binding are eligible. The current official root page must independently reconfirm the
retained restaurant identity. A bounded same-origin detail page may be followed only
after that root confirmation, and the detail page must independently reconfirm the same
restaurant before it can emit a telephone claim.

Telephone extraction is deliberately narrow: the visible page text must contain an
explicit `TEL`, `電話`, `電話番号`, or `お電話` label immediately associated with a
Japanese telephone number. If a page contains more than one distinct labeled number,
no claim is emitted. Raw HTML is never persisted and existing canonical values are never
overwritten; the normal source-basic web importer remains import-time missing-only.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import re
import sqlite3
from collections import Counter
from pathlib import Path

import collect_official_index_web_fields as official
import collect_official_practical_fields as practical
import reconcile_private_official_web_consensus_v4 as web

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RULE_VERSION = "source-basic-web-field-evidence-v2"
PHONE_PARSER_VERSION = "official-labeled-telephone-v1"
MAX_DETAIL_LINKS = 6

# Capture only a number following an explicit telephone label. The numeric body allows
# common Japanese separators, but validation below requires a plausible Japanese prefix
# and 10-11 domestic digits after +81 normalization.
LABELLED_PHONE_RE = re.compile(
    r"(?:電話番号|お電話|電話|TEL(?:EPHONE)?)\s*(?:番号)?\s*[：:]?\s*"
    r"(?P<number>(?:\+?81|0)[0-9０-９()（）\-‐‑–—ー\s]{7,28}[0-9０-９])",
    re.I,
)
DASH_RE = re.compile(r"[‐‑–—ー]")


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def ascii_digits(text: str) -> str:
    return str(text or "").translate(str.maketrans("０１２３４５６７８９", "0123456789"))


def normalized_japanese_phone(value: str) -> str | None:
    digits = re.sub(r"\D", "", ascii_digits(value))
    if digits.startswith("81"):
        digits = "0" + digits[2:]
    if not digits.startswith("0") or len(digits) not in (10, 11):
        return None
    return digits


def explicit_labeled_telephone(text: str):
    # Preserve line boundaries so labels are not accidentally paired with a distant
    # unrelated number. A label may use the immediately following line for the number.
    raw_lines = [re.sub(r"[\t\r ]+", " ", line).strip() for line in str(text or "").split("\n")]
    lines = [line for line in raw_lines if line]
    matches = []
    for idx, line in enumerate(lines):
        contexts = [line]
        if idx + 1 < len(lines):
            contexts.append(f"{line} {lines[idx + 1]}")
        for context in contexts:
            for found in LABELLED_PHONE_RE.finditer(context):
                raw = DASH_RE.sub("-", ascii_digits(found.group("number"))).strip(" .,:：;；|")
                normalized = normalized_japanese_phone(raw)
                if normalized:
                    matches.append((normalized, raw, context[:220]))
    by_number = {}
    for normalized, raw, snippet in matches:
        by_number.setdefault(normalized, (raw, snippet))
    if len(by_number) != 1:
        return None, None, "multiple_labeled_numbers" if len(by_number) > 1 else "no_labeled_number"
    _normalized, (raw, snippet) = next(iter(by_number.items()))
    return raw, snippet, "accepted_single_labeled_number"


def selected_targets(db):
    states = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    conflicts = {
        pid for pid, in db.execute(
            "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
        )
    }
    reviewed = official.selected_official_bindings(db)
    known_phone = {
        pid for pid, in db.execute(
            "SELECT place_id FROM field_resolutions WHERE field_key='contact.telephone' AND resolution_state='known'"
        )
    }
    index_doc = load_json(DATA / "official_candidate_index.json")
    targets = []
    seen_pid = set()
    seen_url = set()
    counts = Counter()
    for record in index_doc.get("records") or []:
        pid = str(record.get("googlePlaceId") or "").strip()
        url = web.normalize_url(record.get("pageUrl"))
        name = str(record.get("name") or "").strip()
        if not pid or pid in seen_pid:
            continue
        seen_pid.add(pid)
        if states.get(pid) not in ("verified", "source_matched"):
            counts["identity_not_publishable"] += 1
            continue
        if pid in conflicts:
            counts["identity_conflict"] += 1
            continue
        if pid not in reviewed:
            counts["official_binding_not_reviewed"] += 1
            continue
        if pid in known_phone:
            counts["telephone_already_known"] += 1
            continue
        if not url:
            counts["invalid_or_blocked_page_url"] += 1
            continue
        if url in seen_url:
            counts["shared_page_url_deferred"] += 1
            continue
        seen_url.add(url)
        targets.append({
            "pid": pid,
            "name": name,
            "pageUrl": url,
            "missing": {"telephone"},
            "checkedAt": record.get("checkedAt") or index_doc.get("checkedAt"),
        })
    return targets, counts


def identity_checked_page(target: dict, page: dict):
    if not page.get("ok"):
        return None, None
    fact, check = official.select_page_fact(page, target["name"])
    if not fact or check.get("accepted") is not True:
        return None, check
    return fact, check


def make_row(target: dict, page: dict, identity_check: dict, phone: str, snippet: str, *, parent_url: str | None = None, link: dict | None = None):
    discovery = {
        "method": "explicit_labeled_telephone",
        "telephoneParserVersion": PHONE_PARSER_VERSION,
        "labelRequired": True,
        "singleDistinctLabeledNumberRequired": True,
        "evidenceSnippet": snippet,
    }
    if parent_url:
        discovery.update({
            "sameOriginDetailPage": True,
            "parentSourceUrl": parent_url,
            "rootIdentityReconfirmedBeforeDiscovery": True,
            "detailIdentityReconfirmedIndependently": True,
            "anchorText": (link or {}).get("anchorText") or "",
            "linkScore": (link or {}).get("score"),
        })
    return official.evidence_row(
        target,
        page,
        identity_check,
        {"telephone": phone},
        discovery=discovery,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--max-pages", type=int, default=250)
    args = ap.parse_args()

    db = sqlite3.connect(args.database)
    targets, counts = selected_targets(db)
    db.close()
    targets = targets[: max(0, args.max_pages)]
    counts["target_rows"] = len(targets)

    roots = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(12, args.workers))) as pool:
        futures = {pool.submit(practical.fetch_visible_page, t["pageUrl"]): t for t in targets}
        for future in concurrent.futures.as_completed(futures):
            target = futures[future]
            try:
                roots[target["pid"]] = future.result()
            except Exception as exc:
                roots[target["pid"]] = {"url": target["pageUrl"], "ok": False, "blocked": type(exc).__name__}

    rows = []
    detail_roots = []
    for target in targets:
        page = roots.get(target["pid"]) or {}
        if not page.get("ok"):
            counts[f"root_skip_{page.get('blocked') or 'unknown'}"] += 1
            continue
        counts["roots_ok"] += 1
        _fact, check = identity_checked_page(target, page)
        if not check or check.get("accepted") is not True:
            counts[(check or {}).get("reason") or "root_identity_not_reconfirmed"] += 1
            continue
        counts["root_identity_reconfirmed"] += 1
        phone, snippet, reason = explicit_labeled_telephone(page.get("visibleText") or "")
        if phone:
            rows.append(make_row(target, page, check, phone, snippet or ""))
            counts["root_telephone_evidence"] += 1
            continue
        counts[f"root_phone_{reason}"] += 1
        # Only roots that did not already resolve a telephone need bounded child pages.
        detail_roots.append((target, page, check))

    discovery_results = {}
    if detail_roots:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(12, args.workers))) as pool:
            futures = {
                pool.submit(
                    official.discover_detail_links,
                    target["pageUrl"],
                    str(page.get("finalUrl") or page.get("url") or target["pageUrl"]),
                ): (target, page, check)
                for target, page, check in detail_roots
            }
            for future in concurrent.futures.as_completed(futures):
                target, page, check = futures[future]
                try:
                    discovery_results[target["pid"]] = future.result()
                except Exception as exc:
                    discovery_results[target["pid"]] = {"ok": False, "blocked": type(exc).__name__, "links": []}

    detail_jobs = []
    for target, root_page, root_check in detail_roots:
        discovery = discovery_results.get(target["pid"]) or {}
        if not discovery.get("ok"):
            counts[f"detail_discovery_skip_{discovery.get('blocked') or 'unknown'}"] += 1
            continue
        links = (discovery.get("links") or [])[:MAX_DETAIL_LINKS]
        if links:
            counts["roots_with_detail_links"] += 1
        counts["detail_links_selected"] += len(links)
        parent_url = str(discovery.get("finalUrl") or root_page.get("finalUrl") or target["pageUrl"])
        for link in links:
            detail_jobs.append((target, root_check, parent_url, link))

    detail_pages = {}
    if detail_jobs:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(12, args.workers))) as pool:
            futures = {
                pool.submit(practical.fetch_visible_page, link["url"]): (target, root_check, parent_url, link)
                for target, root_check, parent_url, link in detail_jobs
            }
            for future in concurrent.futures.as_completed(futures):
                target, root_check, parent_url, link = futures[future]
                key = (target["pid"], link["url"])
                try:
                    detail_pages[key] = future.result()
                except Exception as exc:
                    detail_pages[key] = {"url": link["url"], "ok": False, "blocked": type(exc).__name__}

    accepted_place = {row["googlePlaceId"] for row in rows}
    for target, _root_check, parent_url, link in detail_jobs:
        if target["pid"] in accepted_place:
            continue
        page = detail_pages.get((target["pid"], link["url"])) or {}
        if not page.get("ok"):
            counts[f"detail_skip_{page.get('blocked') or 'unknown'}"] += 1
            continue
        counts["detail_pages_ok"] += 1
        _fact, check = identity_checked_page(target, page)
        if not check or check.get("accepted") is not True:
            counts["detail_identity_not_reconfirmed"] += 1
            continue
        counts["detail_identity_reconfirmed"] += 1
        phone, snippet, reason = explicit_labeled_telephone(page.get("visibleText") or "")
        if not phone:
            counts[f"detail_phone_{reason}"] += 1
            continue
        rows.append(make_row(target, page, check, phone, snippet or "", parent_url=parent_url, link=link))
        accepted_place.add(target["pid"])
        counts["detail_telephone_evidence"] += 1

    # Exact snapshot-key dedupe only. No cross-snapshot evidence combination.
    deduped = {}
    for row in rows:
        ev = row.get("webEvidence") or {}
        key = (row["googlePlaceId"], ev.get("finalUrl"), ev.get("contentHash"))
        deduped.setdefault(key, row)
    rows = sorted(
        deduped.values(),
        key=lambda r: (
            r["googlePlaceId"],
            str((r.get("webEvidence") or {}).get("finalUrl") or ""),
            str((r.get("webEvidence") or {}).get("contentHash") or ""),
        ),
    )
    counts["new_evidence_rows"] = len(rows)

    output = {
        "schemaVersion": 2,
        "ruleVersion": RULE_VERSION,
        "checkedAt": web.utc_now()[:10],
        "policy": {
            "paidDataApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "sourceBackedIdentityRequired": True,
            "reviewedOfficialBindingRequired": True,
            "rawHtmlPersisted": False,
            "robotsRespected": True,
            "restrictedAccessBypass": False,
            "telephoneIncludedInCompletionTargets": True,
            "explicitTelephoneLabelRequired": True,
            "singleDistinctLabeledNumberRequired": True,
            "multiSnapshotEvidenceByPlaceId": True,
            "snapshotIdentity": ["googlePlaceId", "finalUrl", "contentHash"],
            "crossSnapshotClaimMerge": False,
            "canonicalResolution": "import_time_missing_only",
            "sameOriginDetailTraversal": True,
            "detailIdentityReconfirmationRequired": True,
            "maxExplicitDetailLinksPerRoot": MAX_DETAIL_LINKS,
        },
        "summary": {
            "rows": len(rows),
            "places": len({row["googlePlaceId"] for row in rows}),
            "fieldCounts": {"telephone": len(rows)} if rows else {},
            "fetchCounts": dict(sorted(counts.items())),
        },
        "rows": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
