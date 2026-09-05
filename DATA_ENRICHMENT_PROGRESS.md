# Area1 Data Enrichment Progress

Updated: 2026-09-06

## Current milestone

`TOKYO / 地区1️⃣` is in **bulk source/field completion and runtime-field normalization**.

The product/runtime layer is usable. Current work is focused on durable source coverage, filter-ready opening hours, representative/featured dishes, budget, address and cuisine quality. Missing or ambiguous values are intentionally omitted rather than fabricated.

## Current audited production state

Latest validated PR #6 build:

- exact in-scope Google food-business identity inventory: **2,804 / 2,804**;
- OSM independent-source candidates: **1,273**;
- Google QC-v4 source rows: **658 verified / 615 rejected / 0 pending**;
- canonical production entities: **648** unique verified Place IDs;
- production IDs present in the exact Google inventory: **645**;
- usable Tabelog/official source-backed production: **396 / 648 = 61.1%**;
- explicit terminal source resolutions: **44**;
- source outcomes accounted for: **440 / 648 = 67.9%**;
- unresolved current-production source queue: **208**;
- non-generic cuisine: **571 / 648**;
- budget known: **192 / 648**;
- address known: **261 / 648**;
- normalized filterable opening hours: **273 / 648**;
- strict reviewed Chinese recommendations: **27 / 648**;
- public featured/representative dishes: **84 / 648**;
- legacy representative-dish source data: **72 / 648**;
- 百名店: **22**.

Distance pools remain:

- <=300 m: 137;
- <=500 m: 220;
- <=800 m: 359;
- <=1,200 m: 648.

## Completion levels

Three levels remain separate:

1. **Exact Google identity inventory — complete.** `data/area1_google_ids.json` contains 2,804 / 2,804 in-scope food-business Place IDs inside the strict 1.2 km Area1 circle.
2. **Current canonical production — 648 entities.** These identities have independently maintained geospatial/source evidence and passed Google identity QC.
3. **Full-information completion — still in progress.** Exact-inventory IDs without verified independent-source identity remain **2,161**. Current production also still has field gaps.

A Google Place ID in the exact inventory is not automatically promoted into production. Expansion to a durable public database continues to require independent-source identity evidence.

## Opening-hours normalization — 2026-09-06

The former schedule field was descriptive prose and was not reliable enough for future open/closed filtering. The canonical runtime now uses a normalized structure documented in `DATA_SCHEMA.md`.

Example:

```js
openingHours: {
  timezone: 'Asia/Tokyo',
  days: {
    mon: [['11:30', '14:00'], ['17:00', '23:00']],
    tue: [['11:30', '14:00'], ['17:00', '23:00']],
    wed: []
  }
}
```

Semantics:

- missing day key = schedule unknown for that day;
- `[]` = explicitly closed;
- time pairs = known opening periods;
- close times may extend beyond midnight;
- timezone is `Asia/Tokyo`.

The old descriptive schedule/reference count was **304**. After normalization and conservative review, **273** restaurants have filter-ready weekly hours. The remaining **31** old schedule references were deliberately not promoted because they were prose-only, reservation-only, irregular, calendar/SNS-dependent, or otherwise unsafe to interpret as a weekly schedule.

Raw maintenance fields such as `openingHoursRaw`, `closedDays`, and `closedNote` remain in source shards for provenance but are forbidden from leaking into canonical production. `hoursReference` is now only a Chinese display string generated from normalized `openingHours`; if no normalized schedule exists, neither field is emitted.

A bare time interval such as `11:00–20:00` is not assumed to mean seven-day opening. It is expanded only when the same maintained source provides exact regular closed days or explicitly states no regular closure. `不定休` does not become a weekly schedule.

Parser tests cover Japanese and English weekday ranges, compact weekend/holiday forms, split lunch/dinner periods, L.O. text, exact closed days, `無休`, dayless hours and irregular schedules. Current test suite: **9 / 9 pass**.

## Featured dishes — 2026-09-06

The data model now separates two concepts:

- `recommendedDishes`: strict source-explicit recommendations/popular/signature items;
- `featuredDishes`: the public broader field containing strict recommendations plus source-backed representative dishes.

Strict recommendation coverage remains **27 restaurants**. It was not loosened.

This pass added **57** reviewed Chinese representative-dish rows from existing maintained dish claims. Every added `featuredDishes` record is exact-Place-ID keyed and its source URL must already be registered as a `dishes` field claim for the same Place ID; the canonical builder rejects unsupported rows.

Result:

- public featured-dish coverage: **84 / 648**;
- source-backed legacy dish rows: **64**;
- source-backed legacy dish rows with reviewed Chinese featured output: **64 / 64**;
- remaining conversion gap inside that already-sourced legacy subset: **0**.

`featuredDishes` stores structured objects with Chinese name, Japanese source name and semantic kind (`recommended`, `signature`, or `representative`). Optional `priceYen` / `priceText` fields are reserved for directly supported menu prices. Restaurant-level budget must never be reused as a dish price.

The browser now labels the broader public field as **特色菜**. Missing featured dishes are simply omitted.

## Remaining field gaps among usable-source restaurants

Among the **396** production restaurants that already have a usable Tabelog/official source, the current enrichment queue contains overlapping gaps:

- `featuredDishes`: **314**;
- normalized `openingHours`: **161**;
- budget: **204**;
- address: **169**;
- cuisine: **27**.

These rows are the next field-completion priority because their identities/sources are already established. Tabelog pages are not bulk-crawled from GitHub-hosted runners because they return 403; automated work prioritizes official restaurant/brand sites and already-reviewed Tabelog facts.

## 2026-09-06 accelerated bulk source pass

The preceding bulk pass replaced much of the one-restaurant-at-a-time source discovery loop with reusable official-site indexing.

Starting point -> audited result:

- source-backed: **356 -> 396**;
- source outcomes: **400 -> 440**;
- unresolved: **248 -> 208**;
- address: **207 -> 261**;
- non-generic cuisine: **568 -> 571**;
- strict recommendations: **10 -> 27**.

`data/official_candidate_index.json` currently keeps **187** independently fetched official website URLs. Routine re-fetch/extraction of those URLs requires zero Google Places calls.

Generated `data/source_enrichment_autoofficial.js` contains conservative exact-Place-ID official claims. Historical announcements and unstructured free-text hours are not automatically promoted into current filterable schedules.

## Google API cost control

The cost-sensitive official-site recovery pass made exactly **100** Place Details requests using the Enterprise `websiteUri` field mask. At the list-price marginal rate used for the project budget calculation, the conservative worst-case exposure was **USD 2.00**; actual billing may be lower if monthly free-tier quota remained.

That pass recovered 24 additional independently fetched official URLs, including 18 previously unresolved production identities, and expanded the reusable independent official index from 163 to 187.

Guardrails remain:

- no further paid discovery is triggered by ordinary commits;
- paid recovery is manual-dispatch only;
- ordinary official-index extraction uses persisted independent HTTPS URLs and makes zero Google Places calls;
- the normalized-hours/featured-dish pass makes **no new Google Places calls**.

## Runtime/product contract

The public site remains static GitHub Pages:

- strict production boundary <=1,200 m;
- Google Place ID required for production identity;
- cuisine exclusion, budget and distance filters;
- exactly three distinct results whenever >=3 eligible restaurants exist;
- cuisine diversity is a preference, not a hard requirement;
- Web Crypto randomness;
- 百名店 weight 2.2 vs ordinary 1.0;
- no rating/review-count popularity ranking.

Result views remain:

1. three-store overview: Leaflet + OpenStreetMap;
2. per-store Google Maps Embed place map using verified Place ID, with Leaflet fallback;
3. restaurant cards;
4. three-store comparison table;
5. direct Google Maps business/navigation link.

Open-now filtering is still **not enabled yet**. The backend is now structurally ready, but the remaining 161 usable-source schedule gaps should be reduced before missing-day semantics are turned into a user-facing filter.

## Data pipeline

```text
OSM / curated independent candidates
          |
          v
Google identity QC ----> exact Google ID inventory
          |
    verified Place ID
          |
          +-------------------------------+
          |                               |
          v                               v
reviewed Tabelog/official source    official candidate index
          |                               |
          |                        zero-Google site refetch
          |                               |
          +-----------+-------------------+
                      v
              source_enrichment*.js
                 + raw source evidence
                      |
        +-------------+-------------+
        |                           |
        v                           v
normalized openingHours      reviewed featured dishes
        |                           |
        +-------------+-------------+
                      v
          build_production_dataset.mjs
                      |
                      v
             production_area1.js
                      |
                      v
                    browser
```

The browser does not perform source matching or enrichment.

## Ordered next work

1. **Complete the 161 normalized opening-hours gaps with existing usable sources**, prioritizing official chain/store pages and explicit weekly schedules.
2. **Expand featured dishes beyond the first 84 rows**, prioritizing official menu/signature pages. Preserve `representative` vs `recommended` semantics and add prices only when directly supported.
3. Continue budget/address/cuisine extraction for the 396 usable-source restaurants.
4. Continue the 208 unresolved current-production source outcomes without weakening identity rules.
5. Expand the 2,161 exact-inventory IDs only when independent-source identity can be established.
6. Enable open-now/open-at-time filtering only after schedule coverage and edge-case semantics are sufficiently strong.

## Validation evidence

Key runs:

- zero-Google safe bulk rebuild: `33975776551`;
- cost-capped official recovery: `33975941715`;
- final clean-baseline zero-Google rebuild: `33976128092`;
- normalized hours + featured dishes Pages validation: `33977684773`;
- normalized hours PR validation: `33977684766`.

Current authoritative runtime-field metrics are the latest successful normalized-hours/featured-dish build: **648 production / 273 filterable schedules / 84 featured dishes / 27 strict recommendations / 396 source-backed**.
