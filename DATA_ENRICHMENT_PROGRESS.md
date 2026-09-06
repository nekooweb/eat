# Area1 Data Enrichment Progress

Updated: 2026-09-06

## Current baseline

`TOKYO / 地区1️⃣` keeps the confirmed **2,804-ID** Area1 snapshot as a frozen historical benchmark.

- frozen exact inventory: **2,804 / 2,804**;
- canonical production: **656**;
- production inside inventory: **653**;
- legacy inventory-only: **2,151**;
- verified historical QC rows: **666**;
- legacy Tabelog/official source-backed production: **404 / 656**;
- current usable source indexed across Tabelog / official / Hot Pepper: **446 / 656**;
- current explicit source resolutions: **38**;
- superseded historical resolutions: **6**;
- source outcomes currently accounted for: **484 / 656**;
- unresolved production source queue: **172**;
- official-site index: **194** identities;
- cuisine known: **601**;
- address known: **323**;
- normalized opening hours: **359**;
- budget known: **273**;
- featured dishes: **129**;
- strict recommendations: **30**;
- 百名店: **22**.

## 2026-09-06 Hot Pepper benchmark and additive promotion

The configured `HOTPEPPER_API_KEY` was validated and the first real Area1 benchmark completed successfully in Actions run `34030943605`.

### Geographic collection

- 2 km Hot Pepper geographic superset: **2,743** shops;
- exact local <=1.2 km crop: **870** shops;
- geographic pages: **28**.

### Matching to the frozen 2,804 identity snapshot

- matching seeds: **2,801**;
- high: **499**;
- medium: **36**;
- review: **2,019**;
- collision review: **65**;
- low: **176**;
- none: **6**;
- high/medium detail-eligible bindings: **535**;
- Hot Pepper-ID collision groups: **30**.

The 535 matched Hot Pepper IDs were fetched in **27 requests** using <=20-ID batching. All 535 returned successfully.

### Strict-safe current-production candidates

The second automatic-use gate retained **128** current-production candidates. Their matching quality was strong overall: median coordinate distance was approximately **5.7 m** and median normalized/romanized name similarity was **0.96**.

Potential fields available in those 128 rows:

- address: 128;
- cuisine: 127;
- dinner budget: 126;
- hours: 128;
- closure: 128.

These figures are source availability, not net-new production gain.

### Net-new / conflict audit

The 128 candidates were compared against current production before promotion.

Net-new candidate fields:

- address: **+55**;
- cuisine: **+22**;
- dinner budget: **+84**;
- opening-hours raw evidence: **+73**.

Existing dinner prices were compared rather than overwritten:

- exact same: 1;
- strong overlap: 19;
- partial overlap: 14;
- disjoint: 8;
- current dinner missing: 84.

All **22** partial/disjoint price conflicts already had strong current official/Tabelog evidence, so Hot Pepper was not allowed to replace them.

Three of the 84 missing-dinner identities already had a known lunch price. The current canonical builder still resolves both meal periods from one budget claim row, so those **3** dinner claims were deliberately deferred until lunch/dinner resolution is split. This prevents a dinner-only Hot Pepper row from accidentally deleting a known lunch value.

### Additive-only promotion

The durable promotion committed:

- `data/hotpepper_bindings.json`;
- `data/source_enrichment_hotpepper.js`.

Promotion mode is **additive-only**. It cannot overwrite an existing address, cuisine, dinner budget or normalized schedule.

Promoted source rows: **92**.

Field claims in the promoted shard:

- address: **55**;
- cuisine: **22**;
- dinner budget: **81**;
- hours raw: **73**;
- closure: **73**.

The production invariant audit reported **zero violations**.

Measured canonical gains:

- address: **268 -> 323**;
- cuisine: **579 -> 601**;
- budget known: **192 -> 273**;
- normalized opening hours: **287 -> 359**;
- lunch prices changed: **0**;
- dinner prices added: **81**;
- existing protected values changed: **0**.

Of the 73 new hours-text claims, **72** normalized safely into machine-readable weekly schedules; one remained raw evidence only.

## Multi-source price policy

Price completion is explicitly **not** a Hot-Pepper-only pipeline. See `PRICE_ENRICHMENT.md`.

Lunch and dinner should be resolved independently from multiple permitted sources:

1. current exact official branch/menu evidence;
2. exact Tabelog budget evidence already maintained / reviewed for the identity;
3. authorized Hot Pepper structured dinner budget;
4. representative official-menu-derived observed ranges;
5. weak/sparse evidence for review only.

Google Places price fields are not used because repository maintenance prohibits billable Google Places execution. Ordinary web/Google search may be used to discover an underlying official/menu/booking page, but the search-result snippet itself is not canonical price evidence.

The next price-resolver change should split the current restaurant-level budget winner into independent `lunch` and `dinner` claim resolution. This will allow complementary evidence such as Tabelog lunch + Hot Pepper dinner without discarding either meal period.

## Resolution-history model

An older `source_resolution` record is no longer deleted when a later exact source becomes available.

Instead:

- the historical resolution remains as audit provenance;
- a same-day/newer usable source supersedes it for current-state reporting;
- if a resolution is newer than the usable source, the source-binding audit fails;
- current source-queue metrics exclude superseded historical resolutions from the unresolved/resolution denominator.

After Hot Pepper promotion:

- usable source indexed: **446 / 656 (68.0%)**;
- current explicit resolutions: **38**;
- superseded historical resolutions: **6**;
- source outcomes accounted for: **484 / 656 (73.8%)**;
- unresolved: **172**.

## Billable-API transition remains in force

The Hot Pepper addition does not relax the zero-paid-Google policy.

- no Google Places / Area Insights / Text Search / Place Details / paid website discovery;
- historical Google Place IDs/QC state are frozen compatibility inputs;
- no Google API key is injected into Pages;
- Hot Pepper API usage is authorized/free and secret-backed;
- open POI sources and official pages remain secondary identity/content sources;
- direct web search is a gap-discovery tool, not a bulk factual database.

## Remaining work

1. Split price resolution into independent lunch/dinner claims.
2. Apply existing exact Tabelog/official evidence to remaining meal-period gaps before doing new web discovery.
3. Group remaining official-menu discovery by brand/domain/template so one fetch can enrich many identities.
4. Use direct search selectively for unresolved independent restaurants and retain the underlying source URL as evidence.
5. Continue OSM / Overture / other open-source reconciliation primarily for identity/address/category/currentness gaps.
6. Review the 36 medium Hot Pepper bindings, 65 collision-review identities and high-value inventory-only bindings only where they can resolve a meaningful production gap.
7. Continue the **172** current unresolved source outcomes.
8. Add a source-native canonical identity key before future scope expansion.

## Data rules

- Existing Google Place IDs are frozen compatibility keys, not an active paid data provider.
- Durable metadata requires maintainable independent/authorized evidence.
- Missing or ambiguous data stays unknown.
- Strong-source conflicts are retained for review; ranges are not silently averaged.
- `recommendedDishes` requires explicit recommendation/popularity/signature evidence.
- `featuredDishes` may use broader source-backed representative items.
- `openingHours` contains only reliable normalized weekly schedules.
- budget requires explicit/authorized spend-range evidence or a separately labeled representative official-menu derivation.
- cross-source automated matching creates candidates; identity expansion is never justified by one weak source alone.
