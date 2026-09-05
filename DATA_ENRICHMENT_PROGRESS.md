# Area1 Data Enrichment Progress

Updated: 2026-09-06

## Current milestone

`TOKYO / 地区1️⃣` is in **source-backed field completion plus full-range identity accounting**.

The public product remains stable at 648 canonical restaurants. Data maintenance now uses confidence-tiered batch extraction, specialized official-site parsers and reviewed brand templates rather than restaurant-by-restaurant research.

Missing or ambiguous fields remain omitted rather than guessed.

## Authoritative audited production state

Latest validated reviewed-template run: **`33983081967`**.

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
- public `featuredDishes`: **125 / 648**;
- source-backed legacy dish rows with reviewed Chinese featured output: **105 / 105**;
- 百名店: **22**.

Distance pools remain 137 / 220 / 359 / 648 at <=300 / <=500 / <=800 / <=1,200 m.

## A/B/C official enrichment acceleration

Run `33980591040` replaced restaurant-by-restaurant official-site research with:

- **A** deterministic automatic promotion;
- **B** evidence-card review;
- **C** leave unknown when evidence is insufficient.

Bulk scale: 187 official-indexed production identities, 173 incomplete targets, 14 complete rows skipped, 361 unique URLs, 23 duplicate requests avoided, 172/173 main-page fetch success and 120 B-review evidence cards.

Original overlapping B signals were address 34, openingHours 51, cuisine 12, budget 66 and featuredDishes 79. Specialized parsers/templates progressively remove deterministic cases from that burden.

## Specialized opening-hours automation

### Trusted locator templates

PR #10 / run `33981430074`:

- trusted locator targets: **32**;
- fetched: **31 / 32**;
- identity matches: **25**;
- raw safe patches: **7**;
- source-resolution conflicts blocked: **4**;
- accepted schedule refreshes: **3**.

This layer fixes flattened weekly text and keeps generic-brand ambiguity locked rather than reopening it from a website URL alone.

### Existing-source direct official sites

PR #11 / run `33982241187`:

- direct official targets: **40**;
- fetch success: **40 / 40**;
- identity matches: **28**;
- accepted schedules: **4**;
- normalized opening hours: **278 -> 282**;
- source-backed hours gap: **157 -> 153**.

Accepted restaurants: ヒナタ屋, 眞踏珈琲店, まぐろ市場 and 麺屋武蔵 巌虎.

Temporary, dated, seasonal, irregular and conditional calendars are rejected.

## Explicit address / budget automation

PR #12 / run `33982592924`:

- eligible targets: **70**;
- current fetch success: **60 / 70**;
- identity matches: **39**;
- address patches: **2**;
- budget patches: **0**.

Accepted addresses:

1. ヒナタ屋 — `東京都千代田区神田小川町3-10`;
2. 焼肉京城 — `東京都千代田区神田三崎町2-10-3`.

Result: address **259 -> 261**, source-backed address gap **172 -> 170**. Budget remains **192**, because menu-item/course/product prices are not converted into restaurant spend ranges.

## Reviewed featured-dish template propagation

Run **`33983081967`** adds a reusable propagation layer for brand-menu semantics that were already reviewed in committed enrichment.

Components:

- `scripts/featured_template_registry.mjs`;
- `scripts/audit_featured_template_gaps.mjs`;
- `scripts/build_featured_template_propagation.mjs`;
- manual `.github/workflows/promote-featured-templates.yml`;
- generated `data/source_enrichment_zzzzzfeaturedtemplates.js`.

A template can propagate only to an exact production Place ID that:

- currently lacks `featuredDishes`;
- is already independently source-backed;
- has no `source_resolution` state.

Brand similarity is not identity evidence.

Audit/promotion result:

- reviewed template brands: **15**;
- production rows matching those brands: **46**;
- surface rows still missing featured dishes: **15**;
- source-backed missing rows: **1**;
- promoted: **1**;
- blocked: **14**;
- blocked by existing source-resolution state: **13**;
- blocked because not source-backed: **1**.

Promoted exact identity:

- `つじ田` — `ChIJJ8_bnU6NGGARsXyvg0mnXI0`;
- maintained sources already include official evidence;
- reviewed dish: `濃厚つけ麺` / `浓厚蘸面`;
- kind: `signature`;
- official menu source: `https://tsukemen-tsujita.com/menu/noukoutsukemen/`.

Result:

- featured dishes: **124 -> 125**;
- source-backed featured gap: **275 -> 274**;
- source-backed/legacy dish rows: **111 -> 112**;
- strict recommendations remain **27**.

All repository, source-binding, normalized-field and dish-gap audits passed.

The 14 blocked apparent same-brand gaps are generic or insufficiently sourced Starbucks, Doutor, Tully's, Royal Host, Café Veloce, Café de Crié or Tsujita identities. They remain unfilled until independent branch identity/source evidence exists.

## Remaining production-field gaps

Among the **397 source-backed production restaurants**, current overlapping gaps are:

- `featuredDishes`: **274**;
- normalized `openingHours`: **153**;
- budget: **205**;
- address: **170**;
- non-generic cuisine: **28**.

Reviewed chain-menu propagation is now close to saturated among source-backed same-brand identities. Further featured-dish gains should come from **new explicit representative/signature evidence**, grouped by host/menu pattern and reviewed once before being added to the registry.

## Data semantics

- `recommendedDishes` — strict explicit recommendation/popularity/specialty evidence;
- `featuredDishes` — broader source-backed representative/signature/recommended dishes;
- `lunch` / `dinner` — restaurant spend ranges, not menu-item price ranges;
- normalized `openingHours` — only filter-ready weekly schedules; conditional calendars remain unknown.

Speed must not weaken these semantics.

## Stable source rules

- reviewed stable enrichment survives transient website failures;
- freshness generators rebuild from a clean baseline when needed;
- generic-brand identity conflicts are not resolved by brand or menu similarity;
- unlabeled/free-text addresses remain review-only;
- menu prices do not create budget ranges;
- field-specific official evidence attaches through `sourceRefs`;
- one official enrichment row per Place ID is preserved in the combined loader.

## Full 2,804-ID maintenance ledger

`data/area1_inventory_ledger.json` accounts for every exact inventory Place ID without persisting full Google display payloads.

Current partition:

- inventory total: **2,804**;
- `production`: **645** inventory IDs;
- `inventory_only`: **2,159** inventory IDs;
- production outside exact inventory snapshot: **3**;
- verified QC Place IDs outside inventory snapshot: **4**.

`data/area1_inventory_expansion_queue.json` contains the first **56** inventory-only identities with **64** OSM candidate links. After current production-field work, the same A/B/C approach should be applied to these 56 before the remaining **2,103** untouched inventory-only identities.

## Google API cost control

The A/B/C acceleration, locator, single-site hours, explicit address/budget and featured-template passes make **zero new Google Places requests**.

Routine continuation should use persisted official URLs, reviewed templates, OSM/curated independent candidates and bounded review queues. Paid Google recovery remains manual-only.

## Current ordered work

1. Extract new explicit representative/signature items from current official menu pages; current source-backed featured gap is **274**.
2. Continue deterministic host/template extraction for the remaining **153 opening-hours** gaps.
3. Keep budget at B-review/host-specific explicit-spend semantics; do not infer from menu prices.
4. Continue deterministic explicit-address extraction; source-backed gap is **170**.
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
- explicit official address/budget: `33982592924`;
- reviewed featured-template propagation: **`33983081967`**.

Current authoritative metrics: **648 production / 397 source-backed / 441 source outcomes / 261 addresses / 282 filter-ready schedules / 192 budget-known / 125 featured dishes / 27 strict recommendations / 2,804 ledgered identities**.
