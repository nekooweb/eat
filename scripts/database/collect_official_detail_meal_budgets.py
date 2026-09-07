#!/usr/bin/env python3
"""Collect explicit meal budgets from same-origin detail pages of reviewed official sites.

The retained official landing page is fetched first and must re-confirm the restaurant
identity. Only links discovered on that verified page are eligible. At most two same-host
HTTPS detail pages per restaurant are fetched, each with its own robots check. Raw HTML
is never persisted. Generic priceRange/menu item prices are not promoted: the shared
strict parser still requires an explicit meal label, an explicit budget cue, and a finite
JPY range.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import re
import sqlite3
from collections import Counter, defaultdict
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, build_opener

import collect_official_index_web_fields as official
import collect_official_meal_budgets as meal
import reconcile_private_official_web_consensus_v4 as web

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RULE_VERSION = meal.RULE_VERSION
PARSER_VERSION = meal.PARSER_VERSION
DETAIL_FEATURE_VERSION = "official-same-origin-detail-v1"
MAX_DETAIL_LINKS = 2

HIGH_HINT = re.compile(r"(?:ランチ|lunch|menu|メニュー|お品書き|price|料金|予算|budget)", re.I)
MEDIUM_HINT = re.compile(r"(?:course|コース|food|料理|drink|店舗情報|shop|info)", re.I)
EXCLUDE_HINT = re.compile(r"(?:recruit|求人|privacy|policy|採用|予約|reserve|instagram|facebook|twitter|x\.com)", re.I)


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []
        self._href = None
        self._text = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() != "a":
            return
        values = dict(attrs)
        self._href = values.get("href")
        self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.links.append((self._href, " ".join(self._text).strip()))
            self._href = None
            self._text = []


def host_key(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def discover_detail_links(html: str, page_url: str):
    parser = LinkParser()
    try:
        parser.feed(html)
    except Exception:
        return []
    base_host = host_key(page_url)
    scored = {}
    for href, label in parser.links:
        href = str(href or "").strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        absolute = web.normalize_url(urljoin(page_url, href))
        if not absolute or host_key(absolute) != base_host:
            continue
        if absolute.rstrip("/") == page_url.rstrip("/"):
            continue
        signal = f"{label} {urlparse(absolute).path}"
        if EXCLUDE_HINT.search(signal):
            continue
        score = 0
        if HIGH_HINT.search(signal):
            score += 10
        if MEDIUM_HINT.search(signal):
            score += 4
        if score <= 0:
            continue
        old = scored.get(absolute)
        if old is None or score > old[0]:
            scored[absolute] = (score, re.sub(r"\s+", " ", label).strip()[:80])
    ranked = sorted(
        ((url, score, label) for url, (score, label) in scored.items()),
        key=lambda item: (-item[1], len(urlparse(item[0]).path), item[0]),
    )
    return ranked[:MAX_DETAIL_LINKS]


def fetch_homepage(url: str):
    allowed, robots_note = web.may_fetch(url)
    if not allowed:
        return {"url": url, "ok": False, "status": None, "blocked": robots_note}
    request = Request(url, headers={
        "User-Agent": web.USER_AGENT,
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.3",
        "Accept-Language": "ja,en;q=0.8",
    })
    try:
        with build_opener().open(request, timeout=12) as response:
            status = int(getattr(response, "status", 200) or 200)
            final_url = str(response.geturl() or url)
            if status in (401, 403, 429):
                return {"url": url, "ok": False, "status": status, "blocked": f"http_{status}"}
            if status < 200 or status >= 300:
                return {"url": url, "ok": False, "status": status, "blocked": f"http_{status}"}
            normalized_final = web.normalize_url(final_url)
            if not normalized_final:
                return {"url": url, "ok": False, "status": status, "blocked": "redirect_to_blocked_host"}
            content_type = str(response.headers.get("Content-Type") or "")
            payload = response.read(web.MAX_BYTES + 1)
            if len(payload) > web.MAX_BYTES:
                return {"url": url, "ok": False, "status": status, "blocked": "page_too_large"}
    except HTTPError as exc:
        return {"url": url, "ok": False, "status": exc.code, "blocked": f"http_{exc.code}"}
    except (URLError, TimeoutError) as exc:
        return {"url": url, "ok": False, "status": None, "blocked": type(exc).__name__}
    except Exception as exc:
        return {"url": url, "ok": False, "status": None, "blocked": type(exc).__name__}

    html = web.decode_body(payload, content_type)
    visible = web.strip_html(html)
    title = web.title_from_html(html)
    return {
        "url": url,
        "finalUrl": normalized_final,
        "ok": True,
        "status": status,
        "robots": robots_note,
        "retrievedAt": web.utc_now(),
        "contentHash": hashlib.sha256(payload).hexdigest(),
        "title": title,
        "structuredFacts": web.jsonld_facts(html),
        "visibleAddress": web.visible_address(visible),
        "visibleHours": web.visible_hours(visible),
        "visibleCuisine": web.cuisine_signal(f"{title} {visible[:8000]}"),
        "detailLinks": discover_detail_links(html, normalized_final),
    }


def load_targets(database: Path):
    index_doc = json.loads((DATA / "official_candidate_index.json").read_text(encoding="utf-8"))
    db = sqlite3.connect(database)
    states = dict(db.execute("SELECT place_id,identity_state FROM catalog_entries"))
    conflict_places = {pid for pid, in db.execute(
        "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
    )}
    reviewed = official.selected_official_bindings(db)
    known = meal.known_index(db)
    db.close()

    counts = Counter()
    candidates = []
    seen = set()
    for record in index_doc.get("records") or []:
        pid = str(record.get("googlePlaceId") or "").strip()
        if not pid or pid in seen:
            continue
        seen.add(pid)
        if states.get(pid) not in ("verified", "source_matched"):
            counts["identity_not_publishable"] += 1
            continue
        if pid in conflict_places:
            counts["identity_conflict"] += 1
            continue
        if pid not in reviewed:
            counts["official_binding_not_reviewed"] += 1
            continue
        missing = [m for m in ("lunch", "dinner") if meal.meal_missing(known, pid, m)]
        if not missing:
            counts["budget_complete"] += 1
            continue
        page_url = web.normalize_url(record.get("pageUrl"))
        if not page_url:
            counts["invalid_or_blocked_page_url"] += 1
            continue
        candidates.append({
            "pid": pid,
            "name": str(record.get("name") or "").strip(),
            "pageUrl": page_url,
            "missing": missing,
            "checkedAt": record.get("checkedAt") or index_doc.get("checkedAt"),
        })
    url_places = defaultdict(set)
    for item in candidates:
        url_places[item["pageUrl"]].add(item["pid"])
    targets = []
    for item in candidates:
        if len(url_places[item["pageUrl"]]) != 1:
            counts["shared_page_url_deferred"] += 1
            continue
        targets.append(item)
    return targets, counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--max-restaurants", type=int, default=250)
    args = ap.parse_args()

    targets, counts = load_targets(args.database)
    targets = targets[: max(0, args.max_restaurants)]
    counts["target_restaurants"] = len(targets)

    homes = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(10, args.workers))) as pool:
        future_map = {pool.submit(fetch_homepage, t["pageUrl"]): t for t in targets}
        for future in concurrent.futures.as_completed(future_map):
            t = future_map[future]
            try:
                homes[t["pid"]] = future.result()
            except Exception as exc:
                homes[t["pid"]] = {"url": t["pageUrl"], "ok": False, "blocked": type(exc).__name__}

    verified = []
    detail_jobs = []
    for target in targets:
        home = homes.get(target["pid"]) or {}
        if not home.get("ok"):
            counts[f"home_skip_{home.get('blocked') or 'unknown'}"] += 1
            continue
        counts["homes_ok"] += 1
        fact, identity_check = official.select_page_fact(home, target["name"])
        if not fact or identity_check.get("accepted") is not True:
            counts[identity_check.get("reason") or "home_identity_not_reconfirmed"] += 1
            continue
        counts["homes_identity_verified"] += 1
        links = home.get("detailLinks") or []
        if not links:
            counts["verified_home_without_detail_link"] += 1
            continue
        verified.append((target, home, identity_check))
        for url, score, label in links[:MAX_DETAIL_LINKS]:
            detail_jobs.append((target, home, identity_check, url, score, label))
    counts["detail_links_selected"] = len(detail_jobs)

    detail_pages = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(10, args.workers))) as pool:
        future_map = {
            pool.submit(meal.fetch_budget_page, job[3]): job
            for job in detail_jobs
        }
        for future in concurrent.futures.as_completed(future_map):
            job = future_map[future]
            key = (job[0]["pid"], job[3])
            try:
                detail_pages[key] = future.result()
            except Exception as exc:
                detail_pages[key] = {"url": job[3], "ok": False, "blocked": type(exc).__name__}

    rows = []
    field_counts = Counter()
    resolved_meals_by_pid = defaultdict(set)
    for target, home, identity_check, detail_url, score, label in detail_jobs:
        page = detail_pages.get((target["pid"], detail_url)) or {}
        if not page.get("ok"):
            counts[f"detail_skip_{page.get('blocked') or 'unknown'}"] += 1
            continue
        counts["detail_pages_ok"] += 1
        final_url = str(page.get("finalUrl") or page.get("url") or "")
        if host_key(final_url) != host_key(str(home.get("finalUrl") or home.get("url") or "")):
            counts["detail_cross_origin_redirect"] += 1
            continue
        claims, snippets, ambiguous = meal.extract_meal_budgets(page.get("visibleText") or "")
        for m in ambiguous:
            counts[f"ambiguous_{m}_ranges"] += 1
        claims = {
            m: claim for m, claim in claims.items()
            if m in target["missing"] and m not in resolved_meals_by_pid[target["pid"]]
        }
        if not claims:
            counts["detail_without_explicit_missing_meal_budget"] += 1
            continue
        for m in claims:
            field_counts[m] += 1
            resolved_meals_by_pid[target["pid"]].add(m)
        rows.append({
            "googlePlaceId": target["pid"],
            "sourceProvider": "official",
            "sourceProviderId": "official-detail-budget:" + hashlib.sha256(final_url.encode("utf-8")).hexdigest()[:20],
            "missingBefore": sorted(target["missing"]),
            "identityCheck": identity_check,
            "webEvidence": {
                "sourceUrl": page.get("url"),
                "finalUrl": final_url,
                "retrievedAt": page.get("retrievedAt"),
                "contentHash": page.get("contentHash"),
                "parserVersion": PARSER_VERSION,
                "rawHtmlPersisted": False,
                "sameOriginDetailPage": True,
                "identitySupportUrl": home.get("finalUrl") or home.get("url"),
                "identitySupportContentHash": home.get("contentHash"),
                "identitySupportRetrievedAt": home.get("retrievedAt"),
                "detailLinkLabel": label,
                "detailLinkScore": score,
                "collectorFeatureVersion": DETAIL_FEATURE_VERSION,
                "retainedOfficialIndexCheckedAt": target.get("checkedAt"),
            },
            "budgetClaims": claims,
            "evidenceSnippets": {m: snippets[m] for m in claims},
            "checkedAt": (page.get("retrievedAt") or web.utc_now())[:10],
        })
        counts["new_evidence_snapshots"] += 1

    output = {
        "schemaVersion": 1,
        "ruleVersion": RULE_VERSION,
        "parserVersion": PARSER_VERSION,
        "checkedAt": web.utc_now()[:10],
        "policy": {
            "paidDataApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "reviewedOfficialIdentityRequired": True,
            "sameOriginDetailDiscovery": True,
            "maxDetailLinksPerRestaurant": MAX_DETAIL_LINKS,
            "explicitMealLabelRequired": True,
            "explicitBudgetCueRequired": True,
            "finiteRangeOnly": True,
            "genericPriceRangePromoted": False,
            "rawHtmlPersisted": False,
            "robotsRespected": True,
            "restrictedAccessBypass": False,
        },
        "summary": {
            "rows": len(rows),
            "places": len({row["googlePlaceId"] for row in rows}),
            "fieldCounts": dict(sorted(field_counts.items())),
            "fetchCounts": dict(sorted(counts.items())),
        },
        "rows": sorted(rows, key=lambda row: (row["googlePlaceId"], row["webEvidence"]["finalUrl"])),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
