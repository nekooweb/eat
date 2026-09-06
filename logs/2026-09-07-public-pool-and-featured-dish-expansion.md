# 2026-09-07 — Public pool and featured-dish expansion

## Request

Prioritize featured/signature dish information and first put the full 2,000+ restaurant universe online.

## Architecture decision

The repository's exact 2,804 Google inventory intentionally persists Place IDs only and does not persist Google display payloads. Inventory-only IDs therefore cannot be rendered honestly as normal restaurant cards without an independent display source.

Instead of weakening the canonical admission rules, this implementation keeps the existing 662 canonical restaurants intact and adds a separate deploy-time public/open recommendation layer sourced from retained Hot Pepper facts, Overture Maps and OpenStreetMap.

## Implementation

Added `scripts/build_public_open_pool.mjs`.

The builder:

- retains the 662 canonical rows unchanged;
- adds named/geocoded Hot Pepper inventory-bound rows not already canonical;
- adds Overture Maps food candidates within 1.2 km;
- adds remaining OpenStreetMap candidates;
- removes exact-name/near-coordinate duplicates;
- never invents a Google Place ID for open-source rows;
- requires the combined pool to contain at least 2,000 restaurants.

Updated `app.js` to merge the canonical and public pools for random recommendations. Open rows without a Google Place ID use a name/address Google Maps search and Leaflet map instead of a fake Place-ID link.

Updated `index.html` to load `public_pool_area1.js`, refresh runtime cache versions and disclose the two-tier data model.

Updated `.github/workflows/pages.yml` to generate, validate and deploy the public pool and the featured-dish work queue.

Updated `scripts/audit_repository.mjs` so the new public runtime layer is audited without relaxing the existing canonical identity, provenance and source-backed checks.

## Online result

The deployed public layer contains:

- canonical rows: 662;
- public rows: 4,571;
- total online candidate rows: 5,233;
- Hot Pepper inventory-bound public rows: 388;
- Overture Maps rows: 3,573;
- OSM rows: 610;
- public address coverage: 4,021;
- public hours coverage: 482;
- public finite-budget coverage: 385;
- public dish-reference coverage: 4,571 / 4,571.

The first integration attempt was stopped by the old fixed runtime-order audit because it did not yet know about `public_pool_area1.js`. This was corrected in the repository audit contract; the data build itself had already exceeded the requested 2,000-row minimum.

## Featured dishes

The web UI distinguishes two states:

- `特色菜`: source-backed `featuredDishes` / `recommendedDishes` or provider-native signature-dish evidence;
- `参考菜品`: cuisine/brand/chain-based fallback information marked `featuredDishConfidence: reference_hint`.

This means every newly generated public row has immediately useful dish context, but reference hints are not falsely counted as verified restaurant-specific signature dishes.

### Hot Pepper source-backed promotion pass

`build_public_open_pool.mjs` was extended with a conservative Hot Pepper signature-dish extractor.

Promotion requires a provider-native descriptive clause to include both an explicit recommendation/signature marker (`自慢`, `名物`, `看板`, `おすすめ`, `人気`, `絶品`, `専門`, `イチオシ`, etc.) and a recognized concrete dish term. Generic genre/category text is not accepted as evidence.

Each promoted item keeps the Hot Pepper URL, checked date, matched Japanese term and bounded evidence text.

The first successful pass upgraded:

- 57 public restaurants from reference-only to source-backed featured-dish status;
- 65 individual featured-dish items.

All remaining open rows continue to display `参考菜品`, not an unsupported `特色菜` label.

## Featured-dish queue

Added `scripts/build_public_dish_queue.mjs` to make source-backed signature-dish completion the primary enrichment workflow. It prioritizes canonical gaps, Hot Pepper-bound rows, rows with official/provider URLs, Overture identities and then OSM identities.

The queue generator was corrected after the first promotion pass so restaurants with source-backed `featuredDishes` / `recommendedDishes` are removed from future work queues. This prevents the 57 newly completed public records from being repeatedly scheduled.

## Policy

- paid Google data API calls: 0;
- canonical 662 identity admission: unchanged;
- public expansion is explicitly separate from canonical identity verification;
- Google response/display payload is not persisted;
- reference dish hints never count as source-backed featured-dish completion;
- provider-signature promotions retain URL/date/evidence provenance and are audited before Pages deployment.
