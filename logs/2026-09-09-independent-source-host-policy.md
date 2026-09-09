# Independent source host-policy consolidation — 2026-09-09

## Problem

Independent-source admission had drifted across multiple layers. The standard candidate planner, weak-nearby planner, strict v3 reviewer, and workflow post-review checks carried overlapping but different host exclusion lists.

The 2026-09-09 weak-source hardening added Hitosara, Localplace, Demae-can, EPARK, Uber Eats, and Wolt to the weak lane after a co-located false-positive audit. The standard planner/reviewer still used older lists. Current standard candidates did not contain those hosts, so no known production source was polluted, but a future Overture snapshot could send an aggregator/delivery URL into network review and only fail at a later workflow guard.

## Fix

A central `scripts/independent_source_host_policy.mjs` now defines the host policy for network-review inputs.

`scripts/sanitize_independent_source_candidate_plan.mjs` applies the policy before network review. It removes excluded URL values, drops candidates that have no independent merchant URL left, and recomputes candidate hosts without mutating Place ID/name/coordinates or dish evidence.

`scripts/audit_independent_source_host_policy.mjs` checks candidate and approved-source outputs for excluded hosts.

The sanitizer/audit are wired into:

- `review-independent-dish-sources.yml`;
- `review-independent-dish-sources-extended.yml`;
- `review-weak-nearby-independent-sources.yml`;
- `pr-review.yml`.

A synthetic regression verifies that Hitosara/Localplace/delivery URLs are rejected, valid merchant URLs remain, and an allowed menu URL can safely replace a banned proposal root before network access.

## Boundaries

- paid Google data API calls remain zero;
- catalog Place IDs and runtime names are unchanged;
- source aliases cannot replace catalog identity;
- no dish evidence is created by host sanitization;
- strict page name/location review remains the identity admission gate;
- this change is defense-in-depth and does not lower existing identity thresholds.
