#!/usr/bin/env python3
"""Use fresh OSM rich tags to re-run strict cross-provider identity consensus.

Historical Google rows remain private linkage hints only. The only new public request is
one bounded OSM Overpass query. Fresh OSM phone/website/address tags are combined in
memory with retained Hot Pepper and current Overture rows. No identity is promoted and
no raw Google/Overpass payload is persisted.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

import diagnose_fresh_osm_rich_tags as fresh_osm
import diagnose_private_strong_consensus_v5 as v5
import reconcile_private_google_hints as base
import reconcile_private_address_consensus_v2 as v2
import reconcile_private_multisource_consensus_v3 as v3
import reconcile_private_official_web_consensus_v4 as v4

RULE_VERSION = "private-fresh-osm-strong-consensus-v7"


def address_text(tags: dict) -> str:
    parts = []
    for key in (
        "addr:province", "addr:state", "addr:city", "addr:district", "addr:suburb",
        "addr:quarter", "addr:street", "addr:place", "addr:housenumber", "addr:postcode"
    ):
        value = str(tags.get(key) or "").strip()
        if value and value not in parts:
            parts.append(value)
    full = str(tags.get("addr:full") or "").strip()
    return full or " ".join(parts)


def fresh_osm_provider_rows(doc: dict) -> list[dict]:
    rows = []
    seen = set()
    for element in doc.get("elements") or []:
        sid = fresh_osm.source_id(element)
        tags = element.get("tags") if isinstance(element.get("tags"), dict) else {}
        coord = fresh_osm.coordinates(element)
        name = str(tags.get("name") or "").strip()
        if not sid or sid in seen or not coord or not name:
            continue
        distance = fresh_osm.haversine_m(
            fresh_osm.CENTER_LAT, fresh_osm.CENTER_LNG, coord[0], coord[1]
        )
        if distance > fresh_osm.RADIUS_M:
            continue
        seen.add(sid)
        phone_raw = fresh_osm.first_tag(tags, "contact:phone", "phone", "contact:mobile", "mobile")
        website_raw = fresh_osm.first_tag(tags, "contact:website", "website", "url")
        phone = fresh_osm.normalize_phone(phone_raw)
        website = fresh_osm.normalize_url(website_raw)
        rows.append({
            "provider": "OpenStreetMap",
            "providerId": sid,
            "name": name,
            "address": address_text(tags),
            "lat": coord[0],
            "lng": coord[1],
            "websites": [website] if website else [],
            "raw": {
                "phones": [phone] if phone else [],
                "website": website or None,
                "opening_hours": tags.get("opening_hours"),
                "cuisine": tags.get("cuisine"),
            },
            "freshPublicOsm": True,
        })
    return rows


def signal_fingerprint(rule: str, phones: list[str], urls: list[str], domains: list[str]) -> list[str]:
    values = phones if rule == "exact_cross_provider_phone" else urls if rule == "exact_cross_provider_official_url" else domains
    return [hashlib.sha256(str(value).encode("utf-8")).hexdigest()[:20] for value in values]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--initial", type=Path, required=True)
    ap.add_argument("--retry", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    args = ap.parse_args()

    db = sqlite3.connect(args.database)
    id_only = {row[0] for row in db.execute(
        "SELECT place_id FROM catalog_entries WHERE identity_state='id_only'"
    )}
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

    osm_doc, osm_elapsed, osm_hash = fresh_osm.fetch_overpass()
    osm_rows = fresh_osm_provider_rows(osm_doc)
    counts = Counter()
    counts["fresh_osm_rows"] = len(osm_rows)
    counts["fresh_osm_rows_with_phone"] = sum(bool(v4.source_phones(r)) for r in osm_rows)
    counts["fresh_osm_rows_with_allowed_domain"] = sum(bool(v5.row_domains(r)) for r in osm_rows)
    counts["fresh_osm_rows_with_address"] = sum(bool(str(r.get("address") or "").strip()) for r in osm_rows)

    hints = base.load_google_hints(args.initial, args.retry)
    provider_rows = {
        "Hot Pepper": base.hotpepper_rows(),
        "OpenStreetMap": osm_rows,
        "Overture Maps": base.overture_rows(),
    }
    grids = {provider: base.build_grid(rows) for provider, rows in provider_rows.items()}

    provisional = []
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
                item[1]["distanceMeters"], -item[1]["nameSimilarity"],
                str(item[0].get("providerId") or "")
            ))
            candidates.extend(local[:18])

        components = v3.componentize(candidates)
        if components:
            counts["has_multisource_cluster"] += 1
        strong = []
        for component in components:
            metrics = v3.cluster_metrics(component)
            phones, urls, domains = v5.shared_signal(component)
            if phones:
                counts["components_exact_cross_provider_phone"] += 1
            if urls:
                counts["components_exact_cross_provider_official_url"] += 1
            if domains:
                counts["components_shared_allowed_domain"] += 1
            rule = v5.strong_rule(metrics, phones, urls, domains)
            if rule:
                members = v3.best_per_provider(metrics["members"])
                if not any(row.get("provider") == "OpenStreetMap" and row.get("freshPublicOsm") for row, _ev in members):
                    continue
                strong.append((rule, metrics, phones, urls, domains))

        if not strong:
            counts["no_strong_signal"] += 1
            continue
        if len(strong) > 1:
            counts["ambiguous_strong_components"] += 1
            continue

        rule, metrics, phones, urls, domains = strong[0]
        members = v3.best_per_provider(metrics["members"])
        provisional.append({
            "googlePlaceId": pid,
            "rule": rule,
            "providers": metrics["providers"],
            "providerCount": metrics["providerCount"],
            "maxHintNameSimilarity": metrics["maxHintNameSimilarity"],
            "averageMutualNameSimilarity": metrics["averageMutualNameSimilarity"],
            "minimumHintDistanceMeters": metrics["minimumHintDistanceMeters"],
            "maximumMutualDistanceMeters": metrics["maximumMutualDistanceMeters"],
            "hintStructuredAddressMembers": metrics["hintStructuredAddressMembers"],
            "sourceAddressSupportingPairs": metrics["sourceAddressSupportingPairs"],
            "signalFingerprints": signal_fingerprint(rule, phones, urls, domains),
            "independentSourceKeys": [
                {"provider": row["provider"], "providerId": str(row.get("providerId") or "")}
                for row, _ev in members
            ],
        })
        counts[f"provisional_{rule}"] += 1

    native_users = defaultdict(set)
    signal_users = defaultdict(set)
    for row in provisional:
        pid = row["googlePlaceId"]
        for source in row["independentSourceKeys"]:
            native_users[(source["provider"], source["providerId"])].add(pid)
        for fp in row["signalFingerprints"]:
            signal_users[(row["rule"], fp)].add(pid)

    final = []
    for row in provisional:
        if any(len(native_users[(s["provider"], s["providerId"])]) > 1 for s in row["independentSourceKeys"]):
            counts["native_source_reuse_deferred"] += 1
            continue
        if not row["signalFingerprints"]:
            counts["missing_strong_signal_fingerprint"] += 1
            continue
        if any(len(signal_users[(row["rule"], fp)]) > 1 for fp in row["signalFingerprints"]):
            counts["strong_signal_reuse_deferred"] += 1
            continue
        final.append(row)
        counts[f"strong_{row['rule']}"] += 1

    counts["strong_candidate_place_ids"] = len(final)
    output = {
        "schemaVersion": 1,
        "ruleVersion": RULE_VERSION,
        "policy": {
            "newGoogleApiCalls": 0,
            "googleDisplayPayloadPersisted": False,
            "newPublicNetworkRequests": 1,
            "publicNetworkSource": "OpenStreetMap Overpass",
            "promotionPerformed": False,
            "proximityOnlyBindingAllowed": False,
            "privateHistoricalHintsDurable": False,
            "rawOverpassResponsePersisted": False,
            "aggregatorDomainConsensusAllowed": False,
            "nativeSourceReuseAllowed": False,
            "strongSignalReuseAcrossPlaceIdsAllowed": False,
        },
        "freshOsm": {
            "rows": len(osm_rows),
            "elapsedSeconds": osm_elapsed,
            "responseHash": osm_hash,
            "timestampOsmBase": (osm_doc.get("osm3s") or {}).get("timestamp_osm_base"),
        },
        "summary": {
            "idOnly": len(id_only),
            "provisionalStrongCandidates": len(provisional),
            "strongCandidates": len(final),
            "counts": dict(sorted(counts.items())),
        },
        "candidates": final,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status":"pass", **output["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
