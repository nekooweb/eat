# Strict recommendation source provenance — 2026-09-09

## Bug

`data/recommended_dishes.js` stores strict recommendation evidence as Place ID + 1–2 dishes + HTTPS `sourceUrl` + `checkedAt`, but `scripts/build_source_provenance.mjs` previously loaded only `source_enrichment_*.js`. A recommendation could therefore appear in the public runtime while its reviewed source URL was absent from the public `sourceLinks`/`sourceClaimedFields` overlay.

## Fix

The provenance builder now also reads `recommended_dishes.js` after production identity has already been built.

For every strict recommendation row:

- the Place ID must already exist in production;
- the source must be HTTPS with a valid review date;
- if that URL already exists in the restaurant's provenance, the existing link is augmented with the `dishes` claim and `recommendationEvidence` metadata;
- otherwise a provenance-only `reviewed recommendation evidence` link is created;
- the exact reviewed dish labels are retained as `recommendationDishes` on the source link.

Recommendation evidence cannot create or change an identity and adds only a dish provenance claim.

`audit_recommendation_source_provenance.mjs` requires every row in `recommended_dishes.js` to have an exact matching public source link, recommendation flag, dish claim and retained dish labels. It is now part of PR Review.
