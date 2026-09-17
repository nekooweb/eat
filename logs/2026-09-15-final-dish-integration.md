# Final dish integration — 2026-09-15

## Objective

This branch is the final production-integration stage for the 2026-09-14/15 dish-completion effort.

Starting point: `agent-e2e-dish-s7-20260914` after S7 completed its full E2E lifecycle. The final branch is `final-dish-integration-20260915`.

## Verified starting state

- Frozen catalog: 2,804 Place IDs.
- Public named runtime baseline: 1,422 restaurants.
- Original dish-work denominator: 892 rows.
- Official + Retained current denominator: 537 rows (Official 219 + Retained 318).
- Discovery + F-source denominator: 355 rows.
- S0–S7 Discovery/F-source review coverage: 355/355; all eight shards completed research, second-pass review, explicit approval, shard-local canonical integration, maintained rebuild, audit, replay/idempotence validation and documentation.
- S0–S7 validated canonical emissions before global union: 36 R evidence items + 33 F evidence items. Accepted source-native translation-pending evidence remains excluded from guessed canonical Chinese emission.
- Paid Google Data API calls: 0.

## Finalization boundary

PR #67 is not treated as approved merely because structural coverage is 537/537. Its current head still has a pending central-review manifest and incomplete reviewed-file materialization. Final integration therefore remains fail-closed:

1. import all durable S0–S7 reviewed/approval artifacts;
2. finalize Official/Retained reviewed artifacts conservatively, preferring existing explicit reviews and reconciling duplicate submissions by frozen Place ID;
3. retain any accepted source-native item without deterministic Chinese normalization as translation-pending rather than guessing;
4. create explicit digest approvals only after full terminal coverage and semantic gates pass;
5. union all approved evidence through the maintained merge → specificity → evidence audit → public rebuild → integration audit path;
6. perform a second logical replay and require zero new logical R/F evidence, zero runtime-count delta and zero evidence-key delta;
7. run SQLite rebuild/validators and zero-paid-API audit;
8. record measured final production metrics before any merge to `main`.

## Status

Final integration started. No change has been made to `main`; production merge is blocked until the global validation run is green.

## Final validated result

- Terminal review coverage: **892/892**.
- Official/Retained: **537/537** final reviewed rows.
- Discovery/F-source: **355/355** reviewed rows; S0–S7 canonical delta verified at **36 R + 33 F**.
- Official/Retained emitted canonical evidence: **0 R + 71 F**.
- Official/Retained translation-pending source-native items: **120**.
- Final runtime: recommended **619**, featured **707**, display **774**, recommendation gap **803**.
- Final evidence items: R **1036**, F **2722**.
- Relative to original production baseline: recommended **+24**, featured **+32**, display **+34**, recommendation gap **-24**.
- Full disposable SQLite rebuild and maintained validators: **pass**.
- Logical replay: **0 new R, 0 new F, zero count delta**.
- Paid Google Data API calls: **0**.

The final integration remains on `final-dish-integration-20260915` until its production PR is reviewed/merged; `main` was not directly edited by this workflow.

## Final validated result

- Terminal review coverage: **892/892**.
- Official/Retained: **537/537** final reviewed rows.
- Discovery/F-source: **355/355** reviewed rows; S0–S7 canonical delta verified at **36 R + 33 F**.
- Official/Retained emitted canonical evidence: **0 R + 69 F**.
- Official/Retained translation-pending source-native items: **74**.
- Final runtime: recommended **619**, featured **707**, display **774**, recommendation gap **803**.
- Final evidence items: R **1036**, F **2724**.
- Relative to original production baseline: recommended **+24**, featured **+32**, display **+34**, recommendation gap **-24**.
- Full disposable SQLite rebuild and maintained validators: **pass**.
- Logical replay: **0 new R, 0 new F, zero count delta**.
- Paid Google Data API calls: **0**.

The final integration remains on `final-dish-integration-20260915` until its production PR is reviewed/merged; `main` was not directly edited by this workflow.
