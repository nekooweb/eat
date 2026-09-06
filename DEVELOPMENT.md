# Eat Development Plan

Updated: 2026-09-06

## Current state

`TOKYO / 地区1️⃣` has completed the expensive restaurant-list/identity capture stage. The frozen historical Area1 snapshot remains **2,804** exact Google Place IDs and must not be recollected with paid Google APIs.

Latest audited production state after Pages run `34032998440`:

- frozen historical inventory: **2,804**;
- canonical production: **656**;
- production inside frozen inventory: **653**;
- inventory-only legacy IDs: **2,151**;
- usable maintained source indexed: **446 / 656 (68.0%)**;
- current source outcomes accounted for: **484 / 656 (73.8%)**;
- unresolved current source queue: **172**;
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

`DATA_ENRICHMENT_PROGRESS.md` is the numeric progress report. `PRICE_ENRICHMENT.md` defines meal-price evidence and resolver policy. `HOTPEPPER_ENRICHMENT.md` documents the authorized Hot Pepper path. `DATA_SCHEMA.md` is the runtime-field contract.

## Primary objective

Restaurant discovery is no longer the main problem.

Optimize:

> trustworthy useful fields completed per authorized/free request, source fetch and review minute for the already-known Area1 identities.

Current priority:

1. **P0** — identity/source binding, currentness, name, address/coordinates, cuisine;
2. **P1** — lunch and dinner price evidence resolved independently;
3. **P2** — normalized hours, regular closure, phone/menu/source URLs;
4. **P3** — representative dishes and strict recommendations.

Do not return to large-scale paid restaurant discovery unless a later measured recall audit demonstrates a material gap in the frozen 2,804-ID universe.

## Billable API prohibition

Repository maintenance must not execute billable Google place/search/map data APIs.

- no live Google Places / Area Insights / Text Search / Place Details;
- no paid place/search fallback;
- no Google API key injected into Pages;
- historical Place IDs/QC are frozen compatibility inputs only;
- retired paid scripts remain fail-closed;
- CI runs `scripts/audit_no_paid_apis.mjs` and currently reports zero hits.

Ordinary external Google Maps links may remain as navigation links. Ordinary web/search can be used selectively to discover an underlying official/permitted page, but search snippets are not durable factual evidence.

## Hot Pepper structured enrichment

The project owner states that this project is non-commercial and the intended Hot Pepper API usage has separate authorization/confirmation. The repository uses that project-specific authorization assumption.

The real benchmark completed successfully in Actions run `34030943605`:

- 2 km geographic superset: **2,743** Hot Pepper shops;
- exact <=1.2 km crop: **870**;
- high matches: **499**;
- medium matches: **36**;
- high/medium detail-eligible bindings: **535**;
- detail retrieval: **535 / 535** in **27** <=20-ID requests;
- strict-safe existing-production candidates: **128**.

After conflict/net-new reconciliation, the durable additive shard contains **94** source rows with:

- address claims: **55**;
- cuisine claims: **22**;
- dinner-budget claims: **84**;
- hours raw claims: **73**;
- closure claims: **73**.

Measured Hot Pepper canonical gains against the no-Hot-Pepper baseline:

- any meal budget: **+81 restaurants**;
- dinner budget: **+84**;
- address: **+55**;
- cuisine: **+22**;
- normalized hours: **+72**;
- existing lunch values overwritten: **0**;
- protected stronger values overwritten: **0**.

The promotion workflow is manual-only and idempotent. Ordinary pushes do not consume Hot Pepper requests.

## Independent meal-price architecture

`scripts/price_resolver.mjs` now resolves `lunch` and `dinner` independently. One provider no longer owns both meal periods.

Valid example:

```text
Tabelog lunch + Hot Pepper dinner
```

Price claims require explicit provenance through one of:

- `budget`;
- `lunchBudget`;
- `dinnerBudget`.

Pages and the Hot Pepper promotion workflow enforce `STRICT_PRICE_PROVENANCE=1`.

### Evidence classes

Price evidence is ranked before provider priority:

- **A / `explicit_range`** — explicit branch budget / average-spend range; hard-filter eligible;
- **B / `menu_derived`** — reviewed representative range derived from a sufficiently complete official menu; used only when no A-class range exists;
- **C / `sparse`** — one item/course/charge/promotion/search snippet; review/display evidence only and never a hard restaurant budget.

Within equal A-class evidence, provider order is current official branch > Tabelog > authorized Hot Pepper > lower-priority maintained sources. Freshness breaks ties.

Strong-source conflicts are not averaged silently.

## Official-menu-derived price rollout

`data/source_enrichment_zzzzpricepatches.js` is the reviewed B-class patch layer. It augments an existing exact official binding during the canonical build and stores the derivation method/observed prices for auditability.

First landed records:

1. **神田たまごけん神保町店** — official current core-menu prices produce representative `[990,1490]` for lunch and dinner; seasonal/limited items are excluded.
2. **シリ バラジ** — official Suidobashi lunch menu lists complete lunch sets at 800 / 900 / 1400 yen, producing lunch `[800,1400]`.

These two reviewed additions moved strict coverage from:

```text
lunch 155 -> 157
dinner 253 -> 254
both 136 -> 137
any 272 -> 274
```

The strict provenance audit remains **0** and material strong-price conflicts remain **0** after this rollout.

## Current enrichment queue

The queue is meal-aware and generated by `scripts/build_enrichment_queue.mjs`.

Global remaining gaps:

- lunch: **499**;
- dinner: **402**.

Among restaurants that already have a usable maintained source:

- lunch gaps: **289**;
- dinner gaps: **192**.

High-value groups currently include:

- Tabelog-linked lunch gaps: **167**;
- Hot Pepper-linked lunch gaps: **83**;
- Hot Pepper-linked dinner gaps: **1**;
- repeated official domains/brands such as Doutor, Tully's, Starbucks, C-United, Ginza Renoir and others.

This means the next phase must exhaust **existing-source extraction before broad new source discovery**.

## Execution order from here

1. Process existing exact official/Tabelog lunch gaps first; lunch is the largest deficit.
2. Batch repeated official domains/brand menu templates instead of fetching restaurants one by one.
3. Promote an official menu-derived budget only when multiple comparable current prices support a representative range; mark it `menu_derived` and retain observed prices/derivation notes.
4. Keep single-item/cover-charge/promotion-only evidence as C-class and out of hard budget filters.
5. Review exact Tabelog bindings through permitted/reviewed workflows; do not copy review text.
6. Use ordinary web/search only for identities still lacking a usable underlying source after the existing-source queue is exhausted.
7. Keep OSM / Overture / Foursquare OS focused mainly on identity, address, category and currentness/conflict checks rather than restaurant prices.
8. Continue the **172** unresolved source outcomes independently of price completion.
9. Keep the 36 medium Hot Pepper matches, collision cases and inventory-only bindings review-only unless additional evidence justifies a production decision.
10. Add a source-native canonical identity key before expanding beyond the current compatibility-ID architecture.

## Data integrity rules

- Missing or ambiguous data remains unknown.
- A weak source never overwrites a stronger maintained exact claim.
- A price array without explicit field provenance is ignored and fails strict audit when stored in a source shard.
- B-class menu-derived values must be reproducible from a maintained official page.
- C-class sparse prices never become restaurant budget bands.
- Raw schedule prose is not exposed as normalized hours unless the conservative normalizer can safely parse it.
- `recommendedDishes` requires explicit recommendation/popularity/signature evidence.
- `featuredDishes` may use broader reviewed source-backed representative items.
- Cross-source automatic matching generates candidates; one weak match never admits a new production identity.

## Runtime contract

The public product remains a static GitHub Pages application. Recommendation behavior remains: <=1,200m, current canonical production identities, cuisine/budget/distance filters, three distinct results when possible, cuisine-diversity preference, Web Crypto randomness, 百名店 weight 2.2 and no rating/review popularity ranking.

Embedded maps use Leaflet/OpenStreetMap. Hot Pepper images are not ingested. The required Hot Pepper service credit remains on the public page.
