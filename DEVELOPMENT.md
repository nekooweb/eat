# Eat Development Plan

Updated: 2026-09-05

## Current milestone

`TOKYO / 地区1️⃣` has moved from partial geographic coverage to an **exact identity inventory + staged full-information completion** phase.

Current verified state:

- exact in-scope operational food-business identities within 1,200 m: **2,804**;
- exact Place-ID inventory: **2,804 / 2,804**;
- OSM source candidates processed by Google QC-v4: **990 / 990**;
- OSM verification result: 526 verified / 464 rejected / 0 pending;
- canonical production entities: **517** unique Place IDs;
- production entities represented in the exact inventory: 515;
- current usable Tabelog/official bindings: 237;
- explicit terminal source resolutions: 32;
- current production identities with a source outcome: 269 / 517;
- new unresolved production source queue: **248**;
- exact-inventory identities without a verified independent-source identity: **2,291**.

The old 269-production / 1,613-discovery-ID baseline is superseded by this document and `AREA1_COMPLETENESS.md`.

## Product/runtime contract

Required behavior remains:

- static GitHub Pages site;
- strict Area1 production boundary <=1,200 m;
- Google Place ID required for production identity;
- Google Places response fields used only transiently for identity/QC/discovery;
- persistent restaurant facts built from independent sources;
- one deploy-time canonical dataset;
- browser-side filtering/random selection only;
- Leaflet/OpenStreetMap three-store overview map;
- one Leaflet map per result card;
- three-store comparison table;
- direct Place-ID Google Maps navigation link;
- no browser-side source matching;
- no runtime database/backend;
- maintenance data/scripts excluded from the public Pages payload.

## Data architecture

### 1. Exact Google identity universe

`data/area1_google_ids.json` is now the authoritative Area1 identity inventory.

Current inventory properties:

- `radiusMeters: 1200`;
- `count: 2804`;
- `complete: true`;
- `coverageVerified: true`;
- `independentCountVerified: true`;
- method: `places_aggregate_geodesic_partition_boundary_qc_v3`.

`scripts/discover_google_area1.py` now:

1. obtains an independent `INSIGHT_COUNT` for the exact circle;
2. enumerates Place IDs through recursively split Places Aggregate sectors;
3. uses geodesic destination calculations for the circle boundary;
4. counts each sector before requesting Place IDs, avoiding the >100-place enumeration failure;
5. uses a 5 m guard band only for boundary recovery;
6. fetches transient location/status only for guard-band-only candidates;
7. persists only IDs and audit metadata;
8. refuses completion unless the final unique ID count equals the independent circle count.

The successful exact run used 238 Aggregate requests plus 34 transient boundary Details checks. The 1,200 m sector union produced 2,801 IDs, 34 guard-band candidates were examined, 3 were recovered inside the strict circle, and the final inventory matched the independent count at 2,804.

`scripts/audit_area1_identity_coverage.mjs` now requires all of the following before `exactCoverageReady` can pass:

- `complete === true`;
- `coverageVerified === true`;
- `independentCountVerified === true`;
- declared integer count;
- unique Place-ID count equals declared count.

### 2. Independent-source candidate verification

`scripts/verify_google_places.py` QC-v4 remains the source-to-Google identity gate.

Persistent Google-derived state remains compact:

- source ID;
- verified/rejected/pending state;
- Google Place ID where applicable;
- compact rejection reason/QC version.

Transient Google fields are used for:

- name matching;
- business status;
- food-related type check;
- source/Google coordinate comparison;
- strict Area1 boundary check.

All 990 OSM candidates have now been processed. Current rejection reasons:

- `outside_1_2km`: 258;
- `location_mismatch`: 80;
- `closed_permanently`: 67;
- `name_mismatch`: 40;
- `non_food_google_type`: 14;
- `no_google_place`: 5.

Do not weaken QC thresholds merely to increase production count.

### 3. Canonical production

`scripts/build_production_dataset.mjs`:

- admits verified identities only;
- collapses to one entity per Google Place ID;
- uses independent/curated/Tabelog/official metadata conservatively;
- blocks production rows outside 1,200 m;
- preserves missing optional fields as missing;
- writes `data/production_area1.js` for deployment.

Current canonical production: **517 entities / 517 unique Place IDs**.

Distance pools:

- <=300 m: 116;
- <=500 m: 192;
- <=800 m: 295;
- <=1,200 m: 517.

The 800–1,200 m ring now contains **222** production entities; the earlier near-only coverage issue is no longer true.

### 4. Durable source/field enrichment

Google is not the permanent metadata database.

Long-lived branch facts should come from:

- OpenStreetMap;
- Tabelog;
- restaurant/organization official pages;
- reviewed curated sources where explicitly allowed.

Target persistent fields:

- exact branch/display name;
- cuisine/category;
- independent address;
- independent coordinates/distance;
- lunch budget;
- dinner budget;
- opening hours;
- regular holidays/closure notes;
- representative dishes;
- Tabelog/official source binding;
- Google Place ID identity/navigation;
- source/QC outcome and review date;
- 百名店 year/category where applicable.

Each source reference must declare which fields it supports. Do not infer fields from cuisine stereotypes or nearby branches.

## Current field/source completeness

Latest passing canonical build:

| Metric | Current |
| --- | ---: |
| Production entities | 517 |
| Cuisine known | 425 |
| Budget known | 95 |
| Schedule/holiday known | 202 |
| Representative dishes known | 20 |
| Display address known | 95 |
| Usable Tabelog/official bindings | 237 |
| 百名店 | 22 |

Source-resolution state:

- usable bindings: 237;
- explicit terminal resolutions: 32;
- source outcomes accounted for: 269;
- unresolved production identities: **248**;
- current source-resolution coverage: about 52%.

The 248 unresolved rows are mostly identities newly admitted by the completed OSM verification pass. They already have independent OSM identity/location and a verified Place ID, making them the highest-value next enrichment queue.

## Exact inventory reconciliation

The exact inventory audit currently reports:

- exact inventory IDs: 2,804;
- unique verified Google IDs in the source-verification cache: 516;
- verified IDs covered by exact inventory: 513;
- inventory IDs without verified independent-source identity: **2,291**;
- rejected source-match IDs nevertheless present in exact inventory: 91;
- verified source IDs outside exact inventory: 3.

These numbers must not be interpreted as 2,291 immediately admissible missing restaurants. `inventoryPlaceIdsWithoutVerifiedIndependentSource` means that the Google identity exists in the exact food-business universe but a durable independent-source identity relationship has not yet been established.

## Ordered next work

### Priority 1 — complete source outcomes for the 248 newly admitted production entities

For every unresolved production Place ID:

1. use existing OSM name/coordinates + verified Place ID as the branch anchor;
2. locate the exact current Tabelog or official branch source;
3. attach a usable source only when branch identity is supported;
4. otherwise write an explicit terminal resolution rather than guessing;
5. extract supported fields in the same review where possible;
6. record review date and field-level provenance.

This queue should be completed before spending most effort on Google-only identities because these 248 already affect the live recommendation pool.

### Priority 2 — complete missing fields for all production entities

Field priority:

1. address;
2. cuisine normalization;
3. opening hours / regular holidays;
4. lunch and dinner budget;
5. representative dishes;
6. award metadata.

Opening/holiday information remains descriptive until schedule semantics and coverage are strong enough for exclusion logic.

### Priority 3 — reconcile the 2,291 Google-only exact-inventory identities

Use a controlled discovery workflow:

1. take an exact-inventory Place ID not represented by a verified independent source;
2. fetch Google name/location/type/status only transiently as a discovery aid;
3. locate an independent OSM/Tabelog/official identity;
4. verify branch correspondence;
5. add a durable independent candidate/binding and pass existing QC/canonical gates;
6. otherwise record a reviewed reconciliation outcome.

Do not persist a new long-lived Google-details database.

### Priority 4 — exception reconciliation

Separately inspect:

- 91 exact-inventory Place IDs seen in rejected source matches;
- 3 verified-source Place IDs outside the exact inventory;
- 7 curated-overlap candidates still unresolved by their dedicated verifier;
- existing `listing_hold`, `no_current_usable_source`, `ambiguous` and `source_not_found` rows when better evidence becomes available.

Never solve these exceptions by weakening the strict 1,200 m or branch-identity rules.

## Batch reporting requirements

Every enrichment/reconciliation batch should record:

- Place IDs/source rows processed;
- source URLs and review dates;
- usable binding vs terminal-resolution outcome;
- fields populated;
- reviewed-but-missing fields and reason;
- production count before/after;
- source-resolution coverage before/after;
- exact-inventory reconciliation delta;
- distance-pool changes;
- audit/build/deploy result and relevant commit/run.

## Validation / CI

Current required checks include:

- JavaScript/Python syntax checks;
- canonical build;
- repository/runtime audit;
- source-binding/resolution audit;
- source queue report;
- coverage report;
- exact Area1 identity inventory audit on discovery;
- minimal public-site assembly;
- GitHub Pages deployment.

Latest validation evidence for this milestone:

- full Google verification inventory commit: `8196b93767f6842352cd62cf7052875ccc0dedec`;
- exact discovery logic: `01177fedfd9fd2b73e1b0dcfe3f19afd5a99085d`;
- exact inventory commit: `81d874558e556a6942e81606a7855de455d8a7b4`;
- strengthened exact completeness gate: `9ba11132310fe3adf40b205021ecff7adc6bd39b`;
- exact discovery workflow: `33953718846` — success;
- Pages build/deploy after exact inventory: `33953786379` — success.

See `AREA1_COMPLETENESS.md` for the audited identity-count details. Historical architecture/source-resolution milestones remain in `CHANGELOG.md`.

## Later work

After Area1 full-information/reconciliation coverage is sufficiently complete:

- opening/holiday-aware filtering after schedule semantics are validated;
- local recommendation history after privacy/persistence rules are defined;
- `TOKYO / 地区2️⃣`;
- `SHIZUOKA`.
