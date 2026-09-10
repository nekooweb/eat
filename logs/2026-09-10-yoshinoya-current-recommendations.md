# 2026-09-10 — Yoshinoya current recommendation batch

## Scope

Continue the current official-chain recommendation gap workflow after the Gusto/Ringer Hut batch and the central evidence-retention fix.

Targets currently in the `official_crawl` recommendation lane:

- `ChIJGwjljhWMGGARjLafECSEbqA` — 吉野家
- `ChIJ38dCzRqMGGAR9Awruuaqr_A` — 吉野家

Both identities already have reviewed official store pages under `stores.yoshinoya.com`; this batch does not create or change identity bindings.

## Current official recommendation source

Reviewed on 2026-09-10:

`https://www.yoshinoya.com/menu/`

The current official menu page explicitly presents the following under `おすすめメニュー / RECOMMENDED`:

- `月見牛とじ御膳/月見牛とじ丼`
- `極旨牛鉄板ステーキ定食`

The current `極旨牛鉄板ステーキ定食` product page remains available as a period-limited menu item, and Yoshinoya's current moon-viewing campaign page states that `月見牛とじ御膳` and `月見牛とじ丼` began nationwide sales on 2026-08-27, subject to some-store exclusions.

For the reviewed-chain evidence layer this batch records two concrete recommendation labels per still-missing Yoshinoya target:

- `月見牛とじ御膳` -> `月见牛肉滑蛋御膳`
- `極旨牛鉄板ステーキ定食` -> `极旨铁板牛排套餐`

Both remain `source_recommendation_text`; no ordinary menu item is promoted merely from cuisine or brand knowledge.

## Runtime-baseline hardening

The active reviewed-chain updater previously still required the public named runtime to equal exactly 1,422 rows. That is unsafe because the named/public count is expected to change when identity recovery or quarantine changes publishability.

Added `scripts/runtime_catalog_contract.mjs` with the intended contract:

1. frozen `catalogTotal` must remain 2,804;
2. runtime `inventoryTotal` must equal the actual named row count;
3. named rows + `unpublishedPlaceIdOnly` must reconcile to the frozen catalog;
4. every published row must have a unique non-empty Place ID.

The reviewed-chain updater and DOUTOR gap builder now use this dynamic contract rather than pinning `1422`.

Added `scripts/test_runtime_catalog_contract.mjs`, which explicitly proves that different named/unpublished splits can be valid for the same frozen catalog and rejects count or ID inconsistencies.

## Reviewed-chain updater regression

Added `scripts/test_reviewed_current_chain_updater.mjs` to execute the updater against the current generated runtime and verify:

- zero network / zero paid data API policy;
- no identity mutation;
- already-bound official-domain requirement;
- gap-only/idempotent output;
- dynamic public-runtime-count policy;
- reviewed registry reconciliation (`skipped + emitted = reviewed`);
- unique target IDs and strict recommendation evidence fields;
- no return of the `1422` named-runtime pin in the active current-chain or DOUTOR builders.

The apply workflow no longer pins the reviewed registry size either. Future reviewed chain rules can be added without editing a second `reviewedRules=N` business constant; the workflow validates registry/output reconciliation instead.

## Trigger and expected effect

The marker `.reviewed-current-chain-recommendation-run` is updated for this batch. After merge, the existing apply workflow will rebuild the baseline, emit only current gaps, merge into the now full-retention evidence store, rebuild again, and require the recommendation coverage delta to exactly equal the number of emitted targets before writing data back to `main`.

On the pre-apply baseline both Yoshinoya targets have no `recommendedDishes`, so the expected current batch output is two restaurants. Final counts must be taken from the successful post-merge workflow rather than assumed from this pre-apply expectation.
