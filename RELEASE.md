# Eat Production Release — 2026-09-17

## Release status

**Production released.** The reviewed dish-evidence integration is merged into `main`, and the corresponding GitHub Pages deployment for commit `c105b360f31ac7d521ebd78628e40da61827f42a` completed successfully in run `35201154882`.

This document is the current release checkpoint. Older dated development sections remain useful as historical progress records, but their pre-merge warnings no longer describe production state after this release.

## Included product behavior

### Random media feedback

The generate button keeps the existing restaurant-selection behavior and additionally provides presentation-only feedback:

- random voice selection from the configured `voice/` pool;
- 45% playback volume;
- maximum playback duration of 2 seconds;
- random mascot selection from the configured WebP pool;
- random placement around/above the generate button;
- immediate mascot and placement repetition are avoided;
- media playback/rendering failure does not block restaurant generation.

The repository audit verifies that every committed MP3/WebP intended for this effect is represented by the runtime configuration and copied into the Pages artifact.

## Included data release

The full 892-row dish-work program reached terminal review coverage:

- Official / Retained reviewed: 537 / 537;
- Discovery / F-source reviewed: 355 / 355;
- total terminal coverage: 892 / 892;
- paid Google Data API calls: 0.

Final public runtime:

| Metric | Production release |
| --- | ---: |
| Frozen catalog IDs | 2,804 |
| Public named restaurants | 1,422 |
| Restaurants with strict recommended dish (R) | 619 |
| Restaurants with featured/menu dish (F) | 707 |
| Restaurants with any display dish | 774 |
| Recommendation gap | 803 |
| R evidence items | 1,036 |
| F evidence items | 2,724 |

Change from the pre-integration production baseline:

| Metric | Delta |
| --- | ---: |
| R restaurant coverage | +24 |
| F restaurant coverage | +32 |
| Any-display coverage | +34 |
| Recommendation gap | -24 |
| R evidence items | +36 |
| F evidence items | +61 |

The final logical replay is idempotent: all public count deltas and new R/F evidence deltas are zero on the second replay. Frozen identity IDs and public identity names are preserved, old evidence keys remain retained, and all production additions pass the reviewed-evidence checks.

Authoritative metrics: `data/final_dish_integration_metrics.json`.

## Validation / deployment

The release chain includes reviewed-evidence approval, canonical evidence union, maintained merge, specificity correction, evidence audit, public rebuild, integration audit, disposable SQLite rebuild/validators, and logical replay.

The production `main` deployment at the integration commit passed GitHub Pages. The no-paid-data-API policy workflow for the same commit also passed.

## Remaining development boundaries

The following are intentionally **not** represented as completed by this release:

1. SQLite shadow export has not yet become the web application's single public data source.
2. Identity long-tail gaps remain a separate evidence-acquisition problem.
3. Remaining recommendation gaps require new evidence rather than synthetic inference.
4. Translation-pending evidence remains to be resolved where deterministic normalization is not justified.
5. Historical development checkpoints in `DEVELOPMENT.md` should be read as dated records; this file is the current production checkpoint.

## Release maintenance rule

Future production changes should update this checkpoint (or create a newer dated release checkpoint), preserve the evidence-first / fail-closed rules, run the normal Pages and policy gates, and only describe a data change as released after it is merged to `main` and the production deployment succeeds.
