#!/usr/bin/env python3
"""Compare a fresh public OSM rich-tag query with the retained flattened OSM snapshot.

One bounded Overpass request is made for the frozen TOKYO/地区1️⃣ scope. To keep the
public query cheap in dense central Tokyo, Overpass receives a bounding box and the
exact 1,200 m circular scope is restored locally with Haversine filtering.

The optional rows output is a parsed public-source snapshot for downstream diagnostics.
It contains only OSM-published restaurant fields, not the raw Overpass response and not
any Google data. Downstream workers should reuse this snapshot instead of making the
same network request again.
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
BBOX = (35.68512, 139.74433, 35.70668, 139.77087)  # south, west, north, east
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "nekooweb-eat-osm-rich-diagnostic/1.1 (+https://github.com/nekooweb/eat)"
RULE_VERSION = "fresh-osm-rich-tag-diagnostic-v1"
SNAPSHOT_RULE_VERSION = "fresh-osm-rich-public-snapshot-v1"
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


def address_text(parts: dict) -> str:
    if parts.get("full"):
        return str(parts["full"])
    ordered = [
        parts.get("prefecture"), parts.get("city"), parts.get("district"),
        parts.get("street"), parts.get("housenumber"), parts.get("postcode"),
    ]
    return " ".join(str(v).strip() for v in ordered if str(v or "").strip())


def source_id(element: dict) -> str:
    kind = str(element.get("type") or "").lower()
    ident = element.get("id")
    if kind not in {"node", "way", "relation"} or not isinstance(ident, int):
        return ""
    return f"{kind}/{ident}"


def source_url(sid: str) -> str:
    kind, ident = sid.split("/", 1)
    return f"https://www.openstreetmap.org/{kind}/{ident}"


def coordinates(element: dict):
    if isinstance(element.get("lat"), (int, float)) and isinstance(element.get("lon"), (int, float)):
        return float(element["lat"]), float(element["lon"])
    center = element.get("center") if isinstance(element.get("center"), dict) else {}
    if isinstance(center.get("lat"), (int, float)) and isinstance(center.get("lon"), (int, float)):
        return float(center["lat"]), float(center["lon"])
    return None


def query_text() -> str:
    """Use explicit element selectors for broad Overpass parser compatibility."""
    south, west, north, east = BBOX
    bbox = f"({south},{west},{north},{east})"
    selector = f'["amenity"~"^({AMENITIES})$"]["name"]'
    return "\n".join([
        "[out:json][timeout:25];",
        "(",
        f"  node{selector}{bbox};",
        f"  way{selector}{bbox};",
        f"  relation{selector}{bbox};",
        ");",
        "out center tags;",
    ])


def fetch_overpass():
    body = urlencode({"data": query_text()}).encode("utf-8")
    req = Request(
        OVERPASS_URL,
        data=body,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        },
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
        if exc.code == 400:
            # 400 is a query/parser/transport failure, not a reason to retry around access controls.
            # Keep a small log-only excerpt to make parser incompatibilities diagnosable; it is
            # never written into the durable public snapshot.
            try:
                excerpt = exc.read(1200).decode("utf-8", errors="replace")
            except Exception:
                excerpt = ""
            compact = re.sub(r"\s+", " ", excerpt).strip()[:500]
            raise RuntimeError(f"Overpass parser/transport HTTP 400: {compact or 'no response excerpt'}") from exc
        raise RuntimeError(f"Overpass HTTP {exc.code}") from exc
    except (URLError, TimeoutError) as exc:
        raise RuntimeError(f"Overpass request unavailable: {type(exc).__name__}") from exc
    doc = json.loads(payload.decode("utf-8"))
    if not isinstance(doc.get("elements"), list):
        raise RuntimeError("invalid Overpass JSON response")
    return doc, round(time.time() - started, 3), hashlib.sha256(payload).hexdigest()


def public_rows_from_doc(doc: dict) -> tuple[list[dict], int, int]:
    rows = []
    bbox_elements = 0
    radius_filtered = 0
    seen = set()
    for element in doc.get("elements") or []:
        bbox_elements += 1
        sid = source_id(element)
        tags = element.get("tags") if isinstance(element.get("tags"), dict) else {}
        coord = coordinates(element)
        name = str(tags.get("name") or "").strip()
        if not sid or sid in seen or not coord or not name:
            continue
        distance = haversine_m(CENTER_LAT, CENTER_LNG, coord[0], coord[1])
        if distance > RADIUS_M:
            radius_filtered += 1
            continue
        seen.add(sid)
        phone = normalize_phone(first_tag(tags, "contact:phone", "phone", "contact:mobile", "mobile"))
        website = normalize_url(first_tag(tags, "contact:website", "website", "url"))
        address_parts = structured_address(tags)
        rows.append({
            "provider": "OpenStreetMap",
            "providerId": sid,
            "sourceUrl": source_url(sid),
            "name": name,
            "address": address_text(address_parts),
            "addressParts": address_parts,
            "lat": coord[0],
            "lng": coord[1],
            "distanceMeters": round(distance, 2),
            "phone": phone or None,
            "website": website or None,
            "websiteDomain": website_domain(website),
            "openingHoursRaw": first_tag(tags, "opening_hours") or None,
            "cuisine": first_tag(tags, "cuisine") or None,
            "amenity": first_tag(tags, "amenity") or None,
        })
    rows.sort(key=lambda row: row["providerId"])
    return rows, bbox_elements, radius_filtered


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--rows-output", type=Path)
    args = ap.parse_args()

    old_rows = retained.parse_osm_rows()
    old_by_native = {
        str(row.get("sourceId") or "").strip(): row
        for row in old_rows if str(row.get("sourceId") or "").strip()
    }
    doc, elapsed, response_hash = fetch_overpass()
    public_rows, bbox_elements, radius_filtered = public_rows_from_doc(doc)

    fresh = {}
    coverage = Counter()
    for row in public_rows:
        sid = row["providerId"]
        phone = str(row.get("phone") or "")
        website = str(row.get("website") or "")
        address_parts = row.get("addressParts") or {}
        summary_row = {
            "sourceId": sid,
            "nameHash": hashlib.sha256(str(row.get("name") or "").encode("utf-8")).hexdigest()[:16],
            "lat": row["lat"],
            "lng": row["lng"],
            "distanceMeters": row["distanceMeters"],
            "hasPhone": bool(phone),
            "phoneHash": hashlib.sha256(phone.encode()).hexdigest()[:16] if phone else "",
            "hasWebsite": bool(website),
            "websiteDomain": row.get("websiteDomain") or "",
            "hasStructuredAddress": bool(address_parts),
            "addressKeys": sorted(address_parts),
            "hasOpeningHours": bool(row.get("openingHoursRaw")),
            "hasCuisine": bool(row.get("cuisine")),
        }
        fresh[sid] = summary_row
        for key in ("hasPhone", "hasWebsite", "hasStructuredAddress", "hasOpeningHours", "hasCuisine"):
            if summary_row[key]:
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

    osm3s = doc.get("osm3s") or {}
    query_meta = {
        "center": {"lat": CENTER_LAT, "lng": CENTER_LNG},
        "radiusMeters": RADIUS_M,
        "overpassBoundingBox": {"south": BBOX[0], "west": BBOX[1], "north": BBOX[2], "east": BBOX[3]},
        "exactRadiusAppliedLocally": True,
        "amenities": AMENITIES.split("|"),
    }
    if args.rows_output:
        snapshot = {
            "schemaVersion": 1,
            "ruleVersion": SNAPSHOT_RULE_VERSION,
            "source": "OpenStreetMap public Overpass",
            "retrievedAt": osm3s.get("timestamp_osm_base"),
            "query": query_meta,
            "policy": {
                "paidDataApiCalls": 0,
                "googleDataIncluded": False,
                "rawOverpassResponsePersisted": False,
                "parsedPublicOsmRowsOnly": True,
                "masterWrites": 0,
                "promotionPerformed": False,
            },
            "responseHash": response_hash,
            "rows": public_rows,
        }
        args.rows_output.parent.mkdir(parents=True, exist_ok=True)
        args.rows_output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

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
        "query": query_meta,
        "response": {
            "elapsedSeconds": elapsed,
            "contentHash": response_hash,
            "bboxElements": bbox_elements,
            "outsideRadiusFiltered": radius_filtered,
            "osm3s": osm3s,
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
