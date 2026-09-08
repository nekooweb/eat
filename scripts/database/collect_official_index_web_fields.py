#!/usr/bin/env python3
"""Collect missing fields from retained/reviewed official-page identities.

This collector does not use Google display data or call Google APIs. It starts from
`official_candidate_index.json`, but only for Place IDs whose corresponding retained
official binding is currently `reviewed` in the SQLite master. The current public HTTPS
page is fetched through the robots-aware v4 fetcher and must still match the retained
official restaurant name before field claims are emitted.

After a root official page independently reconfirms the retained restaurant identity,
the collector may follow a small bounded set of explicit same-origin detail links such
as store information, access, location, contact or opening-hours pages. Every followed
page is fetched through the same robots-aware public-web policy and must independently
reconfirm the retained restaurant name before it may emit claims. A root-page match is
therefore a gate for discovery, not a substitute for detail-page identity validation.

Raw HTML is never persisted. Durable claims keep stable URL, retrieval timestamp,
content SHA-256 and parser version. V2 output is snapshot-based, so later scans may
append a changed official-page snapshot for the same Place ID while canonical field
resolution remains import-time missing-only.
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
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse
from urllib.request import Request, build_opener

import reconcile_private_google_hints as names
import reconcile_private_official_web_consensus_v4 as web

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RULE_VERSION = "source-basic-web-field-evidence-v2"
IDENTITY_RULE = "retained_verified_official_page"
DETAIL_LINK_LIMIT = 6
DETAIL_LINK_SCAN_BYTES = 3_000_000
DETAIL_TEXT_RE = re.compile(
    r"(?:店舗(?:情報|詳細|案内|について)?|基本情報|お店(?:について|情報)?|"
    r"アクセス|所在地|地図|営業時間|営業案内|連絡先|お問い合わせ|"
    r"store\s*(?:info|information|details?)|shop\s*(?:info|information|details?)|"
    r"access|location|hours|contact|about)",
    re.I,
)
DETAIL_HREF_RE = re.compile(
    r"/(?:store|shop|access|location|hours|contact|about|info|information|guide|detail)(?:/|[-_.?]|$)",
    re.I,
)
TRACKING_QUERY_KEYS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "gclid", "fbclid", "yclid", "mc_cid", "mc_eid",
}


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def known_index(db):
    return {
        (pid, key)
        for pid, key in db.execute(
            "SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'"
        )
    }


def missing_fields(known, pid):
    equivalents = {
        "address": ("address",),
        "coordinates": ("coordinates",),
        "cuisine": ("cuisine",),
        "hours": ("hours.raw", "hours.reference.legacy", "hours.normalized.legacy"),
        "lunch_budget": ("budget.lunch.range", "budget.lunch.legacy_range"),
        "dinner_budget": ("budget.dinner.range", "budget.dinner.legacy_range"),
        "telephone": ("contact.telephone",),
    }
    return [
        kind for kind, keys in equivalents.items()
        if not any((pid, key) in known for key in keys)
    ]


def selected_official_bindings(db) -> set[str]:
    return {
        pid for pid, in db.execute(
            """SELECT DISTINCT sb.place_id
               FROM source_bindings sb
               JOIN source_records sr ON sr.source_record_id=sb.source_record_id
               WHERE sr.acquisition_method='retained_verified_official_identity_index'
                 AND sb.binding_state='reviewed'"""
        )
    }


def normalized_cuisine(fact: dict, page: dict):
    raw = fact.get("cuisine")
    if isinstance(raw, list):
        raw = " ".join(str(item) for item in raw if item)
    if raw:
        mapped = web.cuisine_signal(str(raw))
        if mapped:
            return mapped
    return page.get("visibleCuisine") or None


def fact_candidates(page: dict, retained_name: str):
    output = []
    for fact in page.get("structuredFacts") or []:
        fact_name = str(fact.get("name") or "").strip()
        if not fact_name:
            continue
        similarity = names.similarity(retained_name, fact_name)
        output.append((similarity, fact))
    output.sort(key=lambda item: (-item[0], -len(str(item[1].get("address") or ""))))
    return output


def select_page_fact(page: dict, retained_name: str):
    candidates = fact_candidates(page, retained_name)
    title = str(page.get("title") or "").strip()
    title_similarity = names.similarity(retained_name, title) if title else 0.0

    if candidates and candidates[0][0] >= 0.72:
        similarity, fact = candidates[0]
        # If two different structured business nodes are similarly plausible, do not
        # choose one automatically (common on chain/store-list pages).
        runner = candidates[1][0] if len(candidates) > 1 else 0.0
        if len(candidates) > 1 and runner >= 0.72 and similarity - runner < 0.08:
            return None, {
                "accepted": False,
                "reason": "ambiguous_structured_business_nodes",
                "bestNameSimilarity": round(similarity, 6),
                "runnerNameSimilarity": round(runner, 6),
                "titleNameSimilarity": round(title_similarity, 6),
            }
        return fact, {
            "accepted": True,
            "identityRule": IDENTITY_RULE,
            "retainedOfficialBindingReviewed": True,
            "pageNameMatchMethod": "jsonld_business_name",
            "pageNameSimilarity": round(similarity, 6),
            "titleNameSimilarity": round(title_similarity, 6),
        }

    # Visible-page fallback is intentionally stricter because the page could be a group
    # home page. It may contribute hours/cuisine only when the title strongly identifies
    # the retained official business; visible address requires an even stronger title.
    if title_similarity >= 0.88:
        fact = {
            "name": title,
            "address": page.get("visibleAddress") if title_similarity >= 0.92 else "",
            "openingHoursRaw": [page["visibleHours"]] if page.get("visibleHours") else [],
            "cuisine": page.get("visibleCuisine"),
            "priceRange": "",
            "telephone": "",
            "geo": None,
        }
        return fact, {
            "accepted": True,
            "identityRule": IDENTITY_RULE,
            "retainedOfficialBindingReviewed": True,
            "pageNameMatchMethod": "strong_page_title",
            "pageNameSimilarity": round(title_similarity, 6),
            "titleNameSimilarity": round(title_similarity, 6),
        }

    return None, {
        "accepted": False,
        "reason": "current_page_name_not_specific_enough",
        "bestNameSimilarity": round(candidates[0][0], 6) if candidates else 0.0,
        "titleNameSimilarity": round(title_similarity, 6),
    }


def claims_from_fact(fact: dict, page: dict, missing: set[str]):
    claims = {}
    address = str(fact.get("address") or "").strip()
    if "address" in missing and address:
        claims["address"] = address

    opening = list(fact.get("openingHoursRaw") or [])
    if not opening and page.get("visibleHours"):
        opening = [page["visibleHours"]]
    if "hours" in missing and opening:
        claims["openingHoursRaw"] = opening

    cuisine = normalized_cuisine(fact, page)
    if "cuisine" in missing and cuisine:
        claims["cuisineNormalized"] = cuisine

    geo = fact.get("geo")
    if "coordinates" in missing and isinstance(geo, dict):
        lat, lng = geo.get("lat"), geo.get("lng")
        if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
            claims["geo"] = {"lat": float(lat), "lng": float(lng)}

    price = str(fact.get("priceRange") or "").strip()
    if ("lunch_budget" in missing or "dinner_budget" in missing) and price:
        # Raw only. Do not guess whether a generic official priceRange means lunch or dinner.
        claims["priceRange"] = price

    telephone = str(fact.get("telephone") or "").strip()
    if "telephone" in missing and telephone:
        claims["telephone"] = telephone
    return claims


def remaining_after_claims(missing: set[str], claims: dict) -> set[str]:
    remaining = set(missing)
    mapping = {
        "address": "address",
        "openingHoursRaw": "hours",
        "cuisineNormalized": "cuisine",
        "geo": "coordinates",
        "telephone": "telephone",
    }
    for claim_key, missing_key in mapping.items():
        if claim_key in claims:
            remaining.discard(missing_key)
    # priceRange is intentionally non-canonical and does not consume either meal gap.
    return remaining


def clean_detail_url(base_url: str, href: str) -> str | None:
    href = html_lib.unescape(str(href or "").strip())
    if not href or href.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
        return None
    try:
        joined = urljoin(base_url, href)
        parsed = urlparse(joined)
        base = urlparse(base_url)
    except Exception:
        return None
    if parsed.scheme != "https" or not parsed.netloc or parsed.netloc.lower() != base.netloc.lower():
        return None
    if not web.allowed_host(web.host_of(joined)):
        return None
    query = [
        (key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if key.casefold() not in TRACKING_QUERY_KEYS
    ]
    clean = parsed._replace(fragment="", query=urlencode(query, doseq=True)).geturl()
    if clean.rstrip("/") == base_url.rstrip("/"):
        return None
    return clean


def extract_detail_links(html_text: str, base_url: str) -> list[dict]:
    candidates = []
    seen = set()
    anchor_re = re.compile(r"<a\b([^>]*)>([\s\S]*?)</a>", re.I)
    href_re = re.compile(r"\bhref\s*=\s*([\"'])(.*?)\1", re.I | re.S)
    for order, match in enumerate(anchor_re.finditer(html_text)):
        attrs, inner = match.group(1), match.group(2)
        href_match = href_re.search(attrs)
        if not href_match:
            continue
        href = html_lib.unescape(href_match.group(2)).strip()
        anchor_text = web.strip_html(inner)[:160]
        url = clean_detail_url(base_url, href)
        if not url or url in seen:
            continue
        text_hit = bool(DETAIL_TEXT_RE.search(anchor_text))
        href_hit = bool(DETAIL_HREF_RE.search(urlparse(url).path + ("?" + urlparse(url).query if urlparse(url).query else "")))
        if not text_hit and not href_hit:
            continue
        seen.add(url)
        score = (2 if text_hit else 0) + (1 if href_hit else 0)
        candidates.append({
            "url": url,
            "anchorText": anchor_text,
            "score": score,
            "documentOrder": order,
        })
    candidates.sort(key=lambda item: (-item["score"], item["documentOrder"], len(item["url"])))
    return candidates[:DETAIL_LINK_LIMIT]


def discover_detail_links(root_url: str, final_url: str) -> dict:
    # Root identity has already been reconfirmed by fetch_page/select_page_fact before
    # this function is called. We refetch only those accepted roots so the shared parser
    # does not need to retain raw HTML or change behavior for unrelated workflows.
    allowed, robots_note = web.may_fetch(final_url)
    if not allowed:
        return {"ok": False, "blocked": robots_note, "links": []}
    req = Request(final_url, headers={
        "User-Agent": web.USER_AGENT,
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.3",
        "Accept-Language": "ja,en;q=0.7",
    })
    try:
        with build_opener().open(req, timeout=12) as response:
            status = int(getattr(response, "status", 200) or 200)
            actual_url = str(response.geturl() or final_url)
            content_type = str(response.headers.get("Content-Type") or "")
            if status in (401, 403, 429):
                return {"ok": False, "blocked": f"http_{status}", "links": []}
            if status < 200 or status >= 300 or "html" not in content_type.casefold():
                return {"ok": False, "blocked": "not_html_success", "links": []}
            if urlparse(actual_url).netloc.lower() != urlparse(final_url).netloc.lower():
                return {"ok": False, "blocked": "redirect_changed_origin", "links": []}
            payload = response.read(DETAIL_LINK_SCAN_BYTES + 1)
            if len(payload) > DETAIL_LINK_SCAN_BYTES:
                return {"ok": False, "blocked": "page_too_large", "links": []}
    except HTTPError as exc:
        return {"ok": False, "blocked": f"http_{exc.code}", "links": []}
    except (URLError, TimeoutError) as exc:
        return {"ok": False, "blocked": type(exc).__name__, "links": []}
    except Exception as exc:
        return {"ok": False, "blocked": type(exc).__name__, "links": []}

    text_html = web.decode_body(payload, content_type)
    return {
        "ok": True,
        "rootUrl": root_url,
        "finalUrl": actual_url,
        "links": extract_detail_links(text_html, actual_url),
    }


def evidence_row(target: dict, page: dict, identity_check: dict, claims: dict, *, discovery: dict | None = None):
    final_url = str(page.get("finalUrl") or page.get("url") or "")
    source_provider_id = "official-index:" + hashlib.sha256(final_url.encode("utf-8")).hexdigest()[:20]
    web_evidence = {
        "sourceUrl": page.get("url"),
        "finalUrl": final_url,
        "retrievedAt": page.get("retrievedAt"),
        "contentHash": page.get("contentHash"),
        "parserVersion": web.PARSER_VERSION,
        "rawHtmlPersisted": False,
        "retainedOfficialIndexCheckedAt": target.get("checkedAt"),
    }
    if discovery:
        web_evidence["discovery"] = discovery
    return {
        "googlePlaceId": target["pid"],
        "sourceProvider": "official",
        "sourceProviderId": source_provider_id,
        "missingBefore": sorted(target["missing"]),
        "identityCheck": identity_check,
        "webEvidence": web_evidence,
        "fieldClaims": claims,
        "checkedAt": (page.get("retrievedAt") or web.utc_now())[:10],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--max-pages", type=int, default=250)
    args = ap.parse_args()

    index_doc = load_json(DATA / "official_candidate_index.json")
    db = sqlite3.connect(args.database)
    states = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    conflict_places = {
        pid for pid, in db.execute(
            "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
        )
    }
    reviewed_official = selected_official_bindings(db)
    known = known_index(db)
    db.close()

    counts = Counter()
    targets = []
    seen_pid = set()
    seen_url = set()
    for record in index_doc.get("records") or []:
        pid = str(record.get("googlePlaceId") or "").strip()
        page_url = web.normalize_url(record.get("pageUrl"))
        retained_name = str(record.get("name") or "").strip()
        if not pid or pid in seen_pid:
            continue
        seen_pid.add(pid)
        if states.get(pid) not in ("verified", "source_matched"):
            counts["identity_not_publishable"] += 1
            continue
        if pid in conflict_places:
            counts["identity_conflict"] += 1
            continue
        if pid not in reviewed_official:
            counts["official_binding_not_reviewed"] += 1
            continue
        missing = missing_fields(known, pid)
        if not missing:
            counts["already_field_complete"] += 1
            continue
        if not page_url:
            counts["invalid_or_blocked_page_url"] += 1
            continue
        if page_url in seen_url:
            # One page describing multiple restaurants cannot safely provide canonical
            # fields to all of them without store-specific structured nodes.
            counts["shared_page_url_deferred"] += 1
            continue
        seen_url.add(page_url)
        targets.append({
            "pid": pid,
            "name": retained_name,
            "pageUrl": page_url,
            "missing": missing,
            "checkedAt": record.get("checkedAt") or index_doc.get("checkedAt"),
        })

    targets = targets[: max(0, args.max_pages)]
    counts["target_rows"] = len(targets)
    counts["telephone_completion_target_enabled"] = 1
    pages = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(12, args.workers))) as pool:
        future_map = {pool.submit(web.fetch_page, target["pageUrl"]): target for target in targets}
        for future in concurrent.futures.as_completed(future_map):
            target = future_map[future]
            try:
                pages[target["pid"]] = future.result()
            except Exception as exc:
                pages[target["pid"]] = {
                    "url": target["pageUrl"], "ok": False,
                    "blocked": type(exc).__name__, "status": None,
                }

    rows = []
    field_counts = Counter()
    accepted_roots = []
    remaining_by_pid = {}
    root_final_url_by_pid = {}

    for target in targets:
        page = pages.get(target["pid"]) or {}
        if not page.get("ok"):
            counts[f"page_skip_{page.get('blocked') or 'unknown'}"] += 1
            continue
        counts["pages_ok"] += 1
        fact, identity_check = select_page_fact(page, target["name"])
        if not fact or identity_check.get("accepted") is not True:
            counts[identity_check.get("reason") or "page_identity_not_reconfirmed"] += 1
            continue
        counts["root_identity_reconfirmed"] += 1
        missing = set(target["missing"])
        claims = claims_from_fact(fact, page, missing)
        if claims:
            for key in claims:
                field_counts[key] += 1
            rows.append(evidence_row(target, page, identity_check, claims))
            counts["root_evidence_rows"] += 1
        else:
            counts["verified_root_without_missing_field_claim"] += 1
        remaining = remaining_after_claims(missing, claims)
        remaining_by_pid[target["pid"]] = remaining
        root_final_url_by_pid[target["pid"]] = str(page.get("finalUrl") or page.get("url") or target["pageUrl"])
        # Even a root that emitted no claim may reveal an explicit detail page containing
        # the missing field, so all identity-reconfirmed roots remain eligible here.
        if remaining:
            accepted_roots.append(target)

    detail_discovery = {}
    if accepted_roots:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(12, args.workers))) as pool:
            future_map = {
                pool.submit(
                    discover_detail_links,
                    target["pageUrl"],
                    root_final_url_by_pid[target["pid"]],
                ): target
                for target in accepted_roots
            }
            for future in concurrent.futures.as_completed(future_map):
                target = future_map[future]
                try:
                    detail_discovery[target["pid"]] = future.result()
                except Exception as exc:
                    detail_discovery[target["pid"]] = {
                        "ok": False, "blocked": type(exc).__name__, "links": []
                    }

    detail_tasks = []
    seen_detail_snapshot_url = set()
    for target in accepted_roots:
        discovery = detail_discovery.get(target["pid"]) or {}
        if not discovery.get("ok"):
            counts[f"detail_discovery_skip_{discovery.get('blocked') or 'unknown'}"] += 1
            continue
        links = discovery.get("links") or []
        if links:
            counts["roots_with_detail_links"] += 1
        counts["detail_links_discovered"] += len(links)
        for link in links:
            key = (target["pid"], link["url"])
            if key in seen_detail_snapshot_url:
                continue
            seen_detail_snapshot_url.add(key)
            detail_tasks.append((target, link, discovery.get("finalUrl") or target["pageUrl"]))

    counts["detail_pages_targeted"] = len(detail_tasks)
    detail_pages = {}
    if detail_tasks:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(12, args.workers))) as pool:
            future_map = {
                pool.submit(web.fetch_page, link["url"]): (target, link, parent_url)
                for target, link, parent_url in detail_tasks
            }
            for future in concurrent.futures.as_completed(future_map):
                target, link, parent_url = future_map[future]
                key = (target["pid"], link["url"])
                try:
                    detail_pages[key] = (future.result(), target, link, parent_url)
                except Exception as exc:
                    detail_pages[key] = ({
                        "url": link["url"], "ok": False,
                        "blocked": type(exc).__name__, "status": None,
                    }, target, link, parent_url)

    for target, link, parent_url in detail_tasks:
        page, _target, _link, _parent = detail_pages.get(
            (target["pid"], link["url"]),
            ({}, target, link, parent_url),
        )
        if not page.get("ok"):
            counts[f"detail_page_skip_{page.get('blocked') or 'unknown'}"] += 1
            continue
        counts["detail_pages_ok"] += 1
        fact, identity_check = select_page_fact(page, target["name"])
        if not fact or identity_check.get("accepted") is not True:
            counts["detail_identity_not_reconfirmed"] += 1
            continue
        counts["detail_identity_reconfirmed"] += 1
        remaining = remaining_by_pid.get(target["pid"], set(target["missing"]))
        claims = claims_from_fact(fact, page, remaining)
        if not claims:
            counts["verified_detail_without_missing_field_claim"] += 1
            continue
        for key in claims:
            field_counts[key] += 1
        discovery_note = {
            "method": "same_origin_explicit_detail_link",
            "parentSourceUrl": parent_url,
            "anchorText": link.get("anchorText") or "",
            "linkScore": link.get("score"),
            "rootIdentityReconfirmedBeforeDiscovery": True,
            "detailIdentityReconfirmedIndependently": True,
        }
        rows.append(evidence_row(
            target,
            page,
            identity_check,
            claims,
            discovery=discovery_note,
        ))
        counts["detail_evidence_rows"] += 1
        remaining_by_pid[target["pid"]] = remaining_after_claims(remaining, claims)

    # One fetched detail URL can redirect to the same durable snapshot as another link.
    # Deduplicate at the exact v2 snapshot key before writing the output.
    deduped = {}
    for row in rows:
        ev = row.get("webEvidence") or {}
        key = (
            row.get("googlePlaceId"),
            str(ev.get("finalUrl") or ""),
            str(ev.get("contentHash") or ""),
        )
        previous = deduped.get(key)
        if previous is None:
            deduped[key] = row
            continue
        merged_claims = dict(previous.get("fieldClaims") or {})
        merged_claims.update(row.get("fieldClaims") or {})
        previous["fieldClaims"] = merged_claims
        counts["duplicate_detail_snapshot_merged"] += 1
    rows = list(deduped.values())
    counts["new_evidence_rows"] = len(rows)

    output = {
        "schemaVersion": 2,
        "ruleVersion": RULE_VERSION,
        "checkedAt": web.utc_now()[:10],
        "policy": {
            "paidDataApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "sourceBackedIdentityRequired": True,
            "httpsExistingSourceUrlsOnly": True,
            "rawHtmlPersisted": False,
            "robotsRespected": True,
            "restrictedAccessBypass": False,
            "telephoneIncludedInCompletionTargets": True,
            "multiSnapshotEvidenceByPlaceId": True,
            "snapshotIdentity": ["googlePlaceId", "finalUrl", "contentHash"],
            "crossSnapshotClaimMerge": False,
            "canonicalResolution": "import_time_missing_only",
            "sameOriginDetailTraversal": True,
            "rootIdentityGateRequiredBeforeDetailDiscovery": True,
            "detailIdentityReconfirmationRequired": True,
            "maxExplicitDetailLinksPerRoot": DETAIL_LINK_LIMIT,
            "genericPriceRangeMealInference": False,
        },
        "summary": {
            "rows": len(rows),
            "places": len({row["googlePlaceId"] for row in rows}),
            "fieldCounts": dict(sorted(field_counts.items())),
            "fetchCounts": dict(sorted(counts.items())),
        },
        "rows": sorted(
            rows,
            key=lambda row: (
                row["googlePlaceId"],
                str((row.get("webEvidence") or {}).get("finalUrl") or ""),
                str((row.get("webEvidence") or {}).get("contentHash") or ""),
            ),
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
