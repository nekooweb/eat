#!/usr/bin/env python3
"""Collect explicit `tel:` telephone links from reviewed official restaurant pages.

This zero-paid-API collector targets residual `contact.telephone` gaps after retained
structured sources and visible labeled telephone evidence have already resolved higher-
priority values. Eligibility requires a publishable, non-conflict restaurant with a
currently reviewed retained-official binding.

The current official root page must independently reconfirm the retained restaurant
identity before any telephone claim or child-page traversal is allowed. The collector
accepts only explicit HTML `href="tel:..."` links containing one unique plausible
Japanese telephone number. If a page exposes multiple distinct `tel:` numbers, the page
is deferred rather than choosing one. A bounded same-origin detail page may contribute
only when it independently reconfirms the same restaurant identity.

Raw HTML is never persisted. Canonical resolution remains import-time missing-only via
the existing source-basic web evidence importer.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import html as html_lib
import json
import re
import sqlite3
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse
from urllib.request import Request, build_opener

import collect_official_index_web_fields as official
import reconcile_private_official_web_consensus_v4 as web

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RULE_VERSION = "source-basic-web-field-evidence-v2"
TEL_PARSER_VERSION = "official-tel-link-v1"
MAX_DETAIL_LINKS = 6


class TelLinkParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.values: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag.casefold() != "a":
            return
        for key, value in attrs:
            if str(key or "").casefold() != "href" or value is None:
                continue
            href = html_lib.unescape(str(value)).strip()
            if href.casefold().startswith("tel:"):
                self.values.append(href[4:].strip())


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def ascii_digits(text: str) -> str:
    return str(text or "").translate(str.maketrans("０１２３４５６７８９", "0123456789"))


def parse_tel_value(value: str):
    raw = unquote(html_lib.unescape(str(value or ""))).strip()
    # Extensions, pauses and multiple-recipient syntax are not safe canonical phone
    # values for this dataset; defer rather than silently truncate them.
    if not raw or any(token in raw.casefold() for token in (";", ",", "ext=", "postd=")):
        return None
    raw = ascii_digits(raw)
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("81"):
        domestic = "0" + digits[2:]
    else:
        domestic = digits
    if not domestic.startswith("0") or len(domestic) not in (10, 11):
        return None
    # Preserve the explicit source-native URI value while using domestic digits only
    # for uniqueness checks.
    return domestic, raw[:80]


def unique_tel_claim(values: list[str]):
    by_number: dict[str, str] = {}
    for value in values:
        parsed = parse_tel_value(value)
        if not parsed:
            continue
        domestic, raw = parsed
        by_number.setdefault(domestic, raw)
    if len(by_number) == 1:
        domestic, raw = next(iter(by_number.items()))
        return raw, domestic, "accepted_single_tel_number"
    if len(by_number) > 1:
        return None, None, "multiple_tel_numbers"
    return None, None, "no_valid_tel_link"


def fetch_tel_page(url: str) -> dict:
    allowed, robots_note = web.may_fetch(url)
    if not allowed:
        return {"url": url, "ok": False, "blocked": robots_note}
    req = Request(url, headers={
        "User-Agent": web.USER_AGENT,
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.3",
        "Accept-Language": "ja,en;q=0.7",
    })
    try:
        with build_opener().open(req, timeout=12) as response:
            status = int(getattr(response, "status", 200) or 200)
            final_url = str(response.geturl() or url)
            content_type = str(response.headers.get("Content-Type") or "")
            if status in (401, 403, 429):
                return {"url": url, "ok": False, "status": status, "blocked": f"http_{status}"}
            if status < 200 or status >= 300 or "html" not in content_type.casefold():
                return {"url": url, "ok": False, "status": status, "blocked": "not_html_success"}
            if not web.allowed_host(web.host_of(final_url)):
                return {"url": url, "ok": False, "status": status, "blocked": "redirected_to_blocked_host"}
            payload = response.read(web.MAX_BYTES + 1)
            if len(payload) > web.MAX_BYTES:
                return {"url": url, "ok": False, "status": status, "blocked": "page_too_large"}
    except HTTPError as exc:
        return {"url": url, "ok": False, "status": exc.code, "blocked": f"http_{exc.code}"}
    except (URLError, TimeoutError) as exc:
        return {"url": url, "ok": False, "status": None, "blocked": type(exc).__name__}
    except Exception as exc:
        return {"url": url, "ok": False, "status": None, "blocked": type(exc).__name__}

    html_text = web.decode_body(payload, content_type)
    visible = web.strip_html(html_text)
    parser = TelLinkParser()
    try:
        parser.feed(html_text)
    except Exception:
        pass
    final_url = web.normalize_url(final_url) or final_url
    return {
        "url": url,
        "finalUrl": final_url,
        "ok": True,
        "status": status,
        "robots": robots_note,
        "retrievedAt": web.utc_now(),
        "contentHash": hashlib.sha256(payload).hexdigest(),
        "title": web.title_from_html(html_text),
        "structuredFacts": web.jsonld_facts(html_text),
        "visibleAddress": web.visible_address(visible),
        "visibleHours": web.visible_hours(visible),
        "visibleCuisine": web.cuisine_signal(f"{web.title_from_html(html_text)} {visible[:8000]}"),
        "telValues": parser.values,
        "detailLinks": official.extract_detail_links(html_text, final_url),
    }


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
    counts = Counter()
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


def accepted_identity(target: dict, page: dict):
    if not page.get("ok"):
        return None
    _fact, check = official.select_page_fact(page, target["name"])
    if not _fact or check.get("accepted") is not True:
        return None
    return check


def make_row(target: dict, page: dict, identity_check: dict, phone: str, domestic_digits: str, *, parent_url: str | None = None, link: dict | None = None):
    discovery = {
        "method": "explicit_html_tel_link",
        "telephoneParserVersion": TEL_PARSER_VERSION,
        "explicitTelHrefRequired": True,
        "singleDistinctTelNumberRequired": True,
        "normalizedDomesticDigits": domestic_digits,
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
        futures = {pool.submit(fetch_tel_page, t["pageUrl"]): t for t in targets}
        for future in concurrent.futures.as_completed(futures):
            target = futures[future]
            try:
                roots[target["pid"]] = future.result()
            except Exception as exc:
                roots[target["pid"]] = {"url": target["pageUrl"], "ok": False, "blocked": type(exc).__name__}

    rows = []
    detail_jobs = []
    resolved_places = set()
    for target in targets:
        page = roots.get(target["pid"]) or {}
        if not page.get("ok"):
            counts[f"root_skip_{page.get('blocked') or 'unknown'}"] += 1
            continue
        counts["roots_ok"] += 1
        identity_check = accepted_identity(target, page)
        if not identity_check:
            counts["root_identity_not_reconfirmed"] += 1
            continue
        counts["root_identity_reconfirmed"] += 1
        phone, domestic, reason = unique_tel_claim(page.get("telValues") or [])
        if phone:
            rows.append(make_row(target, page, identity_check, phone, domestic or ""))
            resolved_places.add(target["pid"])
            counts["root_tel_evidence"] += 1
            continue
        counts[f"root_tel_{reason}"] += 1
        links = (page.get("detailLinks") or [])[:MAX_DETAIL_LINKS]
        if links:
            counts["roots_with_detail_links"] += 1
        counts["detail_links_selected"] += len(links)
        parent_url = str(page.get("finalUrl") or page.get("url") or target["pageUrl"])
        for link in links:
            detail_jobs.append((target, parent_url, link))

    detail_pages = {}
    if detail_jobs:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(12, args.workers))) as pool:
            futures = {
                pool.submit(fetch_tel_page, link["url"]): (target, parent_url, link)
                for target, parent_url, link in detail_jobs
            }
            for future in concurrent.futures.as_completed(futures):
                target, parent_url, link = futures[future]
                key = (target["pid"], link["url"])
                try:
                    detail_pages[key] = future.result()
                except Exception as exc:
                    detail_pages[key] = {"url": link["url"], "ok": False, "blocked": type(exc).__name__}

    for target, parent_url, link in detail_jobs:
        if target["pid"] in resolved_places:
            continue
        page = detail_pages.get((target["pid"], link["url"])) or {}
        if not page.get("ok"):
            counts[f"detail_skip_{page.get('blocked') or 'unknown'}"] += 1
            continue
        counts["detail_pages_ok"] += 1
        identity_check = accepted_identity(target, page)
        if not identity_check:
            counts["detail_identity_not_reconfirmed"] += 1
            continue
        counts["detail_identity_reconfirmed"] += 1
        phone, domestic, reason = unique_tel_claim(page.get("telValues") or [])
        if not phone:
            counts[f"detail_tel_{reason}"] += 1
            continue
        rows.append(make_row(
            target,
            page,
            identity_check,
            phone,
            domestic or "",
            parent_url=parent_url,
            link=link,
        ))
        resolved_places.add(target["pid"])
        counts["detail_tel_evidence"] += 1

    # Exact snapshot-key dedupe only. No cross-snapshot claim combination.
    deduped = {}
    for row in rows:
        ev = row.get("webEvidence") or {}
        key = (row["googlePlaceId"], ev.get("finalUrl"), ev.get("contentHash"))
        deduped.setdefault(key, row)
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
            "telephoneIncludedInCompletionTargets": True,
            "explicitTelHrefRequired": True,
            "singleDistinctTelNumberRequired": True,
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
