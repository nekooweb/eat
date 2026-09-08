# 2026-09-08 — Overture independent dish-source recovery

## Objective

Continue source-backed dish completion after retained-source and already-bound official URL discovery reached diminishing returns.

This batch targets the **301** public restaurants whose recommendation queue action was:

`find_independent_dish_source`

At baseline, the existing retained `official_candidate_index.json` produced **0** proposal rows for these targets.

## Constraints kept unchanged

- frozen Google Place-ID catalog: **2,804**;
- public named runtime: **1,415**;
- no paid Google data API calls;
- Google display payload not used for this source discovery;
- no cuisine/name/brand dish inference;
- no generic dish fallback;
- proximity-only source binding forbidden;
- proposal generation cannot change identity;
- proposed websites cannot create dish evidence before review;
- R/F semantics remain unchanged downstream.

## Proposal generator expansion

Updated:

`scripts/build_independent_dish_source_candidate_plan.mjs`

Implementation commit:

`8d9f23c722ee06b3ad2a8a2368e6f6cef90d1630` — `Expand independent dish source candidates with Overture`

The generator now consumes the retained Area1 Overture snapshot in addition to the existing official candidate index.

Candidate filtering uses:

- independent website URL required;
- normalized restaurant-name similarity;
- current independent runtime coordinates;
- maximum 120 m Overture candidate distance;
- minimum strong name/distance combinations;
- winner-margin ambiguity control;
- one Overture native ID cannot be proposed to multiple frozen Place IDs;
- social/aggregator/Google/OpenStreetMap URLs excluded.

## First proposal result

Workflow:

`Build independent dish source candidate plan`

Run:

`34187915362` — **success**

Generated plan commit:

`e46358b` — `Update independent dish source candidate plan`

Metrics:

- current source-less recommendation targets: **301**;
- Overture snapshot rows: **3,908**;
- Overture rows carrying independent websites: **2,516**;
- targets with nearby Overture candidates: **301 / 301**;
- proposal rows accepted for review: **36**;
- high-confidence proposal rows: **24**;
- proposal coverage of source-less gap: **12.0%**;
- name-incompatible candidates rejected: **252**;
- weak candidates rejected: **13**;
- ambiguous winner rejected: **0**;
- retained official-candidate-index proposals: **0**.

The large reject count is intentional: Overture proximity alone is not enough.

## Strict live source-review layer

Added:

`scripts/review_independent_dish_source_candidates.mjs`

Commit:

`f81938779ccd7bfe5a3e8682256e7b979b9f0262` — `Add strict review for independent dish source candidates`

Added workflow:

`.github/workflows/review-independent-dish-sources.yml`

Commit:

`d18ec89d1144c0d3fe123eecb74785fb571bb337` — `Automate strict independent dish source review`

The reviewer only processes the **24 high-confidence** Overture proposal rows.

A site is not accepted merely because its domain matches a brand. It requires strong page-native name evidence and, for a generic/root page, independent location confirmation through structured geo/address or visible address agreement.

This specifically prevents cases such as a generic chain homepage from becoming branch-level dish evidence without branch confirmation.

The review output is source-only. It is forbidden from mutating name, coordinates, identity or dishes.

## Status

Strict live review has been launched. Its validated approved/rejected totals and any downstream runtime/evidence changes will be appended after the workflow completes.
