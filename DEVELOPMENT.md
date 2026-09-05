# Eat Development Plan

Updated: 2026-09-06

## Authoritative current state

`TOKYO / 地区1️⃣` is in **production-field completion plus full 2,804-identity range accounting**.

Current audited baseline after the official-enrichment acceleration pass:

- exact Area1 identity inventory: **2,804 / 2,804**;
- canonical production: **648** unique Google Place IDs;
- production IDs inside exact inventory: **645**;
- usable Tabelog/official source-backed production: **397 / 648**;
- source outcomes accounted for: **441 / 648 = 68.1%**;
- unresolved current-production source queue: **207**;
- non-generic cuisine: **571 / 648**;
- budget known: **192 / 648**;
- address known: **259 / 648**;
- filter-ready normalized `openingHours`: **278 / 648**;
- strict `recommendedDishes`: **27 / 648**;
- public `featuredDishes`: **124 / 648**;
- 百名店: **22**.

The address count changed from 261 to 259 because the accelerated official-source audit removed two historical low-quality/false address claims. This is an intentional quality correction, not a network-fetch regression.

The full-range ledger accounts for all 2,804 exact inventory identities:

- `production`: **645** inventory IDs;
- `inventory_only`: **2,159**;
- production outside this exact inventory snapshot: **3**;
- first prioritized expansion queue: **56 identities / 64 OSM candidate links**;
- untouched inventory-only identities after that queue: **2,103**.

`DATA_ENRICHMENT_PROGRESS.md` is the authoritative numeric progress report. Historical numbers in older logs remain historical when they differ from this file.

## Development principle

The browser product remains a static GitHub Pages application. Data discovery, validation and enrichment happen during maintenance/CI, not at browser runtime.

Google Place ID is the durable production identity/admission key. Full Google Places display payloads are not stored as the long-lived restaurant database. Durable display and recommendation metadata comes from maintainable independent sources such as OSM, official pages, Tabelog and curated evidence.

Missing or ambiguous fields are omitted rather than guessed.

## Accelerated official enrichment

Restaurant-by-restaurant web research is no longer the default path.

Official-source maintenance now uses three confidence tiers:

1. **A — auto-promote**: exact Place ID + maintained official page/name agreement + matching structured business data or a trusted branch/store locator. Durable address, validated weekly hours and conservative cuisine are eligible.
2. **B — fast review**: the pipeline extracts candidate address/hours/cuisine text, menu/Product/MenuItem names, recommendation snippets, price snippets and menu URLs into a review artifact. A reviewer checks evidence cards instead of manually searching each restaurant.
3. **C — no action**: insufficient signal; nothing is guessed into production.

Latest validated bulk run: `33980591040`.

Fetch/result scale:

- persisted official index: **187** production identities;
- incomplete targets fetched: **173**;
- already-complete rows skipped: **14**;
- unique URLs fetched: **361**;
- duplicate URL downloads avoided by in-run cache: **23**;
- main pages fetched successfully: **172 / 173**;
- B-review evidence cards: **120**.

Overlapping B-review fields:

- address: **34**;
- opening hours: **51**;
- cuisine: **12**;
- budget: **66**;
- featured dishes: **79**.

This pass makes **zero new Google Places API requests**.

Implementation:

- `scripts/extract_official_index_fields.mjs` — fetch only incomplete official records, concurrency 8, URL promise cache, conditional menu fetches, structured/menu signal extraction;
- `scripts/build_auto_official_enrichment.mjs` — stable incremental A-tier writer;
- `scripts/build_official_fast_review_queue.mjs` — B-tier evidence queue;
- `.github/workflows/promote-official-bulk.yml` — manual bulk maintenance workflow;
- `logs/2026-09-06-auto-enrichment-acceleration.md` — detailed acceleration design and validation log.

## Stable refresh and source-safety rules

A website timeout is not evidence that previously reviewed data disappeared.

Therefore:

- successful current fetches may add or replace supported fields;
- transient fetch failures retain earlier reviewed claims;
- stale/incorrect facts are removed only after contradictory evidence or explicit validation failure;
- generic free-text addresses are not auto-promoted;
- trusted locator visible address/hours require a branch-specific page/title match;
- temporary, COVID-era, dated, year-end and special-hours notices are rejected;
- opening-hours text must normalize and validate under the canonical weekly schedule contract.

Different official pages may support different fields. One combined `official` enrichment row per Place ID is preserved; field-specific pages attach through `sourceRefs` rather than creating duplicate provider rows.

## Canonical opening-hours contract

Production uses only filter-ready weekly structure:

```js
openingHours: {
  timezone: 'Asia/Tokyo',
  days: {
    mon: [['11:30', '14:00'], ['17:00', '23:00']],
    wed: []
  }
}
```

Semantics:

- missing day key = unknown;
- `[]` = explicitly closed;
- time-pair arrays = known opening periods;
- missing `openingHours` = no reliable weekly schedule;
- timezone = `Asia/Tokyo`.

Unknown schedule data is never converted into a false open/closed claim. Runtime open-now filtering remains disabled until a separate coverage/freshness review.

## Featured dishes vs strict recommendations

- `recommendedDishes`: explicit recommendation/popularity/specialty evidence only;
- `featuredDishes`: broader source-backed `representative`, `signature` or `recommended` items used by the public UI.

A representative item is never silently relabeled as recommended. Prices are used only when directly supported by current source evidence.

Current coverage:

- featured dishes: **124 / 648**;
- strict recommendations: **27 / 648**.

Dish/budget interpretation remains B-review by default unless a deterministic host/template rule is strong enough. The project should not trade source semantics for speed.

## Immediate production-field queue

Among the **397 source-backed production restaurants**, current overlapping gaps are:

- `featuredDishes`: **275**;
- normalized `openingHours`: **157**;
- budget: **205**;
- address: **172**;
- cuisine: **28**.

Preferred processing order:

1. A-tier structured/locator auto-promotion;
2. repeated-host/template B-review batches;
3. conservative manual review only for ambiguous residual cases.

## Full 2,804-ID expansion architecture

`data/area1_inventory_ledger.json` tracks every exact inventory Place ID with compact internal status. It does not persist full Google display names, addresses, coordinates or Places payloads.

`data/area1_inventory_expansion_queue.json` contains the first **56** inventory-only identities with **64** existing OSM candidate links. Candidate rejection is review context, not a terminal invalidation of the Google identity.

After current production fields, the same A/B/C approach should be applied to this 56-ID queue before processing the remaining 2,103 untouched inventory-only identities.

Public production admission still requires exact branch identity, <=1,200 m scope, independently maintainable source evidence and successful canonical/source audits.

## Google API cost guardrail

Routine enrichment should prefer persisted official URLs, OSM/curated candidates and independent sources.

The acceleration pass uses **zero new Google Places requests**. Paid Google recovery remains manual-only and should not be triggered merely to inflate coverage.

## CI and audit contract

Every material field/identity batch must:

1. preserve exact Place-ID/source provenance;
2. rebuild canonical production;
3. run opening-hours parser tests when schedules change;
4. run repository audit;
5. run source-binding audit;
6. run normalized-field audit;
7. generate coverage/source/enrichment/dish/identity reports;
8. use `set -o pipefail` for report pipelines so `tee` cannot hide failures;
9. update progress/development/log records when authoritative state changes.

## Runtime/product contract

Recommendation behavior remains unchanged:

- strict Area1 distance <=1,200 m;
- verified Google Place ID required;
- cuisine exclusion, budget and distance filters;
- exactly three distinct results whenever >=3 eligible restaurants exist;
- cuisine diversity preferred, not mandatory;
- Web Crypto randomness;
- 百名店 weight 2.2 vs ordinary 1.0;
- no rating/review-count ranking.

Result views remain:

1. Leaflet + OpenStreetMap three-store overview;
2. per-store Google Maps Embed place map with Leaflet fallback;
3. restaurant cards;
4. three-store comparison table;
5. direct Google Maps link.

Voice/mascot feedback remains isolated from restaurant selection and does not block result generation.

## Ordered next work

1. Process B-review rows by repeated host/template rather than restaurant order.
2. Reduce the remaining 157 opening-hours / 275 featured-dish gaps without weakening semantics.
3. Resolve the remaining 207 current-production source outcomes.
4. Apply A/B/C review to the 56-ID prioritized inventory expansion queue.
5. Process the remaining 2,103 inventory-only identities in bounded independent-source batches.
6. Enable schedule-aware runtime filtering only after coverage/freshness review.
