# 2026-09-19 — S2 classification central review

## Central decision

All 11 S2 worker proposals were reviewed independently against the existing fail-closed contract and only the assigned bound-source evidence.

Final S2 decisions:

- accepted_evidence: 3
- candidate: 2
- no_evidence: 1
- blocked: 5
- paid Google Data API calls: 0

Accepted:

- サラファン -> `style-western`
- WIZ CRAFT BEER and FOOD -> `style-italian`
- さかなさま 大手町店 -> `food-seafood`

Conservative decisions retained:

- Kanda Square remains blocked because the assigned site identifies a mixed-use facility rather than one restaurant entity.
- L'art et Mikuni remains no_evidence because the exact branch evidence contains no explicit cuisine/business category.
- デニーズ 東京ドームシティ店 and Brussels remain candidate because their assigned pages are brand-level rather than exact-branch classification evidence.
- ワイン処 Oasi, Craft Beer Market (Awajicho), BAR 2000, and Craft Beer Market (Otemachi) remain blocked because the assigned URLs could not be reviewed reliably.
- No unassigned replacement source was introduced.

## Independent source checks

The central pass re-opened only already-assigned sources. It independently confirmed:

- サラファン: exact Tabelog branch genre includes ロシア料理 and 洋食; only the existing `style-western` mapping is accepted.
- WIZ: exact branch page identifies the address and describes the venue as an イタリアン酒場・ビアレストラン; only `style-italian` is accepted.
- KANDA SQUARE: the official site describes offices, halls/conference facilities, and a restaurant/shop collection, confirming the catalog identity conflict.
- Denny's and BRUSSELS roots remain multi-store/brand-level evidence and are not propagated to an exact branch.

## Maintained truth before CI

The deterministic reviewed truth now aggregates S2 + S5 + S6 + S7:

- review files: 4
- reviewed rows: 36
- accepted rows: 14
- candidate rows: 4
- no_evidence rows: 4
- blocked rows: 14
- accepted overlay rows: 14

## Maintained preview result

PR validation measured:

- accepted classification: **1,272 -> 1,275 (+3)**
- unknown classification: **150 -> 147 (-3)**
- coverage: **89.45% -> 89.66%**
- cuisineStyle rows: **519 -> 521**
- foodType rows: **265 -> 266**
- venueType rows: **595 -> 595**
- rows with multiple dimensions: **96 -> 96**
- active bound-source rows: **75 -> 64**
- active explicit bound links: **84 -> 73**
- S2 active assignment: **11 -> 0**

The full S2 shard is retired from immediate work. The maintained residual bound-source plan now contains 64 rows / 73 explicit links across S0, S1, S3 and S4.


## Production deployment

PR #97 was squash-merged to `main` as `e3a1ba012b88a5bfb96f0ab7fa876cf7a68e2f47`.

Production verification:

- GitHub Pages run #1396 / `35442523537`: success;
- no-paid-data-API run #1176 / `35442523581`: success;
- production build, maintained rebuild, static checks and Pages deploy all completed successfully.

S2 central-reviewed classifications are therefore part of the production release.
