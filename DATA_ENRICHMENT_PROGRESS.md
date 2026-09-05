# Area1 Data Enrichment Progress

Updated: 2026-09-06

## Current milestone

`TOKYO / 地区1️⃣` is in **source-backed field completion plus full-range identity accounting**.

The public product remains stable at 648 canonical restaurants. Data maintenance is now moving from restaurant-by-restaurant research to a confidence-tiered batch pipeline.

Missing or ambiguous fields remain omitted rather than guessed.

## Authoritative audited production state

Latest validated official-enrichment acceleration run: `33980591040`.

- exact Area1 Google food-business identity inventory: **2,804 / 2,804**;
- OSM independent-source candidates: **1,273**;
- Google QC-v4 candidate rows: **658 verified / 615 rejected / 0 pending**;
- canonical production: **648** unique Place IDs;
- production IDs inside exact inventory: **645**;
- production IDs outside this exact inventory snapshot: **3**;
- usable Tabelog/official source-backed production: **397 / 648**;
- explicit terminal source resolutions: **44**;
- source outcomes accounted for: **441 / 648 = 68.1%**;
- unresolved current-production source queue: **207**;
- non-generic cuisine: **571 / 648**;
- budget known: **192 / 648**;
- address known: **259 / 648**;
- filter-ready normalized `openingHours`: **278 / 648**;
- strict `recommendedDishes`: **27 / 648**;
- public `featuredDishes`: **124 / 648**;
- source-backed dish rows with reviewed Chinese featured output: **104 / 104**;
- 百名店: **22**.

Distance pools remain 137 / 220 / 359 / 648 at <=300 / <=500 / <=800 / <=1,200 m.

The previous address baseline was 261. The accelerated high-confidence audit removed **2 historical false/low-quality address claims**, so 259 is the corrected authoritative value.

## Field-enrichment history

### Normalization pass

PR #6 established the normalized field contracts:

- descriptive schedule prose became structured `openingHours`;
- ambiguous/irregular schedules are omitted rather than inferred;
- `recommendedDishes` remains strict;
- broader public `featuredDishes` supports `representative`, `signature` and `recommended` semantics.

Baseline after normalization:

- openingHours: **273 / 648**;
- featuredDishes: **84 / 648**;
- strict recommendations: **27 / 648**.

### Pass 2 — zero-Google official/menu/locator batch

Run `33978590468`:

- source-backed: **396 -> 397**;
- source outcomes: **440 -> 441**;
- unresolved current production: **208 -> 207**;
- openingHours: **273 -> 278**;
- featuredDishes: **84 -> 120**;
- strict recommendations: **27 -> 27**.

### Pass 3 — official-menu continuation

PR #8:

- featuredDishes: **120 -> 124**;
- reviewed source-backed dish rows: **100 -> 104**;
- featured-dish gap: **279 -> 275**;
- no Google Places calls.

## Acceleration pass — A/B/C review

The default process is no longer “open every restaurant and inspect manually”.

### A — automatic promotion

Automatic writes require:

- exact production Place ID;
- successful current official-page fetch;
- maintained restaurant/page name agreement;
- matching structured business data or a trusted branch/store locator;
- field-specific validation.

A-tier currently applies to durable address, validated weekly opening hours and conservative cuisine signals.

Generic free-text addresses do not qualify. Temporary, dated, COVID-era, year-end and special-hours notices are rejected.

### B — fast evidence review

For signals that should not be guessed automatically, the workflow produces one evidence card per restaurant containing the already-extracted candidate data:

- address text;
- opening-hours block;
- cuisine signal;
- Product/MenuItem names;
- recommendation/signature snippets;
- price snippets;
- menu URLs.

The reviewer verifies the evidence rather than manually searching the web.

### C — no action

If current evidence is insufficient, the field remains empty.

## Latest acceleration measurements

Run `33980591040` used the persisted official index and made **zero new Google Places requests**.

Official-index processing:

- indexed production official pages: **187**;
- rows still needing some field work: **173**;
- already-complete rows skipped: **14**;
- unique URLs fetched: **361**;
- duplicate URL requests avoided through cache: **23**;
- main pages fetched successfully: **172 / 173**;
- maintained name agreement: **148**;
- pages with structured facts: **75**;
- visible address signals: **135**;
- visible opening-hours signals: **101**;
- cuisine signals: **142**;
- recommendation/menu signals: **115**;
- menu pages requested: **211**;
- menu pages fetched successfully: **203**.

Stable A-tier writer:

- auto-official rows retained: **74**;
- rows refreshed: **63**;
- structured address refreshes: **11**;
- trusted-locator address refreshes: **2**;
- structured hours refreshes: **2**;
- structured cuisine refreshes: **3**.

Canonical production/source audits all passed after the refresh.

## B-review queue

Latest `_audit/official_fast_review_queue.json`:

- restaurants with at least one B-review signal: **120**;
- A-auto fields identified during queue analysis: **7**;
- fetch/identity failures: **25**;
- rows with no useful B signal: **28**.

Overlapping B-review fields:

- address: **34**;
- openingHours: **51**;
- cuisine: **12**;
- budget: **66**;
- featuredDishes: **79**.

This means the manual workload is now evidence verification for 120 prepared records, not 187 independent restaurant web searches. Repeated hosts can be processed as template batches, reducing work further.

## Remaining production-field gaps

Among the **397 source-backed production restaurants**, current overlapping gaps are:

- `featuredDishes`: **275**;
- normalized `openingHours`: **157**;
- budget: **205**;
- address: **172**;
- non-generic cuisine: **28**.

The address gap increased by 2 only because two incorrect historical values were removed.

## Opening-hours contract

Canonical filter-ready format:

```js
openingHours: {
  timezone: 'Asia/Tokyo',
  days: {
    mon: [['11:30', '14:00'], ['17:00', '23:00']],
    wed: []
  }
}
```

- missing day key = unknown;
- `[]` = explicitly closed;
- intervals = known opening periods;
- missing `openingHours` = no reliable weekly schedule;
- timezone = `Asia/Tokyo`.

Open-now runtime filtering remains disabled until coverage/freshness is strong enough.

## Dish semantics

- `recommendedDishes` — strict explicit recommendation/popularity/specialty evidence;
- `featuredDishes` — broader source-backed representative/signature/recommended dishes.

Dish and budget interpretation remain B-review unless a deterministic official host/template provides strong semantics. Speed must not turn representative menu items into unsupported recommendations.

## Stable official-source refresh rule

- previously reviewed official enrichment remains stable across transient fetch failures;
- successful current refetches may add/replace supported fields;
- stale facts are removed after contradictory evidence or explicit validation failure;
- one `official` enrichment row per Place ID is preserved in the combined loader;
- field-specific official pages attach through `sourceRefs`.

## Full 2,804-ID maintenance ledger

`data/area1_inventory_ledger.json` accounts for every exact inventory Place ID without persisting full Google display payloads.

Current partition:

- inventory total: **2,804**;
- `production`: **645** inventory IDs;
- `inventory_only`: **2,159** inventory IDs;
- production IDs outside the exact inventory snapshot: **3**;
- verified QC Place IDs outside inventory snapshot: **4**.

## First full-range expansion queue

`data/area1_inventory_expansion_queue.json`:

- identities: **56**;
- OSM candidate links: **64**;
- identities with `name_mismatch` evidence: **27**;
- identities with `location_mismatch` evidence: **31**;
- missing candidate rows: **0**.

The same A/B/C approach should be applied to these 56 identities before the remaining **2,103** untouched inventory-only identities.

Full-range completion means every inventory identity receives an auditable maintenance outcome; it does not mean forcing all 2,804 identities into public production.

## Google API cost control

The acceleration pass makes **zero new Google Places requests**.

Routine continuation should use persisted official URLs, official store/menu templates, OSM/curated independent candidates and bounded review queues. Paid Google recovery remains manual-only.

## Current ordered work

1. Process the 120 B-review evidence rows by repeated host/template, not one restaurant at a time.
2. Continue reducing the **157 opening-hours** and **275 featured-dish** gaps.
3. Process budget/address/cuisine candidates where source semantics are strong enough.
4. Resolve the remaining **207** current-production source outcomes.
5. Apply A/B/C review to the **56** prioritized expansion identities.
6. Then process the **2,103** untouched inventory-only identities in bounded independent-source batches.
7. Enable schedule-aware filtering only after a separate coverage/freshness review.

## Validation evidence

- normalized hours + initial featured dishes: `33977684773`;
- Pass 2: `33978590468`;
- full ledger + prioritized expansion queue: `33978820748`;
- Pass 3: `33979365931`;
- accelerated official enrichment: **`33980591040`**.

Current authoritative metrics: **648 production / 397 source-backed / 441 source outcomes / 259 addresses / 278 filter-ready schedules / 124 featured dishes / 27 strict recommendations / 2,804 ledgered identities**.
