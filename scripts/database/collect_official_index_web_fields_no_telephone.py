#!/usr/bin/env python3
"""Run reviewed-official public-web enrichment with telephone collection disabled.

Historical telephone evidence remains readable, but this active collector excludes the
telephone gap before any root/detail page is processed. Address, coordinates, cuisine,
hours and raw generic price-range evidence keep the existing strict identity rules.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import collect_official_index_web_fields as base

_original_missing_fields = base.missing_fields


def missing_fields_without_telephone(known, pid):
    return [kind for kind in _original_missing_fields(known, pid) if kind != "telephone"]


def output_path_from_argv():
    for index, value in enumerate(sys.argv[:-1]):
        if value == "--output":
            return Path(sys.argv[index + 1])
    return None


def main():
    base.missing_fields = missing_fields_without_telephone
    base.main()
    output = output_path_from_argv()
    if output and output.exists():
        doc = json.loads(output.read_text(encoding="utf-8"))
        policy = dict(doc.get("policy") or {})
        policy["telephoneIncludedInCompletionTargets"] = False
        policy["telephoneCollectionEnabled"] = False
        doc["policy"] = policy
        new_claims = ((doc.get("summary") or {}).get("newFieldClaims") or {})
        if new_claims.get("contact.telephone") or new_claims.get("telephone"):
            raise RuntimeError("telephone claim emitted while telephone collection is disabled")
        output.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
