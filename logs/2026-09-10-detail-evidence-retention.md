# 2026-09-10 — Detail evidence full-retention fix

## Problem

`merge_google_inventory_detail_evidence.mjs` previously deduplicated the union of old and new recommendation/featured evidence and then truncated the stored result to six items.

That mixed two different responsibilities:

- provenance storage should retain every distinct verified evidence item;
- public/runtime presentation may intentionally select a bounded subset.

A restaurant with six stored historical evidence items receiving one new distinct item could therefore lose one old item even though no evidence was explicitly revoked. Restaurant-level coverage counters could remain unchanged, hiding the loss.

## Fix

The merge layer now stores the complete deduplicated union and keeps the same deterministic date/key ordering. Same-key observations continue to prefer a newer observation, or a richer representation when dates are equal.

Additional policy metadata records that:

- evidence storage has no item-count limit at this merge stage;
- presentation limiting is not performed here;
- evidence retention is a complete monotonic union.

The monotonic guard now checks item counts in addition to restaurant counts.

## Regression

Added `scripts/test_detail_evidence_retention.mjs` covering:

1. six old recommendation items + one new distinct item => seven stored items;
2. a same-key, same-date richer observation replaces the poorer representation without duplicating it;
3. an empty/no-match later refresh preserves all seven items;
4. summary counts and retention policy metadata match the full union.

PR Review runs this regression after the standard public-only rebuild.

## Boundaries

This does not remove bounded collection or public-display limits. Individual collectors may still intentionally emit a small evidence sample per crawl, and canonical/runtime export may still present a bounded dish list. The change only prevents the central evidence merge from destructively truncating evidence that has already been accepted.

No network collection, paid data API, identity mutation, runtime hand-edit, or SQLite reset is introduced.
