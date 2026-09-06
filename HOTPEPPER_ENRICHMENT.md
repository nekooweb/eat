# Hot Pepper Area1 Enrichment

Updated: 2026-09-06

## Status

Hot Pepper Gourmet Web Service is a **first-class structured enrichment source**, but not the sole source of truth.

The successful real benchmark is GitHub Actions run `34030943605`.

Measured result:

- 2 km geographic superset: **2,743** shops;
- exact Area1 <=1.2 km crop: **870**;
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
- detail rows returned: **535 / 535**;
- current production identities with a Hot Pepper binding: **141**;
- inventory-only bindings: **394**;
- strict-safe current-production candidates: **128**.

The 128 strict-safe candidates were reconciled against stronger/existing fields before durable promotion. They were never treated as a blanket overwrite set.

## Authorization and secrets

Project-owner guidance states that the project is non-commercial and the intended Hot Pepper API use is separately authorized/confirmed.

The API key remains in GitHub Actions secrets and is never committed or injected into Pages.

## Request architecture

### Geographic discovery

`scripts/collect_hotpepper_area1.py discover` requests a 2 km superset around Area1 with `range=4`, `count=100` pagination, then deduplicates IDs and performs the exact <=1.2 km Haversine crop locally.

The benchmark required **28** geographic pages.

### Local record linkage

`scripts/match_hotpepper_inventory.py` uses the already-paid historical matching seed plus current production and Hot Pepper rows. No new Google request occurs.

Matching uses:

- spatial blocking and exact distance;
- normalized Japanese/Latin names;
- Japanese -> Hepburn romanization;
- address/postal evidence;
- best-vs-second candidate margin;
- one-Hot-Pepper-ID collision protection.

### Detail batching

Bound IDs are fetched in batches of at most **20**. The real benchmark retrieved **535 IDs in 27 requests**.

Do not replace this with one request per restaurant.

### Automatic-use gate

`scripts/build_hotpepper_enrichment.py` applies a second strict gate.

Rules:

- medium matches remain review-only;
- collisions remain review-only;
- inventory-only matches remain binding-ledger/review data;
- only strict-safe high matches attached to existing production can generate automatic field claims;
- one Hot Pepper match alone never creates a new production identity.

## Net-new reconciliation

The 128 strict-safe candidate rows produced these net-new opportunities:

- address: **55**;
- cuisine: **22**;
- dinner budget: **84**;
- hours raw evidence: **73**.

Existing dinner values were compared first. Partial/disjoint conflicts backed by stronger official/Tabelog evidence were not overwritten.

## Current durable additive shard

`data/source_enrichment_hotpepper.js` is regenerated idempotently against a true no-Hot-Pepper baseline.

Current durable rows: **94**.

Field claims:

- address: **55**;
- cuisine: **22**;
- dinner budget: **84**;
- hours raw: **73**;
- closure: **73**.

Measured canonical Hot Pepper gains:

- any meal budget: **+81 restaurants**;
- dinner budget: **+84**;
- address: **+55**;
- cuisine: **+22**;
- normalized hours: **+72**;
- existing lunch overwritten: **0**;
- protected stronger fields overwritten: **0**.

Promotion invariant violations: **0**.

## Independent meal resolver

`scripts/price_resolver.mjs` resolves lunch and dinner independently. This safely permits:

```text
Tabelog lunch + Hot Pepper dinner
```

without either provider deleting the other meal period.

Hot Pepper contributes **84 A-class explicit dinner-budget claims**.

Current global price coverage after the subsequent official-menu-derived rollout is:

- lunch: **157 / 656**;
- dinner: **254 / 656**;
- both: **137 / 656**;
- either: **274 / 656**.

The difference from the earlier 155/253/136/272 state comes from reviewed official B-class menu-derived evidence, not additional Hot Pepper calls.

## Field rules

### Name / address / identity

Hot Pepper ID is retained as a source-native alias. Safe exact-production bindings may contribute name/address evidence.

### Cuisine

Use the most specific available Hot Pepper sub-genre/genre and map it into Eat's Chinese cuisine taxonomy while retaining source lineage.

### Dinner budget

Provider-defined finite intervals are promoted conservatively:

- `2001～3000円` -> `[2001,3000]`;
- `～2000円` -> `[0,2000]` when it is a provider-defined upper-cap range;
- lower-bound-only ranges are not forced into a finite `[min,max]` value.

Hot Pepper dinner budget is A-class `explicit_range` evidence.

`lunch=あり` proves only lunch availability and is never converted into a lunch price.

### Hours / closure

Hot Pepper `open`/`close` strings remain source evidence. Canonical weekly hours are emitted only when the conservative normalizer can safely parse them.

### Attribution

The public page includes:

`Powered by ホットペッパーグルメ Webサービス`

Hot Pepper images are intentionally not ingested.

## Multi-source price interaction

See `PRICE_ENRICHMENT.md`.

Price evidence classes:

- A `explicit_range` — explicit official/Tabelog/Hot Pepper budget;
- B `menu_derived` — reviewed representative official-menu range;
- C `sparse` — one item/course/charge/search snippet, review only.

Evidence class outranks provider. Therefore an A-class Tabelog/Hot Pepper range beats a B-class official menu derivation even though official is otherwise the higher-priority provider.

Google Places price fields remain prohibited because repository maintenance forbids billable Google Places calls.

## Current gap interpretation

Hot Pepper has largely solved a portion of the **dinner** problem, not lunch.

Current global gaps:

- lunch missing: **499**;
- dinner missing: **402**.

Among Hot Pepper-linked production rows:

- lunch gaps: **83**;
- dinner gaps: **1**.

Across all production rows already carrying a usable maintained source:

- lunch gaps: **289**;
- dinner gaps: **192**.

The next enrichment phase therefore prioritizes existing official/Tabelog lunch evidence rather than additional Hot Pepper collection.

## Workflow safety

`.github/workflows/hotpepper-enrichment.yml` and `.github/workflows/promote-hotpepper-additive.yml` are manual-only.

The promotion workflow:

1. removes the previous Hot Pepper shard from the temporary build;
2. builds the no-Hot-Pepper baseline;
3. regenerates the complete additive shard;
4. rebuilds canonical production;
5. proves additive invariants;
6. runs strict price/source/repository audits;
7. commits only when durable data changes.

Normal pushes therefore do not consume Hot Pepper requests.

## Historical runs

- `34030289095` — exposed the earlier `tee`/pipefail masking issue and empty secret;
- `34030342882` — correctly failed API-key preflight after fail-fast fixes;
- `34030943605` — first fully successful real benchmark;
- `34032406916` — successful idempotent meal-aware promotion, producing the durable 94-row / 84-dinner-claim shard.

All active pipelines use `set -euo pipefail`, validate required outputs and make no paid Google data API calls.
