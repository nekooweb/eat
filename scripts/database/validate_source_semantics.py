#!/usr/bin/env python3
"""Validate provider-source vs normalized-field separation."""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    db = sqlite3.connect(args.database)
    db.execute("PRAGMA foreign_keys=ON")
    failures = []

    def expect(condition, message):
        if not condition:
            failures.append(message)

    hp_source_genres = db.execute("""
      SELECT count(*)
      FROM field_observations o
      JOIN source_records sr ON sr.source_record_id=o.source_record_id
      WHERE sr.acquisition_method='retained_hotpepper_artifact'
        AND o.field_key='cuisine_source'
        AND o.value_json IS NOT NULL
    """).fetchone()[0]
    expect(hp_source_genres == 535, f"Hot Pepper source genres={hp_source_genres}, expected=535")

    hp_canonical_cuisine_obs = db.execute("""
      SELECT count(*)
      FROM field_observations o
      JOIN source_records sr ON sr.source_record_id=o.source_record_id
      WHERE sr.acquisition_method='retained_hotpepper_artifact'
        AND o.field_key='cuisine'
    """).fetchone()[0]
    expect(hp_canonical_cuisine_obs == 0,
           f"full Hot Pepper raw genre leaked into canonical cuisine observations={hp_canonical_cuisine_obs}")

    hp_selected_cuisine = db.execute("""
      SELECT count(*)
      FROM field_resolutions r
      JOIN field_observations o ON o.observation_id=r.observation_id
      JOIN source_records sr ON sr.source_record_id=o.source_record_id
      WHERE r.field_key='cuisine'
        AND r.resolution_state='known'
        AND sr.acquisition_method='retained_hotpepper_artifact'
    """).fetchone()[0]
    expect(hp_selected_cuisine == 0,
           f"full Hot Pepper raw genre selected as canonical cuisine={hp_selected_cuisine}")

    known_cuisine = db.execute(
        "SELECT count(*) FROM field_resolutions WHERE field_key='cuisine' AND resolution_state='known'"
    ).fetchone()[0]

    summary = {
        "status": "fail" if failures else "pass",
        "hotPepperSourceGenreObservations": hp_source_genres,
        "hotPepperCanonicalCuisineObservations": hp_canonical_cuisine_obs,
        "hotPepperSelectedCanonicalCuisine": hp_selected_cuisine,
        "knownCanonicalCuisine": known_cuisine,
        "failures": failures,
    }
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    db.close()
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
