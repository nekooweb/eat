# Independent Dish Source Recovery — 2026-09-08

## Goal

Continue large-batch dish completion after the already-bound official-site crawl and retained Hot Pepper/Tabelog evidence reached diminishing returns.

Current recommendation-first gap at the start of this lane:

- public named runtime: **1,415**;
- strict recommendations known: **254**;
- recommendation gap: **1,161**;
- crawlable already-bound official/source URL: **263**;
- retained third-party-only targets: **597**;
- targets requiring a new independent dish source: **301**.

The 301-source gap previously had **0 proposal rows** because every retained `official_candidate_index.json` record fell outside the current `find_independent_dish_source` queue.

## Design principle

New source discovery and source approval are separate stages.

```text
current publishable restaurant identity
  -> proposal-only independent source discovery
  -> strict live source review
  -> reviewed source-only overlay
  -> existing official dish collector
  -> R/F evidence semantics
  -> monotonic merge
  -> runtime + SQLite canonical validation
```

A proposed website is never dish evidence and never changes restaurant identity by itself.

## Stage 1 — Overture proposal expansion

`scripts/build_independent_dish_source_candidate_plan.mjs` now consumes two retained sources:

1. `official_candidate_index.json` — existing reviewed candidate-index lane;
2. `overture_area1_candidates.json` — retained Overture Maps Area1 snapshot.

No network request occurs in proposal generation.

### Overture candidate requirements

Only Overture rows with an independent HTTP/HTTPS website are considered. The following are excluded:

- Google / Googleusercontent;
- Tabelog;
- Hot Pepper;
- OpenStreetMap;
- Facebook / Instagram / X / Twitter / YouTube / TikTok.

For each current `find_independent_dish_source` target:

- use the current public runtime's already-independent name and coordinates;
- search only a bounded local Overture spatial neighborhood;
- maximum candidate distance = 120 m;
- score normalized name compatibility plus coordinate distance;
- require a strong name/distance combination;
- require a winner margin over the second candidate unless the match is effectively exact;
- prevent one Overture native identity from being proposed to multiple frozen Place IDs.

This remains a proposal layer only.

### Proposal safety contract

- frozen Place ID stays the catalog join key;
- identity binding changes = 0;
- network requests = 0;
- paid Google data API calls = 0;
- Google display payload used = false;
- proximity-only binding = forbidden;
- dish evidence before identity/source review = forbidden;
- central source review required.

## Stage 2 — strict live website review

`scripts/review_independent_dish_source_candidates.mjs` reviews only:

`review_high_confidence_overture_website_candidate`

rows.

The reviewer makes bounded normal HTTP(S) requests to the proposed public website. It does not call a data API.

### Site validation

The review accepts only same-site redirects and HTML pages. Aggregator/social/Google URLs remain excluded.

The page must independently provide strong restaurant-name evidence through:

- Schema.org food-establishment JSON-LD name; or
- a strongly matching page title.

A generic brand homepage is **not sufficient**. Root/home pages additionally require location confirmation such as:

- structured geo close to the current independent runtime coordinates;
- structured address agreement;
- visible address agreement.

A path-specific page may use an even stricter exception only when the structured restaurant name is effectively exact and the retained Overture proposal is already an almost exact coordinate/name match.

### Reviewed overlay boundary

A successful review may emit only a source website overlay. It cannot change:

- runtime name;
- coordinates;
- identity state;
- cuisine/budget/hours directly;
- recommendation/featured dishes directly.

Dish evidence must still be generated later by the existing source-backed dish collector under the unchanged R/F semantics.

## Stage 3 — source-only runtime handoff

After strict review has produced accepted rows, the reviewed source overlay should be added to `build_google_inventory_runtime.mjs` as a source-only input with the same hard boundary used by the existing reviewed-official overlay.

Expected consequence for accepted rows:

```text
find_independent_dish_source
  -> reviewed sourceWebsites available
  -> collect_strict_recommended_dishes
  -> normal bounded official/source crawl
```

The handoff must not alter identity/core fields.

## Deployment / validation

Proposal plan workflow:

`.github/workflows/build-independent-dish-source-candidates.yml`

Strict live review workflow:

`.github/workflows/review-independent-dish-sources.yml`

The main collector remains responsible for final evidence merge, runtime rebuild and reusable SQLite database contract validation after reviewed sources are handed into runtime.

## Initial proposal result

The first Overture-expanded plan produced:

- independent-source gap: **301**;
- Overture snapshot rows: **3,908**;
- Overture rows with independent websites: **2,516**;
- nearby Overture candidates for all 301 targets: **301**;
- accepted proposal rows: **36**;
- high-confidence proposal rows: **24**;
- proposal coverage: **12.0%**;
- rejected for incompatible name: **252**;
- rejected as weak: **13**;
- ambiguous winner rejection: **0**.

This intentionally favors precision over source-count inflation.
