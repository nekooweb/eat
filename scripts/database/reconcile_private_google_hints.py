#!/usr/bin/env python3
"""Private diagnostic/reconciliation of historical Google hints to independent sources.

Google Places content is consumed only from expiring private Actions artifacts. It is
never emitted into the durable proposal. Private output may retain only match metrics and
Place IDs for short-lived review; durable rows contain independent Hot Pepper / OSM /
Overture fields only. No network request or Google API call is made here.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
CENTER_LAT = 35.6959
CENTER_LNG = 139.7576


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def parse_osm_rows() -> list[dict]:
    text = (DATA / "area1_osm.js").read_text(encoding="utf-8")
    marker = "window.RESTAURANTS.push("
    start = text.find(marker)
    if start < 0:
        raise RuntimeError("cannot parse area1_osm.js")
    body = text[start + len(marker):]
    decoder = json.JSONDecoder()
    rows = []
    pos = 0
    while pos < len(body):
        while pos < len(body) and (body[pos].isspace() or body[pos] == ","):
            pos += 1
        if pos >= len(body) or body.startswith(");", pos):
            break
        row, end = decoder.raw_decode(body, pos)
        if not isinstance(row, dict):
            raise RuntimeError(f"unexpected OSM row at {pos}")
        rows.append(row)
        pos = end
    return rows


def normalize(value) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    text = re.sub(r"https?://\S+", "", text)
    return "".join(ch for ch in text if ch.isalnum())


def similarity(a, b) -> float:
    left, right = normalize(a), normalize(b)
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0
    if left in right or right in left:
        shorter, longer = sorted((len(left), len(right)))
        if shorter >= 4:
            return max(0.88, shorter / longer)
    return SequenceMatcher(None, left, right).ratio()


def postcode(value) -> str:
    match = re.search(r"(?:〒\s*)?(\d{3})[-ー－]?(\d{4})", str(value or ""))
    return "".join(match.groups()) if match else ""


def haversine(lat1, lng1, lat2, lng2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def area_distance(lat, lng) -> float:
    return haversine(CENTER_LAT, CENTER_LNG, lat, lng)


def finite_coord(row):
    return isinstance(row.get("lat"), (int, float)) and isinstance(row.get("lng"), (int, float))


def source_address(row):
    if row.get("address"):
        return str(row.get("address") or "")
    addresses = row.get("addresses") or []
    if addresses:
        a = addresses[0] or {}
        return " ".join(
            str(a.get(k) or "").strip()
            for k in ("region", "locality", "postcode", "freeform")
            if str(a.get(k) or "").strip()
        )
    return ""


def load_google_hints(initial: Path, retry: Path) -> dict[str, dict]:
    hints = {}
    for path in (initial, retry):
        doc = load_json(path)
        for row in doc.get("rows") or []:
            pid = str(row.get("_placeId") or row.get("id") or "").strip()
            display = row.get("displayName") or {}
            name = str(display.get("text") if isinstance(display, dict) else display or "").strip()
            loc = row.get("location") or {}
            lat, lng = loc.get("latitude"), loc.get("longitude")
            if not pid or not name or not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
                continue
            hints[pid] = {
                "name": name,
                "address": str(row.get("formattedAddress") or ""),
                "lat": float(lat),
                "lng": float(lng),
                "businessStatus": row.get("businessStatus"),
            }
    return hints


def overture_rows():
    doc = load_json(DATA / "overture_area1_candidates.json")
    output = []
    for raw in doc.get("rows") or []:
        row = {
            "provider": "Overture Maps",
            "providerId": raw.get("overtureId"),
            "name": raw.get("name"),
            "address": source_address(raw),
            "lat": raw.get("lat"),
            "lng": raw.get("lng"),
            "cuisine": raw.get("basicCategory") or ((raw.get("taxonomy") or {}).get("primary")),
            "websites": raw.get("websites") or [],
            "raw": raw,
        }
        if row["providerId"] and row["name"] and finite_coord(row):
            output.append(row)
    return output


def osm_rows():
    output = []
    for raw in parse_osm_rows():
        row = {
            "provider": "OpenStreetMap",
            "providerId": raw.get("id"),
            "name": raw.get("name"),
            "address": str(raw.get("address") or ""),
            "lat": raw.get("lat"),
            "lng": raw.get("lng"),
            "cuisine": raw.get("cuisine"),
            "openingHoursRaw": raw.get("openingHoursRaw"),
            "tags": raw.get("tags") or [],
            "raw": raw,
        }
        if row["providerId"] and row["name"] and finite_coord(row):
            output.append(row)
    return output


def hotpepper_rows():
    doc = load_json(DATA / "hotpepper_catalog_facts.json")
    output = []
    for raw in doc.get("rows") or []:
        facts = raw.get("facts") or {}
        row = {
            "provider": "Hot Pepper",
            "providerId": raw.get("hotpepperId"),
            "name": facts.get("name"),
            "address": facts.get("address") or "",
            "lat": facts.get("lat"),
            "lng": facts.get("lng"),
            "cuisine": ((facts.get("genre") or {}).get("name")),
            "websites": [url for url in [(facts.get("urls") or {}).get("pc")] if url],
            "raw": raw,
        }
        if row["providerId"] and row["name"] and finite_coord(row):
            output.append(row)
    return output


def build_grid(rows, step=0.0005):
    grid = defaultdict(list)
    for row in rows:
        grid[(round(row["lat"] / step), round(row["lng"] / step))].append(row)
    return grid, step


def nearby(grid, step, lat, lng, radius_cells=4):
    key = (round(lat / step), round(lng / step))
    output = []
    for di in range(-radius_cells, radius_cells + 1):
        for dj in range(-radius_cells, radius_cells + 1):
            output.extend(grid.get((key[0] + di, key[1] + dj), []))
    return output


def evidence_for(hint, row):
    dist = haversine(hint["lat"], hint["lng"], row["lat"], row["lng"])
    sim = similarity(hint["name"], row["name"])
    gp, sp = postcode(hint.get("address")), postcode(row.get("address"))
    return {
        "distanceMeters": round(dist, 3),
        "nameSimilarity": round(sim, 6),
        "postcodeMatch": bool(gp and sp and gp == sp),
        "addressExact": bool(normalize(hint.get("address")) and normalize(hint.get("address")) == normalize(row.get("address"))),
    }


def strong_single(ev, name):
    if len(normalize(name)) < 3:
        return False, None
    if ev["nameSimilarity"] == 1.0 and ev["distanceMeters"] <= 12:
        return True, "exact_name_within_12m"
    if ev["nameSimilarity"] >= 0.985 and ev["distanceMeters"] <= 8:
        return True, "name_0985_within_8m"
    if ev["postcodeMatch"] and ev["nameSimilarity"] >= 0.97 and ev["distanceMeters"] <= 25:
        return True, "postcode_name_097_within_25m"
    if ev["addressExact"] and ev["nameSimilarity"] >= 0.95 and ev["distanceMeters"] <= 30:
        return True, "address_name_095_within_30m"
    return False, None


def diagnostic_bins(candidates, counts):
    if not candidates:
        counts["diag_no_independent_candidate_within_120m"] += 1
        return
    counts["diag_any_independent_candidate_within_120m"] += 1
    best = sorted(candidates, key=lambda item: (-item[1]["nameSimilarity"], item[1]["distanceMeters"]))[0][1]
    if best["nameSimilarity"] == 1.0:
        for limit in (10, 20, 30, 50, 80, 120):
            if best["distanceMeters"] <= limit:
                counts[f"diag_best_exact_name_le_{limit}m"] += 1
    for sim_label, threshold in (("0995", 0.995), ("099", 0.99), ("098", 0.98), ("095", 0.95), ("090", 0.90)):
        if best["nameSimilarity"] >= threshold:
            for limit in (10, 20, 30, 50, 80, 120):
                if best["distanceMeters"] <= limit:
                    counts[f"diag_best_sim_{sim_label}_le_{limit}m"] += 1
    if best["postcodeMatch"]:
        counts["diag_best_postcode_match"] += 1
        if best["nameSimilarity"] >= 0.95 and best["distanceMeters"] <= 60:
            counts["diag_postcode_sim095_le_60m"] += 1
    if best["addressExact"]:
        counts["diag_best_address_exact"] += 1

    provider_best = {}
    for row, ev in candidates:
        prev = provider_best.get(row["provider"])
        if prev is None or (-ev["nameSimilarity"], ev["distanceMeters"]) < (-prev[1]["nameSimilarity"], prev[1]["distanceMeters"]):
            provider_best[row["provider"]] = (row, ev)
    counts[f"diag_provider_coverage_{len(provider_best)}"] += 1
    strong_provider_rows = [
        (row, ev) for row, ev in provider_best.values()
        if ev["nameSimilarity"] >= 0.90 and ev["distanceMeters"] <= 80
    ]
    if len(strong_provider_rows) >= 2:
        counts["diag_two_provider_hint_support"] += 1
        compatible = True
        for i, (row, _ev) in enumerate(strong_provider_rows):
            for other, _oev in strong_provider_rows[i + 1:]:
                if haversine(row["lat"], row["lng"], other["lat"], other["lng"]) > 60 or similarity(row["name"], other["name"]) < 0.85:
                    compatible = False
        if compatible:
            counts["diag_two_provider_mutual_consensus"] += 1


def independent_row(row):
    out = {
        "provider": row["provider"],
        "providerId": row["providerId"],
        "name": row["name"],
        "address": row.get("address") or "",
        "lat": row["lat"],
        "lng": row["lng"],
        "distanceMeters": round(area_distance(row["lat"], row["lng"])),
    }
    for key in ("cuisine", "websites", "openingHoursRaw", "tags"):
        if row.get(key):
            out[key] = row[key]
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--initial", type=Path, required=True)
    parser.add_argument("--retry", type=Path, required=True)
    parser.add_argument("--private-output", type=Path, required=True)
    parser.add_argument("--durable-output", type=Path, required=True)
    args = parser.parse_args()

    db = sqlite3.connect(args.database)
    id_only = {row[0] for row in db.execute("SELECT place_id FROM catalog_entries WHERE identity_state='id_only'")}
    conflict_places = {row[0] for row in db.execute("SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'")}
    bound_provider_ids = defaultdict(set)
    for provider, provider_id, pid in db.execute(
        """SELECT sr.provider,sr.provider_id,sb.place_id
           FROM source_bindings sb JOIN source_records sr ON sr.source_record_id=sb.source_record_id
           WHERE sb.binding_state IN ('reviewed','conflict')"""
    ):
        bound_provider_ids[(provider, provider_id)].add(pid)
    db.close()

    hints = load_google_hints(args.initial, args.retry)
    provider_rows = {
        "Hot Pepper": hotpepper_rows(),
        "OpenStreetMap": osm_rows(),
        "Overture Maps": overture_rows(),
    }
    grids = {provider: build_grid(rows) for provider, rows in provider_rows.items()}

    private_proposals = []
    durable_rows = []
    near_miss_rows = []
    counts = Counter()

    for pid in sorted(id_only):
        hint = hints.get(pid)
        if hint is None:
            counts["id_only_without_historical_hint"] += 1
            continue
        if hint.get("businessStatus") not in (None, "OPERATIONAL"):
            counts["historical_non_operational"] += 1
            continue
        candidates = []
        for provider, (grid, step) in grids.items():
            local = []
            for row in nearby(grid, step, hint["lat"], hint["lng"]):
                ev = evidence_for(hint, row)
                if ev["distanceMeters"] <= 120:
                    local.append((row, ev))
            local.sort(key=lambda item: (-item[1]["nameSimilarity"], item[1]["distanceMeters"], str(item[0]["providerId"])))
            candidates.extend(local[:5])

        diagnostic_bins(candidates, counts)
        if candidates:
            best_by_provider = {}
            for row, ev in candidates:
                prev = best_by_provider.get(row["provider"])
                if prev is None or (-ev["nameSimilarity"], ev["distanceMeters"]) < (-prev[1]["nameSimilarity"], prev[1]["distanceMeters"]):
                    best_by_provider[row["provider"]] = (row, ev)
            near_miss_rows.append({
                "googlePlaceId": pid,
                "bestIndependent": [
                    {
                        "provider": row["provider"],
                        "providerId": row["providerId"],
                        "distanceMeters": ev["distanceMeters"],
                        "nameSimilarity": ev["nameSimilarity"],
                        "postcodeMatch": ev["postcodeMatch"],
                        "addressExact": ev["addressExact"],
                    }
                    for row, ev in sorted(best_by_provider.values(), key=lambda item: item[0]["provider"])
                ],
            })

        accepted = []
        for row, ev in candidates:
            strong, rule = strong_single(ev, row["name"])
            if not strong:
                continue
            existing = bound_provider_ids.get((row["provider"], str(row["providerId"])), set())
            if existing and existing != {pid}:
                continue
            competitors = [
                (other, other_ev) for other, other_ev in candidates
                if other["provider"] == row["provider"]
                and str(other["providerId"]) != str(row["providerId"])
                and other_ev["distanceMeters"] <= 35
                and other_ev["nameSimilarity"] >= max(0.95, ev["nameSimilarity"] - 0.015)
            ]
            if competitors:
                continue
            accepted.append((row, ev, rule))

        accepted.sort(key=lambda item: (item[1]["distanceMeters"], -item[1]["nameSimilarity"], item[0]["provider"]))
        chosen = None
        final_rule = None
        providers = {row["provider"] for row, _ev, _rule in accepted}
        if len(providers) >= 2:
            consensus = []
            for row, ev, rule in accepted:
                if all(
                    haversine(row["lat"], row["lng"], other["lat"], other["lng"]) <= 45
                    and similarity(row["name"], other["name"]) >= 0.88
                    for other, _oev, _orule in accepted
                ):
                    consensus.append((row, ev, rule))
            if len({row["provider"] for row, _ev, _rule in consensus}) >= 2:
                chosen = sorted(
                    consensus,
                    key=lambda item: ({"Hot Pepper": 0, "OpenStreetMap": 1, "Overture Maps": 2}[item[0]["provider"]], item[1]["distanceMeters"]),
                )[0]
                final_rule = "multi_provider_consensus"
        if chosen is None:
            ultra = [
                item for item in accepted
                if (item[1]["nameSimilarity"] == 1.0 and item[1]["distanceMeters"] <= 6)
                or (item[1]["nameSimilarity"] >= 0.995 and item[1]["distanceMeters"] <= 4)
            ]
            if len(ultra) == 1:
                chosen = ultra[0]
                final_rule = "ultra_tight_single_source"

        if chosen is None:
            counts["id_only_with_hint_no_strict_independent_match"] += 1
            continue
        row, ev, rule = chosen
        if pid in conflict_places:
            counts["conflict_skipped"] += 1
            continue
        durable_rows.append({
            "googlePlaceId": pid,
            **independent_row(row),
            "verification": "reviewed_independent_source_match_using_expiring_private_hint",
            "matchLevel": "strict_reconciliation_v1",
            "sourceCheckedAt": "2026-09-07",
        })
        private_proposals.append({
            "googlePlaceId": pid,
            "selectedProvider": row["provider"],
            "selectedProviderId": row["providerId"],
            "decisionRule": final_rule,
            "singleSourceRule": rule,
            "privateMatchMetrics": ev,
            "candidateProviderCount": len(providers),
        })
        counts[f"provider_{row['provider']}"] += 1
        counts[f"rule_{final_rule}"] += 1

    durable_doc = {
        "schemaVersion": 1,
        "scope": "TOKYO/地区1️⃣",
        "checkedAt": "2026-09-07",
        "policy": {
            "newGoogleApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "historicalGoogleContentUsedOnlyAsPrivateEphemeralHint": True,
            "durableFieldsIndependentSourceOnly": True,
            "proximityOnlyBindingsAllowed": False,
        },
        "rows": durable_rows,
    }
    private_doc = {
        "schemaVersion": 2,
        "checkedAt": "2026-09-07",
        "summary": {
            "currentIdOnly": len(id_only),
            "historicalHintsAvailable": sum(1 for pid in id_only if pid in hints),
            "strictIndependentProposals": len(durable_rows),
            **dict(sorted(counts.items())),
        },
        "rows": private_proposals,
        "nearMisses": near_miss_rows,
    }
    args.durable_output.parent.mkdir(parents=True, exist_ok=True)
    args.private_output.parent.mkdir(parents=True, exist_ok=True)
    args.durable_output.write_text(json.dumps(durable_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.private_output.write_text(json.dumps(private_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(private_doc["summary"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
