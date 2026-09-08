#!/usr/bin/env python3
"""Run reviewed-official public-web enrichment with telephone collection disabled.

Historical telephone evidence remains readable, but this active collector excludes the
telephone gap before any root/detail page is processed. Address, coordinates, cuisine,
hours and raw generic price-range evidence keep the existing strict identity rules.
"""
from __future__ import annotations

import collect_official_index_web_fields as base

_original_missing_fields = base.missing_fields


def missing_fields_without_telephone(known, pid):
    return [kind for kind in _original_missing_fields(known, pid) if kind != "telephone"]


def main():
    base.missing_fields = missing_fields_without_telephone
    base.main()


if __name__ == "__main__":
    main()
