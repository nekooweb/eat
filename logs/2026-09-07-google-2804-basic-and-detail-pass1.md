# 2026-09-07 — Google 2,804 inventory basic launch and detail pass 1

## Scope

The public restaurant universe is the frozen Google Places inventory for `TOKYO / 地区1️⃣`, exactly **2,804 unique Google Place IDs** inside the verified **1.2 km** search circle.

The Google Place ID is the identity anchor. No open-data source can independently create a public restaurant identity.

## Basic launch result

The first objective was to make all 2,804 Google identities usable before doing detailed enrichment.

- Frozen Google inventory: **2,804**
- Existing rich canonical rows intersecting the frozen inventory: **651**
- Additional strong independently sourced basic matches: **733**
- Total with durable name / coordinate basics: **1,384**
- Google Place-ID-only identities still awaiting an independently sourced name: **1,420**

Provider breakdown for the 733 recovered basic matches:

- Hot Pepper: **348**
- Overture Maps: **374**
- OpenStreetMap: **11**

The recovery made **zero new paid Google data API calls**. Previously retained Google sweep data was used transiently only to verify source matching and was not persisted. The durable file stores Google Place IDs plus independently sourced fields only.

For the 1,420 Place-ID-only rows, the public runtime does not invent a restaurant name, address, coordinate, cuisine, or distance. They remain eligible for the default 1.2 km inventory because membership in the frozen inventory proves they are inside the circle, and Google Maps Embed / Place ID provides the real Google location. They are excluded from smaller 300 / 500 / 800 m filters until an independently sourced distance is available.

## Exact public runtime

`data/google_inventory_runtime.js` is generated from the frozen inventory and must pass all of these checks:

- exactly **2,804** rows;
- exactly **2,804** unique Place IDs;
- Place ID set/order exactly equals the frozen inventory;
- no independently known distance above 1,200 m;
- no persisted Google display payload;
- source-matched basic rows must have an independent provider;
- Place-ID-only rows may not contain fabricated basics.

The stable Pages build no longer depends on expiring Google audit artifacts. It validates the persisted independent-source basics and rebuilds the exact runtime directly.

## Detail enrichment priority

The 2,804-row detail queue uses the following order:

1. named restaurant missing strict recommended dishes → `collect_strict_recommended_dishes`;
2. Place-ID-only identity → `resolve_basic_source_identity`;
3. missing source-backed featured dishes;
4. opening hours;
5. dinner / lunch budget;
6. address / cuisine details.

Recommended dishes remain the highest-priority detailed field.

## Detail pass 1

A zero-paid-API bulk collector was run against only already-bound sources:

- retained Hot Pepper restaurant-level promotional text;
- already-bound independent official / provider websites;
- no Google Places / Text Search / Details requests;
- no direct crawl of Google, Tabelog, Hot Pepper pages, or social-media pages for website extraction.

A dish is accepted as a **recommended dish** only when a recognized concrete dish term appears within 110 characters of explicit recommendation / signature language such as `おすすめ`, `名物`, `看板`, `自慢`, `人気`, `signature`, or `recommended`.

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

- restaurants with strict recommended dishes: **183** (previously 29);
- restaurants with source-backed featured dishes: **181** (previously 128).

## Remaining queue after detail pass 1

- strict recommended-dish collection: **1,202** named restaurants;
- basic source identity resolution: **1,420** Place-ID-only identities;
- source-backed featured-dish collection: **110**;
- opening-hours collection: **13**;
- dinner-budget collection: **17**;
- lunch-budget collection: **17**;
- identity-detail fields: **1**;
- currently complete under this queue model: **24**.

The next enrichment work should continue from this queue without weakening Google Place ID identity binding or reintroducing inferred/reference dishes.
