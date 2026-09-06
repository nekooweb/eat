# Area1 Data Enrichment Progress

Updated: 2026-09-06

## Current baseline

`TOKYO / 地区1️⃣` uses the confirmed complete **2,804-ID** Area1 snapshot as the full collection denominator.

- exact inventory: **2,804 / 2,804**;
- canonical production: **656**;
- production inside inventory: **653**;
- inventory-only: **2,151**;
- verified QC rows: **666**;
- source-backed production: **404 / 656**;
- source outcomes accounted for: **448 / 656**;
- unresolved production source queue: **208**;
- official-site index: **194** identities;
- cuisine known: **579**;
- address known: **268**;
- normalized opening hours: **287**;
- budget known: **192**;
- featured dishes: **129**;
- strict recommendations: **30**;
- 百名店: **22**.

## Latest continuation

The existing official-site index was bulk-refreshed first. It was largely saturated, so work shifted to adding new independent official sources for restaurants admitted during the full-range expansion.

Seven newly admitted production identities received maintainable official sources. Safe fields were added together in the same pass:

- source-backed production: **397 -> 404**;
- address: **261 -> 268**;
- normalized opening hours: **282 -> 287**;
- cuisine: **578 -> 579**;
- featured dishes: **125 -> 129**;
- strict recommendations: **27 -> 30**;
- source outcomes: **441 -> 448**;
- unresolved production source queue: **215 -> 208**.

Budget remains **192** because menu-item prices are not converted into restaurant spend ranges.

One newly admitted Bánh Mì identity remains OSM-only because no sufficiently clear maintainable official branch source was found in this pass. Conflicting or conditional opening-hour evidence was also left unknown rather than forced into the weekly model.

## Remaining work

1. Resolve the remaining **3 medium + 49 review** full-range OSM candidates.
2. Continue the **208** unresolved production source outcomes and collect all safe fields in the same pass.
3. Expand independent-source discovery across the remaining **2,151 inventory-only** identities, prioritizing reusable official locator/brand patterns.
4. Rebuild production, source queues and the full 2,804 ledger after each material identity batch.

## Data rules

- Google Place ID is the canonical identity key.
- Durable restaurant metadata requires maintainable independent sources.
- Google display payload is QC input, not the durable database.
- Missing or ambiguous data stays unknown.
- `recommendedDishes` requires explicit recommendation/popularity/signature evidence.
- `featuredDishes` may use broader source-backed representative items.
- `openingHours` contains only reliable normalized weekly schedules.
- budget requires explicit restaurant spend-range evidence.

## Cost rule

Routine continuation should use existing official URLs, OSM, trusted locators, Tabelog bindings and reviewed templates without new paid Google discovery. Enterprise `websiteUri` recovery remains budget-gated and manual-only.

Full collection is considered complete when **2,804 / 2,804 identities have an auditable maintenance outcome**, not when every optional field is forced non-null.
