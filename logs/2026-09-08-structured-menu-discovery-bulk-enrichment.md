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

## Validated batch result

Implementation commit:

`6bec53f9a63873e90329fc6cdcfc2129052d6d76` — `Discover structured same-origin menu links in official crawl`

Collector workflow run:

`34187494460` — **success**

Generated-data commit:

`7c3f1fca4bdece71b3e60db723cacdf82da8f3a6` — `Update source-backed recommended dish evidence`

The same workflow also completed the reusable SQLite database contract successfully after syncing the generated main state.

### Structured-menu discovery diagnostics

The new JSON-LD path found:

- structured menu URLs: **2**;
- restaurants exposing those structured menu URLs: **2**.

This is a valid discovery path, but its current marginal yield is small. The result confirms that the existing anchor + bounded sitemap discovery already covers most crawlable official-menu URL exposure in this Area1 snapshot.

### Official/source crawl diagnostics

The same batch processed:

- website tasks: **428**;
- unique website hosts: **272**;
- website pages visited: **561**;
- website recommendation restaurants found in this fresh pass: **33**;
- website featured/menu restaurants found in this fresh pass: **44**;
- plain-menu items extracted in this fresh pass: **177**.

Fresh collector result before monotonic merge:

- source-backed recommendation restaurants: **53**;
- source-backed featured-only restaurants: **114**;
- recommendation items: **83**;
- featured items: **251**.

The previous evidence set already contained these accepted rows, so the final monotonic merge remained stable rather than duplicating evidence.

### Retained-source diagnostics

Retained official/Tabelog source mining remained stable:

- source files: **40**;
- source rows scanned: **584**;
- rows with claimed dish fields: **110**;
- normalized retained values: **151**;
- untranslated source-backed values: **2**;
- retained featured items: **174**;
- retained featured restaurants: **110**.

Retained Hot Pepper promotional mining scanned:

- Hot Pepper catalog rows: **535**;
- eligible catalog rows: **506**;
- reviewed rich rows: **135**;
- promotional texts scanned: **650**;
- evidence restaurants: **166**;
- recommendation restaurants: **18**;
- featured restaurants: **148**;
- recommendation items: **20**;
- featured items: **177**.

### Current merged evidence/runtime state

Validated merged detail evidence:

- evidence restaurants: **477**;
- recommendation evidence restaurants: **229**;
- featured evidence restaurants: **414**;
- recommendation items: **438**;
- featured items: **1,009**;
- `source_recommendation_text`: **438**;
- `retained_source_menu_item`: **167**;
- `provider_promotional_dish_text`: **222**;
- `source_menu_text`: **620**.

Current public runtime remains:

- named restaurants: **1,415**;
- strict `recommendedDishes` known: **254**;
- source-backed `featuredDishes` known: **423**;
- restaurants with a Chinese-normalized public dish value: **485 / 1,415 = 34.3%**;
- unfilled public dish rows: **930**;
- approximate Chinese dish rows: **0**;
- generic fallback: **false**.

Current recommendation-first queue:

- recommendation gap: **1,161**;
- crawlable official/source targets: **263**;
- retained third-party-only targets: **597**;
- targets needing a new independent dish source: **301**;
- featured-only completion targets: **62**;
- total deterministic dish work rows: **1,223** across 8 stable shards.

The independent-source proposal plan currently has **0 proposal rows** because all 194 retained `official_candidate_index` records are outside the current 301-row independent-source gap. This means repeating the existing candidate index cannot reduce that lane further.

## Interpretation / next bulk direction

The structured-link counters are near zero, so the limiting factor is no longer ordinary official-menu URL discovery.

The next higher-value work should therefore be:

1. deepen **retained third-party extraction** for the 597 source-known recommendation gaps, but only from source-native text/fields that carry concrete menu or recommendation semantics;
2. expand **free independent-source discovery** for the 301 source-less recommendation targets using new public/open-data candidate inputs rather than recycling the exhausted 194-row official candidate index;
3. keep identity review separate from dish promotion — a newly discovered URL is proposal/evidence input until identity binding passes the existing collision/review rules;
4. continue deterministic zh-CN normalization while preserving original source text;
5. keep official crawl depth bounded because the current structured-menu experiment shows low marginal gain from further URL-discovery expansion.

## No-paid-API / validation result

The completed run confirms:

- paid-data-API audit: **pass**;
- files scanned by policy audit: **206**;
- paid API hits: **0**;
- map mode: **Leaflet + OpenStreetMap**;
- Google Maps use: **external navigation only**;
- collector job: **success**;
- reusable SQLite database validation: **success**.
