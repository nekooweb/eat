# 2026-09-10 — Current official chain recommendation gap batch 2

## Scope

Continue source-first recommendation completion after the retained dish-translation normalization batch.

Current public dish plan before this batch:

- public runtime: 1,422 named restaurants;
- recommendation gap: 834;
- official crawl lane: 226;
- retained source mining lane: 318;
- independent source discovery lane: 290;
- official/retained featured lane: 67.

This batch does not change identity, coordinates, source binding, UI, SQLite reset behavior, or paid-data-API policy.

## Reviewed current official sources

### Gusto

Target Place ID: `ChIJVaTZmWqMGGARH0x_mvWNJuc`.

Already-reviewed identity source in the repository points to the Gusto store domain under `store-info.skylark.co.jp`, so the Skylark domain family is already bound to the target identity.

Current official source reviewed on 2026-09-10:

`https://www.skylark.co.jp/gusto/`

The current Gusto page marks the section as `おすすめメニュー` and explicitly names `黒酢タルタルのビッグチキンカツ定食` in the recommendation copy.

Canonical evidence added by the updater when the target still has no recommendation:

- source original: `黒酢タルタルのビッグチキンカツ定食`
- zh-CN canonical: `黑醋塔塔酱大份鸡排套餐`
- class: `source_recommendation_text`

### Ringer Hut

Target Place ID: `ChIJJ_D4jRmMGGARMpn_E26qUCA`.

Already-reviewed identity source in the repository points to `https://shop.ringerhut.jp/detail/r0494/`; no new identity binding is introduced.

Current official source reviewed on 2026-09-10:

`https://www.ringerhut.jp/menu/seasonal/natsukara_cp_2026/`

The current seasonal product page explicitly describes `夏辛ちゃんぽん` as `辛党必食の一杯`, which satisfies the existing strict recommendation marker policy (`必食`).

Canonical evidence added by the updater when the target still has no recommendation:

- source original: `夏辛ちゃんぽん`
- zh-CN canonical: `夏辣长崎什锦面`
- class: `source_recommendation_text`

## Updater hardening

The previous current-chain script was written for its first nine-row application and threw an error once a reviewed target already had recommendation data. That made a second reviewed batch unsafe to run after the first batch and the later DOUTOR gap fill.

The updater now:

1. validates every target against the current runtime and already-bound official domain before considering output;
2. validates source URL domain and evidence metadata;
3. skips targets that already have `recommendedDishes` instead of failing or overwriting them;
4. emits only current recommendation gaps;
5. records skipped already-filled rules in the output;
6. remains identity-isolated and zero-paid-API.

The apply workflow no longer hard-codes the historical `9 restaurants / 11 items` batch. It reconciles `skipped + output = reviewed rules`, then requires the post-merge recommendation growth to equal the actual number of rows emitted by the current gap-only build. This makes reruns idempotent: a fully applied registry can legitimately emit zero new rows and must produce zero growth.

## Trigger

`.reviewed-current-chain-recommendation-run` is updated in the same PR. After merge to `main`, the existing reviewed-current-chain workflow will rebuild the public baseline, generate only still-missing evidence, audit the merge, require exact monotonic recommendation growth, and commit verified data back to `main`.

## Remaining larger bottleneck

The general official-site collector still follows only exact-hostname menu links. This excludes valid already-bound chain transitions such as:

- `shop.ringerhut.jp` -> `www.ringerhut.jp`;
- `store-info.skylark.co.jp` -> `www.skylark.co.jp`.

That is a separate collector-boundary issue and should be fixed with a narrow same-domain-family rule plus regression tests, rather than by broadly allowing cross-origin crawling.
