#!/usr/bin/env python3
"""Collect explicit meal-budget ranges from retained/reviewed official pages.

This is a narrow, high-precision public-web collector. It only visits HTTPS pages already
retained as reviewed official identities, respects robots/access restrictions, rechecks
restaurant identity on the current page, and persists no raw HTML. Generic schema.org
`priceRange`, menu/course prices, single values and open-ended prices are not promoted.
A canonical claim requires an explicit lunch/dinner label, an explicit budget/price-band
cue, and a finite JPY range on the same small text window.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener

import collect_official_index_web_fields as official
import reconcile_private_official_web_consensus_v4 as web

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RULE_VERSION = "official-meal-budget-web-evidence-v1"
PARSER_VERSION = "official-meal-budget-web-v1"

MEAL_PATTERNS = {
    "lunch": re.compile(r"(?:ランチ|昼食|お昼|lunch)", re.I),
    "dinner": re.compile(r"(?:ディナー|夕食|晩ご飯|晩御飯|dinner)", re.I),
}
BUDGET_CUE = re.compile(
    r"(?:ご?予算|平均(?:予算|価格)|価格帯|料金(?:目安)?|budget|average\s+price|price\s+range)",
    re.I,
)
RANGE_RE = re.compile(
    r"(?P<whole>(?:[￥¥]\s*)?(?P<low>\d{2,6}(?:,\d{3})*)\s*(?:円)?\s*"
    r"(?:～|〜|~|－|–|—|-)\s*(?:[￥¥]\s*)?(?P<high>\d{2,6}(?:,\d{3})*)\s*(?:円)?)"
)


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def known_index(db):
    return {
        (pid, key)
        for pid, key in db.execute(
            "SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'"
        )
    }


def meal_missing(known, pid: str, meal: str) -> bool:
    if meal == "lunch":
        keys = ("budget.lunch.range", "budget.lunch.legacy_range")
    else:
        keys = ("budget.dinner.range", "budget.dinner.legacy_range")
    return not any((pid, key) in known for key in keys)


def compact_lines(text: str) -> list[str]:
    lines = []
    for raw in str(text or "").splitlines():
        value = re.sub(r"\s+", " ", raw).strip()
        if value:
            lines.append(value)
    return lines


def parse_range(match: re.Match, meal: str, snippet: str):
    whole = match.group("whole")
    if not any(token in whole for token in ("円", "￥", "¥")):
        return None
    low = int(match.group("low").replace(",", ""))
    high = int(match.group("high").replace(",", ""))
    if low < 100 or high < low or high > 200000:
        return None
    return {
        "currency": "JPY",
        "lower": low,
        "upper": high,
        "lowerInclusive": True,
        "upperInclusive": True,
        "evidenceType": "explicit_official_meal_budget_range",
        "meal": meal,
        "rawText": snippet[:180],
    }


def extract_meal_budgets(visible_text: str):
    lines = compact_lines(visible_text)
    found: dict[str, dict[tuple[int, int], tuple[dict, str]]] = {
        "lunch": {}, "dinner": {}
    }
    for index in range(len(lines)):
        window = " ".join(lines[index:index + 3])[:520]
        if not BUDGET_CUE.search(window):
            continue
        for meal, meal_re in MEAL_PATTERNS.items():
            if not meal_re.search(window):
                continue
            for match in RANGE_RE.finditer(window):
                snippet = re.sub(r"\s+", " ", window[max(0, match.start() - 80):match.end() + 80]).strip()
                parsed = parse_range(match, meal, snippet)
                if parsed is None:
                    continue
                found[meal][(parsed["lower"], parsed["upper"])] = (parsed, snippet[:180])

    claims = {}
    snippets = {}
    ambiguous = []
    for meal in ("lunch", "dinner"):
        values = list(found[meal].values())
        if len(values) == 1:
            claims[meal], snippets[meal] = values[0]
        elif len(values) > 1:
            ambiguous.append(meal)
    return claims, snippets, ambiguous


def fetch_budget_page(url: str):
    allowed, robots_note = web.may_fetch(url)
    if not allowed:
        return {"url": url, "ok": False, "status": None, "blocked": robots_note}
    request = Request(
        url,
        headers={
            "User-Agent": web.USER_AGENT,
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.3",
            "Accept-Language": "ja,en;q=0.8",
        },
    )
    try:
        with build_opener().open(request, timeout=12) as response:
            status = int(getattr(response, "status", 200) or 200)
            final_url = str(response.geturl() or url)
            if status in (401, 403, 429):
                return {"url": url, "ok": False, "status": status, "blocked": f"http_{status}"}
            if status < 200 or status >= 300:
                return {"url": url, "ok": False, "status": status, "blocked": f"http_{status}"}
            if web.normalize_url(final_url) is None:
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
        "finalUrl": final_url,
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
        "visibleText": visible,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--workers", type=int, default=6)
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
    reviewed_official = official.selected_official_bindings(db)
    known = known_index(db)
    db.close()

    counts = Counter()
    candidates = []
    seen_pid = set()
    for record in index_doc.get("records") or []:
        pid = str(record.get("googlePlaceId") or "").strip()
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
        missing = [meal for meal in ("lunch", "dinner") if meal_missing(known, pid, meal)]
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
    targets = targets[: max(0, args.max_pages)]
    counts["target_rows"] = len(targets)

    pages = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(10, args.workers))) as pool:
        future_map = {pool.submit(fetch_budget_page, target["pageUrl"]): target for target in targets}
        for future in concurrent.futures.as_completed(future_map):
            target = future_map[future]
            try:
                pages[target["pid"]] = future.result()
            except Exception as exc:
                pages[target["pid"]] = {
                    "url": target["pageUrl"], "ok": False,
                    "status": None, "blocked": type(exc).__name__,
                }

    rows = []
    field_counts = Counter()
    for target in targets:
        page = pages.get(target["pid"]) or {}
        if not page.get("ok"):
            counts[f"page_skip_{page.get('blocked') or 'unknown'}"] += 1
            continue
        counts["pages_ok"] += 1
        fact, identity_check = official.select_page_fact(page, target["name"])
        if not fact or identity_check.get("accepted") is not True:
            counts[identity_check.get("reason") or "page_identity_not_reconfirmed"] += 1
            continue
        claims, snippets, ambiguous = extract_meal_budgets(page.get("visibleText") or "")
        for meal in ambiguous:
            counts[f"ambiguous_{meal}_ranges"] += 1
        claims = {meal: claim for meal, claim in claims.items() if meal in target["missing"]}
        snippets = {meal: snippets[meal] for meal in claims}
        if not claims:
            counts["verified_page_without_explicit_missing_meal_budget"] += 1
            continue
        for meal in claims:
            field_counts[meal] += 1
        rows.append({
            "googlePlaceId": target["pid"],
            "sourceProvider": "official",
            "sourceProviderId": "official-budget:" + hashlib.sha256(target["pageUrl"].encode("utf-8")).hexdigest()[:20],
            "missingBefore": sorted(target["missing"]),
            "identityCheck": identity_check,
            "webEvidence": {
                "sourceUrl": page.get("url"),
                "finalUrl": page.get("finalUrl") or page.get("url"),
                "retrievedAt": page.get("retrievedAt"),
                "contentHash": page.get("contentHash"),
                "parserVersion": PARSER_VERSION,
                "rawHtmlPersisted": False,
                "retainedOfficialIndexCheckedAt": target.get("checkedAt"),
            },
            "budgetClaims": claims,
            "evidenceSnippets": snippets,
            "checkedAt": (page.get("retrievedAt") or web.utc_now())[:10],
        })
        counts["new_evidence_rows"] += 1

    output = {
        "schemaVersion": 1,
        "ruleVersion": RULE_VERSION,
        "parserVersion": PARSER_VERSION,
        "checkedAt": web.utc_now()[:10],
        "policy": {
            "paidDataApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "reviewedOfficialIdentityRequired": True,
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
            "fieldCounts": dict(sorted(field_counts.items())),
            "fetchCounts": dict(sorted(counts.items())),
        },
        "rows": sorted(rows, key=lambda row: row["googlePlaceId"]),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
