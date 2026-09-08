# 2026-09-08 — Source-backed recommended-dish evidence pipeline v2

## Motivation

`recommendedDishes` is an important user-facing field and should be preserved and expanded whenever trustworthy source evidence is available. The previous approximate runtime layer demonstrated why coverage alone is not a sufficient target: cuisine/name/brand templates produced large repeated clusters such as `烤鲭鱼 · 日式炸鸡`, `烤鸡串 · 日式炸鸡`, and `烤肉拼盘 · 牛舌`, which looked restaurant-specific even though they were only category-level guesses.

The strict-source reset therefore remains in force: approximate recommendation rows = 0 and generic fallback = false. This batch focused on recovering recommendation coverage from already-collected official and third-party evidence instead of lowering the semantic threshold.

## Baseline before this batch

Public named runtime:

- frozen catalog: 2,804 Place IDs
- public named restaurants: 1,415
- unpublished Place-ID-only: 1,389
- `recommendedDishes`: 185 restaurants
- featured-only display: 106 restaurants
- any Chinese dish display: 291 / 1,415 = 20.6%
- unfilled dish display: 1,124
- approximate recommendation rows: 0

## New three-level semantic model

### R — strict recommendation

Can enter public `recommendedDishes` only when:

1. retained source data explicitly claims `recommendedDishes` with a matching sourceRef field claim; or
2. an already-bound official page / retained Hot Pepper text contains a concrete dish term in the same local context as explicit recommendation/signature wording such as `おすすめ`, `名物`, `看板`, `自慢`, `一押し`, `一番人気`, `売れ筋`, `必食`, `signature`, `specialty`, `recommended`, `best seller`, `must try`, or equivalent.

A dish appearing somewhere on the page without recommendation semantics is not R.

### F — source-backed featured/menu dish

Can enter `featuredDishes`, but cannot be represented as a recommendation merely because it exists on a menu.

Eligible examples:

- retained Tabelog / official / Hot Pepper `dishes` or `featuredDishes` with exact sourceRef claims;
- retained Hot Pepper promotional text containing concrete dishes without an explicit recommendation marker;
- schema.org / JSON-LD `MenuItem` on an already-bound official site.

### C — candidate only

Cuisine → dish, restaurant-name → dish, brand → fixed menu, and other common-sense inference remain internal candidates only and are forbidden from public recommendation/featured fields.

## Shared extractor

Added `scripts/recommended_dish_extractor.mjs`.

The new extractor changes the old full-page substring logic to block-aware local context. Paragraph/div/list/heading/table/section boundaries are preserved; only a recommendation-marker block and its immediately adjacent blocks form recommendation context. This reduces accidental joins between an unrelated `人気` label and a menu item elsewhere on the page.

The Chinese normalization dictionary is specific-first. Examples include:

- `濃厚つけ麺` → `浓厚蘸面`
- `家系ラーメン` → `横滨家系拉面`
- `バターチキン` → `黄油鸡咖喱`
- `エビ炒飯` → `虾仁炒饭`
- `鯖塩焼き` → `盐烤鲭鱼`
- `だし巻き玉子` → `日式高汤玉子烧`

The dictionary only standardizes a dish that is actually present in source text; it never creates a dish from cuisine/name/brand metadata.

## Retained-first mining

Added `scripts/build_retained_dish_evidence.mjs`.

It performs zero network requests and scans retained `source_enrichment*.js` rows together with their sourceRefs.

Measured result:

- source shards: 40
- source rows scanned: 584
- rows carrying dish-related source claims: 110
- retained dish values translated/normalized: 100
- skipped/untranslatable retained values: 53
- new retained featured evidence items: 136
- featured evidence restaurants: 99
- provider item counts in this retained pass: Tabelog 63 / official 37

Ordinary retained `dishes` are intentionally F-only and were not promoted to recommendation.

## Official-site / Hot Pepper collector refactor

Refactored `scripts/collect_google_inventory_recommendations.mjs`.

Architecture correction:

- 2,804 is the frozen catalog baseline;
- the detail collector works on the current 1,415 named public rows;
- the remaining 1,389 Place-ID-only entries stay in the separate identity-recovery path.

Source behavior:

- Hot Pepper is consumed from retained `hotpepper_catalog_facts.json`; no paid/extra API call is added;
- already-bound official sites may be fetched directly;
- Google / Tabelog / Hot Pepper / social URLs are excluded from direct website crawling;
- at most a small number of same-origin menu/food links are followed;
- raw HTML is not durable;
- JSON-LD `MenuItem` is F-only unless separate recommendation semantics exist.

During the effective rollout batch, fresh extraction identified:

- retained Hot Pepper strict-recommendation restaurants: 18
- official-site strict-recommendation restaurants: 7
- retained Hot Pepper featured restaurants: 68

Later idempotent reruns can report zero *new* official recommendation rows because the seven official rows are already present in monotonic retained evidence; this is not a regression.

## Evidence merge and QC

`merge_google_inventory_detail_evidence.mjs` remains monotonic: later crawl failure/no-match does not delete previously verified evidence.

A strict audit discovered a historical duplicate bug: the old merge key included the source-native dish spelling, so the same Chinese dish on the same Hot Pepper page could survive twice when the Japanese source string differed.

The semantic dedupe key is now:

`nameZh + provider + sourceUrl + evidenceClass`

`nameJa/nameOriginal` remains metadata only.

Current merged detail evidence:

- evidence restaurants: 277
- recommendation evidence restaurants: 165
- featured evidence restaurants: 163
- recommendation items: 236
- featured items: 214
- provider item counts: sourceWebsite 203 / Tabelog 61 / Hot Pepper 111 / official 75
- evidence classes: `source_recommendation_text` 236 / `retained_source_menu_item` 136 / `provider_promotional_dish_text` 78

`audit_google_inventory_detail_evidence.mjs` blocks any featured/menu-only evidence from silently becoming a recommendation.

## Public result

After rebuild/materialization:

- public `recommendedDishes`: **185 → 192 (+7)**
- `featuredDishes` known: **188**
- featured-only display: **108**
- any Chinese dish display: **291 → 300 (+9)**
- display coverage: **20.6% → 21.2%**
- unfilled dish display: **1,115**
- approximate recommendation rows: **0**
- generic fallback: **false**

The evidence layer expanded from 211 restaurants to 277, while public dish display increased by only nine rows. This is expected: many newly organized retained/F evidence items overlap restaurants that already had canonical/public dish data. Evidence coverage and public-field coverage must therefore be reported separately.

## Repetition guard

`audit_materialized_chinese_dish_runtime.mjs` now treats large repeated clusters as a blocking anomaly:

- same exact two-dish recommendation pair across >=20 restaurants → fail/review;
- same exact single-dish recommendation across >=60 restaurants → fail/review.

This is not proof that lower counts are always correct; it is a regression guard against the previous category-template failure mode.

Current largest recommendation repeats are:

- `三明治`: 14
- `咖喱`: 13
- `意大利面`: 7
- `刺身`: 6
- `拉面`: 5
- `披萨`: 5

No 20+/100+ fixed pair cluster remains.

## Recommendation-first remaining queue

The old detail queue incorrectly mixed frozen-catalog size with public-runtime size and treated every known URL as equally crawlable. Both assumptions are fixed.

Current recommendation gap: **1,223 restaurants**.

Three source-access classes:

1. **229 — `collect_strict_recommended_dishes`**
   - already has a crawlable, bound independent official URL;
   - best target for the next direct official-menu batch.
2. **647 — `extract_retained_dish_source`**
   - no directly crawlable official URL, but retained Tabelog / Hot Pepper-type third-party source exists;
   - continue offline/retained extraction; do not bypass access restrictions.
3. **347 — `find_independent_dish_source`**
   - no current usable dish source;
   - needs a new free independent source before recommendation can be added.

`229 + 647 + 347 = 1,223` exactly.

This is the main scalable continuation path: increase true source coverage rather than lowering R semantics.

## Workflow reliability fixes

Three failures were useful and were fixed without weakening the data rules.

### Run 34178855068

The new evidence audit found the duplicate semantic-dish merge bug. Extraction itself worked. Fix: semantic dedupe key above; audit remained strict.

### Run 34178941795

Evidence, runtime, and QC passed, but final rebase failed because build helpers left uncommitted derived files. Fix: after committing the three intended data artifacts, reset the runner worktree to HEAD before rebase.

### Run 34179216085

All data/QC/three-way queue stages passed, but a queued workflow had checked out its historical event SHA while an earlier serialized run had already pushed new evidence. This produced a generated-data rebase conflict.

Fix: every serialized dish run now performs `git fetch origin main` + `git reset --hard origin/main` immediately before processing, so queued runs begin from current main rather than stale event state.

### Final validation — run 34179341699

All stages succeeded:

- checkout
- sync latest main
- no-paid-data-API audit
- runtime/queue build
- retained dish evidence mining
- official/Hot Pepper collector
- monotonic merge
- strict evidence audit
- runtime rebuild
- three-way recommendation queue validation
- commit / rebase / push

No-paid-data-API audit remained:

- policy: pass
- map: Leaflet + OpenStreetMap
- Google Maps usage: external navigation only
- scanned files: 194
- paid-data-API hits: 0

## Main implementation commits

- `47c631c5` — add shared source-backed recommendation extractor
- `29b3093c` — mine retained provider dish evidence
- `44942854` — refactor recommendation crawl for published runtime
- `3a38508e` — refocus detail queue on named public restaurants
- `9dda8301` — validate retained and official dish evidence
- `719e929b` — rebuild source-backed dish collection workflow
- `e440ce1f` — deduplicate dish evidence by public semantic key
- `10dfe197` — make dish evidence bot rebase cleanly
- `be0af513` — block suspicious repeated recommendation clusters
- `e67cc509` — split recommendation gaps by source access class
- `a3acb173` — validate three-way dish source queue
- `090bef97` — sync latest main before dish batch processing
- `b53125ae` — update recommended-dish pipeline documentation
- `0cbb1ba5` — update DEVELOPMENT.md
- `160eb27f` — update DATA_PIPELINE.md

## Next execution order

1. run stronger source-page/menu extraction against the 229 crawlable official targets;
2. batch mine the 647 retained third-party tasks for explicit recommendation language before looking for new pages;
3. only then search new independent sources for the 347 source-less targets;
4. keep R/F/C semantics, semantic dedupe, repetition guard, and zero-paid-API policy unchanged.
