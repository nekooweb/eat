#!/usr/bin/env python3
"""Collect explicit labeled address and opening-hours evidence from reviewed official pages.

This collector is a zero-paid-API residual-field pass. It only targets publishable,
non-conflict restaurants that already have a reviewed retained-official binding and are
still missing canonical address and/or hours after higher-priority structured sources and
previous official-page extraction have run.

A current official root page must independently reconfirm the retained restaurant
identity. A bounded same-origin detail page is eligible only after that root confirmation
and must independently reconfirm the same restaurant identity before emitting claims.

Address claims require an explicit store/location label (e.g. 住所, 所在地, Address), an
Area1-compatible Tokyo ward in the value, and exactly one distinct candidate on the page.
Corporate/HQ contexts are rejected. Visible-address fallback without a label is not used.

Hours claims require an explicit business-hours label (e.g. 営業時間, 営業日時,
営業日・時間, Opening Hours) plus a concrete time expression or 24-hour marker. Pages
with multiple different labeled hours sections are deferred rather than combined.

Raw HTML is never persisted. Durable evidence uses the existing multi-snapshot v2
source-basic evidence contract; canonical resolution remains import-time missing-only.
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
PARSER_VERSION = "official-labeled-address-hours-v1"
MAX_DETAIL_LINKS = 6

TOKYO_WARDS = r"(?:千代田区|文京区|中央区|新宿区|台東区)"
ADDRESS_LABEL_RE = re.compile(
    r"(?:店舗所在地|店所在地|店舗住所|所在地|住所|Address)\s*[：:]?\s*(?P<value>.*)$",
    re.I,
)
ADDRESS_VALUE_RE = re.compile(
    rf"(?:〒\s*\d{{3}}-?\d{{4}}\s*)?(?:東京都\s*)?{TOKYO_WARDS}[^\n]{{2,150}}",
    re.I,
)
CORPORATE_CONTEXT_RE = re.compile(
    r"(?:本社|本店所在地|会社概要|企業情報|運営会社|運営元|事業者|法人概要|corporate|company)",
    re.I,
)
ADDRESS_STOP_RE = re.compile(
    r"^(?:電話|TEL|FAX|営業時間|営業日時|定休日|アクセス|交通|お問い合わせ|予約|URL|Web|Email|E-mail)\b",
    re.I,
)

HOURS_LABEL_RE = re.compile(
    r"(?:営業時間|営業日時|営業日[・/／\s]*時間|営業案内|Opening\s*Hours|Business\s*Hours)\s*[：:]?\s*(?P<value>.*)$",
    re.I,
)
HOURS_TIME_RE = re.compile(
    r"(?:[0-2]?\d\s*[：:]\s*[0-5]\d|24\s*(?:時間|hours?|h\b))",
    re.I,
)
HOURS_STOP_RE = re.compile(
    r"^(?:住所|所在地|店舗所在地|電話|TEL|FAX|アクセス|交通|お問い合わせ|予約|URL|Web|Email|E-mail|支払|決済)\b",
    re.I,
)
RECEPTION_CONTEXT_RE = re.compile(
    r"(?:受付時間|電話受付|予約受付|お問い合わせ受付|問い合わせ受付|コールセンター)",
    re.I,
)


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def compact(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalized_address_key(value: str) -> str:
    text = compact(value).casefold()
    text = re.sub(r"^〒\s*", "", text)
    text = re.sub(r"\s+", "", text)
    return text


def normalized_hours_key(value: str) -> str:
    text = compact(value).casefold()
    text = text.translate(str.maketrans({"：": ":", "～": "~", "〜": "~", "－": "-", "ー": "-"}))
    return re.sub(r"\s+", "", text)


def visible_lines(text: str) -> list[str]:
    return [compact(line) for line in str(text or "").split("\n") if compact(line)]


def labeled_address(text: str):
    lines = visible_lines(text)
    found: dict[str, tuple[str, str]] = {}
    rejected_corporate = 0
    for idx, line in enumerate(lines):
        match = ADDRESS_LABEL_RE.search(line)
        if not match:
            continue
        prefix = line[: match.start()]
        recent = " ".join(lines[max(0, idx - 2):idx] + [prefix])
        if CORPORATE_CONTEXT_RE.search(recent):
            rejected_corporate += 1
            continue
        chunks = [match.group("value") or ""]
        for offset in (1, 2):
            if idx + offset >= len(lines):
                break
            next_line = lines[idx + offset]
            if ADDRESS_STOP_RE.search(next_line):
                break
            chunks.append(next_line)
        context = " ".join(chunk for chunk in chunks if chunk)
        address_match = ADDRESS_VALUE_RE.search(context)
        if not address_match:
            continue
        value = compact(address_match.group(0))[:260]
        key = normalized_address_key(value)
        if key:
            found.setdefault(key, (value, compact(line + " " + context)[:320]))
    if len(found) == 1:
        value, snippet = next(iter(found.values()))
        return value, snippet, "accepted_single_labeled_address", rejected_corporate
    if len(found) > 1:
        return None, None, "multiple_labeled_addresses", rejected_corporate
    return None, None, "no_labeled_address", rejected_corporate


def labeled_hours(text: str):
    lines = visible_lines(text)
    found: dict[str, tuple[str, str]] = {}
    reception_rejected = 0
    for idx, line in enumerate(lines):
        match = HOURS_LABEL_RE.search(line)
        if not match:
            continue
        recent = " ".join(lines[max(0, idx - 1):idx + 1])
        if RECEPTION_CONTEXT_RE.search(recent):
            reception_rejected += 1
            continue
        chunks = [match.group("value") or ""]
        for offset in (1, 2, 3):
            if idx + offset >= len(lines):
                break
            next_line = lines[idx + offset]
            if HOURS_STOP_RE.search(next_line):
                break
            chunks.append(next_line)
        context = compact(" ".join(chunk for chunk in chunks if chunk))
        if not context or not HOURS_TIME_RE.search(context):
            continue
        # Keep the label in the durable raw hours string so provenance remains clear.
        value = compact(line[: match.end("value")] + " " + " ".join(chunks[1:]))[:600]
        key = normalized_hours_key(value)
        if key:
            found.setdefault(key, (value, compact(line + " " + context)[:700]))
    if len(found) == 1:
        value, snippet = next(iter(found.values()))
        return value, snippet, "accepted_single_labeled_hours", reception_rejected
    if len(found) > 1:
        return None, None, "multiple_labeled_hours", reception_rejected
    return None, None, "no_labeled_hours", reception_rejected


def selected_targets(db):
    states = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    conflicts = {
        pid for pid, in db.execute(
            "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
        )
    }
    reviewed = official.selected_official_bindings(db)
    known = official.known_index(db)
    index_doc = load_json(DATA / "official_candidate_index.json")
    counts = Counter()
    targets = []
    seen_pid = set()
    seen_url = set()
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
        missing = set(official.missing_fields(known, pid)) & {"address", "hours"}
        if not missing:
            counts["address_hours_already_known"] += 1
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
            "missing": missing,
            "checkedAt": record.get("checkedAt") or index_doc.get("checkedAt"),
        })
    return targets, counts


def accepted_identity(target: dict, page: dict):
    if not page.get("ok"):
        return None
    _fact, check = official.select_page_fact(page, target["name"])
    if not _fact or check.get("accepted") is not True:
        return None
    return check


def strong_address_identity(check: dict) -> bool:
    return (
        check.get("pageNameMatchMethod") == "jsonld_business_name"
        or float(check.get("pageNameSimilarity") or 0) >= 0.92
    )


def claims_for_page(target: dict, page: dict, check: dict, counts: Counter):
    missing = set(target["missing"])
    claims = {}
    snippets = {}
    text = page.get("visibleText") or ""

    if "address" in missing:
        if not strong_address_identity(check):
            counts["address_identity_not_strong_enough"] += 1
        else:
            value, snippet, reason, corporate_rejected = labeled_address(text)
            if corporate_rejected:
                counts["corporate_address_context_rejected"] += corporate_rejected
            if value:
                claims["address"] = value
                snippets["address"] = snippet
            else:
                counts[f"address_{reason}"] += 1

    if "hours" in missing:
        value, snippet, reason, reception_rejected = labeled_hours(text)
        if reception_rejected:
            counts["reception_hours_context_rejected"] += reception_rejected
        if value:
            claims["openingHoursRaw"] = [value]
            snippets["openingHoursRaw"] = snippet
        else:
            counts[f"hours_{reason}"] += 1

    return claims, snippets


def evidence_row(target: dict, page: dict, check: dict, claims: dict, snippets: dict, *, parent_url: str | None = None, link: dict | None = None):
    discovery = {
        "method": "explicit_labeled_address_hours",
        "fieldParserVersion": PARSER_VERSION,
        "explicitLabelRequired": True,
        "singleDistinctCandidateRequired": True,
        "evidenceSnippets": snippets,
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
    return official.evidence_row(target, page, check, claims, discovery=discovery)


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
        futures = {pool.submit(practical.fetch_visible_page, target["pageUrl"]): target for target in targets}
        for future in concurrent.futures.as_completed(futures):
            target = futures[future]
            try:
                roots[target["pid"]] = future.result()
            except Exception as exc:
                roots[target["pid"]] = {
                    "url": target["pageUrl"], "ok": False, "blocked": type(exc).__name__
                }

    rows = []
    root_remaining = {}
    detail_roots = []
    field_counts = Counter()
    for target in targets:
        page = roots.get(target["pid"]) or {}
        if not page.get("ok"):
            counts[f"root_skip_{page.get('blocked') or 'unknown'}"] += 1
            continue
        counts["roots_ok"] += 1
        check = accepted_identity(target, page)
        if not check:
            counts["root_identity_not_reconfirmed"] += 1
            continue
        counts["root_identity_reconfirmed"] += 1
        claims, snippets = claims_for_page(target, page, check, counts)
        if claims:
            rows.append(evidence_row(target, page, check, claims, snippets))
            counts["root_evidence_rows"] += 1
            for key in claims:
                field_counts[key] += 1
        else:
            counts["verified_root_without_labeled_claim"] += 1
        remaining = set(target["missing"])
        if "address" in claims:
            remaining.discard("address")
        if "openingHoursRaw" in claims:
            remaining.discard("hours")
        root_remaining[target["pid"]] = remaining
        if remaining:
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
                target, _page, _check = futures[future]
                try:
                    discovery_results[target["pid"]] = future.result()
                except Exception as exc:
                    discovery_results[target["pid"]] = {
                        "ok": False, "blocked": type(exc).__name__, "links": []
                    }

    detail_jobs = []
    for target, root_page, _root_check in detail_roots:
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
            detail_jobs.append((target, parent_url, link))

    detail_pages = {}
    if detail_jobs:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(12, args.workers))) as pool:
            futures = {
                pool.submit(practical.fetch_visible_page, link["url"]): (target, parent_url, link)
                for target, parent_url, link in detail_jobs
            }
            for future in concurrent.futures.as_completed(futures):
                target, parent_url, link = futures[future]
                key = (target["pid"], link["url"])
                try:
                    detail_pages[key] = future.result()
                except Exception as exc:
                    detail_pages[key] = {
                        "url": link["url"], "ok": False, "blocked": type(exc).__name__
                    }

    for target, parent_url, link in detail_jobs:
        remaining = root_remaining.get(target["pid"], set())
        if not remaining:
            continue
        page = detail_pages.get((target["pid"], link["url"])) or {}
        if not page.get("ok"):
            counts[f"detail_skip_{page.get('blocked') or 'unknown'}"] += 1
            continue
        counts["detail_pages_ok"] += 1
        check = accepted_identity(target, page)
        if not check:
            counts["detail_identity_not_reconfirmed"] += 1
            continue
        counts["detail_identity_reconfirmed"] += 1
        detail_target = dict(target)
        detail_target["missing"] = set(remaining)
        claims, snippets = claims_for_page(detail_target, page, check, counts)
        if not claims:
            counts["verified_detail_without_labeled_claim"] += 1
            continue
        rows.append(evidence_row(
            detail_target,
            page,
            check,
            claims,
            snippets,
            parent_url=parent_url,
            link=link,
        ))
        counts["detail_evidence_rows"] += 1
        for key in claims:
            field_counts[key] += 1
        if "address" in claims:
            remaining.discard("address")
        if "openingHoursRaw" in claims:
            remaining.discard("hours")
        root_remaining[target["pid"]] = remaining

    # Exact v2 snapshot-key dedupe only. If two selected links redirect to the same
    # snapshot, combine claims inside that exact snapshot; never across different pages.
    deduped = {}
    for row in rows:
        ev = row.get("webEvidence") or {}
        key = (row["googlePlaceId"], ev.get("finalUrl"), ev.get("contentHash"))
        previous = deduped.get(key)
        if previous is None:
            deduped[key] = row
            continue
        merged = dict(previous.get("fieldClaims") or {})
        merged.update(row.get("fieldClaims") or {})
        previous["fieldClaims"] = merged
        counts["duplicate_snapshot_merged"] += 1
    rows = sorted(
        deduped.values(),
        key=lambda row: (
            row["googlePlaceId"],
            str((row.get("webEvidence") or {}).get("finalUrl") or ""),
            str((row.get("webEvidence") or {}).get("contentHash") or ""),
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
            "explicitAddressOrHoursLabelRequired": True,
            "singleDistinctCandidateRequired": True,
            "corporateAddressContextRejected": True,
            "area1TokyoWardRequiredForVisibleAddress": True,
            "concreteTimeRequiredForVisibleHours": True,
            "multiSnapshotEvidenceByPlaceId": True,
            "snapshotIdentity": ["googlePlaceId", "finalUrl", "contentHash"],
            "crossSnapshotClaimMerge": False,
            "canonicalResolution": "import_time_missing_only",
            "sameOriginDetailTraversal": True,
            "rootIdentityGateRequiredBeforeDetailDiscovery": True,
            "detailIdentityReconfirmationRequired": True,
            "maxExplicitDetailLinksPerRoot": MAX_DETAIL_LINKS,
        },
        "summary": {
            "rows": len(rows),
            "places": len({row["googlePlaceId"] for row in rows}),
            "fieldCounts": dict(sorted(field_counts.items())),
            "fetchCounts": dict(sorted(counts.items())),
        },
        "rows": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
