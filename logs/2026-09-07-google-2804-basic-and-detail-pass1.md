# 2026-09-07 — Google 2,804 inventory basic launch and detail enrichment

## Scope

The public restaurant universe is the frozen Google Places inventory for `TOKYO / 地区1️⃣`, exactly **2,804 unique Google Place IDs** inside the verified **1.2 km** search circle.

The Google Place ID is the identity anchor. No OSM, Overture, Hot Pepper, Tabelog, or other source may independently create a public restaurant identity.

## Phase 1 — basic launch

The first objective is satisfied at the runtime level: **all 2,804 frozen Google Place IDs can enter the public 1.2 km runtime and open the real Google Maps place**.

The runtime does not require a fabricated local copy of Google's display payload. Independent durable sources are used to improve the visible basic fields where a strong source-to-Place-ID match exists.

After two strict matching passes:

- Frozen Google inventory: **2,804**
- Existing rich canonical rows intersecting the frozen inventory: **651**
- Additional strong independently sourced basic matches: **760**
- Total with durable independent name / coordinate basics: **1,411**
- Google Place-ID-only identities still awaiting an independently sourced name / coordinate pair: **1,393**
- Second-pass new strong matches: **27**

Provider breakdown for the 760 independently sourced matches:

- Hot Pepper: **357**
- Overture Maps: **392**
- OpenStreetMap: **11**

Both recovery passes made **zero new paid Google data API calls**. Previously retained Google sweep data was used transiently only to verify source matching and was not persisted. The durable basic file stores the Google Place ID plus independently sourced fields only.

For the 1,393 Place-ID-only rows, the public runtime does not invent a restaurant name, address, coordinate, cuisine, or exact distance. They remain eligible for the default 1.2 km inventory because membership in the frozen inventory proves they are inside the circle, and Google Maps Embed / Place ID opens the actual Google place. They are excluded from the smaller 300 / 500 / 800 m filters until an independently sourced distance is available.

This means **basic launch completion** and **local metadata completeness** are intentionally different concepts:

- basic launch completion: **2,804 / 2,804** Google identities;
- independent durable basic metadata: **1,411 / 2,804**;
- independent durable basic metadata still unresolved: **1,393 / 2,804**.

## Exact public runtime requirements

`data/google_inventory_runtime.js` is generated from the frozen inventory and must pass all of these checks:

- exactly **2,804** rows;
- exactly **2,804** unique Place IDs;
- Place ID set/order exactly equals the frozen inventory;
- every row is marked as belonging to the verified 1.2 km frozen inventory;
- no independently known distance above 1,200 m;
- no persisted Google display payload;
- source-matched basic rows must have an independent provider;
- Place-ID-only rows may not contain fabricated basics.

The stable Pages build no longer depends on expiring Google audit artifacts. It validates the persisted independent-source basics and rebuilds the exact runtime directly.

## Additional basic detail overlay

For rows whose durable identity is already strongly matched to Hot Pepper, retained Hot Pepper fields are reused without additional API calls to improve the basic public record where available:

- address;
- opening-hours reference text;
- closure note;
- parsable dinner-budget range.

These fields remain source-backed and do not change the Google Place ID identity anchor.

## Phase 2 — detailed enrichment priority

Once the exact 2,804 runtime baseline is live, enrichment continues without weakening identity rules. The queue order is:

1. unresolved Place-ID-only source identity → `resolve_basic_source_identity`;
2. named restaurant missing strict recommended dishes → `collect_strict_recommended_dishes`;
3. missing source-backed featured dishes;
4. opening hours;
5. dinner / lunch budget;
6. address / cuisine details.

Thus unresolved basic source matching remains the highest queue priority, while **recommended dishes remain the highest-priority detailed field**.

## Detail pass 1

A zero-paid-API bulk collector was run against only already-bound sources:

- retained Hot Pepper restaurant-level promotional text;
- already-bound independent official / provider websites;
- no Google Places / Text Search / Details requests;
- no direct crawl of Google, Tabelog, Hot Pepper pages, or social-media pages for website extraction.

A dish is accepted as a **recommended dish** only when a recognized concrete dish term appears near explicit recommendation / signature language such as `おすすめ`, `名物`, `看板`, `自慢`, `人気`, `signature`, or `recommended`.

Final first-pass evidence:

- Hot Pepper rows available: **535**
- Hot Pepper strict-recommendation restaurants found: **29**
- Hot Pepper featured-only restaurants found: **60**
- independent website tasks: **374**
- independent website hosts: **297**
- website-matched restaurants: **128**
- evidence rows with strict recommendations: **155**
- evidence rows with featured-only dishes: **53**
- recommendation items: **217**
- featured items: **61**

After overlaying this evidence into the exact 2,804 runtime:

- restaurants with strict recommended dishes: **183**;
- restaurants with source-backed featured dishes: **181**.

These are real source-backed records, not cuisine-based reference guesses.

## Current continuation rule

The remaining 1,393 Place-ID-only identities continue to be searched for independent durable basic sources, but their unresolved local display metadata does not remove them from the already-complete 2,804 Google runtime. Detailed enrichment may continue in parallel for the 1,411 named/source-bound identities, with strict recommended dishes first.

No open-expansion restaurant pool, inferred reference dishes, or non-Google public identities are reintroduced.
