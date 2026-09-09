# Legacy PR #16 source-fact migration — 2026-09-09

## Why this migration exists

PR #16 (`bulk-gap-reduction-20260906`) became structurally stale after the database/runtime refactor and fell roughly one thousand commits behind `main`, but its manually reviewed source batch was never fully represented in the current source graph.

A 2026-09-09 audit rebuilt the current public runtime and compared all 17 legacy Place IDs against `source_provenance.js`, `reviewed_official_runtime_sources.json`, and `official_candidate_index.json`:

- all 17 identities remain published;
- only 2/17 retained every legacy source URL;
- 15/17 were missing at least one reviewed legacy URL;
- 16/17 were missing at least one field claim that the legacy batch had explicitly sourced.

## Migration boundary

`data/source_enrichment_pr16-gap-migration.js` restores only the 17 source-only fact rows.

It does **not**:

- create or change a Place ID binding;
- replace runtime/catalog names;
- copy Google display payload;
- call a paid Google API;
- restore the old six-row `RECOMMENDED_DISHES` block automatically.

The current production builder already treats `source_enrichment_*.js` rows as enrichment-only: they are grouped into an already admitted production Place ID and cannot create a new production identity.

## Recommendation handling

The old PR also contained six recommendation rows. They are intentionally excluded from this migration because the current builder requires recommendation rows to be unique per Place ID and the recommendation pipeline now has stricter explicit-recommendation semantics. Ordinary source-supported `dishes` remain available as source facts/featured evidence; any recommendation upgrade must be reviewed separately.
