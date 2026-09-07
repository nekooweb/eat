#!/usr/bin/env python3
"""Collect explicit practical facts from a tiny same-origin official detail-page set."""
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
from urllib.parse import urljoin, urlparse
from urllib.request import Request, build_opener

import collect_official_detail_meal_budgets as detail
import collect_official_index_web_fields as official
import collect_official_practical_fields as practical
import reconcile_private_official_web_consensus_v4 as web

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RULE_VERSION = practical.RULE_VERSION
PARSER_VERSION = practical.PARSER_VERSION
MAX_DETAIL_LINKS = 2
PRACTICAL_HINT = re.compile(r"(?:店舗情報|shop|info|facility|設備|サービス|service|access|アクセス|faq|よくある|guide|ご案内|利用案内)", re.I)
EXCLUDE_HINT = re.compile(r"(?:menu|メニュー|お品書き|course|コース|recruit|求人|privacy|policy|採用|予約|reserve|instagram|facebook|twitter|x\.com)", re.I)


def host_key(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def discover_links(html: str, page_url: str):
    parser = detail.LinkParser()
    try:
        parser.feed(html)
    except Exception:
        return []
    base_host = host_key(page_url)
    found = {}
    for href, label in parser.links:
        href = str(href or "").strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        absolute = web.normalize_url(urljoin(page_url, href))
        if not absolute or host_key(absolute) != base_host or absolute.rstrip("/") == page_url.rstrip("/"):
            continue
        signal = f"{label} {urlparse(absolute).path}"
        if EXCLUDE_HINT.search(signal) or not PRACTICAL_HINT.search(signal):
            continue
        score = 10 if re.search(r"(?:facility|設備|店舗情報|shop|info|サービス|service)", signal, re.I) else 6
        if re.search(r"(?:access|アクセス|faq|よくある)", signal, re.I):
            score += 3
        old = found.get(absolute)
        if old is None or score > old[0]:
            found[absolute] = (score, re.sub(r"\s+", " ", label).strip()[:80])
    ranked = sorted(((u,s,l) for u,(s,l) in found.items()), key=lambda x: (-x[1], len(urlparse(x[0]).path), x[0]))
    return ranked[:MAX_DETAIL_LINKS]


def fetch_home(url: str):
    allowed, robots_note = web.may_fetch(url)
    if not allowed:
        return {"url": url, "ok": False, "blocked": robots_note}
    req = Request(url, headers={"User-Agent": web.USER_AGENT,"Accept":"text/html,application/xhtml+xml;q=0.9,*/*;q=0.3","Accept-Language":"ja,en;q=0.8"})
    try:
        with build_opener().open(req, timeout=12) as response:
            status = int(getattr(response, "status", 200) or 200)
            final_url = str(response.geturl() or url)
            content_type = str(response.headers.get("Content-Type") or "")
            if status in (401,403,429): return {"url":url,"ok":False,"status":status,"blocked":f"http_{status}"}
            if status < 200 or status >= 300 or "html" not in content_type.casefold(): return {"url":url,"ok":False,"status":status,"blocked":"not_html_success"}
            normalized = web.normalize_url(final_url)
            if not normalized: return {"url":url,"ok":False,"status":status,"blocked":"redirect_to_blocked_host"}
            payload = response.read(web.MAX_BYTES + 1)
            if len(payload) > web.MAX_BYTES: return {"url":url,"ok":False,"status":status,"blocked":"page_too_large"}
    except HTTPError as exc:
        return {"url":url,"ok":False,"status":exc.code,"blocked":f"http_{exc.code}"}
    except (URLError,TimeoutError) as exc:
        return {"url":url,"ok":False,"status":None,"blocked":type(exc).__name__}
    except Exception as exc:
        return {"url":url,"ok":False,"status":None,"blocked":type(exc).__name__}
    html = web.decode_body(payload, content_type)
    visible = web.strip_html(html)
    title = web.title_from_html(html)
    return {"url":url,"finalUrl":normalized,"ok":True,"status":status,"robots":robots_note,"retrievedAt":web.utc_now(),"contentHash":hashlib.sha256(payload).hexdigest(),"title":title,"structuredFacts":web.jsonld_facts(html),"visibleAddress":web.visible_address(visible),"visibleHours":web.visible_hours(visible),"visibleCuisine":web.cuisine_signal(f"{title} {visible[:8000]}"),"detailLinks":discover_links(html,normalized)}


def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--database",type=Path,required=True); ap.add_argument("--output",type=Path,required=True); ap.add_argument("--workers",type=int,default=6); ap.add_argument("--max-restaurants",type=int,default=250); args=ap.parse_args()
    index=json.loads((DATA/"official_candidate_index.json").read_text(encoding="utf-8"))
    db=sqlite3.connect(args.database)
    states=dict(db.execute("SELECT place_id,identity_state FROM catalog_entries")); conflicts={p for p, in db.execute("SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'")}; reviewed=official.selected_official_bindings(db); known={(p,k) for p,k in db.execute("SELECT place_id,field_key FROM field_resolutions WHERE resolution_state='known'")}; db.close()
    counts=Counter(); candidates=[]; seen=set()
    for r in index.get("records") or []:
        pid=str(r.get("googlePlaceId") or "").strip(); url=web.normalize_url(r.get("pageUrl")); name=str(r.get("name") or "").strip()
        if not pid or pid in seen: continue
        seen.add(pid)
        if states.get(pid) not in ("verified","source_matched") or pid in conflicts or pid not in reviewed or not url: continue
        if all((pid,k) in known for k in practical.FIELD_RULES): counts["already_practical_complete"]+=1; continue
        candidates.append({"pid":pid,"name":name,"url":url})
    url_places=defaultdict(set)
    for t in candidates: url_places[t["url"]].add(t["pid"])
    targets=[t for t in candidates if len(url_places[t["url"]])==1][:max(0,args.max_restaurants)]; counts["target_restaurants"]=len(targets)
    homes={}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(10,args.workers))) as pool:
        fut={pool.submit(fetch_home,t["url"]):t for t in targets}
        for f in concurrent.futures.as_completed(fut):
            t=fut[f]
            try: homes[t["pid"]]=f.result()
            except Exception as exc: homes[t["pid"]]={"url":t["url"],"ok":False,"blocked":type(exc).__name__}
    jobs=[]
    for t in targets:
        home=homes.get(t["pid"]) or {}
        if not home.get("ok"): counts[f"home_skip_{home.get('blocked') or 'unknown'}"]+=1; continue
        counts["homes_ok"]+=1
        fact,check=official.select_page_fact(home,t["name"])
        if not fact or check.get("accepted") is not True: counts[check.get("reason") or "home_identity_not_reconfirmed"]+=1; continue
        counts["homes_identity_verified"]+=1
        links=home.get("detailLinks") or []
        if not links: counts["verified_home_without_practical_detail_link"]+=1; continue
        for u,score,label in links[:MAX_DETAIL_LINKS]: jobs.append((t,home,check,u,score,label))
    counts["detail_links_selected"]=len(jobs)
    pages={}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(10,args.workers))) as pool:
        fut={pool.submit(practical.fetch_visible_page,j[3]):j for j in jobs}
        for f in concurrent.futures.as_completed(fut):
            j=fut[f]; key=(j[0]["pid"],j[3])
            try: pages[key]=f.result()
            except Exception as exc: pages[key]={"url":j[3],"ok":False,"blocked":type(exc).__name__}
    rows=[]; field_counts=Counter()
    for t,home,check,u,score,label in jobs:
        page=pages.get((t["pid"],u)) or {}
        if not page.get("ok"): counts[f"detail_skip_{page.get('blocked') or 'unknown'}"]+=1; continue
        counts["detail_pages_ok"]+=1
        final=str(page.get("finalUrl") or page.get("url") or "")
        if host_key(final)!=host_key(str(home.get("finalUrl") or home.get("url") or "")): counts["detail_cross_origin_redirect"]+=1; continue
        claims,snips=practical.explicit_claims(page.get("visibleText") or "")
        claims={k:v for k,v in claims.items() if (t["pid"],k) not in known}; snips={k:snips[k] for k in claims}
        if not claims: counts["detail_without_missing_practical_claim"]+=1; continue
        for k in claims: field_counts[k]+=1
        rows.append({"googlePlaceId":t["pid"],"identityCheck":check,"webEvidence":{"sourceUrl":page.get("url"),"finalUrl":final,"retrievedAt":page.get("retrievedAt"),"contentHash":page.get("contentHash"),"parserVersion":PARSER_VERSION,"rawHtmlPersisted":False,"sameOriginDetailPage":True,"identitySupportUrl":home.get("finalUrl") or home.get("url"),"identitySupportContentHash":home.get("contentHash"),"detailLinkLabel":label,"detailLinkScore":score},"practicalClaims":claims,"evidenceSnippets":snips})
    out={"schemaVersion":1,"ruleVersion":RULE_VERSION,"checkedAt":web.utc_now()[:10],"policy":{"paidDataApiCalls":0,"googleDisplayPayloadPersisted":False,"reviewedOfficialIdentityRequired":True,"explicitLabelRequired":True,"explicitPositiveOrNegativeRequired":True,"absenceNeverMeansFalse":True,"rawHtmlPersisted":False,"robotsRespected":True,"restrictedAccessBypass":False},"summary":{"rows":len(rows),"fieldCounts":dict(sorted(field_counts.items())),"fetchCounts":dict(sorted(counts.items()))},"rows":sorted(rows,key=lambda r:(r["googlePlaceId"],r["webEvidence"]["finalUrl"]))}
    args.output.parent.mkdir(parents=True,exist_ok=True); args.output.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8"); print(json.dumps({"status":"pass",**out["summary"]},ensure_ascii=False,sort_keys=True))

if __name__=="__main__": main()
