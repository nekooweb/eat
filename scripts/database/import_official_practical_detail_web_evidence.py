#!/usr/bin/env python3
"""Import same-origin official detail-page practical evidence."""
from __future__ import annotations

from pathlib import Path

import import_official_practical_web_evidence as base

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE_PATH = ROOT / "data" / "official_practical_detail_web_evidence.json"


def import_evidence(db, id_set: set[str], conflict_places: set[str], stamp: str):
    return base.import_evidence(
        db,
        id_set,
        conflict_places,
        stamp,
        evidence_path=EVIDENCE_PATH,
        acquisition_method="official_practical_detail_web_evidence_v1",
        binding_method="field_only_from_reviewed_official_same_origin_detail_page",
        provider_prefix="official-practical-detail",
    )
