# Area1 Data Enrichment Progress

Updated: 2026-09-06

## Current milestone

`TOKYO / 地区1️⃣` is in **source-backed field completion plus full-range identity accounting**.

The public product remains stable at 648 canonical restaurants. Current work has two parallel goals:

1. improve durable fields for those 648 restaurants without weakening provenance;
2. process the complete 2,804-ID Area1 identity inventory through an auditable maintenance ledger and staged independent-source expansion.

Missing or ambiguous fields are omitted rather than guessed.

## Authoritative audited production state

Latest validated state after Pass 3:

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
- structured public `featuredDishes`: **124 / 648**;
- source-backed dish rows with reviewed Chinese featured output: **104 / 104**;
- 百名店: **22**.

Distance pools remain 137 / 220 / 359 / 648 at <=300 / <=500 / <=800 / <=1,200 m.

## Field-enrichment history

### Normalization pass

PR #6 established the current field contracts:

- descriptive schedule prose became structured `openingHours`;
- ambiguous/irregular schedules are omitted rather than inferred;
- `recommendedDishes` remains strict;
- broader public `featuredDishes` supports `representative`, `signature` and `recommended` semantics.

After that pass:

- openingHours: **273 / 648**;
- featuredDishes: **84 / 648**;
- strict recommendations: **27 / 648**.

### Pass 2 — zero-Google official/menu/locator batch

Authoritative run: `33978590468`.

Result:

- source-backed: **396 -> 397**;
- source outcomes: **440 -> 441**;
- unresolved current production: **208 -> 207**;
- filter-ready opening hours: **273 -> 278** (+5);
- featured dishes: **84 -> 120** (+36);
- maintained raw dish claims represented in the canonical build: **72 -> 108**;
- strict recommendations: **27 -> 27**.

Pass 2 reused the persisted official-site index and current official brand/menu pages. It made **zero new Google Places requests**.

### Pass 3 — current official-menu continuation

PR #8 adds four exact-Place-ID featured-dish records from current official menu/business pages:

- Café Veloce 神保町店 — blend coffee, `representative`;
- another canonical Café Veloce identity — blend coffee, `representative`;
- Domino's Pizza 淡路町 — Domino Deluxe, `representative`;
- YEBISU BAR 御茶ノ水店 — YEBISU BAR meat tofu and sea-bream fish & chips, `signature`.

Result:

- featuredDishes: **120 -> 124** (+4);
- source-backed dish rows with reviewed Chinese featured output: **100 -> 104**;
- current featured-dish gap among source-backed production: **279 -> 275**;
- openingHours remains **278**;
- source-backed remains **397**;
- source outcomes remain **441**;
- no Google Places calls.

The Pass 3 shard is exact-Place-ID keyed and adds field-specific official `dishes` provenance. Seasonal-only products are avoided for durable representative coverage.

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

Rules:

- missing day key = unknown;
- `[]` = explicitly closed;
- intervals = known opening periods;
- missing `openingHours` = no reliable weekly schedule;
- timezone = `Asia/Tokyo`.

Raw `openingHoursRaw`, `closedDays` and `closedNote` stay maintenance-only. Public `hoursReference` is generated from normalized data.

Open-now filtering remains disabled until coverage/freshness is strong enough. Unknown schedules must never be treated as closed by default.

## Stable official-source refresh rule

A failed website refetch is **not** evidence that a previously reviewed source or field became invalid.

Rules:

- previously reviewed official enrichment remains stable;
- successful current refetches may add/replace supported fields;
- transient fetch failures do not delete earlier reviewed claims;
- stale facts are removed only after explicit contradictory/current evidence or manual review.

This prevents network volatility from silently reducing durable data coverage.

## Multiple official pages for one restaurant

Different official pages may support different fields:

- branch/store page -> address and opening hours;
- brand menu page -> representative dishes;
- product/campaign page -> explicit recommended/signature evidence.

The combined canonical loader keeps one `official` enrichment row per Place ID. Later `z`/`zz` shards augment that row through field-specific `sourceRefs` rather than adding duplicate provider rows.

Source shards must also be standalone-auditable because coverage/report tooling can load them individually.

## CI hardening discovered in Pass 3

PR #8 exposed a false-positive risk in the Pages Coverage report step.

Commands such as:

```bash
node scripts/coverage_report.mjs | tee _audit/coverage.json
```

can report pipeline exit status 0 when `node` fails unless shell `pipefail` is enabled.

The Pages workflow now adds:

```bash
set -o pipefail
```

before all coverage/report pipelines. Report-generator failures therefore fail CI instead of being masked by `tee`.

The Pass 3 shard was also made self-contained for standalone report loading, while still augmenting existing official rows in the canonical combined loader.

## Remaining field gaps among usable-source restaurants

The usable-source set is **397** restaurants. Current overlapping gaps after Pass 3:

- `featuredDishes`: **275**;
- normalized `openingHours`: **157**;
- budget: **205**;
- address: **170**;
- non-generic cuisine: **28**.

These remain the highest-value production-field queue because their source identities are already established.

## Full 2,804-ID maintenance ledger

`data/area1_inventory_ledger.json` accounts for **every exact inventory Place ID** without persisting Google display names, addresses or coordinates.

Current partition:

- inventory total: **2,804**;
- `production`: **645** inventory IDs;
- `inventory_only`: **2,159** inventory IDs;
- `verified_independent_source_not_production`: **0**;
- production IDs outside the exact inventory snapshot: **3**;
- verified QC Place IDs outside the inventory snapshot: **4**.

The ledger is Place-ID/status metadata only. Candidate-level rejection does not mean the Google identity itself is invalid.

The older metric `inventoryPlaceIdsWithoutVerifiedIndependentSource = 2,161` differs from `inventory_only = 2,159` because two inventory production identities are already admitted through other canonical/curated evidence even though they are not among the 643 OSM-QC-verified inventory IDs.

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

The queue is review evidence only. It does **not** assert that the rejected OSM candidate and Google Place ID are the same business.

## Complete-range status semantics

Every exact inventory identity is tracked toward one auditable outcome:

1. production;
2. recoverable/needs-review independent-source candidate;
3. no-independent-source-yet;
4. explicit terminal exclusion where justified.

Full-range completion means all 2,804 IDs have an explicit maintenance outcome, **not** that all 2,804 must appear in the public recommendation pool.

## Google API cost control

The previous cost-sensitive recovery pass reached the project guardrail of **100 Enterprise `websiteUri` requests**, with a conservative worst-case exposure of USD 2.00 if fully billable.

**Pass 2, Pass 3, the full inventory ledger and expansion queue make zero new Google Places requests.**

Routine continuation should use:

- persisted independent official URLs;
- official store/menu templates;
- OSM/curated independent candidates;
- current maintenance ledger and expansion queue.

Paid Google recovery remains manual-only and should not be triggered merely to inflate coverage.

## Current ordered work

1. Continue zero-cost official/brand batches for the remaining **157 opening-hours** and **275 featured-dish** gaps among source-backed production.
2. Continue budget/address/cuisine extraction where reliable current sources exist.
3. Resolve the remaining **207** current-production source outcomes.
4. Review the **56** prioritized inventory expansion identities, starting with name-mismatch/branch-name cases.
5. Then work through the **2,103** untouched inventory-only identities in bounded discovery batches with independent-source requirements.
6. Apply the same normalized field contracts to every newly promoted identity.
7. Enable schedule-aware filtering only after a separate coverage/freshness review.

## Validation evidence

Key current runs:

- normalized hours + initial featured dishes: `33977684773`;
- Pass 2 zero-Google official/menu/locator batch: `33978590468`;
- full ledger + 56-identity prioritized expansion queue: `33978820748`;
- Pass 3 PR validation with coverage pipeline hardening: `33979365931`.

Current authoritative metrics: **648 production / 397 source-backed / 441 source outcomes / 278 filter-ready schedules / 124 featured dishes / 27 strict recommendations / 2,804 ledgered inventory identities**.
