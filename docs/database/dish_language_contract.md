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

The source-native string is evidence. The Chinese string is the canonical product value. Both are retained in their respective layers.

## Canonical fields and evidence classes

Validated source-backed dish evidence may resolve to:

- `recommended_dishes.zh`
- `featured_dishes.zh`

`recommended_dishes.zh` accepts only strict recommendation evidence:

- `source_recommendation_text`
- `source_pdf_recommendation_text`

A dish does not become a recommendation merely because it appears on a menu.

`featured_dishes.zh` accepts approved concrete menu/promotional evidence:

- `retained_source_menu_item`: already-retained exact sourceRef menu/dish value;
- `provider_promotional_dish_text`: concrete dish in retained provider promotional/service copy;
- `structured_menu_item`: schema.org / JSON-LD MenuItem from an already-bound source site;
- `source_menu_text`: concrete ordinary HTML dish from an already-bound same-origin source website;
- `source_pdf_menu_text`: concrete ordinary menu dish from an already-bound official/source PDF;
- `tabelog_menu_text`: concrete menu-page dish from an exact-bound Tabelog restaurant source when acquisition is available;
- `hotpepper_menu_text`: price-backed menu heading from an exact retained Hot Pepper restaurant `/food/` or `/menu/` page.

All ordinary menu classes remain F/featured only. They never become R without explicit recommendation semantics.

## Global invariants

Bulk workers collect source evidence; only the central merge/resolver writes canonical truth. All dish acquisition paths preserve these rules:

- frozen catalog identity key remains the 2,804 Google Place IDs;
- source language may be Japanese;
- final canonical dish label is zh-CN;
- original source text, provider, URL and check date remain attached;
- recommendation requires explicit recommendation/signature/specialty semantics;
- ordinary menu text is featured only;
- restaurant name, cuisine, brand and proximity are not dish evidence;
- proximity-only identity binding is forbidden;
- evidence merges monotonically;
- raw third-party HTML is not persisted;
- paid Google data API calls remain **0**.

## Acquisition paths

### Retained provider promotional mining

`scripts/build_retained_hotpepper_promotional_dish_evidence.mjs` performs a network-free pass over already-retained Hot Pepper facts bound to the frozen Place ID.

It consumes:

- `hotpepper_catalog_facts.json -> facts.genre.catch`;
- `hotpepper_catalog_facts.json -> facts.freeFood` only when the text contains both concrete availability semantics such as `食べ放題` / `ビュッフェ` and a concrete dish;
- reviewed rich metadata `specialFeatures[].title` for `strict_auto` / `manual_exact` bindings;
- reviewed rich `sourceServiceText.allYouCanEat` only when it contains concrete availability wording and a concrete dish.

It intentionally excludes generic service booleans, cuisine/category tags, restaurant-name inference, and duplicate `sourceCatch` text. Promotional concrete dishes are F unless the same retained text contains an explicit recommendation marker.

### Exact-bound structured Hot Pepper web path

`scripts/collect_hotpepper_web_structured_dish_evidence.mjs` is the production Hot Pepper public-web collector. It does **not** call the Hot Pepper Web Service API.

The identity and semantic boundary is intentionally narrow:

1. start only from an exact Hot Pepper `strJ...` URL already retained for a frozen Place ID;
2. revalidate the restaurant name on the root page;
3. follow only same-restaurant `/food/` or `/menu/` links actually exposed by that root page; guessed menu paths are forbidden;
4. revalidate restaurant identity on the food/menu page;
5. R is accepted only from a dish heading inside Hot Pepper's explicit `おすすめ料理` section (`h2` section -> `h3` dish title);
6. F is accepted only from a concrete `h4` menu-item heading with nearby price/price-like menu evidence;
7. course-page ordinary extraction, reviews, related-keyword/footer text and generic page text are excluded.

`scripts/filter_hotpepper_structured_dish_evidence.mjs` then removes deterministic Japanese substring collisions such as pancake/cake, yakisoba/buckwheat-soba and broad-vs-specific duplicate matches. The filter does not use cuisine, brand or restaurant-name inference.

The first generic Hot Pepper page-wide pilot was rejected because template/footer text caused recommendation overmatching. Only the structure-scoped collector is retained as production code.

### Already-bound official-site crawl

`scripts/collect_google_inventory_recommendations.mjs` batch-fetches already-bound official/source websites and follows a bounded number of same-origin menu/food links. Ordinary HTML menu dishes become `source_menu_text` / F; explicit recommendation text may become R.

### Bounded official sitemap discovery

`scripts/collect_official_sitemap_dish_evidence.mjs` probes bounded same-origin sitemap paths for already-bound official/source sites, keeps menu/food/dish URLs inside the source scope, and excludes news/blog/company/recruit/privacy/contact/reservation paths. Ordinary menu items remain F and R still requires explicit recommendation semantics.

### Official/source PDF menus

The PDF collector discovers only PDFs associated with already-bound official/source websites. Ordinary PDF menu dishes become `source_pdf_menu_text`; a recommendation becomes `source_pdf_recommendation_text` only when recommendation wording and the concrete dish occur together in the accepted extraction unit. The SQLite resolver and validator explicitly recognize both PDF classes.

### Tabelog acquisition boundary

GitHub-hosted runners currently do **not** reliably fetch Tabelog restaurant roots. The 8-shard Tabelog collector remains manual/future-environment only and must not be used as an automatic retry loop. Existing retained Tabelog evidence remains valid and is consumed without re-fetching.

## Current public source-backed dish state

After retained Hot Pepper `freeFood`, official HTML/sitemap/PDF enrichment, reviewed independent-source recovery, and the full exact-bound structured Hot Pepper pass:

- frozen catalog: **2,804** Place IDs;
- named public runtime: **1,422** restaurants;
- public `recommendedDishes`: **447** restaurants;
- public `featuredDishes`: **645** restaurants;
- at least one Chinese-normalized public dish field: **700 / 1,422 = 49.2%**;
- unfilled public dish rows: **722**;
- approximate recommendations: **0**;
- generic fallback: **false**.

The source-backed detail evidence contains:

- evidence restaurants: **691**;
- recommendation evidence restaurants: **422**;
- featured evidence restaurants: **635**;
- recommendation evidence items: **741**;
- featured evidence items: **2,479**;
- `source_recommendation_text`: **740** items;
- `source_pdf_recommendation_text`: **1** item;
- `hotpepper_menu_text`: **1,490** items;
- `source_menu_text`: **626** items;
- `source_pdf_menu_text`: **47** items;
- `provider_promotional_dish_text`: **156** items;
- `retained_source_menu_item`: **160** items.

Current recommendation work lanes are:

- crawlable official/source website: **259**;
- retained third-party source mining: **419**;
- needs a new independent dish source: **297**;
- source-backed featured-only completion: **55**;
- dish complete: **392**.

The full structure-scoped Hot Pepper pass reduced the previous recommendation gap from 1,163 to **975** and the no-dish gap from 924 to **722**, without approximate recommendation fallback.

## SQLite validation state

The database contract run after the structured Hot Pepper merge passed.

The dish translation validator accepted **3,176** source-backed dish evidence items, all retaining source-original text, and materialized canonical dish fields for **414 recommended** places and **626 featured** places after identity/conflict gating. Repeated import, backup/restore and shadow export validations also passed.

The older `docs/database/validate_schema.py` snapshot comparison currently reports the known legacy manifest-count warning in CI and is treated as non-blocking there. This does not relax the dish evidence resolver/validator contract.

## Translation-pending is not missing evidence

When a retained source contains a real dish name but the deterministic normalizer cannot yet produce a reliable Chinese label, preserve the source fact in `data/dish_translation_pending.json` with `status=needs_zh_normalization` rather than inventing a translation.

A pending row means source evidence exists but Chinese canonicalization is pending. It must not be replaced with cuisine/name/brand guesses.

The retained normalization queue currently has **2 items / 2 restaurants** deliberately left unresolved.

## Current implementation

- `scripts/recommended_dish_extractor.mjs`: source-native/Japanese dish -> Chinese normalizer and strict recommendation detector.
- `scripts/build_retained_dish_evidence.mjs`: retained explicit dish evidence mining plus translation-pending queue.
- `scripts/build_retained_hotpepper_promotional_dish_evidence.mjs`: network-free retained Hot Pepper promotional/service-text mining.
- `scripts/collect_hotpepper_web_structured_dish_evidence.mjs`: exact-bound structure-scoped Hot Pepper public-web collector.
- `scripts/filter_hotpepper_structured_dish_evidence.mjs`: deterministic source-native lexical collision filter.
- `scripts/collect_google_inventory_recommendations.mjs`: already-bound official/source-site + retained-source collector.
- `scripts/collect_official_sitemap_dish_evidence.mjs`: bounded same-origin sitemap menu discovery.
- `scripts/build_dish_batch_plan.mjs`: deterministic remaining-work lanes and 8-shard plan.
- `scripts/collect_tabelog_dish_evidence.mjs`: exact-bound Tabelog collector retained as a manual/future-environment path.
- `scripts/audit_google_inventory_detail_evidence.mjs`: web evidence semantic/provider/class contract.
- `scripts/database/resolve_dish_translation_evidence.py`: accepted source-backed evidence -> SQLite `*.zh` resolutions.
- `scripts/database/validate_dish_translation_resolution.py`: language, provenance, semantic-class and resolution-consistency validation.
- `.github/workflows/collect-hotpepper-structured-dishes.yml`: manual-only production Hot Pepper structured enrichment with monotonic merge and database-contract handoff.

No network request is performed by the SQLite translation resolver. It does not infer dishes from cuisine, restaurant name or brand.

## Quality boundary

A source-native product name can be normalized automatically only when the semantic meaning is sufficiently clear from the retained source or independently verified menu description. Brand-created names and unfamiliar dish titles may remain pending instead of receiving fabricated Chinese labels.
