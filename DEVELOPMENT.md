# Eat Development Plan

Updated: 2026-09-05

## Current milestone

`TOKYO / 地区1️⃣` is now in the **exact identity inventory + full-information reconciliation** phase.

The important distinction is:

- **identity-count completeness is solved**: 2,804 / 2,804 in-scope food-business Place IDs inside the strict 1.2 km circle;
- **full-information completeness is not solved yet**: independent source identity and durable branch fields still have to be reconciled.

Latest audited state:

- exact in-scope operational food-business identities: **2,804**;
- exact Place-ID inventory: **2,804 / 2,804**;
- OSM independent-source candidates: **1,273**;
- Google QC-v4: **658 verified / 615 rejected / 0 pending**;
- unique verified Google IDs in the QC cache: 647;
- exact-inventory IDs with verified independent-source coverage: **643**;
- exact-inventory IDs still without verified independent-source identity: **2,161**;
- canonical production entities: **648** unique Place IDs;
- usable Tabelog/official bindings: **275**;
- explicit source resolutions: **34**;
- source outcomes accounted for: **309 / 648**;
- unresolved live-production source queue: **339**.

## Product/runtime contract

- static GitHub Pages site;
- strict production boundary <=1,200 m;
- Google Place ID required for production identity;
- Google Places data used transiently for identity/QC/discovery rather than as the durable restaurant database;
- persistent facts come from OSM, Tabelog, official pages and reviewed curated sources;
- one deploy-time canonical dataset;
- browser-side filtering/random selection only;
- Leaflet/OpenStreetMap overview, per-store maps and comparison table;
- no browser-side source matching or runtime backend.

## Exact Area1 inventory

`data/area1_google_ids.json` is authoritative for the exact Google food-business identity universe:

- radius: 1,200 m;
- count: 2,804;
- method: `places_aggregate_geodesic_partition_boundary_qc_v3`;
- complete / coverage verified / independent count verified.

`scripts/discover_google_area1.py` uses an exact Aggregate count, recursively split geodesic sectors and a 5 m boundary-recovery guard band. It refuses to mark the inventory complete unless the final unique Place-ID count equals the independent exact-circle count.

Successful exact run `33953718846`:

- exact count 2,804;
- inner sector union 2,801;
- boundary candidates 34;
- recovered inside strict circle 3;
- final 2,804.

## Independent-source coverage correction

The previous OSM query omitted several food/business types that were present in the exact Google scope. Commit `732dcf1ce7c0b80128d577cfa3a3e43b1ece826a` added OSM bar/pub/biergarten/ice-cream coverage.

Result:

- candidates 990 -> **1,273** (+283);
- verified source rows 526 -> **658**;
- production 517 -> **648** (+131).

Current expanded-pool rejection reasons:

- outside 1.2 km: 371;
- location mismatch: 97;
- closed permanently: 79;
- name mismatch: 44;
- non-food Google type: 18;
- no Google place: 6.

Do not weaken these gates merely to increase production count.

## Canonical identity rule

The type expansion exposed a serious merge risk: a historical rich metadata row could rename a newly verified independent OSM identity when both were associated with the same Place ID.

Commit `697e85581317216f014d2f7ae1b5dd641663ee4e` fixes the canonical name/address priority:

1. exact Place-ID enrichment explicitly claiming `name`;
2. otherwise exact verified OSM identity name;
3. historical rich rows may contribute only fields that are safely mergeable and must not rename the identity by detail-score priority.

Geospatial production identity remains anchored to independent OSM coordinates/distance. Pages run `33954834163` passed after this correction.

## Current canonical production

Latest Batch 4 build (`33954926963`):

- production: **648**;
- unique Place IDs: **648**;
- production present in exact Google inventory: 645;
- cuisine known/non-generic: **562**;
- address known: **140**;
- budget known: **126**;
- schedule/holiday known: **239**;
- representative dishes known: **31**;
- source-backed: **275**;
- 百名店: 22.

Distance pools:

- <=300 m: 137;
- <=500 m: 220;
- <=800 m: 359;
- <=1,200 m: 648.

## Full-information batches completed

During this completion pass:

- Batch 1: 8 safe bindings + 2 explicit conflicts;
- Batch 2: 10 safe bindings;
- Batch 3: 10 safe bindings;
- Batch 4: 10 safe bindings.

Batch 4 (`fe128c9078a351010ea92f4a430324e0b6ad8b7f`) added:

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

This moved source-backed production **265 -> 275** and unresolved live production **349 -> 339**.

## Ordered next work

### Priority 1 — remaining 339 live production identities

For each unresolved production Place ID:

1. use exact verified OSM identity/name/coordinates as the anchor;
2. locate the exact Tabelog or official branch page;
3. bind only when branch identity is supported;
4. write an explicit terminal/ambiguous resolution when evidence conflicts;
5. extract name/address/cuisine/budget/hours/closure/dishes only where the cited source supports the field.

Nearest current queue:

`やまじょう`, `レピック神保町`, `森のブッチャーズ`, `座楽`, `Beer Pub 8taps`, `餃子八`, followed by the remaining inner-to-outer production identities.

### Priority 2 — exact inventory reconciliation

Current exact audit:

- exact IDs: 2,804;
- independently verified IDs inside exact inventory: 643;
- remaining identity-reconciliation queue: **2,161**;
- rejected source-match IDs present in exact inventory: 106;
- verified source IDs outside exact inventory: 4.

For Google-only IDs, fetch name/location/status transiently as a discovery aid, then establish an independent OSM/Tabelog/official identity before production admission. Do not build a long-lived Google Details database.

### Priority 3 — field completion

For all production rows, prioritize:

1. address;
2. cuisine normalization;
3. opening hours / regular holidays;
4. lunch/dinner budget;
5. representative dishes;
6. award metadata.

Unknown stays unknown until a supporting source is found.

## CI / validation

Every Pages build now runs:

- canonical production build;
- JavaScript/Python syntax checks;
- repository/runtime audit;
- source-binding audit;
- source queue report;
- coverage report;
- **exact Area1 identity coverage audit**;
- public-site assembly and deployment.

Latest Batch 4 build passed all build/source/exact-coverage gates. Exact-count drift can therefore no longer silently diverge from the deploy state.

See `AREA1_COMPLETENESS.md` for the authoritative numbers and `AREA1_COMPLETION_LOG.md` for batch history.
