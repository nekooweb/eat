# Strict recommendation source provenance — 2026-09-09

## Bug

`data/recommended_dishes.js` stores strict recommendation evidence as Place ID + 1–2 dishes + HTTPS `sourceUrl` + `checkedAt`, but `scripts/build_source_provenance.mjs` previously loaded only `source_enrichment_*.js`. A recommendation could therefore appear in the public runtime while its reviewed source URL was absent from the public `sourceLinks`/`sourceClaimedFields` overlay.

The first provenance audit also exposed a second, older bug: recommendation/featured overlay validation in `build_production_dataset.mjs` checked membership in the historical identity `groupsByPlaceId` before canonicalization. A group can still be dropped later when it lacks the exact verified OSM geo required for final production. Therefore `groupsByPlaceId.has(placeId)` was not sufficient to prove an overlay was attached to final canonical production.

One stale recommendation was found this way: `ChIJ2yzmKgCNGGARujgyaVuRhy8` (`中国料理 錦和`). It still has historical source/official evidence, but is not currently in final `production_area1.js`; its old recommendation row was removed rather than silently published without canonical attachment.

## Fix

The provenance builder now also reads `recommended_dishes.js` after production identity has already been built.

For every strict recommendation row:

- the Place ID must already exist in production;
- the source must be HTTPS with a valid review date;
- if that URL already exists in the restaurant's provenance, the existing link is augmented with the `dishes` claim and `recommendationEvidence` metadata;
- otherwise a provenance-only `reviewed recommendation evidence` link is created;
- the exact reviewed dish labels are retained as `recommendationDishes` on the source link.

Recommendation evidence cannot create or change an identity and adds only a dish provenance claim.

`audit_dish_overlay_production_attachment.mjs` now checks both `recommended_dishes.js` and `featured_dishes.js` against the **final rebuilt** canonical production IDs. This closes the historical-group-vs-final-production gap without weakening canonical geo admission.

`audit_recommendation_source_provenance.mjs` additionally requires every remaining strict recommendation row to have an exact matching public source link, recommendation flag, dish claim and retained dish labels. Both audits are part of PR Review.
