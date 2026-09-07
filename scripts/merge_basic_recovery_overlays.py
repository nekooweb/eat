#!/usr/bin/env python3
"""Merge reviewed durable identity-recovery overlays into the frozen basic source file.

This is an idempotent repository transformation. Overlay rows may contain the Google
Place ID only as the frozen catalog join key; all display fields must come from an
independent durable source. No network request is made here.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ALLOWED_PROVIDERS = {"Hot Pepper", "OpenStreetMap", "Overture Maps"}
BANNED_KEYS = {
    "displayName", "formattedAddress", "businessStatus", "primaryType", "types",
    "googleName", "googleAddress", "googleLocation", "location",
    "nationalPhoneNumber", "internationalPhoneNumber", "websiteUri",
    "currentOpeningHours",
}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def walk_no_banned(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if key in BANNED_KEYS:
                raise RuntimeError(f"banned Google display key in durable overlay: {key}")
            walk_no_banned(child)
    elif isinstance(value, list):
        for child in value:
            walk_no_banned(child)


def row_key(row):
    return row.get("provider"), str(row.get("providerId") or "")


def overlay_metric_prefix(rule_version: str) -> str:
    aliases = {
        "private-address-consensus-v2": "structuredAddressConsensusV2",
        "private-multisource-consensus-v3": "multiSourceConsensusV3",
    }
    if rule_version in aliases:
        return aliases[rule_version]
    tokens = [token for token in re.split(r"[^A-Za-z0-9]+", rule_version) if token]
    if not tokens:
        return "identityRecoveryOverlay"
    head, *tail = tokens
    return head + "".join(token[:1].upper() + token[1:] for token in tail)


def validate_overlay(doc: dict, inventory_count: int) -> list[dict]:
    policy = doc.get("policy") or {}
    if policy.get("newGoogleApiCalls") != 0:
        raise RuntimeError("overlay must record zero new Google API calls")
    if policy.get("googleDisplayPayloadPersisted") is not False:
        raise RuntimeError("overlay must prohibit Google display payload persistence")
    if policy.get("durableFieldsIndependentSourceOnly") is not True:
        raise RuntimeError("overlay must contain independent-source durable fields only")
    if policy.get("proximityOnlyBindingAllowed") is not False:
        raise RuntimeError("proximity-only identity binding is forbidden")
    rule_version = str(doc.get("ruleVersion") or "").strip()
    if not rule_version:
        raise RuntimeError("overlay ruleVersion is required")
    walk_no_banned(doc)

    rows = doc.get("rows") or []
    seen_places = set()
    seen_native = set()
    for row in rows:
        pid = str(row.get("googlePlaceId") or "").strip()
        provider = str(row.get("provider") or "").strip()
        provider_id = str(row.get("providerId") or "").strip()
        name = str(row.get("name") or "").strip()
        distance = row.get("distanceMeters")
        if not pid or not provider_id or not name or provider not in ALLOWED_PROVIDERS:
            raise RuntimeError(f"invalid overlay identity row: {pid or '<missing>'}")
        if pid in seen_places:
            raise RuntimeError(f"duplicate overlay Place ID: {pid}")
        native = (provider, provider_id)
        if native in seen_native:
            raise RuntimeError(f"duplicate overlay native source ID: {native}")
        if not isinstance(distance, (int, float)) or distance < 0 or distance > 1200:
            raise RuntimeError(f"overlay distance outside frozen radius: {pid}")
        if row.get("matchLevel") != rule_version:
            raise RuntimeError(f"overlay rule-version mismatch: {pid}")
        seen_places.add(pid)
        seen_native.add(native)
    if len(rows) > inventory_count:
        raise RuntimeError("overlay larger than frozen inventory")
    return rows


def merge(base_doc: dict, overlay_doc: dict) -> tuple[dict, dict]:
    inventory_count = int(base_doc.get("inventoryCount") or 0)
    if inventory_count != 2804:
        raise RuntimeError(f"unexpected frozen inventory count: {inventory_count}")
    base_policy = base_doc.get("policy") or {}
    if base_policy.get("paidGoogleApiCalls") != 0 or base_policy.get("googleDisplayPayloadPersisted") is not False:
        raise RuntimeError("base source-match policy is not zero-paid/no-Google-display")
    walk_no_banned(base_doc)
    overlay_rows = validate_overlay(overlay_doc, inventory_count)
    rule_version = str(overlay_doc.get("ruleVersion") or "").strip()
    metric_prefix = overlay_metric_prefix(rule_version)

    rows = list(base_doc.get("rows") or [])
    by_pid = {str(row.get("googlePlaceId")): row for row in rows}
    native_to_places = defaultdict(set)
    for row in rows:
        native_to_places[row_key(row)].add(str(row.get("googlePlaceId")))

    added = 0
    already_present = 0
    for row in overlay_rows:
        pid = str(row["googlePlaceId"])
        native = row_key(row)
        bound_elsewhere = native_to_places.get(native, set()) - {pid}
        if bound_elsewhere:
            raise RuntimeError(f"overlay native source collision {native}: {sorted(bound_elsewhere)} vs {pid}")
        existing = by_pid.get(pid)
        if existing is not None:
            if row_key(existing) != native:
                raise RuntimeError(f"overlay Place ID already bound to another native source: {pid}")
            already_present += 1
            continue
        clean = dict(row)
        clean.pop("sourceCuisine", None)
        clean.pop("matchRule", None)
        clean.pop("transformation", None)
        rows.append(clean)
        by_pid[pid] = clean
        native_to_places[native].add(pid)
        added += 1

    rows.sort(key=lambda row: str(row.get("googlePlaceId") or ""))
    production_backed = int((base_doc.get("summary") or {}).get("productionBacked") or 0)
    providers = Counter(str(row.get("provider")) for row in rows)
    summary = dict(base_doc.get("summary") or {})
    summary.update({
        "sourceMatchedInventoryOnly": len(rows),
        "basicReadyTotal": production_backed + len(rows),
        "identityOnlyRemaining": inventory_count - production_backed - len(rows),
        "providers": dict(sorted(providers.items())),
        f"{metric_prefix}Rows": len(overlay_rows),
        f"{metric_prefix}AddedThisMerge": added,
        "lastIdentityRecoveryOverlayRule": rule_version,
        "lastIdentityRecoveryOverlayRows": len(overlay_rows),
        "lastIdentityRecoveryOverlayAddedThisMerge": added,
    })
    if summary["identityOnlyRemaining"] < 0:
        raise RuntimeError("merged basic rows exceed frozen inventory")

    output = dict(base_doc)
    output["rows"] = rows
    output["summary"] = summary
    policy = dict(output.get("policy") or {})
    policy[f"{metric_prefix}Overlay"] = True
    policy[f"{metric_prefix}Rule"] = rule_version
    policy["lastIdentityRecoveryOverlayRule"] = rule_version
    output["policy"] = policy
    walk_no_banned(output)
    metrics = {
        "status": "pass",
        "ruleVersion": rule_version,
        "baseRows": len(base_doc.get("rows") or []),
        "overlayRows": len(overlay_rows),
        "added": added,
        "alreadyPresent": already_present,
        "mergedRows": len(rows),
        "basicReadyTotal": summary["basicReadyTotal"],
        "identityOnlyRemaining": summary["identityOnlyRemaining"],
        "providers": summary["providers"],
    }
    return output, metrics


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("base", type=Path)
    parser.add_argument("overlay", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    base_doc = read_json(args.base)
    overlay_doc = read_json(args.overlay)
    output, metrics = merge(base_doc, overlay_doc)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metrics, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
