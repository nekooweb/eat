# Area1 Data Enrichment Progress

Updated: 2026-09-06

## Current audited baseline

`TOKYO / 地区1️⃣` keeps the confirmed **2,804-ID** Area1 snapshot as a frozen historical benchmark.

Latest successful Pages audit after run `34032998440`:

- frozen exact inventory: **2,804 / 2,804**;
- canonical production: **656**;
- production inside inventory: **653**;
- legacy inventory-only IDs: **2,151**;
- current usable source indexed across Tabelog / official / Hot Pepper: **446 / 656 (68.0%)**;
- current explicit source resolutions: **38**;
- superseded historical resolutions: **6**;
- source outcomes currently accounted for: **484 / 656 (73.8%)**;
- unresolved production source queue: **172**;
- cuisine known: **601**;
- address known: **323**;
- normalized opening hours: **359**;
- any meal budget known: **274**;
- lunch budget known: **157**;
- dinner budget known: **254**;
- both meal budgets known: **137**;
- featured dishes: **129**;
- strict recommendations: **30**;
- 百名店: **22**;
- unprovenanced stored meal-price fields: **0**.

## Hot Pepper benchmark and landing

The configured authorized Hot Pepper key was validated and the real Area1 benchmark completed successfully in Actions run `34030943605`.

### Geographic collection

- 2 km Hot Pepper superset: **2,743** shops;
- exact local <=1.2 km crop: **870**;
- geographic pages: **28**.

### Matching

- matching seeds: **2,801**;
- high: **499**;
- medium: **36**;
- review: **2,019**;
- collision review: **65**;
- low: **176**;
- none: **6**;
- high/medium detail-eligible bindings: **535**;
- Hot Pepper-ID collision groups: **30**.

All **535** bound detail rows were returned in **27** <=20-ID requests.

The second strict automatic-use gate retained **128** existing-production candidates. Median coordinate distance was about **5.7 m** and median normalized/romanized name similarity was **0.96**.

### Net-new reconciliation

Before promotion the 128 candidates were compared with existing official/Tabelog/current production fields.

Net-new candidates:

- address: **+55**;
- cuisine: **+22**;
- dinner budget: **+84**;
- hours raw evidence: **+73**.

Existing dinner-price comparisons were not overwritten when stronger evidence already existed. Partial/disjoint conflicts remained on the stronger maintained source.

### Durable additive shard

The idempotent manual promotion produced the current durable Hot Pepper shard:

- source rows: **94**;
- address claims: **55**;
- cuisine claims: **22**;
- dinner-budget claims: **84**;
- hours raw claims: **73**;
- closure claims: **73**.

Measured canonical gains against a true no-Hot-Pepper baseline:

- restaurants with any known budget: **+81**;
- dinner prices: **+84**;
- address: **+55**;
- cuisine: **+22**;
- normalized opening hours: **+72**;
- known lunch prices overwritten: **0**;
- protected stronger values overwritten: **0**.

The additive production invariant reported **zero violations**.

## Independent lunch / dinner resolver

`scripts/price_resolver.mjs` resolves `lunch` and `dinner` independently.

This safely supports complementary evidence such as:

```text
Tabelog lunch + Hot Pepper dinner
```

without forcing one provider to own both meal periods.

Price claims require explicit `budget`, `lunchBudget` or `dinnerBudget` provenance.

Pages and Hot Pepper promotion run `STRICT_PRICE_PROVENANCE=1`.

### Evidence classes

- A / `explicit_range` — explicit branch-specific budget / average-spend range;
- B / `menu_derived` — reviewed representative range derived from a sufficiently complete official menu;
- C / `sparse` — one item/course/charge/promotion/search snippet; never enters hard canonical budget filtering.

Evidence strength is evaluated before source priority.

## First real B-class official-menu rollout

Two official-menu-derived records were landed in `data/source_enrichment_zzzzpricepatches.js`.

### 神田たまごけん神保町店

- exact Place ID: `ChIJ81Ua8xCMGGARMrzeHYIaVbg`;
- official current branch menu used;
- reviewed core-menu observed prices: 990 / 990 / 990 / 1,150 / 1,490 yen;
- seasonal/limited items excluded;
- resulting B-class lunch: **[990,1490]**;
- resulting B-class dinner: **[990,1490]**.

### シリ バラジ

- exact Place ID: `ChIJe49KxxWMGGAR4qS4zBvOWr8`;
- official Suidobashi lunch menu used;
- complete lunch sets: 800 / 900 / 1,400 yen;
- resulting B-class lunch: **[800,1400]**.

The first attempt exposed only an isolated-shard audit compatibility issue; no invalid deployment occurred. The compatibility path was fixed in commit `5e52ee073d53089f4a090114682361ab7f96aed9` and Pages run `34032998440` passed build, all audits and deployment.

### Measured coverage change

Before these two reviewed records:

- lunch 155;
- dinner 253;
- both 136;
- either 272.

After landing:

- lunch: **157 / 656**;
- dinner: **254 / 656**;
- both: **137 / 656**;
- either: **274 / 656**;
- lunch missing: **499**;
- dinner missing: **402**.

Strict provenance remains **0 unprovenanced price fields** and the price audit reports **0 material strong-source conflicts**.

## NARU data-quality correction

During resolver migration, `JAZZ HOUSE NARU` was found to have an old `dinner:[3000,4999]` value without any source ref claiming budget. Maintained official material supported a music charge/visit information, not a restaurant dinner-spend range.

The unsupported range was removed instead of inventing provenance. This correction is intentionally preserved as an example of why strict price provenance is required.

## Meal-aware enrichment queue

Current global price gaps:

- lunch: **499**;
- dinner: **402**.

Among identities already carrying a usable maintained source:

- lunch gaps: **289**;
- dinner gaps: **192**.

High-yield existing-source groups after the two official-menu additions:

- Tabelog-linked lunch gaps: **167**;
- Hot Pepper-linked lunch gaps: **83**;
- Hot Pepper-linked dinner gaps: **1**;
- repeated official brand/domain groups: Doutor, Tully's, Starbucks, C-United, Ginza Renoir and others.

Therefore the next phase remains **existing-source extraction first**, not broad restaurant/search discovery.

## Next execution order

1. Continue the **289 existing-source lunch gaps**, prioritizing exact official/Tabelog evidence.
2. Process repeated official domains/brands as templates where the same current menu structure is valid.
3. Use B-class `menu_derived` only when multiple comparable official menu prices establish a representative range and store the derivation inputs.
4. Keep single-item/cover-charge/promotional evidence as C-class and out of hard filtering.
5. Use already-maintained exact Tabelog bindings through permitted/reviewed workflows.
6. Use ordinary web/search only to discover an underlying official/permitted source after the existing-source queue is exhausted.
7. Continue OSM / Overture / other open-source work mainly for identity/address/category/currentness.
8. Continue the **172** unresolved source outcomes.
9. Keep medium/collision/inventory-only Hot Pepper matches review-only unless additional evidence supports a production decision.

## Data rules

- Historical Google Place IDs are compatibility keys, not an active paid provider.
- No paid Google place/search data API is executed by maintenance workflows.
- Missing or ambiguous fields remain unknown.
- Strong-source conflicts are retained; ranges are never silently averaged.
- A source-only price requires explicit field provenance.
- B-class official-menu-derived values must be reproducible from maintained observed prices.
- C-class sparse prices never enter hard budget filters.
- `recommendedDishes` requires explicit recommendation/popularity/signature evidence.
- `featuredDishes` may use broader reviewed source-backed representative items.
- `openingHours` contains only safely normalized weekly schedules.
- Automatic cross-source matching creates candidates; one weak source never admits a new production identity.
