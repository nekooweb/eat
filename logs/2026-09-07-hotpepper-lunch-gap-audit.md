# 2026-09-07 — Hot Pepper lunch-budget gap audit

## Purpose

The latest deterministic agent workplan contains 409 `field-hotpepper` tasks, all missing lunch budget; 395 of those tasks are lunch-only. Before adding any new network collector, this audit checks whether retained Hot Pepper data already contains strict finite lunch-range evidence that the current resolvers accidentally failed to consume.

This is a read-only, zero-network diagnostic. It never modifies SQLite, identity state or field resolutions and does not change the existing strict budget acceptance rule.

Implementation:

- `scripts/database/audit_hotpepper_lunch_gaps.py`
- `.github/workflows/hotpepper-lunch-gap-audit.yml`

Workflow run: `34126682698` — success.

## Strict eligibility remains unchanged

A canonical lunch range is eligible only when the retained evidence supplies a finite numeric range and an explicit lunch semantic. Existing Hot Pepper source-fact evidence additionally requires the retained `lunchBudget` claim and `explicit_range` evidence class. A single average, an open-ended amount or an unstructured numeric phrase is not converted into a fabricated range.

## Result

Current master context:

- unresolved lunch places overall: 1,232
- unique reviewed base Hot Pepper IDs: 473
- reviewed-Hot-Pepper places whose lunch range is still unresolved: 432

Audit classification for those 432 reviewed Hot Pepper targets:

- resolver gaps with already-strict eligible evidence: **0**
- no retained lunch-budget evidence: **409**
- retained but non-strict lunch evidence: **23**

The 23 non-strict rich-average cases consist of:

- single lunch value: 14
- numeric but unstructured lunch text: 7
- open-ended/single-lower-bound text: 2

Retained source-fact overlays contributed no unresolved finite explicit lunch range: the observed source-fact rows in this gap set contained no lunch value eligible under the existing rule.

Representative `field-hotpepper` lunch-only item `Bar野澤` (`J004634207`) has no retained lunch-budget evidence in the audited layers.

## Interpretation

There is no safe deterministic resolver fix that will collapse the 395 lunch-only Hot Pepper tasks. The missing lunch values are primarily a source-coverage problem, not a resolver bug.

Do not convert the 23 non-strict values into `[x, x]` ranges or invent an upper/lower bound. If a future UI wants to display a single published average separately, that should be modeled as a different field with its own semantics rather than weakening `budget.lunch.range`.

The next budget-completion stage therefore needs new independent, explicit meal-budget evidence or a deliberate schema extension for single-value budget references; it should not loosen the current finite-range resolver.
