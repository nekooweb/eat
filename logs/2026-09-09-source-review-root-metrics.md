# Independent-source review-root and metric fixes — 2026-09-09

## Bugs found

After the centralized independent-source host policy was merged, a real PR reload showed `hostPolicyRemovedUrlValues: 31` while all 31 standard proposals were retained and `hostPolicyChangedRows` was zero. The count was false: ordinary `pageUrl` values duplicated in `candidateUrls` were being collapsed by a Set and the deduplication delta was incorrectly reported as host-policy removal.

The same review path also exposed a schema gap: v3 review consumes `candidateUrls + pageUrl`, while proposal schemas may carry explicit `menuUrls`. If an allowed page root and a more specific explicit menu URL coexist, the menu URL could be silently omitted from network identity review.

## Fix

`sanitize_independent_source_candidate_plan.mjs` now:

- counts only URL values actually rejected by URL/host policy;
- does not count duplicate valid roots as removals;
- keeps `menuUrls` as provenance;
- adds allowed explicit menu URLs to the temporary sanitized `candidateUrls` review-root set so existing v3 review sees them;
- reports `reviewRootAugmentedRows` separately from host-policy changes;
- preserves the current page root unless it is rejected, in which case an allowed candidate/menu root may replace it.

The synthetic host-policy regression now verifies the exact removal count, valid-root deduplication, excluded root replacement, and explicit menu-root propagation.

## Boundaries

This is review-input plumbing only. It does not change catalog identity, source approval thresholds, dish evidence, or paid-API policy.
