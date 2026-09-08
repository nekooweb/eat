#!/usr/bin/env python3
"""Run source-basic public-web field enrichment with telephone collection disabled.

Historical telephone evidence remains readable by the master importer, but this active
collector never treats `contact.telephone` as a completion target and therefore never
emits new telephone claims. All other source-basic web field logic is unchanged.
"""
from __future__ import annotations

import collect_source_basic_web_fields as base

_original_field_missing = base.field_missing


def field_missing_without_telephone(known, pid, kind):
    if kind == "telephone":
        return False
    return _original_field_missing(known, pid, kind)


def main():
    base.field_missing = field_missing_without_telephone
    base.main()


if __name__ == "__main__":
    main()
