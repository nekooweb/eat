# Structured Menu Discovery Bulk Enrichment — 2026-09-08

## Purpose

Continue large-batch Area1 data completion without paid data APIs and without weakening restaurant identity or dish semantics.

The current public runtime contains 1,415 named/publishable restaurants. The recommendation-first queue still contains a large source-backed gap. Existing official-site collection already follows explicit homepage menu links and a separate bounded sitemap pass, but it does not consume structured Schema.org menu URLs exposed only in JSON-LD.

This change adds that missing discovery layer.

## Problem observed

Current official-site discovery has three relevant states:

1. an already-bound official/source website exists and its homepage contains a normal `<a>` menu link — already handled;
2. the site exposes menu pages through `/sitemap.xml` or `/wp-sitemap.xml` — already handled by the bounded sitemap collector;
3. the homepage publishes Schema.org `hasMenu` / legacy `menu` metadata but does not expose the same URL as a normal anchor — previously missed.

The third case is valuable because it is explicit machine-readable source metadata, not a guessed path and not a proximity/name inference.

## New discovery rule

For each already-bound eligible website homepage:

- parse only `application/ld+json` blocks;
- recursively look for Schema.org `hasMenu` and legacy `menu` properties;
- accept string URLs or object `url` / `@id` values inside those menu properties;
- resolve relative URLs against the already-bound website root;
- require `http` / `https`;
- require exact same hostname as the bound root;
- reject obvious non-HTML assets such as images, CSS, JS, PDF and XML;
- deduplicate URLs;
- keep the existing `MENU_LINK_LIMIT` and `SITE_PAGE_LIMIT` caps;
- prioritize structured menu links before ordinary homepage anchor menu links within the same bounded page budget.

No guessed `/menu/` path probing is introduced.

## Evidence semantics remain unchanged

The new discovery layer only finds a page. It does not itself create a dish claim.

On discovered pages:

- explicit recommendation/signature/popular wording plus a concrete dish remains R / `recommendedDishes`;
- Schema.org `MenuItem` or concrete dish text on a menu-context page remains F / `featuredDishes`;
- cuisine, restaurant name, brand knowledge and generic category terms cannot create dish evidence;
- source-native text, Chinese canonical normalization, source URL, provider, checked date and evidence class remain preserved.

## Identity and source boundary

This pass is intentionally narrower than new-source discovery:

- named public runtime only;
- already-bound independent eligible websites only;
- no identity creation;
- no identity upgrade;
- no Overture/OSM proximity-only binding;
- no Tabelog/Hot Pepper/social/Google live fetch;
- paid Google data API calls remain 0.

The separate `find_independent_dish_source` gap therefore remains a source-review problem and is not silently promoted by this change.

## Batch/deployment flow

The existing `collect-source-backed-recommended-dishes` workflow remains the execution owner:

1. sync latest `main` after serialized wait;
2. run no-paid-API audit;
3. export SQLite-reviewed official source overlay;
4. rebuild the current public runtime and queue;
5. mine retained official/Tabelog/Hot Pepper evidence;
6. crawl already-bound official/source websites;
7. discover structured `hasMenu` / `menu` links from homepage JSON-LD;
8. run the existing bounded official sitemap pass;
9. monotonic evidence merge;
10. rebuild runtime, recommendation-first queue and deterministic 8-shard plans;
11. bot-commit generated evidence/queue/runtime files to `main` when changed;
12. run reusable SQLite database-contract validation against latest `main`.

The workflow is already serialized with `cancel-in-progress: false`, and its first execution step resets to the latest `origin/main`, so consecutive maintenance pushes do not intentionally build on a stale event checkout.

## New metrics

The collector should report:

- `websiteStructuredMenuLinksDiscovered`;
- `websiteStructuredMenuLinkRestaurants`.

These metrics describe discovery only. Public dish coverage is still measured from merged, validated R/F evidence.

## Safety / quality requirements

Blocking requirements remain:

- frozen catalog total = 2,804;
- named public + unpublished ID-only = 2,804;
- no paid data API calls;
- no generic dish fallback;
- no cuisine/name/brand dish inference;
- same-origin structured menu URLs only;
- bounded page/URL counts;
- monotonic evidence merge;
- database contract validation after generated-data writeback.

## Status

Implemented in the 2026-09-08 structured-menu discovery batch. Workflow results and net data deltas are recorded in the corresponding log after validation.
