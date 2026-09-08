# 2026-09-08 post-reset controlled one-cycle execution

## Purpose

After the data-loading repair was reviewed and merged, execute one complete controlled cycle without restoring sustained automatic collection and without using paid Google data APIs.

## Merge and reset validation

- PR #32 was squash-merged into `main` as `856873628588cc3fe2c549c1344f5bb59bbaf66c`.
- A path-limited one-shot trigger launched `Reset and validate data loading` run `34217939138`.
- The temporary trigger was immediately removed and `reset-data-loading.yml` was restored to `workflow_dispatch` only.
- The reset job completed successfully, including source-input backup, full offline reset + repeat import, 11/11 regressions, and rebuilt-output preservation.
- Reset artifacts:
  - `data-loading-input-backup-34217939138` (artifact 10052552812)
  - `data-loading-reset-result-34217939138` (artifact 10052562309)
- Reset manifest retained the 2,804 Place-ID catalog, produced 1,422 public runtime rows and 1,382 unpublished Place-ID-only rows, and confirmed `externalCollectionExecuted=false`.
- Paid-data-API audit passed with 0 hits; map mode remains Leaflet/OpenStreetMap and Google Maps is external-navigation-only.

## Dish-first work plan after reset

The rebuilt planner remained dish-first and created no active completion tasks for ordinary non-dish metadata.

- public runtime: 1,422
- recommended known: 254
- featured known: 424
- display-dish known: 486
- no-dish gap: 936
- recommendation gap: 1,168
- recommendation work lanes:
  - 270 `collect_strict_recommended_dishes`
  - 597 `extract_retained_dish_source`
  - 301 `find_independent_dish_source`
  - 62 `collect_source_backed_featured_dishes`
- deterministic dish work rows: 1,230 across 8 shards

## One real source-backed collection cycle

Because the normal collection workflow is intentionally manual-only, a temporary one-shot dispatcher was added only to dispatch the existing `collect-google-inventory-details.yml` workflow once. It was removed immediately after dispatch, together with its sentinel.

Target workflow:

- `Collect source-backed recommended dishes`
- run: `34218062837`
- result: collection job **success**
- reusable SQLite database contract job **success**
- data commit: `c5b335995e3f7ef6b66cce1c7afa12c0cffffe23` (`Update source-backed recommended dish evidence`)

Successful stages included:

1. no-paid-data-API audit;
2. reviewed official source overlay export;
3. current runtime / dish queue build;
4. retained official + third-party dish mining;
5. retained Hot Pepper promotional dish mining;
6. bounded current official-site / retained Hot Pepper evidence collection;
7. bounded official sitemap menu collection;
8. monotonic evidence merge and source-native specificity correction;
9. runtime / queue / deterministic batch-plan rebuild;
10. writeback to `main`;
11. persistent SQLite master / idempotence / backup-restore / shadow-export contract validation.

Direct live Tabelog crawling was deliberately not re-enabled because repository documentation records GitHub-hosted runners as unsuitable for that route. Retained Tabelog evidence remains usable through the retained-source path.

## Measured change from this cycle

Public runtime remained stable at 1,422; the frozen catalog remained 2,804.

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| recommendedDishesKnown | 254 | 259 | +5 |
| featuredDishesKnown | 424 | 430 | +6 |
| displayDishKnown | 486 | 492 | +6 |
| noDishGap | 936 | 930 | -6 |
| recommendationGap | 1,168 | 1,163 | -5 |
| crawlable-official recommendation gap | 270 | 265 | -5 |
| retained-third-party recommendation gap | 597 | 597 | 0 |
| independent-source recommendation gap | 301 | 301 | 0 |

Evidence summary changed from 229 to 234 recommendation restaurants and from 414 to 420 featured restaurants. Recommendation evidence items increased from 438 to 450; featured items increased from 1,009 to 1,029 before specificity correction (1,026 after correction).

Examples of newly source-backed evidence include `飯田橋 あらた`, where the official menu provided explicit recommendation evidence for udon, sashimi and karaage, plus featured menu evidence such as oden, tempura and sukiyaki.

## Final operational state

- PR #32 repair is on `main`.
- Reset remains `workflow_dispatch` only.
- Source-backed recommended-dish collection remains `workflow_dispatch` only.
- Temporary trigger workflow and sentinel files were deleted.
- No sustained automatic collection loop was restored.
- Paid Google data API usage remains prohibited.
- Current next priority remains: 265 crawlable official recommendation gaps, 597 retained-source mining gaps, then 301 independent-source discovery gaps; recommendation semantics must not be weakened to fill coverage.
