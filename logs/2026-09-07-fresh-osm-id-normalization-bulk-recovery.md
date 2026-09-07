# 2026-09-07 — Fresh OSM ID normalization and bulk field recovery

## Problem found

The fresh OSM field-enrichment pipeline had acquired a reusable public snapshot with 1,237 rows, but `data/fresh_osm_bound_field_evidence.json` still reported `reviewedOsmBindingPairsScanned: 0` and emitted no durable field rows.

The cause was an identifier-format mismatch at the exact-binding join boundary:

- retained historical OSM QC/source records use internal IDs such as `osm-n-6817614546`;
- fresh public OSM snapshots use native IDs such as `node/6817614546`;
- `canonical_osm_id()` accepted only native `node/`, `way/`, `relation/` forms, so every retained reviewed binding was silently excluded before the exact join.

This was a format-compatibility bug, not a lack of OSM source coverage.

## Fix

Updated `scripts/database/build_fresh_osm_bound_field_evidence.py` so legacy retained forms canonicalize exactly:

- `osm-n-<id>` -> `node/<id>`
- `osm-w-<id>` -> `way/<id>`
- `osm-r-<id>` -> `relation/<id>`

No fuzzy matching, proximity-only matching, or identity promotion was introduced. The enrichment remains exact-reviewed-binding only and missing-only.

The evidence contract was advanced to `fresh-osm-bound-field-evidence-v2`; the importer, durable evidence file, and GitHub Actions enrichment workflow were updated consistently.

## Validation and result

The fresh public OSM diagnostic completed successfully with:

- fresh rows: 1,237;
- shared with retained OSM: 1,232;
- fresh cuisine tags: 646;
- fresh opening-hours tags: 223;
- fresh phone tags: 156;
- fresh structured-address tags: 143;
- fresh website tags: 113;
- paid Google data API calls: 0.

After the ID normalization fix, the downstream exact-binding enrichment completed successfully and changed the binding scan from 0 to:

- reviewed OSM binding pairs scanned: 666;
- unique reviewed native OSM IDs: 666;
- 641 bindings already had all supported fields known;
- 22 reviewed bindings were absent from the current 1,237-row fresh snapshot;
- 3 durable missing address fields were added.

The small number of new fields after repairing 666 joins shows that the already-bound OSM field-completion path is now close to saturation. Repeating the same OSM scope is therefore low priority unless the public source changes materially.

## Bulk-completion implication

The next high-volume work should shift away from repeatedly re-querying already-bound OSM records and toward the master planner's unresolved identity pool and source-specific field shards. The current multi-agent architecture remains proposal-only:

1. deterministic task ownership by shard;
2. source-specific workers collect evidence/proposals;
3. workers never write SQLite directly;
4. central resolver/validator promotes only accepted evidence;
5. master and task plan are rebuilt after promotion.

Priority should be: `identity-public-recovery` first, then `field-official` / `field-open-data` / `field-existing-source` where independent evidence is available; Hot Pepper lunch-only gaps should not be brute-forced because the retained source audit already showed most unresolved lunch tasks have no retained lunch evidence.

## Commits

- `1bf0b7f` — Fix legacy OSM ID normalization for fresh field evidence
- `5bff39f` — Align fresh OSM importer with evidence v2
- `5fbefc3` — Migrate fresh OSM evidence document to v2
- `698082f` — Align fresh OSM enrichment workflow with evidence v2
- `2f81f0b` — Actions-generated durable reviewed fresh OSM field evidence
