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

The official-site collector can batch-fetch already-bound independent sites and follow a small number of same-origin menu/food pages. GitHub-hosted runners currently do **not** reliably fetch Tabelog restaurant roots, so the 8-shard Tabelog collector is manual-only and must not be used as an automatic retry loop. Existing retained Tabelog evidence remains valid and is still consumed without re-fetching.

## Translation-pending is not missing evidence

When a retained source contains a real dish name but the deterministic normalizer cannot yet produce a reliable Chinese label, the source evidence must be preserved in `data/dish_translation_pending.json` with `status=needs_zh_normalization`.

Such a row means:

- a dish/source fact exists;
- source provenance exists;
- Chinese canonicalization is pending.

It must not be counted as `no dish evidence` and must not be replaced with cuisine/name/brand guesses.

## Current implementation

- `scripts/recommended_dish_extractor.mjs`: Japanese/source-native dish -> Chinese normalizer and strict recommendation detector.
- `scripts/build_retained_dish_evidence.mjs`: retained evidence mining plus translation-pending queue.
- `scripts/collect_google_inventory_recommendations.mjs`: bound-official-site + retained Hot Pepper bulk collector; plain official menu text is F only.
- `scripts/build_dish_batch_plan.mjs`: deterministic bulk work lanes and 8-shard plan.
- `scripts/collect_tabelog_dish_evidence.mjs`: exact-bound Tabelog menu collector retained as a manual/future-environment path.
- `scripts/database/resolve_dish_translation_evidence.py`: source-backed evidence -> SQLite `*.zh` resolutions.
- `scripts/database/validate_dish_translation_resolution.py`: validates language, provenance, semantic class, and resolution consistency.
- `scripts/database/export_master_core.py`: prefers `*.zh` canonical fields before legacy dish fields.

No network request is performed by the SQLite translation resolver. It does not infer dishes from cuisine, restaurant name, or brand.

## Quality boundary

A Japanese product name can be translated automatically only when the semantic meaning is sufficiently clear from the retained source or independently verified menu description. Brand-created names with unclear composition may remain pending rather than receiving a fabricated Chinese name.

As of the latest retained normalization batch, the translation-pending queue has been reduced from **53 items / 47 restaurants** to **2 items / 2 restaurants**. The remaining rows are deliberately retained for review instead of being forced through an uncertain translation.
