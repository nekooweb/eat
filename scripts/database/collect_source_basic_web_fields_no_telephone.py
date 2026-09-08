#!/usr/bin/env python3
"""Run source-basic public-web field enrichment with telephone collection disabled.

Historical telephone evidence remains readable by the master importer, but this active
collector never treats `contact.telephone` as a completion target and therefore never
emits new telephone claims. All other source-basic web field logic is unchanged.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import collect_source_basic_web_fields as base

_original_field_missing = base.field_missing


def field_missing_without_telephone(known, pid, kind):
    if kind == "telephone":
        return False
    return _original_field_missing(known, pid, kind)


def output_path_from_argv():
    for index, value in enumerate(sys.argv[:-1]):
        if value == "--output":
            return Path(sys.argv[index + 1])
    return None


def main():
    base.field_missing = field_missing_without_telephone
    base.main()
    output = output_path_from_argv()
    if output and output.exists():
        doc = json.loads(output.read_text(encoding="utf-8"))
        policy = dict(doc.get("policy") or {})
        policy["telephoneIncludedInCompletionTargets"] = False
        policy["telephoneCollectionEnabled"] = False
        doc["policy"] = policy
        summary = dict(doc.get("summary") or {})
        new_claims = dict(summary.get("newFieldClaims") or {})
        if new_claims.get("contact.telephone"):
            raise RuntimeError("telephone claim emitted while telephone collection is disabled")
        output.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
