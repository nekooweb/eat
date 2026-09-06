# Hot Pepper Area1 Enrichment

Updated: 2026-09-06

## Status

Hot Pepper Gourmet Web Service is a **first-class structured enrichment source**, but not the sole source of truth.

The successful real benchmark is GitHub Actions run `34030943605`.

Measured result:

- 2 km geographic superset: **2,743** Hot Pepper shops;
- exact Area1 <=1.2 km crop: **870** shops;
- frozen historical inventory: **2,804** identities;
- usable matching seeds: **2,801**;
- high matches: **499**;
- medium matches: **36**;
- review matches: **2,019**;
- collision-review identities: **65**;
- low: **176**;
- none: **6**;
- high/medium detail-eligible bindings: **535**;
- Hot Pepper ID collisions: **30**;
- detail requests: **27** batches;
- detail rows returned: **535 / 535**, zero missing;
- current production identities with a Hot Pepper binding: **141**;
- inventory-only bindings: **394**;
- strict-safe current-production candidates: **128**.

The strict-safe 128 set is still not a blanket overwrite set. It is reconciled against stronger/existing fields before durable promotion.

## Authorization and secrets

Project-owner guidance states that the project is non-commercial and that the intended Hot Pepper API use is separately authorized/confirmed.

The API key is stored only as a GitHub Actions secret. The workflow accepts:

- `HOTPEPPER_API_KEY` (preferred);
- `HOTPEPPER_API`;
- `HOTPEPPER_KEY`;
- `RECRUIT_API_KEY`.

The successful run confirmed that `HOTPEPPER_API_KEY` is configured correctly.

## Request architecture

### 1. Geographic bulk discovery

`scripts/collect_hotpepper_area1.py discover` requests a 2 km superset around the Area1 center with:

- `range=4`;
- `count=100`;
- normal full rows rather than `type=lite`;
- pagination with `start`.

The benchmark required **28 geographic pages** to collect all 2,743 shops.

The collector then deduplicates Hot Pepper shop IDs, calculates exact Haversine distance locally and retains only <=1.2 km rows.

### 2. Local record linkage

`scripts/match_hotpepper_inventory.py` combines:

- the already-paid 2026-09-06 full-list/retry transient Google audit artifacts;
- current production identities;
- the Hot Pepper Area1 snapshot.

No new Google request occurs. Google display payload is used only transiently for matching and is not copied into durable Hot Pepper outputs.

Matching uses spatial blocking, distance, normalized names, Japanese->Hepburn romanization, address/postal evidence, best-vs-second margin and one-to-one Hot Pepper ID collision protection.

### 3. 20-ID detail batching

Bound Hot Pepper IDs are fetched in batches of at most 20 IDs.

The real benchmark requested **535 IDs in 27 requests** and returned all 535.

Do not replace this with one request per restaurant.

### 4. Binding and strict-safe candidate generation

`scripts/build_hotpepper_enrichment.py` produces:

- `hotpepper_bindings.json`;
- a strict-safe candidate `source_enrichment_hotpepper.js`;
- `hotpepper_promotion_report.json`;
- summary artifacts.

Rules:

- medium -> review only;
- collisions -> review only;
- inventory-only -> binding ledger only;
- only strict-safe high matches from existing production may generate automatic source claims;
- one Hot Pepper match alone never creates a new production identity.

The strict-safe 128 bindings have median coordinate distance about **5.7 m** and median normalized/romanized name similarity **0.96**.

## Net-new reconciliation

Before durable promotion, the 128 strict-safe rows were compared against current official/Tabelog/current production fields.

Net-new candidate fields were:

- address: **55**;
- cuisine: **22**;
- dinner budget: **84**;
- hours raw: **73**.

Existing dinner-price comparisons included:

- exact: 1;
- strong overlap: 19;
- partial overlap: 14;
- disjoint: 8.

All 22 partial/disjoint conflicts already had stronger maintained official/Tabelog evidence and were not overwritten.

## Current durable additive shard

The current durable `data/source_enrichment_hotpepper.js` is regenerated idempotently from the benchmark against a **no-Hot-Pepper baseline**.

Current rows: **94**.

Current field claims:

- address: **55**;
- cuisine: **22**;
- dinner budget: **84**;
- hours raw: **73**;
- closure: **73**.

Measured strict canonical gains from Hot Pepper:

- restaurants with any meal budget: **+81**;
- dinner known: **+84**;
- address: **+55**;
- cuisine: **+22**;
- normalized hours: **+72**;
- existing lunch prices overwritten: **0**;
- protected existing fields overwritten: **0**.

The promotion invariant audit reports **zero violations**.

## Independent meal resolver

The old single-row budget coupling has been removed.

`scripts/price_resolver.mjs` now resolves lunch and dinner independently. This permits:

```text
Tabelog lunch + Hot Pepper dinner
```

without one source deleting the other meal period.

The three Hot Pepper dinner candidates that were initially deferred because lunch was already known are now included safely.

Current price coverage:

- lunch: **155 / 656**;
- dinner: **253 / 656**;
- both: **136 / 656**;
- either: **272 / 656**.

Hot Pepper currently contributes **84 explicit dinner-budget claims**.

## Hot Pepper field rules

### Name / address / identity

Store Hot Pepper ID as a source-native alias. Safe exact-production bindings may contribute Japanese name/address claims.

### Cuisine

Use the most specific Hot Pepper sub-genre/genre evidence available and map it into Eat's versioned Chinese cuisine taxonomy. Preserve raw source codes/names for auditability.

### Dinner budget

Promote provider-defined finite intervals conservatively:

- `2001～3000円` -> `[2001, 3000]`;
- provider upper-cap `～2000円` -> `[0, 2000]`;
- lower-bound-only `10000円～` -> not forced into a finite `[min,max]` band.

Hot Pepper dinner-budget refs are meal-specific `dinnerBudget` claims and are A-class `explicit_range` evidence.

`lunch=あり` proves lunch availability only. It is not a lunch price.

### Hours / closure

Store `open` as raw source text and `close` as closure evidence. Canonical weekly hours are generated only when the conservative normalizer can parse the source safely.

### Attribution

The public page includes:

`Powered by ホットペッパーグルメ Webサービス`

Hot Pepper images are intentionally not ingested.

## Price is explicitly multi-source

See `PRICE_ENRICHMENT.md`.

Hot Pepper is the scalable structured first pass, **not** the only price method.

Price evidence is ranked by class before provider:

- A `explicit_range` — explicit official/Tabelog/Hot Pepper branch budget;
- B `menu_derived` — reviewed range derived from a sufficiently complete official menu;
- C `sparse` — single-item/course/charge/search-snippet evidence, review only.

This prevents one menu price or charge from becoming a restaurant spend range.

Google Places price fields remain prohibited because repository maintenance forbids billable Google Places calls. Ordinary Google/web search may only discover the underlying official/permitted source; the search snippet itself is not canonical evidence.

## Current gap interpretation

Hot Pepper has largely improved **dinner**, not lunch.

Current remaining gaps:

- lunch missing: **501**;
- dinner missing: **403**.

Among the 94 Hot Pepper production rows, the meal-aware queue reports:

- lunch gaps: **83**;
- dinner gaps: **1**.

Therefore the next enrichment work should prioritize existing official/Tabelog lunch evidence rather than making more Hot Pepper calls.

Across all production rows that already have a usable source there are **291 lunch gaps** and **193 dinner gaps**. Those existing bindings should be exhausted before broad new discovery.

## Workflow safety

`.github/workflows/hotpepper-enrichment.yml` and `.github/workflows/promote-hotpepper-additive.yml` are manual-only.

The promotion workflow is idempotent:

1. temporarily remove the previous durable Hot Pepper shard;
2. build the true no-Hot-Pepper baseline;
3. regenerate the complete additive shard from benchmark evidence;
4. rebuild canonical production;
5. prove additive invariants;
6. run strict price provenance, source-binding and repository audits;
7. commit only if the generated durable data changes.

Normal repository pushes therefore do not consume Hot Pepper requests.

## Historical implementation notes

- `34030289095`: exposed the old `tee`/pipefail false-success bug and empty secret;
- `34030342882`: correctly failed at API-key preflight after fail-fast fixes;
- `34030943605`: first fully successful benchmark with configured key;
- `34032406916`: successful idempotent meal-aware promotion, producing the 94-row / 84-dinner-claim shard.

All benchmark/promotion pipelines use `set -euo pipefail`, validate required outputs and make no paid Google data API calls.
