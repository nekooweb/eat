# 2026-09-10 — Controlled source-backed collection result

## Final status

Controlled source-backed collection run `34446357126` completed successfully after the provider-audit fix. The verified data write-back commit is:

`820b11aa5384d5aa548463b9f730df68d94000b0` — `Update source-backed recommended dish evidence`

The run completed the full path:

1. retained source-native dish mining;
2. retained Hot Pepper promotional/recommendation mining;
3. current already-bound official-site collection;
4. bounded sitemap menu discovery;
5. full-retention central evidence merges;
6. dish-specificity correction;
7. central evidence audit;
8. public runtime / queue / batch-plan rebuild;
9. zero-paid-data-API audit;
10. data commit to `main`;
11. persistent SQLite master build;
12. repeat-import idempotence validation;
13. backup/restore validation;
14. shadow export validation.

The database validation job also completed successfully. A legacy monolithic schema prototype check still emits a warning-only failure because it cannot apply the current migration chain; this did not fail the current master/database contract and remains technical debt rather than a successful schema assertion.

## Public runtime delta

Before the successful collection:

- public named runtime: 1,422;
- recommended restaurants: 592;
- featured restaurants: 656;
- restaurants with any zh-CN dish display: 727;
- no-dish gap: 695;
- recommendation gap: 830.

After the verified rebuild:

- public named runtime: 1,422;
- recommended restaurants: **595** (`+3`);
- featured restaurants: **675** (`+19`);
- restaurants with any zh-CN dish display: **740** (`+13`);
- no-dish gap: **682** (`-13`);
- recommendation gap: **827** (`-3`);
- displayed dish coverage: **52.0%**.

The rebuilt recommendation lanes are now:

- official crawl: **220**;
- retained third-party source mining: **318**;
- new independent source required: **289**;
- official/retained featured-only work: **65**.

The original run marker recorded `222 / 318 / 290`, but the fresh pre-collection queue rebuild classified the unchanged total recommendation gap as `223 / 318 / 289`. Final comparisons use the generated queue/runtime, not the marker checkpoint. The successful run reduced that actual official lane from 223 to 220.

## Retained source-native normalization

The retained builder scanned 41 source files / 601 source rows and found 121 restaurants with claimed dish fields.

- translated/normalized source values: 170;
- untranslated values: 2;
- translation pending: **2 items / 2 restaurants**;
- retained featured items: 191.

The remaining two intentionally pending source names are still:

- `えびず焼き`;
- `ソルベージュ®エスプレッソ`.

This confirms the earlier 7-item normalization batch is actually consumed by the rebuild rather than existing only as dictionary code.

## Retained Hot Pepper pass

The network-free retained Hot Pepper pass produced:

- 172 evidence restaurants;
- 18 recommendation restaurants / 20 recommendation items;
- 154 featured restaurants / 186 featured items.

Most of this pass strengthened existing evidence rather than reducing the restaurant-level recommendation gap, which is why the `retained_source_mining` lane remains 318. The next retained-data phase therefore needs new deterministic extraction rules / reviewed source semantics, not repeated execution of the same pass.

## Current official-site pass

The current official collector processed:

- 334 website tasks;
- 242 hosts;
- 475 visited pages;
- 3 structured menu links discovered under the new bounded root/subdomain policy;
- 28 website recommendation restaurants;
- 47 website featured-menu restaurants;
- 150 plain menu items;
- 48 total source-backed recommendation restaurants when the retained Hot Pepper recommendations in the same output are included;
- 76 recommendation items;
- 225 featured items.

The collector completed successfully under the new root/subdomain menu-link policy and public-suffix guard.

## Bounded sitemap pass

The sitemap collector evaluated 266 targets across 242 unique origins:

- 507 sitemap files fetched;
- 64 menu URLs discovered;
- 54 menu pages fetched;
- 18 evidence restaurants;
- 2 recommendation restaurants / 4 recommendation items;
- 16 featured restaurants / 62 featured items.

## Evidence-layer delta

Before this collection, the central evidence store contained:

- 564 recommendation-evidence restaurants;
- 647 featured-evidence restaurants;
- 719 restaurants with either evidence type;
- 989 recommendation items;
- 2,504 featured items.

After all full-retention merges and specificity correction:

- recommendation-evidence restaurants: **567**;
- featured-evidence restaurants: **666**;
- evidence restaurants: **732**;
- recommendation items: **1,000**;
- featured items: **2,663**.

Specificity correction changed 5 items across 5 restaurants and removed 3 duplicate items; the active correction rules were one meat-sushi-over-sushi case and four yakisoba-over-soba cases.

The final evidence audit passed with the maintained providers `sourceWebsite`, `Tabelog`, `Hot Pepper`, `official`, `Visit Chiyoda`, and `Tokyo Ramen of the Year`.

## First-attempt failure and repair

The first controlled run `34445830686` completed source collection and all monotonic merges but failed before write-back because the central audit's private provider allow-list did not include the already-maintained retained provider `Tokyo Ramen of the Year`.

No data from that failed attempt reached `main`.

PR #64 centralized the explicit provider policy and added a regression that runs the retained builder and requires every emitted provider to be accepted by the central audit. The successful second run proves that repair on the real full workflow.

## Next data priority

The largest immediately actionable recommendation lane is now **318 retained-third-party targets**. Re-running the same retained pass will not materially reduce that lane; the next work should use the existing unmatched Hot Pepper recommendation-marker/heading audits to identify source-native concrete dishes that can be added as deterministic strict rules, while keeping marker adjacency and R/F semantics intact.

The 220 official targets remain useful for additional collector improvements and reviewed current-chain batches. The 289 independent-source targets require new free sources and should remain lower priority than already-retained evidence.
