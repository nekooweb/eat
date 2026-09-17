# 2026-09-14 Parallel Agent Data Completion Log

Checkpoint: 2026-09-14 19:24 JST  
Repository: `nekooweb/eat`  
Central branch: `agent-data-library-2026-09-14` (PR #65)  
Separate retained proposal: PR #66 (`agent-retained-s0-2026-09-14`)

## Purpose

This phase splits the current source-backed dish completion queue into deterministic marker/shard assignments that multiple agents can review independently. Agents return evidence/proposals only; they do not directly write canonical runtime data or the SQLite master.

The assignment snapshot is based on the current 2026-09-14 dish plan:

- frozen catalog: 2,804 Place IDs
- public named runtime: 1,422
- unpublished Place-ID-only: 1,382
- recommended dishes known: 595
- featured dishes known: 675
- any display dish known: 740
- recommendation gap: 827
- executable dish work: 892 rows

The 892 rows are mutually exclusive by lane:

| Marker | Rows | Shards |
| --- | ---: | --- |
| `DISH-R-OFFICIAL` | 220 | S0-S7 |
| `DISH-R-RETAINED` | 318 | S0-S7 |
| `DISH-R-DISCOVERY` | 289 | S0-S7 |
| `DISH-F-SOURCE` | 65 | S0-S7 |

## Execution model

1. Select only rows matching the assigned marker/lane and deterministic shard.
2. Re-read each current row before work; skip rows already complete in the current repository state.
3. Preserve frozen Place ID as the identity key. Source aliases may support matching but cannot replace the catalog identity.
4. Verify the exact restaurant/branch before extracting dish evidence. Proximity, same building, postcode or cuisine alone are not identity evidence.
5. Keep provider, exact URL, checked date, source-native dish label/text, evidence class and identity evidence.
6. Classify conservatively:
   - `R`: concrete dish + explicit recommendation/signature/popular/specialty semantics;
   - `F`: concrete source-backed ordinary menu item;
   - `C`: candidate/inference/identity or branch availability not fully proven.
7. If unresolved, return candidate, blocked or no_evidence; do not manufacture completeness.
8. Write proposal/evidence only under `data/agent_proposals/**`.
9. Central review owns duplicate handling, semantic reconciliation and canonical merge.
10. Canonical changes require normal merge/rebuild/audit after central review.

Safety/policy boundaries remain unchanged: paid Google Data API calls = 0; no API-key/billing-dependent collection; no login/CAPTCHA/access-limit bypass; no direct production/SQLite hand edits by workers.

## Progress checkpoint

Progress counts unique assignment rows with a submitted proposal. Multiple files or independent reviews of the same row are counted once.

| Lane | Submitted rows | Total | Completion | Remaining |
| --- | ---: | ---: | ---: | ---: |
| Official | 138 | 220 | 62.7% | 82 |
| Retained | 172 | 318 | 54.1% | 146 |
| Discovery | 36 | 289 | 12.5% | 253 |
| F-source | 0 | 65 | 0.0% | 65 |
| **Total** | **346** | **892** | **38.8%** | **546** |

Central branch currently contains 300/892 submitted rows (33.6%). Retained S0 contributes another 46 rows in PR #66 and therefore counts toward the global 346, but is not yet part of the central branch.

## Completed proposal shards

### `DISH-R-OFFICIAL`

| Shard | Rows | Accepted evidence | Candidate | No evidence | Blocked | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| S1 | 27 | 12 | 3 | 5 | 7 | Complete. |
| S2 | 29 | 5 | 6 | 11 | 7 | Complete. |
| S3 | 21 | 9 | 6 | 4 | 2 | Primary submission. |
| S3 independent | same 21 | 8 | 5 | 5 | 3 | Independent second review; does **not** add 21 more progress rows. |
| S4 | 32 | 8 | 5 | 11 | 8 | Complete. |
| S7 | 29 | 6 | 5 | 12 | 6 | Complete. |

S3 has two complete independent reviews with small classification differences. Central reconciliation must compare all 21 Place IDs and preserve disagreements for manual/semantic review; neither file may be treated as automatically authoritative solely because it was submitted first or has more accepted rows.

Remaining Official shards: S0 (28), S5 (33), S6 (21) = 82 rows.

### `DISH-R-RETAINED`

| Shard | Rows | Accepted evidence | Candidate | No evidence | Blocked | Location |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| S0 | 46 | 12 | 5 | 29 | 0 | PR #66, separate branch |
| S1 | 37 | 1 | 0 | 35 | 1 | central branch |
| S2 | 47 | 13 | 1 | 32 | 1 | central branch |
| S4 | 42 | 7 | 0 | 35 | 0 | central branch |

Remaining Retained shards: S3 (39), S5 (33), S6 (31), S7 (43) = 146 rows.

S1 illustrates why this lane must remain conservative: most retained provider bindings do not contain a recoverable concrete dish claim. A valid retained provider link is not itself sufficient evidence for a dish, and cross-branch provider mismatches remain blocked.

### `DISH-R-DISCOVERY`

| Shard | Rows | Accepted evidence | Candidate | No evidence | Blocked |
| --- | ---: | ---: | ---: | ---: | ---: |
| S7 | 36 | 9 | 3 | 15 | 9 |

Remaining Discovery shards: S0-S6 = 253 rows.

### `DISH-F-SOURCE`

No shard has submitted a proposal at this checkpoint. Remaining: 65 rows.

## Central review rules

A submitted proposal is not canonical truth. Before ingestion, central review must:

- verify the Place ID still belongs to the current queue/lane/shard;
- reject any result that uses a source alias as a replacement identity;
- confirm exact branch identity/availability, especially for brand-level recommendations;
- keep ordinary menu items as F unless the same source explicitly supports R semantics;
- prevent course-level/general recommendation wording from being propagated to individual component dishes;
- compare duplicate Place IDs and duplicate sources across proposal files;
- reconcile independent duplicate submissions such as Official S3;
- preserve no_evidence and blocked results instead of forcing coverage;
- re-check provider/source URL/checked date/evidence text before canonical merge;
- run existing evidence audits, public-only rebuild and regression gates after merge.

## Status semantics

Use the following status ladder when reporting progress:

`unassigned/working -> proposal submitted -> central reviewed -> canonical merged/rebuilt`

Only the final stage changes production/runtime coverage. The 346/892 number in this log means proposal submitted, not 346 canonical rows already changed.

## CI / PR state at checkpoint

Before documentation commits, PR #65 head `d1b73be15123f8b22215a70c35d688cb8ed83bf1` had successful `PR Review` and `Deploy GitHub Pages` checks. CI success shows that adding proposal files did not violate the current repository regression/build contract; it is not a semantic approval of every proposed dish.

PR #66 contains Retained S0 and is behind the moving central branch. Its proposal remains valid as an independent submission, but it must be rebased/merged against the latest central state before final central integration so that new central submissions are not discarded.

## Documentation changes from this checkpoint

- `DEVELOPMENT.md`: added current proposal counts, execution architecture, status semantics and remaining shards.
- `RECOMMENDED_DISH_PIPELINE.md`: added proposal-only stage, worker rules, central review gates and current 892-row assignment snapshot.
- this log: records the exact 19:24 JST progress checkpoint and per-shard submitted results.

## Next work

Priority order:

1. keep collecting unsubmitted Official S0/S5/S6 because Official is closest to lane completion;
2. complete remaining Retained S3/S5/S6/S7 while preserving retained-only scope;
3. continue Discovery S0-S6 with strict exact-branch evidence requirements;
4. start F-source shards without promoting ordinary menu items into R;
5. run a central reconciliation pass across all submitted proposal files before canonical ingestion, beginning with duplicate Official S3 and the separate Retained S0 PR;
6. only after central review, convert accepted proposals into the existing canonical evidence format and rebuild/audit the runtime/queues.
