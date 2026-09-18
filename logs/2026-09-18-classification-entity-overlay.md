# 2026-09-18 — Classification accepted entity overlay

## Scope

This slice implements the next post-PR86 code step before any new bound-source web review:

`central-reviewed classification artifact -> fail-closed materializer -> Place-ID keyed public overlay -> classification runtime`.

It deliberately starts with an empty reviewed artifact, so deploying the infrastructure changes **zero restaurant classifications** until central-reviewed `accepted_evidence` records are added.

## Contract

- identity key: frozen `googlePlaceId`;
- raw `cuisine` / `tags` are never mutated;
- only records with `status = accepted_evidence` enter the overlay;
- accepted rows require verified branch identity, SHA-256 source fingerprint, ISO review date, at least one existing classification concept, and exact-branch non-Google category evidence;
- `candidate`, `no_evidence`, and `blocked` remain review history only and never materialize;
- every accepted concept must be backed by at least one category-evidence item;
- unknown concept IDs, Google/navigation URLs, missing source-native text, invalid dates, duplicate Place IDs, or non-verified accepted identity fail closed.

## Public runtime behavior

`classification.js` now combines:

`exact cuisine/tags taxonomy IDs + accepted entity-overlay IDs`

before applying same-dimension ancestors. The result preserves separate `taxonomyDirectIds` and `entityDirectIds` for auditability while keeping `directIds` / `effectiveIds` backward compatible.

The initial committed overlay is empty, therefore the expected production classification counts are unchanged from the PR86 baseline: 1,261 accepted / 161 unknown.

## Validation

Added a blocking regression for:

- zero-impact initial overlay;
- accepted-only materialization;
- candidate exclusion;
- verified exact-branch identity;
- non-Google evidence URLs;
- existing taxonomy concept IDs;
- stale generated-overlay detection.

Pages and PR Review now regenerate/check the overlay and ship it before `classification.js`.

## Next execution step

With the contract deployed, the next work remains the 100-row `CLASSIFICATION-ENTITY-BOUND` review. Workers may propose evidence from assigned bound sources, but canonical/public classification changes only after central review updates `data/classification_entity_reviewed.json` and the materializer passes.
