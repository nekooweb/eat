#!/usr/bin/env python3
"""Compare a fresh public OSM rich-tag query with the retained flattened OSM snapshot.

One bounded Overpass request is made for the frozen TOKYO/地区1️⃣ scope. To keep the
public query cheap in dense central Tokyo, Overpass receives a bounding box and the
exact 1,200 m circular scope is restored locally with Haversine filtering. This
diagnostic never writes the master and never calls a paid data API.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import time
from collections import Counter
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

import retained_osm_identity as retained

CENTER_LAT = 35.6959
CENTER_LNG = 139.7576
RADIUS_M = 1200
# Bounding square enclosing the 1,200 m circle; exact radius is re-applied locally.
BBOX = (35.68512, 139.74433, 35.70668, 139.77087)  # south, west, north, east
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "nekooweb-eat-osm-rich-diagnostic/1.0 (+https://github.com/nekooweb/eat)"
RULE_VERSION = "fresh-osm-rich-tag-diagnostic-v1"
AMENITIES = "restaurant|cafe|fast_food|bar|pub|food_court|ice_cream|biergarten"


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def normalize_phone(value) -> str:
    digits = re.sub(r"\D+", "", str(value or ""))
    if digits.startswith("81") and len(digits) >= 11:
        digits = "0" + digits[2:]
    return digits


def normalize_url(value) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if raw.startswith("//"):
        raw = "https:" + raw
    if not re.match(r"^https?://", raw, re.I):
        raw = "https://" + raw
    try:
        p = urlparse(raw)
    except Exception:
        return ""
    host = (p.hostname or "").lower().removeprefix("www.")
    if not host or "." not in host or p.scheme.lower() not in {"http", "https"}:
        return ""
    path = p.path.rstrip("/") or "/"
    return p._replace(scheme="https", netloc=host, path=path, params="", query="", fragment="").geturl()


def website_domain(value) -> str:
    url = normalize_url(value)
    return (urlparse(url).hostname or "").lower().removeprefix("www.") if url else ""


def first_tag(tags: dict, *keys: str) -> str:
    for key in keys:
        value = str(tags.get(key) or "").strip()
        if value:
            return value
    return ""


def structured_address(tags: dict) -> dict:
    keys = {
        "prefecture": first_tag(tags, "addr:province", "addr:state"),
        "city": first_tag(tags, "addr:city"),
        "district": first_tag(tags, "addr:district", "addr:suburb", "addr:quarter"),
        "street": first_tag(tags, "addr:street", "addr:place"),
        "housenumber": first_tag(tags, "addr:housenumber"),
        "postcode": first_tag(tags, "addr:postcode"),
        "full": first_tag(tags, "addr:full"),
    }
    return {k: v for k, v in keys.items() if v}


def source_id(element: dict) -> str:
    kind = str(element.get("type") or "").lower()
    ident = element.get("id")
    if kind not in {"node", "way", "relation"} or not isinstance(ident, int):
        return ""
    return f"{kind}/{ident}"


def coordinates(element: dict):
    if isinstance(element.get("lat"), (int, float)) and isinstance(element.get("lon"), (int, float)):
        return float(element["lat"]), float(element["lon"])
    center = element.get("center") if isinstance(element.get("center"), dict) else {}
    if isinstance(center.get("lat"), (int, float)) and isinstance(center.get("lon"), (int, float)):
        return float(center["lat"]), float(center["lon"])
    return None


def query_text() -> str:
    south, west, north, east = BBOX
    return f'''[out:json][timeout:25];
(
  nwr["amenity"~"^({AMENITIES})$"]["name"]({south},{west},{north},{east});
);
out center tags;'''


def fetch_overpass():
    body = urlencode({"data": query_text()}).encode("utf-8")
    req = Request(
        OVERPASS_URL,
        data=body,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        method="POST",
    )
    started = time.time()
    try:
        with urlopen(req, timeout=45) as response:
            status = int(getattr(response, "status", 200) or 200)
            if status in (401, 403, 429):
                raise RuntimeError(f"Overpass access restriction HTTP {status}; not bypassed")
            if status < 200 or status >= 300:
                raise RuntimeError(f"Overpass HTTP {status}")
            payload = response.read(20_000_001)
            if len(payload) > 20_000_000:
                raise RuntimeError("Overpass response exceeds 20 MB diagnostic cap")
    except HTTPError as exc:
        if exc.code in (401, 403, 429):
            raise RuntimeError(f"Overpass access restriction HTTP {exc.code}; not bypassed") from exc
        raise
    except (URLError, TimeoutError) as exc:
        raise RuntimeError(f"Overpass request unavailable: {type(exc).__name__}") from exc
    doc = json.loads(payload.decode("utf-8"))
    if not isinstance(doc.get("elements"), list):
        raise RuntimeError("invalid Overpass JSON response")
    return doc, round(time.time() - started, 3), hashlib.sha256(payload).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", type=Path, required=True)
    args = ap.parse_args()

    old_rows = retained.parse_osm_rows()
    old_by_native = {
        str(row.get("sourceId") or "").strip(): row
        for row in old_rows if str(row.get("sourceId") or "").strip()
    }
    doc, elapsed, response_hash = fetch_overpass()

    fresh = {}
    coverage = Counter()
    bbox_elements = 0
    radius_filtered = 0
    for element in doc.get("elements") or []:
        bbox_elements += 1
        sid = source_id(element)
        tags = element.get("tags") if isinstance(element.get("tags"), dict) else {}
        coord = coordinates(element)
        if not sid or not coord or not str(tags.get("name") or "").strip():
            continue
        distance = haversine_m(CENTER_LAT, CENTER_LNG, coord[0], coord[1])
        if distance > RADIUS_M:
            radius_filtered += 1
            continue
        phone = normalize_phone(first_tag(tags, "contact:phone", "phone", "contact:mobile", "mobile"))
        website = normalize_url(first_tag(tags, "contact:website", "website", "url"))
        address = structured_address(tags)
        row = {
            "sourceId": sid,
            "nameHash": hashlib.sha256(str(tags.get("name") or "").strip().encode("utf-8")).hexdigest()[:16],
            "lat": coord[0],
            "lng": coord[1],
            "distanceMeters": round(distance, 2),
            "hasPhone": bool(phone),
            "phoneHash": hashlib.sha256(phone.encode()).hexdigest()[:16] if phone else "",
            "hasWebsite": bool(website),
            "websiteDomain": website_domain(website),
            "hasStructuredAddress": bool(address),
            "addressKeys": sorted(address),
            "hasOpeningHours": bool(first_tag(tags, "opening_hours")),
            "hasCuisine": bool(first_tag(tags, "cuisine")),
        }
        fresh[sid] = row
        for key in ("hasPhone", "hasWebsite", "hasStructuredAddress", "hasOpeningHours", "hasCuisine"):
            if row[key]:
                coverage[key] += 1

    old_ids = set(old_by_native)
    fresh_ids = set(fresh)
    shared = old_ids & fresh_ids
    new_ids = fresh_ids - old_ids
    missing_ids = old_ids - fresh_ids
    gained = Counter()
    gained_examples = []
    for sid in sorted(shared):
        old = old_by_native[sid]
        cur = fresh[sid]
        changes = []
        if cur["hasPhone"]:
            gained["phone_available_now"] += 1
            changes.append("phone")
        if cur["hasWebsite"]:
            gained["website_available_now"] += 1
            changes.append("website")
        if cur["hasStructuredAddress"] and not str(old.get("address") or "").strip():
            gained["structured_address_vs_old_blank"] += 1
            changes.append("structured_address")
        if cur["hasOpeningHours"] and not str(old.get("openingHoursRaw") or "").strip():
            gained["opening_hours_vs_old_blank"] += 1
        if changes and len(gained_examples) < 80:
            gained_examples.append({
                "sourceId": sid,
                "fields": sorted(set(changes)),
                "websiteDomain": cur["websiteDomain"] if cur["hasWebsite"] else "",
                "addressKeys": cur["addressKeys"],
                "phoneHash": cur["phoneHash"],
            })

    new_signal_examples = []
    for sid in sorted(new_ids):
        cur = fresh[sid]
        if cur["hasPhone"] or cur["hasWebsite"] or cur["hasStructuredAddress"]:
            if len(new_signal_examples) < 80:
                new_signal_examples.append({
                    "sourceId": sid,
                    "hasPhone": cur["hasPhone"],
                    "phoneHash": cur["phoneHash"],
                    "websiteDomain": cur["websiteDomain"],
                    "addressKeys": cur["addressKeys"],
                })

    output = {
        "schemaVersion": 1,
        "ruleVersion": RULE_VERSION,
        "policy": {
            "paidDataApiCalls": 0,
            "googleDataApiCalls": 0,
            "networkRequests": 1,
            "overpassEndpoint": OVERPASS_URL,
            "retryOnRestrictedAccess": False,
            "masterWrites": 0,
            "promotionPerformed": False,
            "rawOverpassResponsePersisted": False,
        },
        "query": {
            "center": {"lat": CENTER_LAT, "lng": CENTER_LNG},
            "radiusMeters": RADIUS_M,
            "overpassBoundingBox": {"south": BBOX[0], "west": BBOX[1], "north": BBOX[2], "east": BBOX[3]},
            "exactRadiusAppliedLocally": True,
            "amenities": AMENITIES.split("|"),
        },
        "response": {
            "elapsedSeconds": elapsed,
            "contentHash": response_hash,
            "bboxElements": bbox_elements,
            "outsideRadiusFiltered": radius_filtered,
            "osm3s": doc.get("osm3s") or {},
        },
        "summary": {
            "retainedRows": len(old_rows),
            "retainedUniqueSourceIds": len(old_ids),
            "freshRows": len(fresh),
            "sharedSourceIds": len(shared),
            "newSourceIds": len(new_ids),
            "retainedMissingFromFreshQuery": len(missing_ids),
            "freshFieldCoverage": dict(sorted(coverage.items())),
            "sharedRichSignalCounts": dict(sorted(gained.items())),
            "newRowsWithIdentitySignals": sum(
                1 for sid in new_ids
                if fresh[sid]["hasPhone"] or fresh[sid]["hasWebsite"] or fresh[sid]["hasStructuredAddress"]
            ),
        },
        "sharedRichSignalExamples": gained_examples,
        "newIdentitySignalExamples": new_signal_examples,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status":"pass", **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
