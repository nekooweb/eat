#!/usr/bin/env python3
"""Collect explicit practical yes/no facts from retained reviewed official pages.

Only already-publishable identities with a reviewed retained official-page binding are
eligible. The current HTTPS page must still identify the retained restaurant. Robots and
access restrictions are respected. Absence of a label never becomes False; only an
explicit local positive/negative phrase is emitted. Raw HTML is never persisted.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import re
import sqlite3
from collections import Counter
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener

import collect_official_index_web_fields as official
import reconcile_private_official_web_consensus_v4 as web

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RULE_VERSION = "official-practical-web-evidence-v1"
PARSER_VERSION = "official-practical-label-v1"

FIELD_RULES = {
    "practical.card_available": {
        "labels": r"(?:クレジット)?カード|カード決済|支払(?:い)?方法",
        "positive": r"利用可(?:能)?|使用可(?:能)?|対応|可\b|使えます|OK",
        "negative": r"利用不可|使用不可|不可\b|非対応|使えません|現金のみ",
    },
    "practical.parking_available": {
        "labels": r"駐車場|パーキング",
        "positive": r"あり|有り|有\b|完備|利用可(?:能)?|提携",
        "negative": r"なし|無し|無\b|ございません|ありません",
    },
    "practical.wifi_available": {
        "labels": r"Wi[-‐‑–— ]?Fi|wifi|無線LAN",
        "positive": r"あり|有り|有\b|利用可(?:能)?|無料|完備|対応",
        "negative": r"なし|無し|無\b|利用不可|非対応|ありません",
    },
    "practical.private_room_available": {
        "labels": r"個室",
        "positive": r"あり|有り|有\b|完備|ございます|利用可(?:能)?",
        "negative": r"なし|無し|無\b|ございません|ありません",
    },
    "practical.barrier_free": {
        "labels": r"バリアフリー|車いす|車椅子",
        "positive": r"対応|利用可(?:能)?|入店可(?:能)?|あり|有り|有\b",
        "negative": r"非対応|利用不可|入店不可|なし|無し|無\b",
    },
    "practical.children_welcome": {
        "labels": r"お子様|お子さま|子供|子ども|キッズ",
        "positive": r"歓迎|可\b|利用可(?:能)?|入店可(?:能)?|OK|対応",
        "negative": r"不可\b|利用不可|入店不可|ご遠慮|お断り",
    },
    "practical.english_menu": {
        "labels": r"英語メニュー|English menu|英語版メニュー",
        "positive": r"あり|有り|有\b|対応|利用可(?:能)?|ございます",
        "negative": r"なし|無し|無\b|非対応|ありません|ございません",
    },
}


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def fetch_visible_page(url: str) -> dict:
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

    html = web.decode_body(payload, content_type)
    visible = web.strip_html(html)
    return {
        "url": url,
        "finalUrl": final_url,
        "ok": True,
        "status": status,
        "robots": robots_note,
        "retrievedAt": web.utc_now(),
        "contentHash": hashlib.sha256(payload).hexdigest(),
        "title": web.title_from_html(html),
        "structuredFacts": web.jsonld_facts(html),
        "visibleAddress": web.visible_address(visible),
        "visibleHours": web.visible_hours(visible),
        "visibleCuisine": web.cuisine_signal(f"{web.title_from_html(html)} {visible[:8000]}"),
        "visibleText": visible,
    }


def explicit_claims(text: str):
    text = re.sub(r"[\t\r ]+", " ", text or "")
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.split("\n") if line.strip()]
    claims = {}
    snippets = {}
    for field_key, rule in FIELD_RULES.items():
        label_re = re.compile(rule["labels"], re.I)
        pos_re = re.compile(rule["positive"], re.I)
        neg_re = re.compile(rule["negative"], re.I)
        matches = []
        for i, line in enumerate(lines):
            if not label_re.search(line):
                continue
            context = " | ".join(lines[max(0, i - 1): min(len(lines), i + 2)])[:260]
            pos = bool(pos_re.search(context))
            neg = bool(neg_re.search(context))
            if pos == neg:
                continue
            matches.append((not neg, context))
        values = {value for value, _ in matches}
        if len(values) != 1:
            continue
        value = next(iter(values))
        evidence = next(snippet for v, snippet in matches if v == value)
        claims[field_key] = value
        snippets[field_key] = evidence[:180]
    return claims, snippets


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
    conflicts = {pid for pid, in db.execute("SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'")}
    reviewed = official.selected_official_bindings(db)
    known = {(pid, key) for pid, key in db.execute("SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'")}
    db.close()

    counts = Counter()
    targets = []
    seen_url = set()
    for record in index_doc.get("records") or []:
        pid = str(record.get("googlePlaceId") or "").strip()
        url = web.normalize_url(record.get("pageUrl"))
        name = str(record.get("name") or "").strip()
        if not pid or states.get(pid) not in ("verified", "source_matched"):
            continue
        if pid in conflicts or pid not in reviewed or not url:
            continue
        if all((pid, key) in known for key in FIELD_RULES):
            counts["already_practical_complete"] += 1
            continue
        if url in seen_url:
            counts["shared_page_url_deferred"] += 1
            continue
        seen_url.add(url)
        targets.append({"pid": pid, "name": name, "url": url})
    targets = targets[: max(0, args.max_pages)]
    counts["target_rows"] = len(targets)

    pages = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(12, args.workers))) as pool:
        futures = {pool.submit(fetch_visible_page, t["url"]): t for t in targets}
        for future in concurrent.futures.as_completed(futures):
            t = futures[future]
            try:
                pages[t["pid"]] = future.result()
            except Exception as exc:
                pages[t["pid"]] = {"url": t["url"], "ok": False, "blocked": type(exc).__name__}

    rows = []
    field_counts = Counter()
    for t in targets:
        page = pages.get(t["pid"]) or {}
        if not page.get("ok"):
            counts[f"page_skip_{page.get('blocked') or 'unknown'}"] += 1
            continue
        counts["pages_ok"] += 1
        fact, identity_check = official.select_page_fact(page, t["name"])
        if not fact or identity_check.get("accepted") is not True:
            counts[identity_check.get("reason") or "page_identity_not_reconfirmed"] += 1
            continue
        claims, snippets = explicit_claims(page.get("visibleText") or "")
        claims = {key: value for key, value in claims.items() if (t["pid"], key) not in known}
        snippets = {key: snippets[key] for key in claims}
        if not claims:
            counts["verified_page_without_missing_practical_claim"] += 1
            continue
        for key in claims:
            field_counts[key] += 1
        final_url = str(page.get("finalUrl") or page.get("url") or "")
        rows.append({
            "googlePlaceId": t["pid"],
            "identityCheck": identity_check,
            "webEvidence": {
                "sourceUrl": page.get("url"),
                "finalUrl": final_url,
                "retrievedAt": page.get("retrievedAt"),
                "contentHash": page.get("contentHash"),
                "parserVersion": PARSER_VERSION,
                "rawHtmlPersisted": False,
            },
            "practicalClaims": claims,
            "evidenceSnippets": snippets,
        })
        counts["new_evidence_rows"] += 1

    output = {
        "schemaVersion": 1,
        "ruleVersion": RULE_VERSION,
        "checkedAt": web.utc_now()[:10],
        "policy": {
            "paidDataApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "reviewedOfficialIdentityRequired": True,
            "explicitLabelRequired": True,
            "explicitPositiveOrNegativeRequired": True,
            "absenceNeverMeansFalse": True,
            "rawHtmlPersisted": False,
            "robotsRespected": True,
            "restrictedAccessBypass": False,
        },
        "summary": {"rows": len(rows), "fieldCounts": dict(sorted(field_counts.items())), "fetchCounts": dict(sorted(counts.items()))},
        "rows": sorted(rows, key=lambda row: row["googlePlaceId"]),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
