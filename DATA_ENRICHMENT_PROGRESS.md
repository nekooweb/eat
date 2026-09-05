# Area1 Data Enrichment Progress

Updated: 2026-09-06

## Current milestone

`TOKYO / 地区1️⃣` is in **source-backed field completion plus full-range identity accounting**.

The public product remains stable at 648 canonical restaurants. Data maintenance now uses confidence-tiered batch extraction and specialized official-site parsers rather than restaurant-by-restaurant research.

Missing or ambiguous fields remain omitted rather than guessed.

## Authoritative audited production state

Latest validated explicit official-field run: **`33982592924`**.

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
- address known: **261 / 648**;
- filter-ready normalized `openingHours`: **282 / 648**;
- strict `recommendedDishes`: **27 / 648**;
- public `featuredDishes`: **124 / 648**;
- source-backed dish rows with reviewed Chinese featured output: **104 / 104**;
- 百名店: **22**.

Distance pools remain 137 / 220 / 359 / 648 at <=300 / <=500 / <=800 / <=1,200 m.

Address history matters: the acceleration audit previously removed two historical bad claims and changed 261 -> 259. The current explicit-field pass adds two different, current official addresses, so **261 is now the corrected authoritative coverage**.

## A/B/C official enrichment acceleration

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

Original overlapping B signals were address 34, openingHours 51, cuisine 12, budget 66 and featuredDishes 79. Specialized parsers progressively remove deterministic cases from that prepared review burden.

## Specialized opening-hours automation

### Trusted locator templates

PR #10 / run `33981430074`:

- trusted locator targets: **32**;
- fetched: **31 / 32**;
- identity matches: **25**;
- raw safe locator patches: **7**;
- existing source-resolution conflicts automatically removed: **4**;
- accepted schedule refreshes: **3**.

This layer fixed flattened weekly text that could otherwise attach several intervals to one weekday. Generic-brand ambiguity remains locked rather than being reopened from a website URL alone.

### Existing-source direct official sites

PR #11 / run **`33982241187`**:

- existing-source direct official targets: **40**;
- current fetch success: **40 / 40**;
- identity matches: **28**;
- accepted schedules: **4**;
- normalized opening hours: **278 -> 282**;
- source-backed hours gap: **157 -> 153**.

Accepted restaurants: ヒナタ屋, 眞踏珈琲店, まぐろ市場 and 麺屋武蔵 巌虎.

The parser rejects temporary, dated, seasonal, irregular and conditional calendars and removes its previous generated shard before target selection so every refresh starts from the durable baseline.

## Explicit address / budget automation

Run **`33982592924`** tests a stricter A-tier for direct official pages.

Admission rules:

- existing independently maintained source support required;
- source-resolution identities excluded;
- known third-party/social/site-builder hosts excluded;
- current fetch + page-title identity agreement required.

Address is automatic only from an explicit `住所` / `所在地` label with a plausible Area1 value.

Budget is automatic only when the source explicitly identifies lunch/dinner plus `予算` / `平均` and supplies a numeric range or upper bound. Menu-item, course, product and beverage prices are not treated as restaurant budget.

Validation:

- eligible targets: **70**;
- current fetch success: **60 / 70**;
- identity matches: **39**;
- accepted patches: **2**;
- address patches: **2**;
- budget patches: **0**.

Accepted official addresses:

1. ヒナタ屋 — `東京都千代田区神田小川町3-10`;
2. 焼肉京城 — `東京都千代田区神田三崎町2-10-3`.

Result:

- address: **259 -> 261**;
- source-backed address gap: **172 -> 170**;
- budget remains **192**;
- source-backed budget gap remains **205**.

The zero-budget result is a useful negative result: generic A-tier budget inference from official menus should not be implemented. Budget remains B-review or host-specific only where explicit spend/average-budget semantics exist.

## Remaining production-field gaps

Among the **397 source-backed production restaurants**, current overlapping gaps are:

- `featuredDishes`: **275**;
- normalized `openingHours`: **153**;
- budget: **205**;
- address: **170**;
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

Missing day key = unknown; `[]` = explicitly closed; missing `openingHours` = no reliable weekly schedule. Static weekly schedules do not model conditional calendars such as holiday-eve hours or substitute closures.

Open-now runtime filtering remains disabled until coverage/freshness is strong enough.

## Dish and budget semantics

- `recommendedDishes` — strict explicit recommendation/popularity/specialty evidence;
- `featuredDishes` — broader source-backed representative/signature/recommended dishes;
- restaurant `lunch` / `dinner` budget — spend range, not menu-item price range.

Speed must not turn representative items into unsupported recommendations or menu prices into unsupported spending budgets.

## Stable official-source refresh rules

- reviewed stable enrichment survives transient website failures;
- freshness generators rebuild their own generated shard from a clean baseline when needed;
- one `official` enrichment row per Place ID is preserved in the combined loader;
- field-specific official pages attach through `sourceRefs`;
- generic-brand identity conflicts are not automatically resolved by an official URL alone;
- ambiguous/condition-dependent schedules remain omitted;
- unlabeled/free-text addresses and menu-price-derived budgets remain review-only.

## Full 2,804-ID maintenance ledger

`data/area1_inventory_ledger.json` accounts for every exact inventory Place ID without persisting full Google display payloads.

Current partition:

- inventory total: **2,804**;
- `production`: **645** inventory IDs;
- `inventory_only`: **2,159** inventory IDs;
- production IDs outside the exact inventory snapshot: **3**;
- verified QC Place IDs outside inventory snapshot: **4**.

`data/area1_inventory_expansion_queue.json` contains the first **56** inventory-only identities with **64** OSM candidate links. The same A/B/C approach should be applied to these 56 identities before the remaining **2,103** untouched inventory-only identities.

Full-range completion means every inventory identity receives an auditable maintenance outcome; it does not mean forcing all 2,804 identities into public production.

## Google API cost control

The A/B/C acceleration, locator, single-site hours and explicit budget/address passes make **zero new Google Places requests**.

Routine continuation should use persisted official URLs, official store/menu templates, OSM/curated independent candidates and bounded review queues. Paid Google recovery remains manual-only.

## Current ordered work

1. Compress/automate repeated official-menu featured-dish review while preserving strict recommendation semantics.
2. Continue deterministic host/template extraction for the remaining **153 opening-hours** gaps.
3. Keep budget at B-review/host-specific explicit-spend semantics; do not infer from menu prices.
4. Continue deterministic explicit-address extraction; current source-backed gap is **170**.
5. Resolve the remaining **207** current-production source outcomes.
6. Apply A/B/C review to the **56** prioritized expansion identities, then the remaining **2,103** inventory-only identities.
7. Enable schedule-aware filtering only after a separate coverage/freshness review.

## Validation evidence

- normalized hours + initial featured dishes: `33977684773`;
- Pass 2: `33978590468`;
- full ledger + prioritized expansion queue: `33978820748`;
- Pass 3: `33979365931`;
- accelerated official enrichment: `33980591040`;
- trusted locator templates: `33981430074`;
- single-site official hours: `33982241187`;
- explicit official address/budget: **`33982592924`**.

Current authoritative metrics: **648 production / 397 source-backed / 441 source outcomes / 261 addresses / 282 filter-ready schedules / 192 budget-known / 124 featured dishes / 27 strict recommendations / 2,804 ledgered identities**.
