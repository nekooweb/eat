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

`featured_dishes.zh` accepts only the approved featured/menu evidence classes.

## Translation-pending is not missing evidence

When a retained source contains a real dish name but the deterministic normalizer cannot yet produce a reliable Chinese label, the source evidence must be preserved in `data/dish_translation_pending.json` with `status=needs_zh_normalization`.

Such a row means:

- a dish/source fact exists;
- source provenance exists;
- Chinese canonicalization is pending.

It must not be counted as `no dish evidence` and must not be replaced with cuisine/name/brand guesses.

## Current implementation

- `scripts/recommended_dish_extractor.mjs`: Japanese/source-native dish -> Chinese normalizer.
- `scripts/build_retained_dish_evidence.mjs`: retained evidence mining plus translation-pending queue.
- `scripts/database/resolve_dish_translation_evidence.py`: source-backed evidence -> SQLite `*.zh` resolutions.
- `scripts/database/validate_dish_translation_resolution.py`: validates language, provenance, semantic class, and resolution consistency.
- `scripts/database/export_master_core.py`: prefers `*.zh` canonical fields before legacy dish fields.

No network request is performed by the SQLite translation resolver. It does not infer dishes from cuisine, restaurant name, or brand.

## Quality boundary

A Japanese product name can be translated automatically only when the semantic meaning is sufficiently clear from the retained source or independently verified menu description. Brand-created names with unclear composition may remain pending rather than receiving a fabricated Chinese name.

As of the latest retained normalization batch, the translation-pending queue has been reduced from **53 items / 47 restaurants** to **2 items / 2 restaurants**. The remaining rows are deliberately retained for review instead of being forced through an uncertain translation.
