#!/usr/bin/env python3
"""Safe wrapper for retained Phase-2 JS assignment inputs.

The historical files are JavaScript assignments whose JSON strings may themselves
contain semicolons. Parse the JSON value with JSONDecoder.raw_decode instead of looking
for a delimiter, and never execute repository JavaScript.
"""
from __future__ import annotations

import json

import retained_phase2_core as _impl


def read_assignment(path, variable):
    text = path.read_text(encoding="utf-8")
    prefix = f"window.{variable}="
    start = text.find(prefix)
    if start < 0:
        raise RuntimeError(f"cannot find {variable} in {path}")
    payload = text[start + len(prefix):].lstrip()
    try:
        value, _end = json.JSONDecoder().raw_decode(payload)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"cannot parse JSON assignment {variable} in {path}: {exc}") from exc
    return value


# Functions defined in retained_phase2_core resolve global names in that module at
# call time, so replace only its parser while keeping all importer logic unchanged.
_impl.read_assignment = read_assignment

load_inputs = _impl.load_inputs
native_identity_rows = _impl.native_identity_rows
provenance_by_place_provider = _impl.provenance_by_place_provider
synthetic_provider_id = _impl.synthetic_provider_id
source_fact_fields = _impl.source_fact_fields
import_source_facts = _impl.import_source_facts
import_provenance = _impl.import_provenance
rich_fields = _impl.rich_fields
import_hotpepper_rich = _impl.import_hotpepper_rich
import_detail_evidence = _impl.import_detail_evidence
import_all = _impl.import_all
