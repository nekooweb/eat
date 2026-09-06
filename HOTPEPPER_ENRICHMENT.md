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
- strict-safe current-production enrichment rows: **128**.

Strict-safe 128-row field claims:

- address: **128**;
- cuisine: **127**;
- dinner budget: **126**;
- opening-hours raw text: **128**;
- closure evidence: **128**;
- name: **128**.

The 128-row set is still a **candidate enrichment shard**, not blanket automatic production expansion. Inventory-only identities remain review-only.

## Authorization and secrets

Project-owner guidance states that the project is non-commercial and that the intended Hot Pepper API use is separately authorized/confirmed.

The API key is stored only as a GitHub Actions secret. The workflow accepts:

- `HOTPEPPER_API_KEY` (preferred);
- `HOTPEPPER_API`;
- `HOTPEPPER_KEY`;
- `RECRUIT_API_KEY`.

The successful run confirmed that `HOTPEPPER_API_KEY` is now configured correctly.

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

No new Google request occurs. Google display payload is used only transiently for matching and is not copied into the durable Hot Pepper outputs.

Matching uses:

- spatial blocking;
- distance;
- normalized Japanese/Latin names;
- Japanese -> Hepburn romanization with `pykakasi`;
- address/postal evidence;
- best-vs-second candidate margin;
- one-to-one Hot Pepper ID collision protection.

### 3. 20-ID detail batching

Hot Pepper's official API supports up to 20 shop IDs per request and accepts repeated or comma-separated values.

The real benchmark requested **535 IDs in 27 requests** and returned all 535.

Do not replace this with one request per restaurant.

### 4. Safe promotion candidate generation

`scripts/build_hotpepper_enrichment.py` produces:

- `hotpepper_bindings.json`;
- `source_enrichment_hotpepper.js`;
- `hotpepper_promotion_report.json`;
- the summary artifact.

Rules:

- medium -> review only;
- collisions -> review only;
- inventory-only -> binding ledger only;
- only strict-safe high matches from existing production may generate source field claims;
- one Hot Pepper match alone never creates a new production identity.

The strict-safe 128 bindings are strong overall: median distance is approximately **5.7 m** and median name similarity is **0.96**. The farthest safe match is 43 m with exact-name similarity 1.0.

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

`lunch=あり` proves lunch availability only. It is not a lunch price.

### Hours / closure

Store `open` as raw source text and `close` as closure evidence. Canonical weekly hours are generated only when the existing conservative normalizer can parse the source safely.

### Attribution

The public page includes:

`Powered by ホットペッパーグルメ Webサービス`

Hot Pepper images are intentionally not ingested.

## Price is explicitly multi-source

See `PRICE_ENRICHMENT.md`.

Hot Pepper is the scalable structured first pass, **not** the only price method.

Lunch and dinner must be resolved independently from the strongest available evidence.

Recommended source roles:

1. exact current official branch/menu evidence;
2. exact Tabelog budget evidence where maintained/permitted;
3. Hot Pepper structured dinner budget;
4. official-menu-derived observed bands;
5. sparse evidence only for review/display.

Google Places `priceLevel` / `priceRange` must not be used because repository maintenance prohibits billable Google Places calls. Ordinary Google/web search may be used only to discover the underlying official/permitted source; search snippets are not canonical database evidence.

## Existing builder interaction

The current production builder already gives official and Tabelog source rows higher general detail priority than weak/curated rows. Hot Pepper therefore must not be treated as a universal overwrite.

However price resolution should evolve from a single restaurant-level `budget` winner to **separate lunch and dinner claim resolution**. Example:

```text
Tabelog lunch known, dinner missing
Hot Pepper dinner known
=> keep Tabelog lunch + Hot Pepper dinner
```

Do not discard one meal period just because another source wins the other period.

## Next engineering steps

1. compare the 128 safe Hot Pepper candidate rows against existing official/Tabelog production claims and calculate **net-new** field gain;
2. resolve lunch and dinner independently rather than selecting one budget row for both;
3. preserve strong-source conflicts instead of averaging them;
4. promote only net-useful/non-conflicting Hot Pepper claims;
5. then use existing Tabelog bindings and official menu/locator pages for remaining price gaps;
6. use direct web search only for unresolved official-page discovery;
7. keep OSM/Overture/Foursquare OS focused mainly on identity/address/category/currentness rather than price;
8. retain the Hot Pepper workflow as manual-only so normal pushes do not consume API requests.

## Historical implementation notes

- `34030289095`: exposed the old `tee`/pipefail false-success bug and empty secret;
- `34030342882`: correctly failed at API-key preflight after fail-fast fixes;
- `34030943605`: first fully successful benchmark with configured key.

All benchmark shell pipelines now use `set -euo pipefail`, required outputs are validated before upload, and no paid Google data API is called.
