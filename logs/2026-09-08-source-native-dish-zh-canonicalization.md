# 2026-09-08 — Source-native dish evidence -> Chinese canonical database fields

## User requirement correction

The product does **not** require restaurant sources to publish Chinese dish names.

The intended pipeline is:

```text
Japanese / source-native dish text
  -> retain original source text and provenance
  -> translate / normalize into Chinese
  -> preserve R/F semantics
  -> write Chinese canonical value into database
```

This batch corrected the implementation and documentation to match that requirement.

## Why the correction mattered

The earlier wording around “Chinese dish display coverage” could be misread as if a restaurant/source needed Chinese text. More importantly, retained mining previously dropped a source-backed dish when the current deterministic dictionary could not translate it.

That conflated two different states:

1. no dish evidence exists;
2. dish evidence exists in Japanese, but Chinese normalization is pending.

These states are now separated.

## Language and evidence contract

Evidence layer keeps:

- source-native `nameOriginal` / legacy-compatible `nameJa`;
- provider;
- source URL;
- checked date;
- evidence semantic class;
- rule/snippet where applicable.

Canonical layer keeps the normalized Chinese label in:

- `recommended_dishes.zh`;
- `featured_dishes.zh`.

The Chinese value never replaces the original evidence text.

## R/F/C semantics remain unchanged

- **R / strict recommendation**: concrete dish + explicit recommendation/signature/popular semantics; may enter `recommendedDishes`.
- **F / featured/menu dish**: source proves the menu item exists, but does not prove recommendation status; may enter `featuredDishes`.
- **C / candidate**: cuisine/name/brand/common-sense inference only; cannot enter public dish fields.

Translating a Japanese dish into Chinese does not upgrade F to R.

## Translation-pending queue

`scripts/build_retained_dish_evidence.mjs` now writes `data/dish_translation_pending.json`.

A pending row means:

- source-backed dish evidence exists;
- original dish name is retained;
- source provenance exists;
- deterministic Chinese normalization is not yet reliable;
- the row must not be counted as “no dish evidence”.

Initial queue:

- 53 pending items;
- 47 restaurants;
- 52 Japanese-language hints.

After expanding the source-native/Japanese normalization rules:

- **2 pending items**;
- **2 restaurants**;
- **2 Japanese-language hints**.

Remaining rows are intentionally conservative:

1. `えびず焼き` — restaurant-created product name without a sufficiently clear retained composition description;
2. `ソルベージュ®エスプレッソ` — trademark product name retained until a stable canonical product-name policy is chosen.

Neither row is treated as missing dish evidence.

## Japanese -> Chinese normalization expansion

`scripts/recommended_dish_extractor.mjs` was expanded with specific-first mappings recovered from retained source text, including examples such as:

- `石焼ビビンパ` -> `石锅拌饭`
- `純豆腐チゲ` -> `嫩豆腐锅`
- `宇和島流鯛めし` -> `宇和岛式鲷鱼饭`
- `串焼き` -> `烤串`
- `スターバックス ラテ` -> `星巴克拿铁`
- `ハニーミルクラテ` -> `蜂蜜牛奶拿铁`
- `ズッパフォルテ` -> `那不勒斯辣味炖猪杂`
- `神経〆活魚` -> `神经处理鲜鱼`
- `釣り魚` -> `钓获鲜鱼`

The last three were additionally checked against current menu/source descriptions before being normalized. Brand/cuisine guessing was not used.

## Latest retained normalization result

Workflow run `34180733861` completed successfully.

Retained source mining:

- source files: 40;
- source rows scanned: 584;
- rows with claimed dish fields: 110;
- translated/normalized retained values: **151**;
- untranslated retained values: **2**;
- translation-pending items: **2**;
- featured evidence items from retained pass: **174**;
- featured restaurants from retained pass: **110**;
- provider items: Tabelog 79 / official 72.

No network request is used for retained mining.

## Latest source-backed evidence layer

After the same run's monotonic merge:

- evidence restaurants: **292**;
- recommendation evidence restaurants: **170**;
- featured evidence restaurants: **176**;
- recommendation evidence items: **241**;
- featured evidence items: **255**;
- `source_recommendation_text`: 241;
- `retained_source_menu_item`: 175;
- `provider_promotional_dish_text`: 80.

The official-site collector also found 3 additional strict-recommendation restaurants in this run.

## Public runtime result

Current public named runtime remains 1,415 restaurants.

Dish fields after materialization:

- `recommendedDishes`: **196 restaurants**;
- `featuredDishes` known: **190 restaurants**;
- featured-only: 109;
- restaurants with a Chinese-normalized public dish value: **305 / 1,415 = 21.6%**;
- no public dish value: 1,110;
- approximate recommendation rows: 0;
- generic fallback: false.

“305 restaurants” means 305 restaurants currently have a Chinese-normalized public value. It does **not** mean their source websites contain Chinese.

Current recommendation gap: **1,219**:

- 226 crawlable bound official-source targets;
- 646 retained third-party-source targets;
- 347 targets needing a new independent source.

## SQLite canonicalization

Added/updated:

- `scripts/database/resolve_dish_translation_evidence.py`
- `scripts/database/validate_dish_translation_resolution.py`
- `scripts/database/build_master.py`
- `scripts/database/export_master_core.py`
- `scripts/database/plan_ingestion_tasks.py`
- `.github/workflows/database-contract.yml`

Canonical resolver behavior:

- consumes already source-backed R/F evidence;
- requires publishable non-conflict identity;
- keeps source-original text;
- requires a valid Chinese `nameZh` before canonicalization;
- materializes `recommended_dishes.zh` / `featured_dishes.zh`;
- performs zero network requests;
- never changes identity;
- never derives a dish from cuisine/name/brand.

## Latest database validation

Database contract run `34180836433` used the latest 496 detail-evidence observations.

Results:

- evidence observations: **496**;
- accepted semantic + translation items: **480**;
- accepted items retaining source-original: **480 / 480**;
- canonical `recommended_dishes.zh`: **164 restaurants / 232 items**;
- canonical `featured_dishes.zh`: **171 restaurants / 243 items**;
- identity-conflict evidence: 6;
- identity-not-publishable evidence: 10;
- dish translation/canonical validator failures: **0**.

Database build, repeat-build idempotence, backup/restore, export validation, runtime/shadow diagnostics all passed. `master-plan-v3` reports **0 active dish-semantic-review tasks** because publishable source-backed evidence with a valid Chinese canonical value is now resolved automatically.

## No-paid-API policy

The recommendation collection run continued to pass:

- paid-data-API policy: pass;
- Google paid data API hits: 0;
- map mode: Leaflet + OpenStreetMap;
- Google Maps use: external navigation only.

## Documentation

Updated/added:

- `RECOMMENDED_DISH_PIPELINE.md`
- `docs/database/dish_language_contract.md`
- this log.

The terminology is now explicit: source-language coverage and Chinese-canonical coverage are separate metrics.

## Next development direction

1. Continue extracting source-native Japanese recommendation/menu text from the 226 crawlable official targets.
2. Deepen retained Japanese menu/recommendation extraction for the 646 third-party-source targets.
3. Preserve untranslated source evidence first, then normalize into Chinese; do not drop it.
4. Keep the small translation-pending queue explicit rather than forcing uncertain translations.
5. Search new free independent sources for the remaining 347 source-less recommendation targets.
6. Keep strict R/F/C semantics and zero-paid-data-API rules unchanged.
