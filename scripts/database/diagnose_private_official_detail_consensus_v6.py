#!/usr/bin/env python3
"""Diagnose ID-only recoveries from same-origin official store/detail pages.

Historical Google Places rows are private linkage hints only. This stage never promotes
an identity and never writes Google display fields. It starts from an unresolved
multi-source Hot Pepper / OSM / Overture component that already carries an allowed
public website, then follows at most two same-origin link hops to find store-specific
public official evidence. Every fetched page is gated by robots/access checks inherited
from v4 and raw HTML is never persisted.
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

import reconcile_private_google_hints as base
import reconcile_private_address_consensus_v2 as v2
import reconcile_private_multisource_consensus_v3 as v3
import reconcile_private_official_web_consensus_v4 as web

RULE_VERSION = "private-official-detail-diagnostic-v6"
PARSER_VERSION = "official-same-origin-detail-jsonld-v1"
MAX_DEPTH = 2
MAX_HOP1_PER_CONTEXT = 3
MAX_HOP2_PER_CONTEXT = 2

STORE_HINT = re.compile(
    r"(?:店舗|店舖|shop|store|location|locations|branch|access|アクセス|"
    r"店舗情報|shopinfo|storeinfo|info|information|guide|ご案内|一覧|list)",
    re.I,
)
EXCLUDE_HINT = re.compile(
    r"(?:menu|メニュー|お品書き|course|コース|recruit|求人|privacy|policy|"
    r"採用|予約|reserve|instagram|facebook|twitter|x\.com|youtube|news|blog|"
    r"contact|お問い合わせ|online|通販|ec|delivery)",
    re.I,
)


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._text: list[str] = []

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
    host = (urlparse(str(url or "")).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def parse_links(html: str, page_url: str) -> list[dict]:
    parser = LinkParser()
    try:
        parser.feed(html)
    except Exception:
        return []
    base_host = host_key(page_url)
    out = []
    seen = set()
    for href, label in parser.links:
        href = str(href or "").strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        absolute = web.normalize_url(urljoin(page_url, href))
        if not absolute or host_key(absolute) != base_host:
            continue
        if absolute.rstrip("/") == page_url.rstrip("/") or absolute in seen:
            continue
        seen.add(absolute)
        out.append({
            "url": absolute,
            "label": re.sub(r"\s+", " ", str(label or "")).strip()[:120],
        })
        if len(out) >= 400:
            break
    return out


def fetch_page_with_links(url: str) -> dict:
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
            content_type = str(response.headers.get("Content-Type") or "")
            if status in (401, 403, 429):
                return {"url": url, "ok": False, "status": status, "blocked": f"http_{status}"}
            if status < 200 or status >= 300 or "html" not in content_type.casefold():
                return {"url": url, "ok": False, "status": status, "blocked": "not_html_success"}
            normalized_final = web.normalize_url(final_url)
            if not normalized_final:
                return {"url": url, "ok": False, "status": status, "blocked": "redirect_to_blocked_host"}
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
        "links": parse_links(html, normalized_final),
    }


def component_name_norms(members: list[tuple[dict, dict]]) -> list[str]:
    out = []
    for row, _ev in v3.best_per_provider(members):
        norm = base.normalize(row.get("name"))
        if len(norm) >= 4 and norm not in out:
            out.append(norm)
    return out


def component_address_tokens(members: list[tuple[dict, dict]]) -> list[str]:
    out = []
    for row, _ev in v3.best_per_provider(members):
        address = str(row.get("address") or "")
        for token in (v2.ward(address), base.postcode(address)):
            token = base.normalize(token)
            if len(token) >= 3 and token not in out:
                out.append(token)
    return out


def rank_links(page: dict, members: list[tuple[dict, dict]], limit: int) -> list[dict]:
    page_url = str(page.get("finalUrl") or page.get("url") or "")
    page_host = host_key(page_url)
    names = component_name_norms(members)
    address_tokens = component_address_tokens(members)
    ranked = []
    for item in page.get("links") or []:
        url = str(item.get("url") or "")
        label = str(item.get("label") or "")
        if host_key(url) != page_host:
            continue
        path = urlparse(url).path
        signal = f"{label} {path}"
        if EXCLUDE_HINT.search(signal):
            continue
        signal_norm = base.normalize(signal)
        score = 0
        reasons = []
        if STORE_HINT.search(signal):
            score += 7
            reasons.append("store_hint")
        matched_names = [name for name in names if name in signal_norm or signal_norm in name]
        if matched_names:
            score += 18
            reasons.append("independent_name_token")
        matched_addresses = [token for token in address_tokens if token in signal_norm]
        if matched_addresses:
            score += 8
            reasons.append("independent_address_token")
        if re.search(r"/(?:shop|shops|store|stores|location|locations|access|restaurant|restaurants)(?:/|$)", path, re.I):
            score += 5
            reasons.append("store_path")
        if score < 7:
            continue
        ranked.append({
            "url": url,
            "label": label[:100],
            "score": score,
            "reasons": reasons,
        })
    ranked.sort(key=lambda x: (-x["score"], len(urlparse(x["url"]).path), x["url"]))
    return ranked[:limit]


def build_contexts(database: Path, initial: Path, retry: Path):
    db = sqlite3.connect(database)
    id_only = {row[0] for row in db.execute("SELECT place_id FROM catalog_entries WHERE identity_state='id_only'")}
    conflict_places = {row[0] for row in db.execute(
        "SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'"
    )}
    bound = defaultdict(set)
    for provider, provider_id, pid in db.execute(
        """SELECT sr.provider,sr.provider_id,sb.place_id
           FROM source_bindings sb JOIN source_records sr ON sr.source_record_id=sb.source_record_id
           WHERE sb.binding_state IN ('reviewed','conflict')"""
    ):
        bound[(provider, str(provider_id))].add(pid)
    db.close()

    hints = base.load_google_hints(initial, retry)
    provider_rows = {
        "Hot Pepper": base.hotpepper_rows(),
        "OpenStreetMap": base.osm_rows(),
        "Overture Maps": base.overture_rows(),
    }
    grids = {provider: base.build_grid(rows) for provider, rows in provider_rows.items()}
    counts = Counter()
    contexts = []

    for pid in sorted(id_only):
        hint = hints.get(pid)
        if hint is None:
            counts["no_historical_hint"] += 1
            continue
        if hint.get("businessStatus") not in (None, "OPERATIONAL"):
            counts["historical_non_operational"] += 1
            continue
        if pid in conflict_places:
            counts["identity_conflict_deferred"] += 1
            continue
        candidates = []
        for provider, (grid, step) in grids.items():
            local = []
            for row in base.nearby(grid, step, hint["lat"], hint["lng"]):
                ev = v2.enriched_evidence(hint, row)
                if ev["distanceMeters"] > 100:
                    continue
                native = v3.native_key(row)
                if native in bound and bound[native] != {pid}:
                    continue
                local.append((row, ev))
            local.sort(key=lambda item: (
                item[1]["distanceMeters"], -item[1]["nameSimilarity"], str(item[0].get("providerId") or "")
            ))
            candidates.extend(local[:18])
        components = v3.componentize(candidates)
        if components:
            counts["has_multisource_cluster"] += 1
        for index, component in enumerate(components):
            members = v3.best_per_provider(component)
            urls = web.component_urls(members)
            if not urls:
                continue
            metrics = v3.cluster_metrics(members)
            contexts.append({
                "pid": pid,
                "componentIndex": index,
                "members": members,
                "urls": urls,
                "providerCount": metrics["providerCount"],
                "providers": metrics["providers"],
                "clusterScore": metrics.get("score"),
            })
    counts["components_with_allowed_websites"] = len(contexts)
    return contexts, counts


def fetch_many(urls: list[str], workers: int, with_links: bool = True) -> dict[str, dict]:
    fetcher = fetch_page_with_links if with_links else web.fetch_page
    pages = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(10, workers))) as pool:
        future_map = {pool.submit(fetcher, url): url for url in urls}
        for future in concurrent.futures.as_completed(future_map):
            url = future_map[future]
            try:
                pages[url] = future.result()
            except Exception as exc:
                pages[url] = {"url": url, "ok": False, "blocked": type(exc).__name__}
    return pages


def page_candidate(page: dict, context: dict, depth: int, link_meta: dict | None):
    match, fact = web.best_page_fact(page, context["members"])
    if not match or not fact:
        return None
    final_url = str(page.get("finalUrl") or page.get("url") or "")
    return {
        "score": match["score"],
        "componentIndex": context["componentIndex"],
        "depth": depth,
        "finalUrl": final_url,
        "contentHash": page.get("contentHash"),
        "retrievedAt": page.get("retrievedAt"),
        "match": match,
        "fact": {
            "name": str(fact.get("name") or page.get("title") or "")[:240],
            "address": str(fact.get("address") or page.get("visibleAddress") or "")[:320],
            "telephoneHash": hashlib.sha256(web.phone_digits(fact.get("telephone")).encode()).hexdigest()[:16]
                if web.phone_digits(fact.get("telephone")) else "",
            "geo": fact.get("geo"),
        },
        "link": link_meta or {},
        "independentSourceKeys": [
            {"provider": row["provider"], "providerId": str(row.get("providerId") or "")}
            for row, _ev in v3.best_per_provider(context["members"])
        ],
        "providerCount": context["providerCount"],
        "providers": context["providers"],
        "clusterScore": context.get("clusterScore"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--initial", type=Path, required=True)
    ap.add_argument("--retry", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--max-landing-pages", type=int, default=250)
    ap.add_argument("--max-detail-pages", type=int, default=500)
    args = ap.parse_args()

    contexts, counts = build_contexts(args.database, args.initial, args.retry)
    landing_urls = []
    for context in contexts:
        for url in context["urls"]:
            if url not in landing_urls:
                landing_urls.append(url)
    landing_urls = landing_urls[:max(0, args.max_landing_pages)]
    allowed_landing = set(landing_urls)
    counts["landing_pages_scheduled"] = len(landing_urls)
    landing_pages = fetch_many(landing_urls, args.workers, with_links=True)
    for page in landing_pages.values():
        if page.get("ok"):
            counts["landing_pages_ok"] += 1
        else:
            counts[f"landing_skip_{page.get('blocked') or 'unknown'}"] += 1

    matches_by_pid = defaultdict(list)
    hop1_jobs = []
    for context in contexts:
        for url in context["urls"]:
            if url not in allowed_landing:
                continue
            page = landing_pages.get(url) or {}
            if not page.get("ok"):
                continue
            direct = page_candidate(page, context, 0, None)
            if direct:
                matches_by_pid[context["pid"]].append((context, direct))
                counts["landing_direct_matches"] += 1
            for link in rank_links(page, context["members"], MAX_HOP1_PER_CONTEXT):
                hop1_jobs.append((context, url, link))
    counts["hop1_links_selected"] = len(hop1_jobs)

    hop1_urls = []
    for _context, _landing, link in hop1_jobs:
        if link["url"] not in hop1_urls:
            hop1_urls.append(link["url"])
    hop1_urls = hop1_urls[:max(0, args.max_detail_pages)]
    allowed_hop1 = set(hop1_urls)
    hop1_pages = fetch_many(hop1_urls, args.workers, with_links=True)
    for page in hop1_pages.values():
        if page.get("ok"):
            counts["hop1_pages_ok"] += 1
        else:
            counts[f"hop1_skip_{page.get('blocked') or 'unknown'}"] += 1

    hop2_jobs = []
    detail_budget_used = len(hop1_urls)
    for context, landing_url, link in hop1_jobs:
        if link["url"] not in allowed_hop1:
            continue
        page = hop1_pages.get(link["url"]) or {}
        if not page.get("ok"):
            continue
        if host_key(str(page.get("finalUrl") or page.get("url") or "")) != host_key(landing_url):
            counts["hop1_cross_origin_redirect"] += 1
            continue
        candidate = page_candidate(page, context, 1, link)
        if candidate:
            matches_by_pid[context["pid"]].append((context, candidate))
            counts["hop1_matches"] += 1
            continue
        for child in rank_links(page, context["members"], MAX_HOP2_PER_CONTEXT):
            if host_key(child["url"]) != host_key(landing_url):
                continue
            hop2_jobs.append((context, landing_url, link, child))
    counts["hop2_links_selected"] = len(hop2_jobs)

    remaining = max(0, args.max_detail_pages - detail_budget_used)
    hop2_urls = []
    for _context, _landing, _parent, child in hop2_jobs:
        if child["url"] not in hop2_urls:
            hop2_urls.append(child["url"])
    hop2_urls = hop2_urls[:remaining]
    allowed_hop2 = set(hop2_urls)
    hop2_pages = fetch_many(hop2_urls, args.workers, with_links=False)
    for page in hop2_pages.values():
        if page.get("ok"):
            counts["hop2_pages_ok"] += 1
        else:
            counts[f"hop2_skip_{page.get('blocked') or 'unknown'}"] += 1

    for context, landing_url, parent, child in hop2_jobs:
        if child["url"] not in allowed_hop2:
            continue
        page = hop2_pages.get(child["url"]) or {}
        if not page.get("ok"):
            continue
        if host_key(str(page.get("finalUrl") or page.get("url") or "")) != host_key(landing_url):
            counts["hop2_cross_origin_redirect"] += 1
            continue
        link_meta = {
            "parentUrl": parent["url"],
            "parentLabel": parent.get("label") or "",
            "url": child["url"],
            "label": child.get("label") or "",
            "score": child.get("score"),
            "reasons": child.get("reasons") or [],
        }
        candidate = page_candidate(page, context, 2, link_meta)
        if candidate:
            matches_by_pid[context["pid"]].append((context, candidate))
            counts["hop2_matches"] += 1

    provisional = []
    for pid, matches in sorted(matches_by_pid.items()):
        best_by_component = {}
        for context, candidate in matches:
            index = context["componentIndex"]
            current = best_by_component.get(index)
            if current is None or candidate["score"] > current["score"]:
                best_by_component[index] = candidate
        ranked = sorted(best_by_component.values(), key=lambda c: (-c["score"], c["depth"], c["finalUrl"]))
        if not ranked:
            continue
        if len(ranked) > 1 and ranked[0]["score"] - ranked[1]["score"] < 0.10:
            counts["ambiguous_confirmed_components"] += 1
            continue
        top = ranked[0]
        provisional.append({
            "googlePlaceId": pid,
            "rule": "official_same_origin_detail",
            "providerCount": top["providerCount"],
            "providers": top["providers"],
            "detailDepth": top["depth"],
            "officialUrl": top["finalUrl"],
            "contentHash": top["contentHash"],
            "retrievedAt": top["retrievedAt"],
            "match": top["match"],
            "officialFact": top["fact"],
            "independentSourceKeys": top["independentSourceKeys"],
            "clusterScore": top.get("clusterScore"),
            "linkEvidence": top.get("link") or {},
        })

    native_users = defaultdict(set)
    url_users = defaultdict(set)
    for row in provisional:
        pid = row["googlePlaceId"]
        url_users[row["officialUrl"]].add(pid)
        for source in row["independentSourceKeys"]:
            native_users[(source["provider"], source["providerId"])].add(pid)

    final = []
    for row in provisional:
        pid = row["googlePlaceId"]
        if len(url_users[row["officialUrl"]]) > 1:
            counts["official_detail_url_reuse_deferred"] += 1
            continue
        if any(len(native_users[(s["provider"], s["providerId"])]) > 1 for s in row["independentSourceKeys"]):
            counts["native_source_collision_deferred"] += 1
            continue
        final.append(row)
    counts["strong_detail_candidates"] = len(final)

    output = {
        "schemaVersion": 1,
        "ruleVersion": RULE_VERSION,
        "parserVersion": PARSER_VERSION,
        "policy": {
            "newGoogleApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "promotionPerformed": False,
            "privateHistoricalHintsDurable": False,
            "proximityOnlyBindingAllowed": False,
            "minimumIndependentProviders": 2,
            "publicOfficialPageRequired": True,
            "sameOriginOnly": True,
            "maxDepth": MAX_DEPTH,
            "rawHtmlPersisted": False,
            "robotsRespected": True,
            "restrictedAccessBypass": False,
        },
        "summary": {
            "strongCandidates": len(final),
            "counts": dict(sorted(counts.items())),
        },
        "candidates": sorted(final, key=lambda row: row["googlePlaceId"]),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
