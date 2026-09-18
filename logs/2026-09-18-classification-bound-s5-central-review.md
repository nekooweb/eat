# 2026-09-18 — S5 classification central review and lifecycle

## Central review

S5 worker proposals were independently reviewed against the same strict entity-classification policy.

Final S5 terminal decisions:

- reviewed: 8 / 8
- accepted_evidence: 4
- candidate: 1
- no_evidence: 0
- blocked: 3
- paid Google Data API calls: 0

Accepted:

- 味のふたば -> `venue-shokudo`, `food-ramen`
- AKL Curry and Bar -> `food-curry`, `venue-bar`
- 小川軒 -> `venue-cafe`
- TGI Fridays Tokyo Dome City -> `style-american`, `venue-bar`

Candidate remains:

- Shake Shack Tokyo Dome -> `food-hamburger` candidate only

Blocked remain:

- Spain Bar ALBA
- 大樹
- Al Mina

No central decision upgrades a non-accepted worker proposal or introduces a concept absent from the proposal.

## Deterministic truth build

The central decision file is not itself the public overlay.

The maintained chain is now:

`bound assignment -> worker proposal -> central review decision -> build_classification_entity_reviewed.mjs -> classification_entity_reviewed.json -> build_classification_entity_overlay.mjs -> public overlay`

The reviewed-truth builder checks proposal status and source fingerprint, permits accepted concepts only as a subset of worker-proposed concepts, and keeps candidate/no_evidence/blocked out of the public overlay.

## Review lifecycle

A second issue appears as soon as accepted rows leave the active completion queue: historical proposal rows must not be reinterpreted as current assignments.

The completion planner now distinguishes:

- active unresolved entity work;
- terminal reviewed rows deferred by cooldown;
- source-changed reviewed rows reactivated early.

For bound-source terminal rows, the current assignment-style source fingerprint is recomputed from the current bound URLs. If it is unchanged, normal cooldown applies:

- candidate: 30 days
- no_evidence: 60 days
- blocked: 30 days

If the fingerprint changes before cooldown expiry, the row is reactivated with `activationReason = source_changed`.

Thus the S5 candidate and blocked rows are not immediately assigned again after this merge, while changed sources can still invalidate the terminal review.

## Historical versus active denominators

The original PR #89 denominator remains an immutable historical fact: 100 initial bound-source rows / 120 explicit links.

After accepted/deferred lifecycle state is applied, the maintained assignment artifact represents only current residual active work. Tests therefore validate structural partition invariants and historical central-review pinning instead of incorrectly requiring the active queue to stay at 100 forever.

## Acceptance

Blocking validation covers:

- deterministic reviewed truth;
- accepted-only overlay;
- proposal -> central decision fingerprint/status pinning;
- no upgrade of candidate/blocked/no_evidence to accepted;
- current runtime catalog identity preservation;
- active/deferred classification partition;
- terminal cooldown;
- source-change reactivation contract;
- dynamic residual S0-S7 assignments;
- no paid Google Data API use.

Actual post-merge coverage and residual assignment counts are reported by maintained CI rather than inferred in this log.

## Maintained preview result

PR validation measured the actual post-review state:

- accepted classification: **1,261 -> 1,265 (+4)**
- unknown classification: **161 -> 157 (-4)**
- coverage: **88.68% -> 88.96%**
- rows with multiple dimensions: **91 -> 94**
- cuisineStyle rows: **517 -> 518**
- foodType rows: **261 -> 263**
- venueType rows: **585 -> 589**
- terminal reviewed deferred: **4**
- source-changed reactivations: **0**
- active bound-source rows: **100 -> 92**
- active explicit bound links: **120 -> 111**
- S5 active assignment: **8 -> 0**

The reduction from 100 to 92 consists of 4 newly accepted rows plus 4 non-accepted terminal rows deferred under review cooldown. The 61 name-candidate rows are unchanged.
