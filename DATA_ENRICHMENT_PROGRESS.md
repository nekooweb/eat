# Area1 Data Enrichment Progress

Updated: 2026-09-06

## Current baseline

`TOKYO / 地区1️⃣` keeps the confirmed **2,804-ID** Area1 snapshot as a frozen historical benchmark.

- frozen exact inventory: **2,804 / 2,804**;
- canonical production: **656**;
- production inside inventory: **653**;
- legacy inventory-only: **2,151**;
- verified historical QC rows: **666**;
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

## Latest enrichment continuation

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

## 2026-09-06 maintenance policy transition

The prior strategy still left several billable Google maintenance paths available behind manual controls/cost caps. They are now disabled.

From this point:

- no paid Places/Area Insights/Text Search/Place Details/website discovery calls are permitted;
- historical Google Place IDs/QC state are frozen inputs only;
- the Pages build no longer injects the shared Google API key;
- new large-batch discovery uses Overture Maps public GeoParquet plus OSM/open official sources;
- Overture↔OSM agreement is used to prioritize review of persisted historical candidate relationships without re-querying Google;
- official field extraction continues from existing/open URLs with URL/host deduplication and conservative field promotion.

This changes the meaning of “full collection”. The 2,804 snapshot remains the historical denominator, but an opaque legacy ID is not forcibly refreshed when doing so would require a paid API. Such identities remain frozen/unresolved until independent evidence is sufficient.

## Remaining work

1. Generate the Overture Area1 staging snapshot.
2. Build and review the open-source reconciliation queue, starting with the existing **3 medium + 49 review** historical OSM candidates.
3. Continue the **208** unresolved production source outcomes using existing/open official sources only.
4. Expand current independent-source coverage without treating every opaque historical ID as a mandatory live lookup.
5. Rebuild production/source ledgers after each material reviewed identity batch.
6. Add a source-native canonical identity key before future scope expansion.

## Data rules

- Existing Google Place IDs are frozen compatibility keys, not an active data provider.
- Durable restaurant metadata requires maintainable independent sources.
- Missing or ambiguous data stays unknown.
- `recommendedDishes` requires explicit recommendation/popularity/signature evidence.
- `featuredDishes` may use broader source-backed representative items.
- `openingHours` contains only reliable normalized weekly schedules.
- budget requires explicit restaurant spend-range evidence.
- cross-source automated matching produces review candidates, not automatic truth.
