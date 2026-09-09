# Direct independent-source planner host-policy integration — 2026-09-09

## Problem

The central independent-source host policy had been enforced by workflow sanitizers, but both the standard and weak candidate planners still carried local exclusion logic. That left two risks:

1. a future host-policy update could drift between planner and sanitizer, generating avoidable review/network work;
2. direct planner use outside the normal workflow could produce candidates that the central policy would reject later.

## Fix

Both candidate planners now import `scripts/independent_source_host_policy.mjs` directly.

- `build_independent_dish_source_candidate_plan.mjs` delegates host exclusion to `isExcludedIndependentHost` / `safeIndependentUrl` and records the central policy version/source in its output.
- `build_weak_nearby_independent_source_candidates.mjs` uses `filterIndependentUrls` directly and records the same policy contract.
- `test_independent_source_candidate_hardening.mjs` no longer owns another duplicate blacklist; it validates both plans with the central policy and requires both outputs to declare the same policy version.

The workflow sanitizer remains as defense-in-depth before network review.

## Boundaries

This refactor changes URL admission only through the already-approved central policy. It does not lower name/proximity thresholds, change Place ID/name/coordinates, create dish evidence, or use paid Google data APIs.
