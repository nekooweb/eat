# Explicit official budget/address automation — 2026-09-06

## Purpose

Test whether the remaining budget/address review burden can be reduced safely from current official pages without treating menu-item prices as restaurant spending budgets.

## Safety contract

The batch only processes existing source-backed production identities with no source-resolution state. Current page fetch and page-title/business-name agreement are required.

Automatic address promotion requires an explicit `住所` or `所在地` label and a plausible Area1 address in 千代田区 or 文京区.

Automatic budget promotion is intentionally much stricter: the page must explicitly identify lunch/dinner together with `予算` or `平均` and provide a numeric range or upper bound. Product, menu-item, course or beverage prices are **not** converted into `lunch`/`dinner` budget ranges.

Known third-party/social/site-builder hosts are excluded from automatic promotion.

## Validation

Authoritative run: `33982592924`.

Clean baseline:

- production: **648**;
- source-backed: **397**;
- budget known: **192**;
- address known: **259**;
- normalized opening hours: **282**.

Scan:

- eligible direct-official targets: **70**;
- current fetch success: **60 / 70**;
- page-title identity matches: **39**;
- automatic patches: **2**;
- address patches: **2**;
- budget patches: **0**;
- explicit lunch-budget patches: **0**;
- explicit dinner-budget patches: **0**.

The zero-budget result is intentional evidence that generic automatic budget derivation should **not** be expanded by interpreting menu prices as per-person spend.

## Accepted addresses

1. **ヒナタ屋** (`ChIJDUGL7RCMGGARErPxhJ7bXgc`)
   - official page: `https://hinata-ya.info/`
   - address: `東京都千代田区神田小川町3-10`

2. **焼肉京城** (`ChIJe4ebpD-MGGARksrpQ0_0cLs`)
   - official page: `https://keijo-suidobashi.com/?utm_source=google&utm_medium=meo`
   - address: `東京都千代田区神田三崎町2-10-3`

Both pages explicitly label the address. The Keijo hours are not automatically promoted by the opening-hours layer because its current page also carries seasonal closure semantics that the static weekly model does not represent faithfully.

## Result

After the accepted patches:

- production: **648**;
- source-backed: **397**;
- budget known: **192** (unchanged);
- address known: **259 -> 261**;
- source-backed address gap: **172 -> 170**;
- normalized opening hours: **282**;
- featured dishes: **124**;
- strict recommendations: **27**.

Repository, source-binding and normalized-field audits passed.

## Cost

**Zero new Google Places API calls.** Only persisted official URLs were fetched.

## Decision for budget work

Do not add a generic A-tier rule that maps one or more menu prices to restaurant budget. Budget remains B-review or host-specific only when an official source has an explicit spend/average-budget semantic.

The next useful acceleration target is therefore not generic budget inference; it is repeated-host evidence compression and deterministic featured-dish/menu extraction where source semantics are explicit.
