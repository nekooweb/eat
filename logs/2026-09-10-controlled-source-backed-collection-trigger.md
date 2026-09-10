# 2026-09-10 — Controlled source-backed collection trigger

## Why this exists

The maintained full source-backed collection workflow remains `workflow_dispatch` only. The current GitHub connector can edit and merge repository content but does not expose a direct workflow-dispatch action.

To execute the user-requested data continuation without turning network maintenance back on for ordinary pushes, this change adds a deliberately narrow bridge workflow.

## Trigger contract

`.github/workflows/trigger-source-backed-collection.yml` runs only when the dedicated root marker changes on `main`:

`.source-backed-dish-collection-run`

The bridge does not collect data itself. It uses the repository-scoped GitHub Actions token with `actions: write` and dispatches the existing `collect-google-inventory-details.yml` workflow at `main`.

Ordinary source-code, documentation, UI, and data commits do not match the marker path and therefore do not trigger network collection.

The existing collector remains the source of truth for:

- already-bound source eligibility;
- strict recommendation / featured semantics;
- bounded site/menu traversal;
- public-suffix-protected root/subdomain menu discovery;
- retained-source mining;
- full-retention evidence merging;
- public runtime and queue regeneration;
- zero-paid-Google-data-API audit;
- post-collection SQLite database contract validation.

## Baseline recorded in the marker

Before this controlled run:

- recommended restaurants: 592;
- featured restaurants: 656;
- any zh-CN dish display: 727;
- recommendation gap: 830;
- official-crawl recommendation lane: 222;
- retained-source-mining lane: 318;
- independent-source-discovery lane: 290.

These are pre-run checkpoints, not promised deltas. The final result must be taken from the completed collection workflow and its committed rebuilt queue/runtime.

## Operational boundary

This preserves the repository's no-automatic-maintenance principle: the network workflow is still opt-in. Changing the explicit marker is the opt-in action; normal pushes cannot invoke it.
