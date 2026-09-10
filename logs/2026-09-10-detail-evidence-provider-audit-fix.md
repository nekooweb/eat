# 2026-09-10 — Detail evidence provider-audit fix

## Failure found by the controlled collection run

Controlled workflow run `34445830686` completed retained mining, current official-site collection, and bounded sitemap collection successfully, then failed in the central evidence audit after the monotonic merge and specificity correction.

The failure was:

`Unsupported detail provider: Tokyo Ramen of the Year`

This provider was not introduced by the live crawl. It is an already-maintained retained source in `source_enrichment_pr16-gap-migration.js` for the MANNISH dish source, and `build_retained_dish_evidence.mjs` correctly emitted one retained dish item with that provider. The audit allow-list had drifted behind the maintained retained-source provider set.

No generated evidence was committed because the failure happened before the rebuild/write-back step.

## Fix

Added `scripts/dish_evidence_provider_policy.mjs` as the closed provider allow-list used by the central evidence audit. The list remains explicit and reviewed; it is not populated from arbitrary incoming evidence.

The maintained providers now include:

- Hot Pepper
- sourceWebsite
- Tabelog
- official
- Visit Chiyoda
- Tokyo Ramen of the Year

The audit imports this closed policy rather than carrying a private stale copy.

## Regression

Added `scripts/test_dish_evidence_provider_policy.mjs` and wired it into PR Review.

The test executes the current network-free retained dish builder into temporary files, collects every provider it actually emits, and requires each to exist in the closed audit policy. It explicitly requires the fixture to exercise `Tokyo Ramen of the Year`, plus Tabelog, official, and Visit Chiyoda, so the exact failure from run `34445830686` cannot silently return.

## Useful data from the failed run

Although the write-back was blocked, all source-collection and merge stages before the final audit produced useful diagnostics:

- retained source builder: 121 evidence restaurants / 191 featured items; translation pending remained 2;
- retained Hot Pepper promotional builder: 172 evidence restaurants, including 18 recommendation restaurants / 20 recommendation items and 154 featured restaurants / 186 featured items;
- current official-site collector: 334 tasks across 242 hosts, 475 pages visited, 47 recommendation restaurants / 75 recommendation items, 114 featured-only restaurants / 225 featured items;
- bounded sitemap collector: 18 evidence restaurants, 2 recommendation restaurants / 4 recommendation items, 16 featured restaurants / 62 featured items;
- after all monotonic merges, before specificity correction: recommendation evidence restaurants 567, featured evidence restaurants 666, evidence restaurants 732, recommendation items 1,000, featured items 2,666;
- specificity correction: 5 restaurants / 5 items corrected, 3 duplicate items removed; recommendation items remained 1,000 and featured items became 2,663.

These are diagnostic pre-publication evidence counts, not final runtime coverage. The run failed before public rebuild and database validation, so they must not be presented as published data.

## Next action

After this audit fix passes PR Review and is merged, rerun the controlled source-backed collection from current `main`. Final runtime/queue deltas must come only from the successful rerun.
