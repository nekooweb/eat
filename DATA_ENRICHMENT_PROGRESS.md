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
- any meal budget known: **272**;
- lunch budget known: **155**;
- dinner budget known: **253**;
- both meal budgets known: **136**;
- featured dishes: **129**;
- strict recommendations: **30**;
- 百名店: **22**.

## 2026-09-06 Hot Pepper benchmark

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

The 128 candidates were compared against production before promotion.

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

## Independent lunch / dinner price resolver

The canonical builder now resolves `lunch` and `dinner` independently through `scripts/price_resolver.mjs`.

This removed the former coupling where one `budget` source row owned both meal periods. Complementary evidence can now coexist, for example:

```text
Tabelog lunch + Hot Pepper dinner
```

The three Hot Pepper dinner claims that were initially deferred because a lunch value already existed are now safely included. They increased `bothMealBudgetsKnown` from **133 -> 136** without changing the known lunch values.

Current strict price coverage:

- lunch known: **155 / 656 (23.6%)**;
- dinner known: **253 / 656 (38.6%)**;
- both known: **136 / 656 (20.7%)**;
- either known: **272 / 656 (41.5%)**;
- lunch missing: **501**;
- dinner missing: **403**.

### Evidence/provenance model

Price claims are ranked by evidence strength before source priority:

- A / `explicit_range` — explicit branch budget/average-spend range;
- B / `menu_derived` — reviewed range derived from a sufficiently complete official menu;
- C / `sparse` — one item/course/promotion/search-snippet style evidence; never enters the hard canonical budget filter.

A source-only meal price must explicitly claim `budget`, `lunchBudget`, or `dinnerBudget` in `sourceRefs`.

Pages and the Hot Pepper promotion workflow enforce `STRICT_PRICE_PROVENANCE=1`.

Current unprovenanced stored meal-price fields: **0**.

### NARU correction

The resolver migration exposed one old unsupported value: `JAZZ HOUSE NARU` had `dinner:[3000,4999]` in a source shard but neither maintained source claimed budget.

The maintained official material supports a music charge / visit information, not an explicit restaurant dinner-spend range. The old dinner array was therefore removed instead of retroactively attaching unsupported budget provenance.

This explains why the old descriptive count **273** became the stricter canonical **272**. The change is intentional data-quality correction, not lost valid coverage.

## Final additive Hot Pepper shard

The idempotent promotion workflow rebuilds a true no-Hot-Pepper baseline first, then regenerates the complete additive shard from benchmark `34030943605`.

Current durable Hot Pepper production shard:

- source rows: **94**;
- address claims: **55**;
- cuisine claims: **22**;
- dinner-budget claims: **84**;
- hours raw claims: **73**;
- closure claims: **73**.

Measured canonical gains against the strict no-Hot-Pepper baseline:

- address: **+55**;
- cuisine: **+22**;
- dinner prices: **+84**;
- restaurants with any known budget: **+81**;
- normalized opening hours: **+72**;
- lunch prices overwritten: **0**;
- protected existing values overwritten: **0**.

The production additive invariant reported **zero violations**.

The Hot Pepper promotion workflow is now **manual-only** (`workflow_dispatch`) so ordinary code/document changes cannot accidentally make authorized API requests.

## Meal-aware enrichment queue

`scripts/build_enrichment_queue.mjs` now treats price gaps separately.

Across all 656 production identities:

- lunch gaps: **501**;
- dinner gaps: **403**.

Among identities that already have a usable maintained source:

- lunch gaps: **291**;
- dinner gaps: **193**.

This means the next step is **not** broad web searching.

High-value existing-source groups include:

- Tabelog-linked rows needing lunch: **168**;
- Hot Pepper-linked rows needing lunch: **83**;
- Hot Pepper-linked rows needing dinner: **1**;
- recurring official chain/domain groups such as Doutor, Tully's, Starbucks, C-United, Ginza Renoir and others.

The queue emits actions such as:

- `extract_official_lunch_price`;
- `extract_tabelog_lunch_price`;
- `extract_official_dinner_price`;
- `extract_tabelog_dinner_price`;
- `discover_official_or_tabelog_lunch_source`.

Lunch is weighted highest because it is now the dominant price deficit.

## Resolution-history model

An older `source_resolution` record is not deleted when a later exact source becomes available.

Instead:

- the historical resolution remains as audit provenance;
- a same-day/newer usable source supersedes it for current-state reporting;
- if a resolution is newer than the usable source, the source-binding audit fails;
- current source-queue metrics exclude superseded historical resolutions from the unresolved/resolution denominator.

Current source status:

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
- ordinary web/Google search is a selective source-discovery tool, not a bulk factual database;
- search-result snippets are not canonical price evidence.

## Remaining work

1. Mine the **291 existing-source lunch gaps** before broad discovery.
2. Audit exact Tabelog bindings for missing explicit meal-period budget claims through permitted/reviewed workflows.
3. Process official domains by brand/template and classify any derived menu ranges as B-class evidence.
4. Keep single-item prices and charges as C-class evidence rather than forcing a budget range.
5. Use ordinary web/Google search selectively only after existing-source extraction is exhausted.
6. Continue OSM / Overture / other open-source reconciliation primarily for identity/address/category/currentness gaps.
7. Review the 36 medium Hot Pepper bindings, 65 collision-review identities and high-value inventory-only bindings only where they resolve a meaningful production gap.
8. Continue the **172** current unresolved source outcomes.
9. Add a source-native canonical identity key before future scope expansion.

## Data rules

- Existing Google Place IDs are frozen compatibility keys, not an active paid data provider.
- Durable metadata requires maintainable independent/authorized evidence.
- Missing or ambiguous data stays unknown.
- Strong-source conflicts are retained for review; ranges are not silently averaged.
- `recommendedDishes` requires explicit recommendation/popularity/signature evidence.
- `featuredDishes` may use broader source-backed representative items.
- `openingHours` contains only reliable normalized weekly schedules.
- hard budget filtering accepts only explicit or reviewed representative evidence with explicit field provenance.
- cross-source automated matching creates candidates; identity expansion is never justified by one weak source alone.
