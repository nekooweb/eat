#!/usr/bin/env python3
"""Use public official pages as a third evidence layer for ID-only recovery.

The frozen Google Place ID and historical Google display fields are private linkage hints
only. Durable output contains independent source rows plus facts parsed from a public
HTTPS page already referenced by Overture/OSM source data. No Google API is called.

Access policy:
- HTTPS only; aggregator/social/Google hosts are excluded.
- robots.txt is checked before page retrieval; explicit disallow / 401 / 403 / 429 is not
  bypassed or retried.
- no CAPTCHA/login bypass.
- raw HTML is never written to durable output; only parsed facts + SHA-256 are retained.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import html as html_lib
import json
import re
import sqlite3
import threading
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, build_opener
from urllib.robotparser import RobotFileParser

import reconcile_private_google_hints as base
import reconcile_private_address_consensus_v2 as v2
import reconcile_private_multisource_consensus_v3 as v3

RULE_VERSION = "private-official-web-consensus-v4"
PARSER_VERSION = "official-web-jsonld-v1"
USER_AGENT = "eat-data-maintenance/1.1 (+https://github.com/nekooweb/eat)"
MAX_BYTES = 3_000_000
BLOCKED_HOST_FRAGMENTS = (
    "google.", "google.com", "maps.google", "tabelog.com", "hotpepper.jp",
    "gnavi.co.jp", "retty.me", "tripadvisor.", "yelp.", "openstreetmap.org",
    "facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com",
    "youtube.com", "youtu.be", "line.me", "linktr.ee", "ubereats.com",
    "menu.jp", "gurunavi.com",
)
FOOD_TYPES = {
    "restaurant", "foodestablishment", "cafeorcoffeeshop", "barorpub",
    "bakery", "fastfoodrestaurant", "icecreamshop", "winery",
}

_ROBOTS_LOCK = threading.Lock()
_ROBOTS_CACHE: dict[str, tuple[bool, RobotFileParser | None, str]] = {}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def host_of(url: str) -> str:
    try:
        p = urlparse(str(url or ""))
    except Exception:
        return ""
    if p.scheme != "https" or not p.hostname:
        return ""
    return p.hostname.lower().removeprefix("www.")


def allowed_host(host: str) -> bool:
    return bool(host) and not any(fragment in host for fragment in BLOCKED_HOST_FRAGMENTS)


def normalize_url(value) -> str | None:
    value = str(value or "").strip()
    host = host_of(value)
    if not host or not allowed_host(host):
        return None
    p = urlparse(value)
    clean = p._replace(fragment="").geturl()
    return clean


def flatten_strings(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, (int, float)):
        return [str(value)]
    if isinstance(value, list):
        out = []
        for item in value:
            out.extend(flatten_strings(item))
        return out
    if isinstance(value, dict):
        out = []
        for item in value.values():
            out.extend(flatten_strings(item))
        return out
    return []


def candidate_urls(row: dict) -> list[str]:
    values = []
    values.extend(flatten_strings(row.get("websites")))
    raw = row.get("raw") or {}
    for key in ("websites", "website", "contactWebsite", "url"):
        values.extend(flatten_strings(raw.get(key)))
    out = []
    for value in values:
        url = normalize_url(value)
        if url and url not in out:
            out.append(url)
    return out[:3]


def source_phones(row: dict) -> set[str]:
    raw = row.get("raw") or {}
    values = flatten_strings(raw.get("phones")) + flatten_strings(raw.get("phone"))
    return {phone_digits(v) for v in values if phone_digits(v)}


def phone_digits(value) -> str:
    digits = re.sub(r"\D+", "", str(value or ""))
    if digits.startswith("81") and len(digits) >= 10:
        digits = "0" + digits[2:]
    return digits[-10:] if len(digits) >= 10 else digits


def robots_for(url: str) -> tuple[bool, RobotFileParser | None, str]:
    p = urlparse(url)
    origin = f"{p.scheme}://{p.netloc}"
    with _ROBOTS_LOCK:
        if origin in _ROBOTS_CACHE:
            return _ROBOTS_CACHE[origin]
    robots_url = urljoin(origin + "/", "robots.txt")
    req = Request(robots_url, headers={"User-Agent": USER_AGENT, "Accept": "text/plain,*/*;q=0.2"})
    try:
        with build_opener().open(req, timeout=7) as response:
            status = int(getattr(response, "status", 200) or 200)
            body = response.read(500_000).decode("utf-8", errors="replace")
        if status == 200:
            rp = RobotFileParser()
            rp.set_url(robots_url)
            rp.parse(body.splitlines())
            result = (True, rp, "robots_loaded")
        elif status == 404:
            result = (True, None, "robots_missing_404")
        else:
            result = (False, None, f"robots_http_{status}")
    except HTTPError as exc:
        if exc.code == 404:
            result = (True, None, "robots_missing_404")
        elif exc.code in (401, 403, 429):
            result = (False, None, f"robots_http_{exc.code}")
        else:
            result = (False, None, f"robots_http_{exc.code}")
    except Exception as exc:
        result = (False, None, f"robots_unavailable:{type(exc).__name__}")
    with _ROBOTS_LOCK:
        _ROBOTS_CACHE[origin] = result
    return result


def may_fetch(url: str) -> tuple[bool, str]:
    ok, rp, note = robots_for(url)
    if not ok:
        return False, note
    if rp is not None and not rp.can_fetch(USER_AGENT, url):
        return False, "robots_disallow"
    return True, note


def decode_body(payload: bytes, content_type: str) -> str:
    m = re.search(r"charset=([A-Za-z0-9._-]+)", content_type or "", re.I)
    encodings = [m.group(1)] if m else []
    encodings += ["utf-8", "shift_jis", "cp932"]
    for encoding in encodings:
        try:
            return payload.decode(encoding)
        except Exception:
            pass
    return payload.decode("utf-8", errors="replace")


def strip_html(value: str) -> str:
    text = re.sub(r"<script\b[^>]*>[\s\S]*?</script>", " ", value, flags=re.I)
    text = re.sub(r"<style\b[^>]*>[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<(?:br|p|div|li|tr|th|td|h[1-6]|section|article|dt|dd)\b[^>]*>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html_lib.unescape(text)
    text = re.sub(r"[\t\r ]+", " ", text)
    text = re.sub(r"\n\s+", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def title_from_html(value: str) -> str:
    m = re.search(r"<title\b[^>]*>([\s\S]*?)</title>", value, re.I)
    return strip_html(m.group(1))[:240] if m else ""


def address_value(value) -> str:
    if isinstance(value, str):
        return value.strip()
    if not isinstance(value, dict):
        return ""
    return " ".join(
        str(value.get(key) or "").strip()
        for key in ("postalCode", "addressRegion", "addressLocality", "streetAddress")
        if str(value.get(key) or "").strip()
    )


def opening_values(node: dict) -> list[str]:
    out = []
    direct = node.get("openingHours")
    if isinstance(direct, str):
        out.append(direct)
    elif isinstance(direct, list):
        out.extend(str(x) for x in direct if x)
    specs = node.get("openingHoursSpecification")
    if isinstance(specs, dict):
        specs = [specs]
    for spec in specs or []:
        if not isinstance(spec, dict):
            continue
        day = spec.get("dayOfWeek")
        if isinstance(day, list):
            day = ",".join(str(x).rsplit("/", 1)[-1] for x in day)
        elif day:
            day = str(day).rsplit("/", 1)[-1]
        value = " ".join(x for x in [str(day or "").strip(), f"{spec.get('opens','')}-{spec.get('closes','')}".strip("-")] if x)
        if value:
            out.append(value)
    return list(dict.fromkeys(out))[:20]


def jsonld_facts(value: str) -> list[dict]:
    facts = []
    pattern = re.compile(r"<script\b[^>]*type=[\"']application/ld\+json[\"'][^>]*>([\s\S]*?)</script>", re.I)
    for match in pattern.finditer(value):
        raw = html_lib.unescape(match.group(1)).strip()
        try:
            parsed = json.loads(raw)
        except Exception:
            continue
        stack = list(parsed) if isinstance(parsed, list) else [parsed]
        seen = 0
        while stack and seen < 100:
            node = stack.pop(0)
            seen += 1
            if not isinstance(node, dict):
                continue
            graph = node.get("@graph")
            if isinstance(graph, list):
                stack.extend(graph)
            types = node.get("@type")
            if isinstance(types, str):
                types = [types]
            types = [str(x).rsplit("/", 1)[-1] for x in (types or [])]
            lower_types = {x.casefold() for x in types}
            if types and not (lower_types & FOOD_TYPES or "localbusiness" in lower_types):
                continue
            geo = node.get("geo") if isinstance(node.get("geo"), dict) else {}
            lat = geo.get("latitude")
            lng = geo.get("longitude")
            try:
                geo_value = {"lat": float(lat), "lng": float(lng)} if lat is not None and lng is not None else None
            except Exception:
                geo_value = None
            cuisine = node.get("servesCuisine")
            if isinstance(cuisine, list):
                cuisine = [str(x) for x in cuisine if x][:12]
            elif cuisine is not None:
                cuisine = str(cuisine)
            fact = {
                "schemaTypes": types[:8],
                "name": str(node.get("name") or "").strip()[:240],
                "address": address_value(node.get("address"))[:320],
                "openingHoursRaw": opening_values(node),
                "cuisine": cuisine,
                "priceRange": str(node.get("priceRange") or "").strip()[:140],
                "telephone": str(node.get("telephone") or "").strip()[:80],
                "geo": geo_value,
            }
            if any(fact.get(k) for k in ("name", "address", "openingHoursRaw", "cuisine", "priceRange", "telephone", "geo")):
                facts.append(fact)
                if len(facts) >= 40:
                    return facts
    return facts


def visible_address(text: str) -> str:
    for pattern in (
        r"(?:〒?\d{3}-?\d{4}\s*)?東京都\s*(?:千代田区|文京区|中央区|新宿区|台東区)[^\n]{2,180}",
        r"(?:〒?\d{3}-?\d{4}\s*)?(?:千代田区|文京区|中央区|新宿区|台東区)[^\n]{2,180}",
    ):
        m = re.search(pattern, text)
        if m:
            return re.sub(r"\s+", " ", m.group(0)).strip()[:260]
    return ""


def visible_hours(text: str) -> str:
    idx = text.find("営業時間")
    if idx < 0:
        return ""
    segment = text[idx:idx + 900]
    if not re.search(r"\d{1,2}:\d{2}", segment):
        return ""
    for stop in ("定休日", "住所", "アクセス", "お問い合わせ", "電話", "TEL"):
        at = segment.find(stop, 4)
        if at > 0:
            segment = segment[:at]
    return re.sub(r"\s+", " ", segment).strip()[:600]


def cuisine_signal(text: str):
    rules = (
        (r"カフェ|喫茶|コーヒー|珈琲", "咖啡"), (r"居酒屋", "居酒屋"),
        (r"ラーメン|中華そば", "拉面"), (r"そば|蕎麦", "荞麦面"), (r"うどん", "乌冬"),
        (r"カレー|カリー", "咖喱"), (r"中華|中国料理|四川|広東|餃子", "中华"),
        (r"インド|ネパール|ビリヤニ", "印度菜"), (r"イタリアン|パスタ|ピザ", "意大利菜"),
        (r"韓国|サムギョプサル", "韩国菜"), (r"焼肉|ホルモン", "烤肉"),
        (r"寿司|鮨", "寿司"), (r"焼き鳥|やきとり|鳥料理", "烤鸡"),
        (r"とんかつ|豚カツ", "炸猪排"), (r"ステーキ|ハンバーグ", "牛排"),
        (r"天ぷら|天婦羅", "天妇罗"), (r"バー|バル", "酒吧"),
        (r"パン|ベーカリー", "面包・烘焙"), (r"スイーツ|ケーキ|甘味", "甜品"),
        (r"魚介|海鮮", "海鲜"), (r"定食|食堂", "食堂"),
        (r"洋食|フレンチ|ビストロ", "西餐"), (r"日本料理|和食|割烹|懐石|おでん", "日式"),
    )
    for pattern, label in rules:
        if re.search(pattern, text):
            return label
    return None


def fetch_page(url: str) -> dict:
    allowed, robots_note = may_fetch(url)
    if not allowed:
        return {"url": url, "ok": False, "status": None, "blocked": robots_note}
    req = Request(url, headers={
        "User-Agent": USER_AGENT,
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
            if not allowed_host(host_of(final_url)):
                return {"url": url, "ok": False, "status": status, "blocked": "redirected_to_blocked_host"}
            payload = response.read(MAX_BYTES + 1)
            if len(payload) > MAX_BYTES:
                return {"url": url, "ok": False, "status": status, "blocked": "page_too_large"}
    except HTTPError as exc:
        return {"url": url, "ok": False, "status": exc.code, "blocked": f"http_{exc.code}"}
    except (URLError, TimeoutError) as exc:
        return {"url": url, "ok": False, "status": None, "blocked": type(exc).__name__}
    except Exception as exc:
        return {"url": url, "ok": False, "status": None, "blocked": type(exc).__name__}

    text_html = decode_body(payload, content_type)
    visible = strip_html(text_html)
    facts = jsonld_facts(text_html)
    title = title_from_html(text_html)
    fallback_address = visible_address(visible)
    fallback_hours = visible_hours(visible)
    fallback_cuisine = cuisine_signal(f"{title} {visible[:8000]}")
    return {
        "url": url,
        "finalUrl": final_url,
        "ok": True,
        "status": status,
        "robots": robots_note,
        "retrievedAt": utc_now(),
        "contentHash": hashlib.sha256(payload).hexdigest(),
        "title": title,
        "structuredFacts": facts,
        "visibleAddress": fallback_address,
        "visibleHours": fallback_hours,
        "visibleCuisine": fallback_cuisine,
    }


def structured_address_support(page_address: str, member_address: str) -> bool:
    pn = v2.address_numbers(page_address)
    mn = v2.address_numbers(member_address)
    if len(pn) < 2 or len(mn) < 2 or pn != mn:
        return False
    pp, mp = base.postcode(page_address), base.postcode(member_address)
    pw, mw = v2.ward(page_address), v2.ward(member_address)
    return bool((pp and mp and pp == mp) or (pw and mw and pw == mw) or v2.address_similarity(page_address, member_address) >= 0.82)


def fact_match(fact: dict, page: dict, members: list[tuple[dict, dict]]) -> dict:
    names = [str(fact.get("name") or "").strip(), str(page.get("title") or "").strip()]
    names = [x for x in names if x]
    page_address = str(fact.get("address") or page.get("visibleAddress") or "").strip()
    page_phone = phone_digits(fact.get("telephone"))
    page_geo = fact.get("geo") if isinstance(fact.get("geo"), dict) else None
    max_name = 0.0
    address_support = 0
    phone_support = 0
    min_geo = None
    for row, _ev in members:
        if names:
            max_name = max(max_name, *(base.similarity(name, row.get("name")) for name in names))
        if page_address and structured_address_support(page_address, str(row.get("address") or "")):
            address_support += 1
        if page_phone and page_phone in source_phones(row):
            phone_support += 1
        if page_geo and isinstance(page_geo.get("lat"), (int, float)) and isinstance(page_geo.get("lng"), (int, float)):
            dist = base.haversine(page_geo["lat"], page_geo["lng"], row["lat"], row["lng"])
            min_geo = dist if min_geo is None else min(min_geo, dist)
    identity_rule = None
    if max_name >= 0.86 and address_support >= 1:
        identity_rule = "official_name_plus_structured_address"
    elif max_name >= 0.92 and phone_support >= 1:
        identity_rule = "official_name_plus_phone"
    elif max_name >= 0.94 and min_geo is not None and min_geo <= 45:
        identity_rule = "official_name_plus_geo"
    score = 0.55 * max_name + min(0.20, 0.10 * address_support) + min(0.15, 0.15 * phone_support)
    if min_geo is not None:
        score += max(0.0, 0.10 * (1.0 - min(min_geo, 60.0) / 60.0))
    return {
        "accepted": identity_rule is not None,
        "identityRule": identity_rule,
        "score": round(score, 6),
        "maxSourceNameSimilarity": round(max_name, 6),
        "addressSupportingMembers": address_support,
        "phoneSupportingMembers": phone_support,
        "minimumGeoDistanceMeters": round(min_geo, 3) if min_geo is not None else None,
        "pageAddress": page_address,
    }


def best_page_fact(page: dict, members: list[tuple[dict, dict]]):
    facts = list(page.get("structuredFacts") or [])
    if not facts:
        facts = [{
            "schemaTypes": [], "name": page.get("title") or "",
            "address": page.get("visibleAddress") or "", "openingHoursRaw": [],
            "cuisine": page.get("visibleCuisine"), "priceRange": "", "telephone": "", "geo": None,
        }]
    scored = []
    for fact in facts:
        match = fact_match(fact, page, members)
        if match["accepted"]:
            scored.append((match["score"], match, fact))
    scored.sort(key=lambda x: (-x[0], -x[1]["maxSourceNameSimilarity"], -x[1]["addressSupportingMembers"]))
    return scored[0][1:] if scored else (None, None)


def component_urls(members: list[tuple[dict, dict]]) -> list[str]:
    out = []
    for row, _ev in v3.best_per_provider(members):
        for url in candidate_urls(row):
            if url not in out:
                out.append(url)
    return out[:5]


def component_quality(members: list[tuple[dict, dict]]) -> dict:
    metrics = v3.cluster_metrics(members)
    return {k: v for k, v in metrics.items() if k != "members"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--initial", type=Path, required=True)
    ap.add_argument("--retry", type=Path, required=True)
    ap.add_argument("--private-output", type=Path, required=True)
    ap.add_argument("--durable-output", type=Path, required=True)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--max-pages", type=int, default=900)
    args = ap.parse_args()

    db = sqlite3.connect(args.database)
    id_only = {row[0] for row in db.execute("SELECT place_id FROM catalog_entries WHERE identity_state='id_only'")}
    conflict_places = {row[0] for row in db.execute("SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'")}
    bound = defaultdict(set)
    for provider, provider_id, pid in db.execute(
        """SELECT sr.provider,sr.provider_id,sb.place_id
           FROM source_bindings sb JOIN source_records sr ON sr.source_record_id=sb.source_record_id
           WHERE sb.binding_state IN ('reviewed','conflict')"""
    ):
        bound[(provider, str(provider_id))].add(pid)
    db.close()

    hints = base.load_google_hints(args.initial, args.retry)
    provider_rows = {
        "Hot Pepper": base.hotpepper_rows(),
        "OpenStreetMap": base.osm_rows(),
        "Overture Maps": base.overture_rows(),
    }
    grids = {provider: base.build_grid(rows) for provider, rows in provider_rows.items()}
    contexts = []
    counts = Counter()

    for pid in sorted(id_only):
        hint = hints.get(pid)
        if not hint:
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
            local.sort(key=lambda item: (item[1]["distanceMeters"], -item[1]["nameSimilarity"], str(item[0]["providerId"])))
            candidates.extend(local[:18])
        components = v3.componentize(candidates)
        if not components:
            continue
        counts["has_multisource_cluster"] += 1
        for index, component in enumerate(components):
            members = v3.best_per_provider(component)
            urls = component_urls(members)
            if not urls:
                continue
            contexts.append({
                "pid": pid,
                "componentIndex": index,
                "members": members,
                "urls": urls,
                "cluster": component_quality(members),
            })

    unique_urls = []
    for context in contexts:
        for url in context["urls"]:
            if url not in unique_urls:
                unique_urls.append(url)
    if len(unique_urls) > args.max_pages:
        unique_urls = unique_urls[:args.max_pages]
    allowed_urls = set(unique_urls)
    counts["candidate_components_with_websites"] = sum(1 for c in contexts if any(u in allowed_urls for u in c["urls"]))
    counts["unique_candidate_pages"] = len(unique_urls)

    pages = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(12, args.workers))) as pool:
        future_map = {pool.submit(fetch_page, url): url for url in unique_urls}
        for future in concurrent.futures.as_completed(future_map):
            url = future_map[future]
            try:
                pages[url] = future.result()
            except Exception as exc:
                pages[url] = {"url": url, "ok": False, "status": None, "blocked": type(exc).__name__}

    counts["pages_ok"] = sum(1 for p in pages.values() if p.get("ok"))
    for page in pages.values():
        if not page.get("ok"):
            counts[f"page_skip_{page.get('blocked') or 'unknown'}"] += 1

    by_pid = defaultdict(list)
    for context in contexts:
        page_matches = []
        for url in context["urls"]:
            if url not in allowed_urls:
                continue
            page = pages.get(url) or {}
            if not page.get("ok"):
                continue
            match, fact = best_page_fact(page, context["members"])
            if match and fact:
                page_matches.append((match["score"], match, fact, page))
        if not page_matches:
            continue
        page_matches.sort(key=lambda item: (-item[0], -item[1]["maxSourceNameSimilarity"], item[3]["finalUrl"]))
        top = page_matches[0]
        by_pid[context["pid"]].append((top[0], context, top[1], top[2], top[3]))

    private_rows = []
    durable_rows = []
    used_native = set()
    for pid, matches in sorted(by_pid.items()):
        matches.sort(key=lambda item: (-item[0], -item[2]["maxSourceNameSimilarity"], item[1]["componentIndex"]))
        top = matches[0]
        runner = matches[1][0] if len(matches) > 1 else 0.0
        margin = top[0] - runner
        if len(matches) > 1 and margin < 0.10:
            counts["ambiguous_official_confirmed_components"] += 1
            continue
        score, context, match, fact, page = top
        members = context["members"]
        page_host = host_of(page.get("finalUrl") or page.get("url"))
        matching_website_rows = [
            item for item in members
            if any(host_of(u) == page_host for u in candidate_urls(item[0]))
        ]
        choices = matching_website_rows or members
        choices = [item for item in choices if v3.native_key(item[0]) not in used_native]
        if not choices:
            counts["native_source_reuse_deferred"] += 1
            continue
        chosen, chosen_ev = sorted(
            choices,
            key=lambda item: (
                0 if any(host_of(u) == page_host for u in candidate_urls(item[0])) else 1,
                v3.PROVIDER_PRIORITY.get(item[0]["provider"], 9),
                -item[1]["nameSimilarity"],
                item[1]["distanceMeters"],
            ),
        )[0]
        native = v3.native_key(chosen)
        used_native.add(native)

        opening = list(fact.get("openingHoursRaw") or [])
        if not opening and page.get("visibleHours"):
            opening = [page["visibleHours"]]
        cuisine = fact.get("cuisine") or page.get("visibleCuisine")
        page_address = fact.get("address") or page.get("visibleAddress") or ""
        evidence = {
            "sourceUrl": page.get("url"),
            "finalUrl": page.get("finalUrl"),
            "retrievedAt": page.get("retrievedAt"),
            "contentHash": page.get("contentHash"),
            "parserVersion": PARSER_VERSION,
            "identityRule": match["identityRule"],
            "name": fact.get("name") or page.get("title") or "",
            "address": page_address,
            "openingHoursRaw": opening,
            "cuisine": cuisine,
            "priceRange": fact.get("priceRange") or "",
            "telephone": fact.get("telephone") or "",
            "geo": fact.get("geo"),
        }
        supporting = [
            {
                "provider": row["provider"], "providerId": str(row["providerId"]),
                "name": row.get("name") or "", "address": row.get("address") or "",
                "lat": row["lat"], "lng": row["lng"],
            }
            for row, _ev in members
        ]
        private_rows.append({
            "googlePlaceId": pid,
            "officialUrl": page.get("finalUrl"),
            "match": match,
            "clusterScore": context["cluster"].get("score"),
            "componentMargin": round(margin, 6),
            "providers": context["cluster"].get("providers"),
        })
        durable = {
            "googlePlaceId": pid,
            **v3.durable_source_row(chosen),
            "verification": "reviewed_independent_multisource_plus_public_official_page",
            "matchLevel": RULE_VERSION,
            "officialEvidence": evidence,
            "independentConsensus": {
                "providerCount": len({row["provider"] for row, _ev in members}),
                "providers": sorted({row["provider"] for row, _ev in members}),
                "supportingSources": supporting,
                "officialPageScore": round(score, 6),
                "officialPageComponentMargin": round(margin, 6),
            },
            "sourceCheckedAt": (page.get("retrievedAt") or utc_now())[:10],
        }
        if opening:
            durable["openingHoursRaw"] = opening
        if page_address and not durable.get("address"):
            durable["address"] = page_address
        durable_rows.append(durable)
        counts[match["identityRule"]] += 1

    private_doc = {
        "schemaVersion": 1,
        "ruleVersion": RULE_VERSION,
        "policy": {
            "newGoogleApiCalls": 0,
            "privateGoogleHintsOnly": True,
            "rawHtmlPersisted": False,
            "robotsRespected": True,
            "restrictedAccessBypass": False,
        },
        "summary": dict(sorted(counts.items())),
        "selected": len(private_rows),
        "rows": private_rows,
    }
    durable_doc = {
        "schemaVersion": 1,
        "ruleVersion": RULE_VERSION,
        "policy": {
            "newGoogleApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "durableFieldsIndependentSourceOnly": True,
            "proximityOnlyBindingAllowed": False,
            "minimumIndependentProviders": 2,
            "publicOfficialPageRequired": True,
            "rawHtmlPersisted": False,
            "robotsRespected": True,
        },
        "summary": {
            "rows": len(durable_rows),
            "providers": dict(sorted(Counter(r["provider"] for r in durable_rows).items())),
            **dict(sorted(counts.items())),
        },
        "rows": sorted(durable_rows, key=lambda row: row["googlePlaceId"]),
    }
    args.private_output.parent.mkdir(parents=True, exist_ok=True)
    args.durable_output.parent.mkdir(parents=True, exist_ok=True)
    args.private_output.write_text(json.dumps(private_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.durable_output.write_text(json.dumps(durable_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", "ruleVersion": RULE_VERSION, **durable_doc["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
