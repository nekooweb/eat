# 2026-09-08 — Structured JSON-LD menu discovery bulk enrichment

## Goal

Continue bulk completion of source-backed dish data without paid data APIs, guessed dishes, or identity relaxation.

This batch focuses on an explicit source-discovery gap in the existing official-site collector: some restaurant homepages expose their menu URL only through Schema.org JSON-LD (`hasMenu` or legacy `menu`) and do not expose the same page as a normal visible `<a>` menu link.

## Pre-change baseline

Latest `data/google_inventory_detail_queue.json` before this code change:

- frozen catalog: **2,804**;
- named public runtime: **1,415**;
- unpublished Place-ID-only: **1,389**;
- strict `recommendedDishes` known: **254**;
- source-backed `featuredDishes` known: **423**;
- recommendation gap: **1,161**;
- recommendation gap with any known source URL: **872**;
- crawlable already-bound official/source URL: **263**;
- retained third-party-only recommendation targets: **597**;
- targets needing a new independent dish source: **301**.

Current priority remains:

`official recommendation extraction > retained third-party extraction > new independent source discovery > featured dishes > hours > budgets > remaining basic fields`

Identity recovery remains a separate lane.

## Existing deployment/data flow reviewed

The repository currently separates:

1. frozen Place-ID catalog;
2. source discovery/binding;
3. reviewed identity state;
4. source-native field/dish evidence;
5. R/F semantic classification;
6. deterministic zh-CN normalization;
7. monotonic evidence merge;
8. public runtime materialization;
9. recommendation-first queue and 8-shard batch plan;
10. SQLite canonical resolution and contract validation.

The collector workflow is serialized and resets to latest `origin/main` before work. Generated evidence is bot-committed back to `main`, followed by an explicit reusable SQLite contract call because a `GITHUB_TOKEN` push does not recursively trigger a second workflow automatically.

## Gap identified

The official collector already supports:

- direct homepage recommendation text;
- Schema.org `MenuItem` embedded in pages;
- same-origin visible menu links discovered from homepage anchors;
- bounded same-origin sitemap menu discovery;
- retained Hot Pepper/Tabelog/official evidence.

It did **not** use structured JSON-LD menu-page references such as:

- `hasMenu: "/menu/"`;
- `hasMenu: {"@id": "https://example.jp/menu/"}`;
- `menu: {"url": "https://example.jp/food/"}`.

This can leave a real menu page undiscovered even though the already-bound official site explicitly publishes that page in machine-readable metadata.

## Change in this batch

`scripts/collect_google_inventory_recommendations.mjs` is extended with bounded structured menu URL discovery.

Rules:

- parse only `application/ld+json` blocks from the already-bound website homepage;
- recursively inspect only the `hasMenu` and legacy `menu` properties;
- accept string URL values or object `url` / `@id` references;
- resolve relative URLs against the already-bound root;
- exact same hostname required;
- only HTTP/HTTPS;
- reject obvious image/script/style/PDF/XML assets;
- deduplicate URLs;
- structured links consume the **same existing `MENU_LINK_LIMIT`** as ordinary menu anchors;
- the overall **existing `SITE_PAGE_LIMIT` remains unchanged**;
- structured links are prioritized before ordinary anchor discovery because they are explicit machine-readable menu relations;
- no guessed `/menu/` path probing is added.

## Evidence semantics are unchanged

Discovering a menu URL is not itself dish evidence.

A visited page still has to produce source evidence through the existing rules:

- R / `recommendedDishes`: concrete dish + explicit recommendation/signature/popularity wording;
- F / `featuredDishes`: Schema.org `MenuItem` or concrete dish text on a menu-context page;
- cuisine/name/brand/common-sense inference: prohibited;
- generic fallback: prohibited;
- source-native text and URL preserved;
- deterministic zh-CN canonicalization only;
- untranslated but source-backed values remain evidence rather than being reclassified as missing.

## Identity/source safety

Unchanged hard boundaries:

- public named runtime only;
- frozen Place ID remains identity key;
- only already-bound independent websites are live crawled;
- no new identity creation or upgrade;
- no proximity-only binding;
- no live Tabelog/Hot Pepper/Google data calls;
- paid Google data API calls: **0**;
- Google Maps remains external navigation only; display map remains Leaflet + OpenStreetMap.

## New diagnostics

Collector summary adds:

- `websiteStructuredMenuLinksDiscovered`;
- `websiteStructuredMenuLinkRestaurants`.

These are discovery diagnostics. They do not count as successful dish coverage unless downstream extraction creates valid R/F evidence and the monotonic merge/database contract accepts it.

## Expected batch behavior

The code-path change itself is in the workflow push trigger list. After merge to `main`, the existing bulk collector should:

1. sync current main;
2. enforce no-paid-API policy;
3. rebuild the latest runtime/queue;
4. re-mine retained source evidence;
5. re-crawl eligible already-bound websites, now including structured menu references;
6. run bounded sitemap discovery;
7. merge evidence monotonically;
8. rebuild runtime and deterministic queue/shards;
9. commit generated changes if any;
10. validate the latest generated main state through the reusable SQLite database contract.

## Follow-up interpretation

If the structured-link counters are high but R/F growth is low, the bottleneck is extraction semantics/website content rather than URL discovery. If counters are near zero, the 263 crawlable targets are already largely covered by anchors/sitemaps and the next higher-value lane is retained third-party extraction plus independent-source discovery for the remaining 301 source-less recommendation targets.
