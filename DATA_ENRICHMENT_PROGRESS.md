# Area1 Data Enrichment Progress

Updated: 2026-09-06

## Current milestone

`TOKYO / 地区1️⃣` is in **source-backed field completion plus full-range identity accounting**.

The public product remains stable at 648 canonical restaurants. Data maintenance now uses confidence-tiered batch extraction and specialized official-site parsers rather than restaurant-by-restaurant research.

Missing or ambiguous fields remain omitted rather than guessed.

## Authoritative audited production state

Latest validated single-site official-hours run: **`33982241187`**.

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
- filter-ready normalized `openingHours`: **282 / 648**;
- strict `recommendedDishes`: **27 / 648**;
- public `featuredDishes`: **124 / 648**;
- source-backed dish rows with reviewed Chinese featured output: **104 / 104**;
- 百名店: **22**.

Distance pools remain 137 / 220 / 359 / 648 at <=300 / <=500 / <=800 / <=1,200 m.

The address baseline is intentionally 259 rather than the earlier 261 because two historical low-quality/false address claims were removed.

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

### A/B/C official enrichment acceleration

Run `33980591040` replaced restaurant-by-restaurant official-site research with:

- **A** deterministic automatic promotion;
- **B** evidence-card review;
- **C** leave unknown when evidence is insufficient.

Bulk scale:

- official indexed production identities: **187**;
- incomplete targets fetched: **173**;
- already complete skipped: **14**;
- unique URLs fetched: **361**;
- duplicate requests avoided: **23**;
- main pages fetched successfully: **172 / 173**;
- B-review evidence cards: **120**.

Original overlapping B signals:

- address: 34;
- openingHours: 51;
- cuisine: 12;
- budget: 66;
- featuredDishes: 79.

The specialized parsers below progressively remove deterministic cases from that prepared review burden.

## Specialized opening-hours automation

### Trusted locator templates

PR #10 / run `33981430074` introduced current official store/branch locator parsing.

Validation:

- trusted locator targets: **32**;
- fetched: **31 / 32**;
- identity matches: **25**;
- raw safe locator patches: **7**;
- existing source-resolution conflicts automatically removed: **4**;
- accepted schedule refreshes: **3**.

This layer fixed flattened weekly text that could otherwise attach several intervals to one weekday. Generic-brand ambiguity remains locked rather than being reopened from a website URL alone.

Coverage stayed 278 because the three accepted rows already had schedules; the pass improved correctness/freshness rather than count.

### Existing-source direct official sites

Run **`33982241187`** introduced a second hours layer for source-backed restaurants with direct official pages.

Safety contract:

- existing independently maintained source support required;
- source-resolution identities excluded;
- chain locators handled separately;
- third-party/aggregator hosts excluded;
- current page fetch + page-title identity agreement required;
- explicit hours section required;
- at least five known day states after normalization;
- temporary, dated, seasonal, irregular and conditional calendars rejected;
- overlapping intervals rejected;
- previous generated shard removed before every refresh so target selection uses a clean baseline.

Final batch:

- direct official targets: **40**;
- current fetch success: **40 / 40**;
- identity matches: **28**;
- accepted schedules: **4**;
- all accepted schedules include full seven-day plus holiday state representation.

Accepted restaurants:

1. ヒナタ屋 — Mon-Sat 11:30-15:30; Sunday/holiday closed;
2. 眞踏珈琲店 — Mon-Sat 12:00-23:00; Sunday/holiday 12:00-21:00;
3. まぐろ市場 — weekdays 11:00-21:00; Sunday/holiday 11:00-15:00; Saturday closed;
4. 麺屋武蔵 巌虎 — daily/holiday 11:00-22:00.

Result:

- normalized opening hours: **278 -> 282**;
- source-backed production remains **397**;
- source-backed hours gap: **157 -> 153**.

No generic brand or new identity was admitted through this field-completion pass.

## Remaining production-field gaps

Among the **397 source-backed production restaurants**, current overlapping gaps are:

- `featuredDishes`: **275**;
- normalized `openingHours`: **153**;
- budget: **205**;
- address: **172**;
- non-generic cuisine: **28**.

Repeated hosts/templates remain the preferred next path. Restaurant-level manual research is reserved for ambiguous residual cases.

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

Static weekly schedules do not model conditional calendars such as holiday-eve hours or substitute closures. Those cases stay unknown/review-only.

Open-now runtime filtering remains disabled until coverage/freshness is strong enough.

## Dish semantics

- `recommendedDishes` — strict explicit recommendation/popularity/specialty evidence;
- `featuredDishes` — broader source-backed representative/signature/recommended dishes.

Dish and budget interpretation remain B-review unless a deterministic official host/template provides strong semantics. Speed must not turn representative items into unsupported recommendations.

## Stable official-source refresh rules

- previously reviewed stable enrichment survives transient website failures;
- freshness generators rebuild their own generated shard from a clean baseline;
- one `official` enrichment row per Place ID is preserved in the combined loader;
- field-specific official pages attach through `sourceRefs`;
- generic-brand identity conflicts are not automatically resolved by an official URL alone;
- ambiguous or condition-dependent schedules remain omitted.

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

The A/B/C acceleration, trusted locator pass and direct-official hours pass make **zero new Google Places requests**.

Routine continuation should use persisted official URLs, official store/menu templates, OSM/curated independent candidates and bounded review queues. Paid Google recovery remains manual-only.

## Current ordered work

1. Continue repeated-host/template automation for the remaining **153 opening-hours** gaps.
2. Build deterministic budget/price extraction for repeated official chain hosts.
3. Expand official-menu featured-dish processing while preserving strict recommendation semantics.
4. Resolve the remaining **207** current-production source outcomes.
5. Apply A/B/C review to the **56** prioritized expansion identities.
6. Then process the **2,103** untouched inventory-only identities in bounded independent-source batches.
7. Enable schedule-aware filtering only after a separate coverage/freshness review.

## Validation evidence

- normalized hours + initial featured dishes: `33977684773`;
- Pass 2: `33978590468`;
- full ledger + prioritized expansion queue: `33978820748`;
- Pass 3: `33979365931`;
- accelerated official enrichment: `33980591040`;
- trusted locator templates: `33981430074`;
- single-site official hours: **`33982241187`**.

Current authoritative metrics: **648 production / 397 source-backed / 441 source outcomes / 259 addresses / 282 filter-ready schedules / 124 featured dishes / 27 strict recommendations / 2,804 ledgered identities**.
