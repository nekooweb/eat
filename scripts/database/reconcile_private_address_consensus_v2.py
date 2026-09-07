#!/usr/bin/env python3
"""Address-structured v2 reconciliation for expiring historical Google hints.

Historical Google display fields are private matching hints only. Durable output contains
only Google Place ID compatibility keys plus independent-source fields. No network/API
request is made by this script.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import reconcile_private_google_hints as base

RULE_VERSION = "private-address-consensus-v2"
ALLOWED_PROVIDERS = {"Hot Pepper", "OpenStreetMap", "Overture Maps"}
WARD_RE = re.compile(r"(千代田区|文京区|中央区|新宿区|台東区|港区|豊島区|Chiyoda(?: City)?|Bunkyo(?: City)?|Chuo(?: City)?|Shinjuku(?: City)?|Taito(?: City)?)", re.I)
POST_RE = re.compile(r"(?:〒\s*)?(\d{3})[-ー－]?(\d{4})")
FLOOR_RE = re.compile(r"(?:\d+\s*(?:F|階|階建)|地下\s*\d+\s*階|B\d+F).*?$", re.I)


def nfk(value) -> str:
    return unicodedata.normalize("NFKC", str(value or ""))


def address_numbers(value) -> tuple[str, ...]:
    text = nfk(value)
    text = POST_RE.sub("", text)
    text = FLOOR_RE.sub("", text)
    text = re.sub(r"(?i)\b(?:japan|tokyo(?:to)?|tokyo prefecture)\b", " ", text)
    text = text.replace("丁目", "-").replace("番地", "-").replace("番", "-").replace("号", "-")
    text = re.sub(r"(?i)\bchome\b", "-", text)
    text = re.sub(r"(?<=\d)[のノ](?=\d)", "-", text)
    groups = re.findall(r"\d+", text)
    return tuple(groups[:3])


def ward(value) -> str:
    match = WARD_RE.search(nfk(value))
    if not match:
        return ""
    token = match.group(1).casefold().replace(" city", "")
    aliases = {
        "chiyoda": "千代田区", "bunkyo": "文京区", "chuo": "中央区",
        "shinjuku": "新宿区", "taito": "台東区",
    }
    return aliases.get(token, match.group(1))


def compact_address(value) -> str:
    text = nfk(value).casefold()
    text = POST_RE.sub("", text)
    text = re.sub(r"(?i)\b(?:japan|tokyo(?:to)?|tokyo prefecture)\b", "", text)
    text = text.replace("東京都", "")
    return "".join(ch for ch in text if ch.isalnum())


def address_similarity(a, b) -> float:
    return base.similarity(compact_address(a), compact_address(b))


def enriched_evidence(hint: dict, row: dict) -> dict:
    ev = dict(base.evidence_for(hint, row))
    hn = address_numbers(hint.get("address"))
    sn = address_numbers(row.get("address"))
    hw = ward(hint.get("address"))
    sw = ward(row.get("address"))
    ev.update({
        "hintAddressNumbers": list(hn),
        "sourceAddressNumbers": list(sn),
        "addressNumberMatch": bool(len(hn) >= 2 and len(sn) >= 2 and hn == sn),
        "wardMatch": bool(hw and sw and hw == sw),
        "addressSimilarity": round(address_similarity(hint.get("address"), row.get("address")), 6),
    })
    ev["addressCoreMatch"] = bool(
        ev["addressNumberMatch"]
        and (ev["postcodeMatch"] or ev["wardMatch"] or ev["addressSimilarity"] >= 0.82)
    )
    return ev


def provider_source_url(row: dict) -> str | None:
    websites = [str(x).strip() for x in (row.get("websites") or []) if str(x).strip().startswith("https://")]
    if row["provider"] == "Hot Pepper" and websites:
        return websites[0]
    if row["provider"] == "OpenStreetMap":
        pid = str(row.get("providerId") or "")
        m = re.fullmatch(r"osm-([nwr])-(\d+)", pid)
        if m:
            kind = {"n": "node", "w": "way", "r": "relation"}[m.group(1)]
            return f"https://www.openstreetmap.org/{kind}/{m.group(2)}"
    return websites[0] if websites else None


def independent_row(row: dict) -> dict:
    out = base.independent_row(row)
    url = provider_source_url(row)
    if url:
        out["sourceUrl"] = url
    return out


def candidate_better(left, right):
    if right is None:
        return True
    le, re = left[1], right[1]
    return (-le["nameSimilarity"], le["distanceMeters"], -le["addressSimilarity"]) < (
        -re["nameSimilarity"], re["distanceMeters"], -re["addressSimilarity"]
    )


def mutual_cluster(seed, candidates):
    row, ev = seed
    members = []
    for other, oev in candidates:
        if other["provider"] == row["provider"]:
            continue
        if base.haversine(row["lat"], row["lng"], other["lat"], other["lng"]) > 30:
            continue
        if base.similarity(row["name"], other["name"]) < 0.88:
            continue
        rn, on = address_numbers(row.get("address")), address_numbers(other.get("address"))
        if len(rn) >= 2 and len(on) >= 2 and rn != on:
            continue
        members.append((other, oev))
    return [seed, *members]


def choose_candidate(hint: dict, candidates: list[tuple[dict, dict]]):
    if not candidates:
        return None, {"reason": "no_candidate"}

    best_by_provider = {}
    for item in candidates:
        provider = item[0]["provider"]
        if candidate_better(item, best_by_provider.get(provider)):
            best_by_provider[provider] = item
    best = sorted(best_by_provider.values(), key=lambda item: (-item[1]["nameSimilarity"], item[1]["distanceMeters"]))

    address_matches = [(row, ev) for row, ev in candidates if ev["addressCoreMatch"] and ev["distanceMeters"] <= 60]
    same_address_names = {base.normalize(row["name"]) for row, _ev in address_matches if base.normalize(row["name"])}

    for row, ev in best:
        if not ev["addressCoreMatch"] or ev["distanceMeters"] > 25 or ev["nameSimilarity"] < 0.72:
            continue
        competitors = [
            oev["nameSimilarity"] for other, oev in address_matches
            if other["provider"] != row["provider"] or other["providerId"] != row["providerId"]
        ]
        second = max(competitors, default=0.0)
        margin = ev["nameSimilarity"] - second
        unique = len(same_address_names) <= 1
        if unique or margin >= 0.12 or ev["nameSimilarity"] >= 0.90:
            return (row, ev, "structured_address_name_unique"), {
                "nameMargin": round(margin, 6), "sameAddressUniqueNames": len(same_address_names)
            }

    clusters = []
    for seed in best:
        cluster = mutual_cluster(seed, candidates)
        providers = {row["provider"] for row, _ev in cluster}
        if len(providers) < 2:
            continue
        if not all(ev["addressCoreMatch"] and ev["distanceMeters"] <= 40 for _row, ev in cluster):
            continue
        max_name = max(ev["nameSimilarity"] for _row, ev in cluster)
        avg_name = sum(ev["nameSimilarity"] for _row, ev in cluster) / len(cluster)
        if max_name < 0.62 or avg_name < 0.50:
            continue
        clusters.append((avg_name, max_name, cluster))
    clusters.sort(key=lambda item: (-item[0], -item[1], min(ev["distanceMeters"] for _row, ev in item[2])))
    if clusters:
        top = clusters[0]
        runner = clusters[1][0] if len(clusters) > 1 else 0.0
        margin = top[0] - runner
        if len(clusters) == 1 or margin >= 0.10:
            chosen = sorted(
                top[2],
                key=lambda item: ({"Hot Pepper": 0, "OpenStreetMap": 1, "Overture Maps": 2}.get(item[0]["provider"], 9), item[1]["distanceMeters"]),
            )[0]
            return (*chosen, "multi_provider_structured_address_consensus"), {
                "clusterAverageNameSimilarity": round(top[0], 6),
                "clusterNameMargin": round(margin, 6),
                "clusterProviders": sorted({row["provider"] for row, _ev in top[2]}),
            }

    return None, {
        "reason": "no_v2_rule",
        "addressCoreCandidates": len(address_matches),
        "bestNameSimilarity": round(max((ev["nameSimilarity"] for _row, ev in candidates), default=0.0), 6),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", type=Path, required=True)
    ap.add_argument("--initial", type=Path, required=True)
    ap.add_argument("--retry", type=Path, required=True)
    ap.add_argument("--private-output", type=Path, required=True)
    ap.add_argument("--durable-output", type=Path, required=True)
    args = ap.parse_args()

    db = sqlite3.connect(args.database)
    id_only = {r[0] for r in db.execute("SELECT place_id FROM catalog_entries WHERE identity_state='id_only'")}
    conflict_places = {r[0] for r in db.execute("SELECT DISTINCT place_id FROM source_bindings WHERE binding_state='conflict'")}
    bound = defaultdict(set)
    for provider, provider_id, pid in db.execute(
        "SELECT sr.provider,sr.provider_id,sb.place_id FROM source_bindings sb JOIN source_records sr ON sr.source_record_id=sb.source_record_id WHERE sb.binding_state IN ('reviewed','conflict')"
    ):
        bound[(provider, provider_id)].add(pid)
    db.close()

    hints = base.load_google_hints(args.initial, args.retry)
    provider_rows = {
        "Hot Pepper": base.hotpepper_rows(),
        "OpenStreetMap": base.osm_rows(),
        "Overture Maps": base.overture_rows(),
    }
    grids = {provider: base.build_grid(rows) for provider, rows in provider_rows.items()}
    counts = Counter()
    private_rows = []
    durable = []
    used_native = set()

    for pid in sorted(id_only):
        hint = hints.get(pid)
        if not hint:
            counts["no_historical_hint"] += 1
            continue
        if hint.get("businessStatus") not in (None, "OPERATIONAL"):
            counts["historical_non_operational"] += 1
            continue
        candidates = []
        for provider, (grid, step) in grids.items():
            local = []
            for row in base.nearby(grid, step, hint["lat"], hint["lng"]):
                ev = enriched_evidence(hint, row)
                if ev["distanceMeters"] <= 120:
                    local.append((row, ev))
            local.sort(key=lambda item: (-item[1]["nameSimilarity"], item[1]["distanceMeters"]))
            candidates.extend(local[:8])
        choice, diag = choose_candidate(hint, candidates)
        if choice is None:
            counts[diag.get("reason", "not_selected")] += 1
            if diag.get("addressCoreCandidates"):
                counts["has_structured_address_candidate"] += 1
            continue
        row, ev, rule = choice
        native = (row["provider"], str(row["providerId"]))
        if pid in conflict_places or (native in bound and bound[native] != {pid}) or native in used_native:
            counts["collision_or_conflict_deferred"] += 1
            continue
        used_native.add(native)
        counts[rule] += 1
        private_rows.append({
            "googlePlaceId": pid,
            "provider": row["provider"],
            "providerId": row["providerId"],
            "rule": rule,
            "metrics": {
                "distanceMeters": ev["distanceMeters"],
                "nameSimilarity": ev["nameSimilarity"],
                "postcodeMatch": ev["postcodeMatch"],
                "wardMatch": ev["wardMatch"],
                "addressNumberMatch": ev["addressNumberMatch"],
                "addressSimilarity": ev["addressSimilarity"],
                **diag,
            },
        })
        durable.append({
            "googlePlaceId": pid,
            **independent_row(row),
            "verification": "reviewed_independent_source_match_using_expiring_private_address_hint",
            "matchLevel": RULE_VERSION,
            "matchRule": rule,
            "sourceCheckedAt": "2026-09-07",
        })

    private_doc = {
        "schemaVersion": 1,
        "ruleVersion": RULE_VERSION,
        "policy": {"newGoogleApiCalls": 0, "privateGoogleHintsOnly": True, "durableGoogleDisplayPayload": False},
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
        },
        "summary": {"rows": len(durable), "providers": dict(sorted(Counter(r["provider"] for r in durable).items())), **dict(sorted(counts.items()))},
        "rows": sorted(durable, key=lambda r: r["googlePlaceId"]),
    }
    args.private_output.parent.mkdir(parents=True, exist_ok=True)
    args.durable_output.parent.mkdir(parents=True, exist_ok=True)
    args.private_output.write_text(json.dumps(private_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.durable_output.write_text(json.dumps(durable_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", "ruleVersion": RULE_VERSION, **durable_doc["summary"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
