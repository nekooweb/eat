# 2026-09-18 — Classification bound-source assignment materialization

## Purpose

The 100-row `CLASSIFICATION-ENTITY-BOUND` plan is now materialized as a review artifact rather than reconstructed manually.

The materializer writes only to `_audit/classification-bound/`:

- `plan.json`: full maintained bound-source plan;
- `manifest.json`: shard counts and plan summary;
- `S0.json` ... `S7.json`: deterministic review assignments.

No canonical data or public runtime file is written.

## Policy

Assignments inherit the maintained PR #86 policy:

- frozen identity key = `googlePlaceId`;
- only already-bound non-Google URLs;
- no new-source discovery;
- no restaurant-name or menu-dish inference for accepted classification;
- worker writes proposal evidence only;
- paid Google Data API calls = 0.

## Validation

The regression requires:

- exactly 100 current rows;
- all 100 review-ready;
- eight deterministic shards;
- unique Place IDs across the union;
- non-Google explicit URLs for every row;
- stable SHA-256 source fingerprints;
- byte-equivalent logical plan for identical maintained inputs.

## CI artifact

Pages review builds generate the assignment set after the maintained public rebuild and include it in the existing private `eat-data-audit` artifact. This makes the exact reviewed denominator recoverable for downstream shard review without committing volatile assignment snapshots into canonical data.
