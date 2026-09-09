# Independent-source reviewer v4 central-policy wrapper — 2026-09-09

## Problem

The production workflows sanitize independent-source candidates before calling the strict v3 page reviewer, but v3 itself predates the central host policy and retains a smaller local banned-host list. A direct/manual v3 invocation could therefore bypass the defense-in-depth sanitizer.

The extended reviewer also invoked v3 directly internally, relying on its caller workflow to have sanitized input first.

## Fix

`review_independent_dish_source_candidates_v4.mjs` is now the safe external reviewer entry point:

1. sanitize the candidate plan with the central host policy before any network review;
2. preserve existing monotonic approvals in a temporary output;
3. call v3 only as the internal strict page-name/location engine;
4. audit the reviewed output against the central host policy before writing it back;
5. publish sanitizer counts and central-policy version in review metadata.

The extended reviewer now routes its promoted high/medium candidate plan through v4 rather than calling v3 directly.

`test_independent_source_reviewer_v4.mjs` runs without live network requests and verifies that an excluded Hitosara high-confidence candidate is dropped before v3, while an allowed explicit menu URL is propagated into sanitized review roots.

## Boundaries

The strict v3 identity criteria remain unchanged. v4 adds admission plumbing only: it does not lower name/location thresholds, mutate catalog identity, create dish evidence, or use paid Google data APIs.
