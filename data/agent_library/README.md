# Parallel data-completion agent library

Snapshot date: 2026-09-14  
Snapshot commit: `820b11aa5384d5aa548463b9f730df68d94000b0`

This directory is the assignment/index layer for parallel data-completion agents. It does **not** duplicate the canonical queues. Agents select work from the existing source-of-truth files by marker and shard, collect proposal/evidence, and leave canonical merge/resolution to the central pipeline.

## Current scope

The frozen catalog contains 2,804 Place IDs. The current public named runtime contains 1,422 restaurants and 1,382 unpublished Place-ID-only records.

Current public dish state from `data/google_inventory_detail_queue.json` / `data/dish_batch_plan.json`:

- recommended dishes known: 595 restaurants
- featured dishes known: 675 restaurants
- any display dish known: 740 restaurants
- no display dish: 682 restaurants
- recommendation gap: 827 restaurants
- executable dish work rows: 892
- dish-complete rows in the public queue: 530

The 892 dish rows are mutually exclusive by lane:

| Marker | Lane / selector | Rows | Purpose |
| --- | --- | ---: | --- |
| `DISH-R-OFFICIAL` | `official_crawl` / `collect_strict_recommended_dishes` | 220 | Find strict recommendation/signature semantics on already-known official sources. |
| `DISH-R-RETAINED` | `retained_source_mining` / `extract_retained_dish_source` | 318 | Mine already-retained third-party/source evidence; do not perform evasive recrawls. |
| `DISH-R-DISCOVERY` | `independent_source_discovery` / `find_independent_dish_source` | 289 | Find a free independent menu/official/PDF source for records lacking a usable dish source. |
| `DISH-F-SOURCE` | `official_or_retained_featured` / `collect_source_backed_featured_dishes` | 65 | Add source-backed ordinary menu items as featured dishes without upgrading them to recommendations. |

`data/dish_batch_plan.json` already assigns every dish work row to deterministic shard `0..7`. Use marker syntax `MARKER:S0` through `MARKER:S7`. Example: `DISH-R-OFFICIAL:S3` means only rows where `lane == "official_crawl" && shard == 3`.

Current shard counts:

| shard | R-official | R-retained | R-discovery | F-source | total |
| ---: | ---: | ---: | ---: | ---: | ---: |
| S0 | 28 | 46 | 41 | 5 | 120 |
| S1 | 27 | 37 | 39 | 13 | 116 |
| S2 | 29 | 47 | 41 | 8 | 125 |
| S3 | 21 | 39 | 40 | 9 | 109 |
| S4 | 32 | 42 | 36 | 7 | 117 |
| S5 | 33 | 33 | 27 | 7 | 100 |
| S6 | 21 | 31 | 29 | 6 | 87 |
| S7 | 29 | 43 | 36 | 10 | 118 |

## Identity work is a separate metric

Do not add public dish rows to SQLite task counts. The latest documented SQLite baseline has:

- `ID-RECOVERY`: 1,381 active `identity_recovery` tasks, routed by `scripts/database/build_agent_workplan.py` as `identity-public-recovery`.
- `ID-CONFLICT`: 20 active `identity_conflict_review` tasks. The same baseline reports 15 catalog identities in conflict; task count and entity count are different metrics.

Identity work is generated from the current SQLite master. Before assigning it, rebuild/generate the workplan and use the generated shard IDs rather than freezing the 2026-09-10 counts. The default planner creates 8 identity-recovery shards and keeps each shard at 250 tasks or fewer.

Suggested assignment markers are `ID-RECOVERY:<generated-shard-id>` and `ID-CONFLICT:<generated-shard-id>`.

## Translation hold queue

`HOLD-TRANSLATION` is **not** normal fill work. Two source-backed items are intentionally pending:

- `えびず焼き`
- `ソルベージュ®エスプレッソ`

Do not force a Chinese canonical name from restaurant/brand knowledge or transliteration. Re-open these only after the canonical product-name policy is explicitly settled or a stronger source provides a stable canonical label/composition.

## Global agent contract

Every agent must obey all of the following:

1. Work only the assigned marker + shard. Re-read the current queue before starting and skip rows that are already complete.
2. Frozen Place ID is the catalog identity key. Source aliases may support identity matching but must not replace the catalog/tool identity name.
3. Workers collect **proposal/evidence only**. Do not hand-edit `data/production_area1.js`, generated runtime files, or the SQLite master.
4. Paid Google data API calls: **0**. Do not add API keys, billing-dependent collection, login/captcha bypass, or access-limit evasion.
5. Proximity, same building, postcode, or cuisine alone never proves restaurant identity.
6. Preserve provider, exact source URL, checked date, source-native dish label/text, evidence class, and identity evidence needed to reproduce the decision.
7. `R` requires both a concrete dish and explicit recommendation/signature/popular/specialty semantics from the source. A normal menu item is `F`, not `R`. Guesses/templates remain candidate-only.
8. If identity or semantics are ambiguous, return `candidate`, `blocked`, or `no_evidence`; do not manufacture completeness.
9. One confirmed source visit may extract all supported factual fields, but the agent must not broaden its task into unrelated restaurants or another shard.
10. Use `proposal-template.json` for handoff. A central reviewer/merge step owns canonical truth.

## Marker-specific instructions

### `DISH-R-OFFICIAL:Sx`

Filter `data/dish_batch_plan.json` to `lane == "official_crawl"` and the assigned shard. Start from already-reviewed official URLs/current official domain family. Capture concrete source-native dish names plus the exact phrase/context that makes them recommended/signature/popular/specialty. Ordinary menu items discovered on the same page may be proposed as `F`, but must not be promoted to `R`. If the official source has no qualifying recommendation semantics, report `no_evidence` instead of guessing.

### `DISH-R-RETAINED:Sx`

Filter to `lane == "retained_source_mining"`. Prefer already-retained evidence and bound source material in the repository. This lane exists specifically to extract facts already held by the project; do not turn it into broad recrawling. Respect Tabelog/source access restrictions and do not retry by circumvention. Preserve source-native text and exact retained provenance. Only explicit recommendation semantics becomes `R`; ordinary retained menu facts become `F`.

### `DISH-R-DISCOVERY:Sx`

Filter to `lane == "independent_source_discovery"`. Find a free, independently verifiable source that is tied to the exact branch/restaurant: official page/menu/PDF, stable menu page, or other permitted source with reproducible evidence. Verify identity before extracting dishes. Do not use review prose as if it were a menu, and do not treat Google-derived historical display content as durable independent evidence. If no acceptable source can be found, return `no_evidence`/`blocked` with the searches tried.

### `DISH-F-SOURCE:Sx`

Filter to `lane == "official_or_retained_featured"`. The goal is source-backed ordinary menu coverage, not recommendation inflation. Extract concrete current menu items from an official or retained permitted source and classify them `F`. Only upgrade an item to `R` when the same evidence independently satisfies the strict recommendation rule.

### `ID-RECOVERY:<generated-shard-id>`

Use the latest generated `identity-public-recovery` shard from `scripts/database/build_agent_workplan.py`. Compare current catalog identity with independent source evidence (aliases, exact branch address, phone/site ownership when available). Never bind solely from distance/proximity. Preserve aliases as evidence; do not overwrite the runtime/catalog identity name with an official-site/source alias. Unresolved records stay candidate/id-only.

### `ID-CONFLICT:<generated-shard-id>`

Use the latest generated `identity-conflict-review` shard. Resolve competing bindings only when evidence decisively identifies the same branch/entity. Compare aliases, address, branch-specific contact/site ownership and other independent evidence together. If the conflict remains genuine, keep it as conflict/review-required rather than choosing the closest candidate.

### `HOLD-TRANSLATION`

No routine agent assignment. The two current rows already have valid source-backed dish evidence; only Chinese canonicalization is pending. Do not reduce dish-evidence counts or force a translation to make the queue look complete.

## Proposal handoff

Each agent returns one proposal JSON based on `proposal-template.json`. Recommended path when committing proposals is:

`data/agent_proposals/<marker>/<shard-or-batch>.json`

Do not have multiple agents edit the same proposal file. Central merge should validate current queue membership again, deduplicate evidence, run the relevant dish/identity regressions, regenerate public artifacts through the normal pipeline, and only then update canonical outputs.

## Engineering blockers are separate

The current data pipeline still has P0/P1 engineering work (missing-name stringification, remaining fixed public-count checks, publish-handoff consistency, field/source ownership, seasonal-menu lifecycle). Do not assign those as data rows. They should be handled by engineering agents before large automatic merges are treated as durable.
