# Area1 Data Enrichment Progress

Updated: 2026-09-06

## Current milestone

`TOKYO / 地区1️⃣` has entered **source-backed field completion plus full-range identity accounting**.

The public product remains stable at 648 canonical restaurants. The current data work has two parallel goals:

1. improve useful fields for those 648 restaurants without weakening provenance;
2. process the complete 2,804-ID Area1 identity inventory through an auditable maintenance ledger and staged independent-source expansion.

Missing or ambiguous fields remain omitted rather than guessed.

## Authoritative audited production state

Latest successful zero-Google Pass 2 build (`33978590468`) and full-range ledger validation (`33978820748`):

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
- filter-ready normalized `openingHours`: **278 / 648**;
- strict `recommendedDishes`: **27 / 648**;
- structured public `featuredDishes`: **120 / 648**;
- legacy/source-backed dish rows with reviewed Chinese featured output: **100 / 100**;
- 百名店: **22**.

Distance pools remain 137 / 220 / 359 / 648 at <=300 / <=500 / <=800 / <=1,200 m.

## Pass 2 field-enrichment result

This pass was deliberately **zero Google Places API cost**. It reused the persisted 187-URL official-site index and official brand/menu pages.

Starting normalized baseline -> Pass 2 result:

- source-backed: **396 -> 397**;
- source outcomes: **440 -> 441**;
- unresolved current production: **208 -> 207**;
- filter-ready opening hours: **273 -> 278** (+5);
- featured dishes: **84 -> 120** (+36);
- maintained raw dish claims represented in canonical build: **72 -> 108**;
- strict recommendations: **27 -> 27**;
- cuisine: **571 -> 571**;
- budget: **192 -> 192**;
- address: **261 -> 261**.

All canonical, repository, source-binding and normalized-field audits passed.

### Stable official-data refresh rule

A failed website refetch is **not** evidence that a previously reviewed source or field became invalid.

An early Pass 2 attempt regenerated the automatic official shard from one network snapshot and would have reduced the stable 74-row automatic official set to 65 because some websites temporarily timed out. That result was rejected and never merged.

The corrected rule is:

- previously reviewed official enrichment remains stable;
- successful current refetches may add/replace supported fields;
- transient fetch failures do not delete earlier reviewed claims;
- stale facts are removed only after explicit contradictory/current evidence or manual review.

### Multiple official pages for one restaurant

A restaurant may legitimately have different official pages for different fields, for example:

- branch/store page -> address and opening hours;
- brand menu page -> representative dishes;
- campaign/product page -> explicit recommended/signature dish evidence.

The maintenance model still keeps one `official` enrichment row per Place ID. Later z-shards augment that row with field-specific `sourceRefs`; they do not create duplicate provider/Place-ID rows.

### Trusted locator hours

`scripts/build_locator_hours_enrichment.mjs` promotes current hours only from trusted official store-locator hosts and only when the result normalizes to the canonical weekly schedule.

It rejects temporary/stale wording such as temporary hours, COVID-era notices, year-end holiday hours, special opening notices and dated old announcements.

Pass 2 added **5** filter-ready schedules from trusted official locator pages. Generated data lives in `data/source_enrichment_zlocatorhours.js`.

## Featured dishes after Pass 2

The two dish concepts remain separate:

- `recommendedDishes` — strict explicit recommendation/popularity/specialty evidence;
- `featuredDishes` — broader source-backed representative/signature/recommended dishes used by the public UI.

Pass 2 added **36** additional exact-Place-ID featured-dish records using current official brand/menu pages. Major batch groups include Tully's, Starbucks, Doutor, Torikizoku, Hanamaru Udon, Royal Host, CoCo Ichibanya, Tsujita and additional current brand menus.

`representative` is used for stable/core menu items. `signature` requires official specialty/house-signature wording. `recommended` requires explicit recommendation/popularity wording. Seasonal products are avoided for durable representative coverage unless the project intentionally records them as time-bounded evidence.

Current featured coverage: **120 / 648**. Strict recommendation coverage remains **27 / 648**.

Every featured-dish row is exact-Place-ID keyed and must have a matching maintained `dishes` source claim. Unsupported rows fail the canonical build.

## Remaining field gaps among usable-source restaurants

After Pass 2, the usable-source set is **397** restaurants. Overlapping remaining gaps are:

- `featuredDishes`: **279**;
- normalized `openingHours`: **157**;
- budget: **205**;
- address: **170**;
- non-generic cuisine: **28**.

These remain the highest-value production-field queue because their source identities are already established.

## Full 2,804-ID maintenance ledger

`data/area1_inventory_ledger.json` now accounts for **every exact inventory Place ID** without persisting Google display names, addresses or coordinates.

Current ledger partition:

- inventory total: **2,804**;
- `production`: **645** inventory IDs;
- `inventory_only`: **2,159** inventory IDs;
- `verified_independent_source_not_production`: **0**;
- production IDs outside the exact inventory snapshot: **3**;
- verified QC Place IDs outside the inventory snapshot: **4**.

The earlier coverage metric `inventoryPlaceIdsWithoutVerifiedIndependentSource = 2,161` is not identical to `inventory_only = 2,159`. Two inventory production identities are not counted among the 643 OSM-QC-verified inventory IDs but are already admitted through other canonical/curated evidence, so they are correctly classified as production rather than pending expansion.

The ledger is Place-ID/status metadata only. Candidate-level rejection does not mean the Google identity itself is invalid.

## First full-range expansion queue

`data/area1_inventory_expansion_queue.json` extracts the highest-value zero-cost review subset from the 2,159 `inventory_only` identities.

Current queue:

- identities: **56**;
- OSM candidate links: **64**;
- identities with `name_mismatch` evidence: **27**;
- identities with `location_mismatch` evidence: **31**;
- missing OSM candidate rows: **0**.

Some identities have more than one candidate/reason, so reason counts overlap.

This queue is prioritized before the **2,103 untouched inventory-only identities** because an independent OSM candidate already exists and may be recoverable through branch-name changes, naming normalization, source updates or corrected location matching.

The queue is review evidence only. It does **not** assert that the rejected OSM candidate and the Google Place ID are the same business.

## Complete-range status semantics

Every exact inventory identity is tracked toward one auditable outcome:

1. `production` — already admitted to canonical production;
2. `inventory_only` — exact identity known, but no verified independent-source admission path yet;
3. future reviewed expansion outcomes may distinguish recoverable review, no-independent-source-yet or explicit terminal exclusion.

A candidate-level rejection is not a terminal identity exclusion.

Full-range completion means all 2,804 IDs have an explicit maintenance outcome, **not** that all 2,804 must appear in the public recommendation pool.

## Opening-hours contract

Canonical filter-ready format remains:

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
- missing `openingHours` = no reliable weekly schedule.

Raw `openingHoursRaw`, `closedDays` and `closedNote` stay maintenance-only. `hoursReference` is generated from normalized data.

Open-now runtime filtering remains disabled until coverage/freshness is strong enough. Unknown schedules must never be treated as closed by default.

## Google API cost control

The previous cost-sensitive recovery pass reached the project guardrail of **100 Enterprise `websiteUri` requests**, with a conservative worst-case exposure of USD 2.00 if fully billable.

**Pass 2 and the full inventory-ledger/expansion-queue work make zero new Google Places requests.**

Routine continuation should keep using:

- persisted independent official URLs;
- official store/menu templates;
- OSM/curated independent candidates;
- current maintenance ledger and expansion queue.

Paid Google recovery remains manual-only and should not be triggered merely to inflate coverage.

## Current ordered work

1. Continue zero-cost official/brand field batches for the remaining **157 opening-hours** and **279 featured-dish** gaps among source-backed production.
2. Continue budget/address/cuisine extraction where reliable current sources exist.
3. Resolve the remaining **207** current-production source outcomes.
4. Review the **56** prioritized inventory expansion identities, starting with name-mismatch/branch-name cases.
5. After that, work through the **2,103** untouched inventory-only identities in bounded discovery batches with independent-source requirements.
6. Apply the same normalized field contracts to every newly promoted identity.
7. Enable schedule-aware filtering only after a separate coverage/freshness review.

## Validation evidence

Key current runs:

- normalized hours + initial featured dishes: `33977684773`;
- Pass 2 zero-Google official/menu/locator batch: **`33978590468`**;
- full 2,804-ID ledger: `33978758946`;
- full ledger + 56-identity prioritized expansion queue: **`33978820748`**.

Current authoritative metrics: **648 production / 397 source-backed / 441 source outcomes / 278 filter-ready schedules / 120 featured dishes / 27 strict recommendations / 2,804 ledgered inventory identities**.
