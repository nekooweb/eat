# 2026-09-08 structured Hot Pepper menu enrichment

## Goal

Continue filling source-backed dish data without paid APIs and without weakening restaurant identity or recommendation semantics.

## Retained Hot Pepper `freeFood` expansion

The retained promotional miner was extended to consume `hotpepper_catalog_facts.json -> facts.freeFood` only when the retained provider text contains both:

1. concrete availability semantics such as `食べ放題`, `ビュッフェ`, or equivalent; and
2. a concrete recognized dish.

This path is network-free and remains F/featured unless the same source text contains an explicit recommendation marker.

The pass found 7 qualifying retained texts and added dish display coverage for 2 previously dishless restaurants:

- 粋 神保町本店: `肉寿司や焼き鳥など食べ放題` -> `肉寿司`, `烤鸡串` as F;
- 個室居酒屋 つるよし 神保町店: `肉寿司や国産マグロなど食べ放題` -> `肉寿司` as F.

Public dish display coverage increased 496 -> 498 and no-dish rows decreased 926 -> 924. Recommended coverage did not change.

## Hot Pepper public-web feasibility pilot

A first 64-restaurant exact-bound public-web pilot proved that GitHub runners could fetch Hot Pepper restaurant pages reliably:

- identity roots: 64 / 64;
- menu pages fetched: 115 / 115;
- request errors: 0.

However, the generic page-wide extractor overmatched Hot Pepper template/footer content and produced 235 apparent R items. That design was rejected and the generic diagnostic collector was later removed.

## Structure-scoped design

The production collector was rewritten around Hot Pepper's page structure instead of generic text scanning:

- start only from an already-retained exact `strJ...` URL bound to the frozen Place ID;
- revalidate restaurant name on the root page;
- discover only same-restaurant `/food/` or `/menu/` links exposed by that root; no guessed menu paths;
- revalidate identity on the food/menu page;
- R only from concrete dish headings inside the explicit `おすすめ料理` section (`h2` section -> `h3` title);
- F only from concrete `h4` menu headings with nearby price/price-like evidence;
- exclude course-page ordinary extraction, reviews, related-keyword/footer text and generic page prose;
- preserve source-native heading, URL and checked date;
- no Hot Pepper Web Service API and no paid Google data API.

The 64-restaurant structure-scoped pilot returned:

- identity pages: 64 / 64;
- food pages: 56 / 56;
- recommendation items: 40 across 29 restaurants;
- featured items: 315 across 52 restaurants;
- errors/rejections: 0.

The large reduction from 235 generic R hits to 40 structure-backed R hits confirmed that the page-wide design was unsafe and the structural boundary was necessary.

## Deterministic lexical conflict filter

Before canonical merge, a source-native lexical filter removes known substring collisions without using cuisine, brand or restaurant-name knowledge. Examples include:

- `パンケーキ` must not also create broad `蛋糕` or the accidental `卡邦尼意大利面` match;
- `パッキーマオ` must not create `肉末咖喱`;
- non-buckwheat compounds such as `油そば`, `まぜそば`, `焼きそば` must not create generic `荞麦面`;
- broad duplicates are dropped when an explicit more-specific source match exists, e.g. `焼き餃子` -> `煎饺` without duplicate `饺子`.

## Full production pass

Full workflow run: `34225451637`.

Raw exact-bound structured collection:

- eligible targets: 437;
- root identity success: 437 / 437;
- food/menu pages discovered: 375;
- food/menu pages fetched: 375 / 375;
- request errors: 0;
- identity rejections: 0;
- evidence restaurants: 340;
- recommendation restaurants: 202;
- featured restaurants: 316;
- R items: 299;
- F items: 1,964.

After deterministic lexical filtering:

- evidence restaurants: 340;
- recommendation restaurants: 200;
- featured restaurants: 316;
- R items: 290;
- F items: 1,919;
- lexical false-positive items dropped: 22;
- broad duplicate items dropped: 32.

Filter counts:

- non-buckwheat-soba compound: 14;
- margherita over pizza: 6;
- pancake over cake: 5;
- grilled gyoza over generic gyoza: 23;
- pancake / carbonara substring collision: 1;
- sushi-shop phrase / sushi dish collision: 1;
- pad kee mao / keema curry collision: 1;
- tonkotsu ramen over generic ramen: 1;
- green curry over generic curry: 2.

## Monotonic merge result

Before the full Hot Pepper structured merge, detail evidence contained:

- evidence restaurants: 489;
- recommendation restaurants: 234;
- featured restaurants: 430;
- R items: 451;
- F items: 1,069.

After merge:

- evidence restaurants: **691**;
- recommendation restaurants: **422**;
- featured restaurants: **635**;
- R items: **741**;
- F items: **2,479**.

Evidence classes after merge include:

- `source_recommendation_text`: 740;
- `source_pdf_recommendation_text`: 1;
- `hotpepper_menu_text`: 1,490;
- `source_menu_text`: 626;
- `source_pdf_menu_text`: 47;
- `provider_promotional_dish_text`: 156;
- `retained_source_menu_item`: 160.

Generated data commit:

- `47b74e722f7fc12a49841a6e55293a46e634e881` — `Add structured Hot Pepper menu dish evidence`

## Public runtime impact

Immediately before the full structured pass:

- recommended known: 259;
- featured known: 440;
- display dish known: 498;
- no-dish gap: 924;
- recommendation gap: 1,163;
- retained-third-party recommendation lane: 597.

After the full structured pass:

- recommended known: **447** (`+188`);
- featured known: **645** (`+205`);
- display dish known: **700** (`+202`);
- no-dish gap: **722** (`-202`);
- recommendation gap: **975** (`-188`);
- retained-third-party recommendation lane: **419** (`-178`);
- independent-source recommendation lane: **297**;
- crawlable official/source R lane: **259**;
- featured-only completion lane: **55**;
- dish-complete rows: **392**.

Public named runtime remains 1,422 and the frozen catalog remains 2,804. Display-dish coverage is now **700 / 1,422 = 49.2%**.

No approximate recommendation fallback or generic dish fallback was introduced.

## SQLite contract

The reusable database-contract job completed successfully after the generated data commit.

Dish translation validation reported:

- status: pass;
- accepted source-backed evidence items: 3,176;
- accepted evidence with source-original text: 3,176;
- recommended canonical places: 414;
- featured canonical places: 626;
- featured classes include `hotpepper_menu_text` and `source_pdf_menu_text`;
- recommendation classes include `source_recommendation_text` and `source_pdf_recommendation_text`.

Idempotent repeated import, backup/restore and shadow export validations also passed. The older snapshot-oriented `docs/database/validate_schema.py` manifest-count check remains a known non-blocking warning in CI; it is not part of the dish evidence acceptance contract.

## Cleanup and production state

After the successful run:

- the overbroad generic Hot Pepper diagnostic collector was removed;
- the one-shot pilot workflow and marker files were removed;
- the completed full-run marker was removed;
- `.github/workflows/collect-hotpepper-structured-dishes.yml` is retained as a manual-only `workflow_dispatch` production workflow;
- the structured collector, lexical filter, evidence validator, SQLite resolver and SQLite validator are retained as production code.

## Next high-value target

The remaining recommendation gap is no longer primarily a transport/fetch problem. Hot Pepper now exposes an additional safe opportunity: explicit `おすすめ料理` h3 headings that are structurally valid recommendation evidence but are not yet recognized by the current deterministic Japanese-to-Chinese dish normalizer.

The next pass should audit those unmatched explicit recommendation headings, rank repeated source-native dish terms, add only unambiguous normalization rules, and leave brand-created/unclear names pending rather than guessing.
