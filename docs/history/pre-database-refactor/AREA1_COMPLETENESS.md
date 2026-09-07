# Area1 1.2 km Completeness Audit

Updated: 2026-09-05

## Status summary

The **identity-count phase is complete** for the repository's configured Area1 food-business universe. The **full-information phase is still in progress**.

### Exact identity universe

- strict radius: **1,200 m**;
- exact Google Places Aggregate count: **2,804** operational in-scope food businesses;
- enumerated unique Place IDs: **2,804 / 2,804**;
- `complete: true`;
- `coverageVerified: true`;
- `independentCountVerified: true`;
- method: `places_aggregate_geodesic_partition_boundary_qc_v3`;
- inventory: `data/area1_google_ids.json`;
- inventory commit: `81d874558e556a6942e81606a7855de455d8a7b4`.

`2,804` is the complete count for the project's configured **food-business** scope (restaurants, cafes, bakeries, bars/pubs, takeaway and related food-service types). It is **not** a count of every retail shop or every Google Maps POI category.

## Exact-count proof

Successful discovery workflow `33953718846`:

1. exact `INSIGHT_COUNT` on the 1,200 m circle;
2. geodesic sector enumeration;
3. count-before-enumerate recursion for sectors above the 100-place limit;
4. 1,205 m guard band only for boundary recovery;
5. transient location/status lookup only for guard-band-only candidates;
6. final hard gate requiring unique Place IDs to equal the independent exact count.

Measured result:

- exact circle count: 2,804;
- 1,200 m geodesic sector union: 2,801 IDs;
- 1,205 m guard-band union: 2,835 IDs;
- boundary candidates checked: 34;
- candidates recovered inside strict 1,200 m: 3;
- final IDs: **2,804**;
- Aggregate requests: 238;
- transient Place Details requests: 34.

Relative to the previous 1,613-ID Nearby-search lead inventory, the exact inventory added 1,215 IDs and removed 24 IDs that no longer fit the current operational/type/radius criteria.

## Independent-source candidate coverage

The OSM collection scope was corrected after the exact inventory exposed a mismatch: the earlier query omitted bar/pub/biergarten/ice-cream features even though those types are part of the project food-business universe.

After expanding the OSM query and rerunning Google QC-v4:

- OSM source candidates: **1,273** (previously 990; **+283**);
- verified source rows: **658**;
- rejected source rows: **615**;
- pending: **0**;
- unique verified Google Place IDs in the QC cache: **647**;
- verified Place IDs covered by the exact 2,804-ID inventory: **643**;
- exact-inventory IDs still without a verified independent-source identity: **2,161**;
- rejected source-match Place IDs nevertheless present in the exact inventory: **106**;
- verified source Place IDs outside the exact inventory: **4**.

Current rejection reasons across the expanded source pool:

- `outside_1_2km`: 371;
- `location_mismatch`: 97;
- `closed_permanently`: 79;
- `name_mismatch`: 44;
- `non_food_google_type`: 18;
- `no_google_place`: 6.

The `2,161` figure is a reconciliation queue, not a claim that 2,161 rows should be admitted blindly. Each exact Google identity still needs an independent durable identity/source relationship or an explicit reviewed outcome.

## Current production state

Latest passing build for source-enrichment Batch 4 (`33954926963`):

- canonical production entities: **648**;
- unique production Place IDs: **648**;
- production Place IDs present in the exact Google inventory: **645**;
- Tabelog/official-source-backed production: **275**;
  - Tabelog bindings: 249;
  - official bindings: 26;
- explicit source resolutions: **34**;
- source outcomes accounted for: **309 / 648**;
- unresolved live-production source queue: **339**;
- source-resolution coverage: **47.7%**.

Current field coverage:

| Field | Known |
| --- | ---: |
| Cuisine / non-generic category | 562 / 648 |
| Address | 140 / 648 |
| Budget | 126 / 648 |
| Opening/holiday information | 239 / 648 |
| Representative dishes | 31 / 648 |
| 百名店 | 22 / 648 |

Distance pools:

- <=300 m: 137;
- <=500 m: 220;
- <=800 m: 359;
- <=1,200 m: 648.

## Canonical identity protection

The OSM type expansion exposed a merge bug where a historical rich metadata row could overwrite the display name of a newly verified OSM identity sharing a Place ID mapping.

Commit `697e85581317216f014d2f7ae1b5dd641663ee4e` changed canonicalization so that:

- a Place-ID keyed enrichment row that explicitly claims `name` has first priority;
- otherwise the name comes from the exact verified OSM identity/geospatial row;
- geospatial identity remains anchored to independent OSM data;
- address prefers an explicit field claim and then the independent geospatial source;
- historical rich metadata can no longer rename an unrelated verified business merely because it has more fields.

Pages workflow `33954834163` passed after this correction.

## Full-information batches completed this session

Four new batches were added after the original source pass:

- Batch 1: 8 safe source bindings + 2 explicit conflicts;
- Batch 2: 10 safe source bindings;
- Batch 3: 10 safe source bindings;
- Batch 4: 10 safe source bindings.

Batch 4 commit `fe128c9078a351010ea92f4a430324e0b6ad8b7f` added exact branch-specific sources for:

- 馬さん餃子酒場 神保町店;
- 神保町 加賀廣;
- CRAFT BEER MARKET 神保町店;
- 大金星 神保町店;
- Bar Plat 本店;
- Bar 37℃;
- 鳥貴族 神保町店;
- おかん;
- 大衆酒場 けいちゃん 神保町店;
- あつ盛.

Batch 4 increased source-backed production from 265 to 275 and reduced the unresolved live-production queue from 349 to 339.

## Completeness definitions

### Identity-count complete — achieved

Requirements:

- exact 1,200 m Aggregate count exists;
- unique Place-ID inventory equals that count;
- `complete`, `coverageVerified` and `independentCountVerified` are true;
- exact-coverage audit passes.

Current result: **2,804 / 2,804**.

### Full-information complete — not yet achieved

Requirements:

- every exact-inventory identity has an explicit reconciliation outcome;
- every admitted production entity has a usable durable source or documented terminal source resolution;
- target fields have field-level provenance or an explicit reviewed-missing reason;
- duplicate/closed/non-food/outside exceptions are recorded rather than silently dropped;
- canonical/runtime/source audits pass.

## Ordered next work

1. Resolve/enrich the remaining **339 live production identities** first because they already affect recommendations.
2. Reconcile the remaining **2,161 exact-inventory Place IDs** that lack a verified independent-source identity.
3. Review the 106 rejected-source matches that point to an exact-inventory identity.
4. Review the 4 verified-source IDs outside the exact inventory separately; do not weaken the strict radius gate.
5. Continue address, budget, hours/holiday and representative-dish completion with exact branch provenance.

The current nearest unresolved live-production queue begins with `やまじょう`, `レピック神保町`, `森のブッチャーズ`, `座楽`, `Beer Pub 8taps` and `餃子八`.

## Continuous validation

`.github/workflows/pages.yml` now executes `scripts/audit_area1_identity_coverage.mjs` on **every Pages build**, so exact-count/reconciliation drift is automatically visible alongside canonical and source-binding audits.

Latest Batch 4 audit:

- exact inventory: 2,804 / 2,804 — pass;
- production: 648 / 648 unique Place IDs — pass;
- source enrichment: 275 / 275 attached — pass;
- exact independent-source coverage: 643 Place IDs;
- exact reconciliation gap: 2,161 Place IDs;
- repository audit: pass;
- source-binding audit: pass.
