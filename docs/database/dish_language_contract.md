# Dish language contract: source-native evidence -> Chinese canonical fields

Updated: 2026-09-08

## Rule

Restaurant sources do **not** need to publish Chinese dish names.

The database contract is:

```text
source-native dish text (normally Japanese)
  -> retain original text + source provenance
  -> translate / normalize to zh-CN
  -> validate recommendation vs featured semantics
  -> materialize canonical Chinese field in SQLite
```

The source-native string is evidence. The Chinese string is the canonical product value. They must both be retained in their respective layers.

## Canonical fields

Validated source-backed dish evidence may resolve to:

- `recommended_dishes.zh`
- `featured_dishes.zh`

`recommended_dishes.zh` requires strict recommendation evidence (`source_recommendation_text`). A menu item does not become a recommendation merely because it can be translated.

`featured_dishes.zh` accepts approved source-backed menu evidence, including:

- `retained_source_menu_item`: an already-retained exact sourceRef menu/dish value;
- `provider_promotional_dish_text`: a concrete dish appearing in retained provider promotional copy;
- `structured_menu_item`: a concrete schema.org / JSON-LD MenuItem from an already-bound source site;
- `source_menu_text`: a concrete dish found in ordinary HTML on an already-bound same-origin official menu page;
- `tabelog_menu_text`: reserved for a concrete menu-page dish from an exact-bound Tabelog restaurant source when that acquisition route is available.

The last two classes are still F/featured evidence. They never become R merely because a dish name appears on a menu page.

## Bulk acquisition contract

Bulk workers collect source evidence; only the central merge/resolver writes canonical truth.

The current deterministic bulk plan uses stable FNV-1a sharding of the frozen Google Place ID, normally across 8 shards. Work lanes are kept separate:

- bound official-site crawl;
- retained-source mining;
- independent free-source discovery;
- source-backed featured/menu completion.

Bulk processing must preserve all of these invariants:

- source language may be Japanese;
- final canonical dish label is zh-CN;
- original source text and URL remain attached;
- recommendation requires explicit recommendation semantics;
- ordinary menu text is featured only;
- proximity-only identity binding is forbidden;
- paid Google data API calls remain 0.

### Retained provider promotional mining

`scripts/build_retained_hotpepper_promotional_dish_evidence.mjs` performs a network-free pass over already-retained Hot Pepper facts.

It currently consumes only provider-authored promotional text that was already bound to the frozen Place ID:

- `hotpepper_catalog_facts.json -> facts.genre.catch` across the retained catalog;
- reviewed rich metadata `specialFeatures[].title` for `strict_auto` / `manual_exact` bindings.

It intentionally does **not** re-read basic `facts.catch` or rich `sourceCatch` because the main collector already consumes the former and the latter is the same source field. It does not use restaurant name, cuisine, tags, or brand knowledge as dish evidence.

A concrete dish in promotional text is F unless that same retained text contains an explicit recommendation marker. For example, a provider phrase equivalent to `ビリヤニが自慢` can support R because `自慢` is explicit recommendation/specialty semantics; a bare `ビリヤニ` mention cannot.

This pass performs zero network requests and zero paid Google data API calls.

### Already-bound official-site crawl

`scripts/collect_google_inventory_recommendations.mjs` batch-fetches already-bound independent official/source websites and follows a small number of same-origin menu/food links.

Ordinary HTML menu dishes are materialized as `source_menu_text` / F. Explicit recommendation text is R. Raw HTML is not persisted.

### Bounded official sitemap discovery

`scripts/collect_official_sitemap_dish_evidence.mjs` adds a second official-site discovery path for menus that are not linked from the root page.

It is deliberately bounded:

- starts only from already-bound eligible official/source website roots;
- probes public same-origin `sitemap.xml` / `wp-sitemap.xml`;
- follows at most a small number of child sitemap files;
- keeps only same-origin menu/food/dish URLs;
- excludes news/blog/company/recruit/privacy/contact/reservation paths;
- multi-segment bound roots keep discovered pages inside their directory prefix;
- fetches only a few menu pages per restaurant;
- ordinary menu items remain F;
- R still requires an explicit recommendation marker;
- raw HTML is not retained;
- paid Google data API calls remain 0.

### Tabelog acquisition boundary

GitHub-hosted runners currently do **not** reliably fetch Tabelog restaurant roots. Therefore the 8-shard Tabelog collector is manual-only and must not be used as an automatic retry loop. Existing retained Tabelog evidence remains valid and is consumed without re-fetching.

## Current public source-backed dish state

After retained Hot Pepper promotional mining plus the bounded official sitemap pass:

- frozen catalog: **2,804** Place IDs;
- named public runtime: **1,415** restaurants;
- public `recommendedDishes`: **217** restaurants;
- public `featuredDishes`: **384** restaurants;
- at least one Chinese-normalized public dish field: **440 / 1,415 = 31.1%**;
- unfilled public dish rows: **975**;
- approximate recommendations: **0**;
- generic fallback: **false**.

The source-backed detail evidence currently contains:

- evidence restaurants: **430**;
- recommendation evidence restaurants: **192**;
- featured evidence restaurants: **373**;
- recommendation evidence items: **349**;
- featured evidence items: **826**;
- `source_menu_text`: **440** items;
- `provider_promotional_dish_text`: **219** items.

These public/runtime figures are not a substitute for SQLite canonical validation; SQLite resolution still requires publishable identity, provenance, language checks, and R/F semantic validation.

## Translation-pending is not missing evidence

When a retained source contains a real dish name but the deterministic normalizer cannot yet produce a reliable Chinese label, the source evidence must be preserved in `data/dish_translation_pending.json` with `status=needs_zh_normalization`.

Such a row means:

- a dish/source fact exists;
- source provenance exists;
- Chinese canonicalization is pending.

It must not be counted as `no dish evidence` and must not be replaced with cuisine/name/brand guesses.

## Current implementation

- `scripts/recommended_dish_extractor.mjs`: Japanese/source-native dish -> Chinese normalizer and strict recommendation detector.
- `scripts/build_retained_dish_evidence.mjs`: retained explicit dish evidence mining plus translation-pending queue.
- `scripts/build_retained_hotpepper_promotional_dish_evidence.mjs`: network-free retained Hot Pepper promotional-text mining.
- `scripts/collect_google_inventory_recommendations.mjs`: bound-official-site + retained Hot Pepper bulk collector; plain official menu text is F only.
- `scripts/collect_official_sitemap_dish_evidence.mjs`: bounded same-origin sitemap discovery for hidden official menu pages.
- `scripts/build_dish_batch_plan.mjs`: deterministic bulk work lanes and 8-shard plan.
- `scripts/collect_tabelog_dish_evidence.mjs`: exact-bound Tabelog menu collector retained as a manual/future-environment path.
- `scripts/database/resolve_dish_translation_evidence.py`: source-backed evidence -> SQLite `*.zh` resolutions.
- `scripts/database/validate_dish_translation_resolution.py`: validates language, provenance, semantic class, and resolution consistency.
- `scripts/database/export_master_core.py`: prefers `*.zh` canonical fields before legacy dish fields.

No network request is performed by the SQLite translation resolver. It does not infer dishes from cuisine, restaurant name, or brand.

## CI handoff note

The dish collector writes generated evidence/runtime files through a GitHub Actions bot commit. GitHub suppresses recursive workflow triggering for pushes made with the workflow's `GITHUB_TOKEN`, so downstream database validation must not rely on that bot push automatically starting another workflow. A separate explicit database-contract trigger/handoff or a subsequent qualifying human-authored commit is required to validate the newly generated evidence in SQLite.

## Quality boundary

A Japanese product name can be translated automatically only when the semantic meaning is sufficiently clear from the retained source or independently verified menu description. Brand-created names with unclear composition may remain pending rather than receiving a fabricated Chinese name.

As of the latest retained normalization batch, the translation-pending queue has been reduced from **53 items / 47 restaurants** to **2 items / 2 restaurants**. The remaining rows are deliberately retained for review instead of being forced through an uncertain translation.
