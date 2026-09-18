# 2026-09-18 — CLASSIFICATION-ENTITY-BOUND S5 review

## Scope

Reviewed all 8 rows in deterministic shard S5 from the PR #89 assignment artifact.

Rules held:

- only assigned bound URLs were used;
- no new-source discovery;
- no restaurant-name classification;
- menu/product wording alone did not reach accepted status;
- inaccessible assigned sources were blocked rather than replaced;
- no canonical/public classification was written.

## Worker outcomes

- reviewed: 8 / 8
- `accepted_evidence` proposals: 4
- candidate: 1
- no_evidence: 0
- blocked: 3
- paid Google Data API calls: 0

### Proposed accepted evidence

- 味のふたば: `venue-shokudo` + `food-ramen` from exact-branch Tabelog genre.
- AKL Curry and Bar: `food-curry` + `venue-bar` from the branch site's explicit lunch/evening business description.
- 小川軒: `venue-cafe` from the exact branch site's 1F cafe label.
- TGI Fridays Tokyo Dome City: `style-american` + `venue-bar` from the exact store page's explicit American restaurant & bar description.

### Candidate

- Shake Shack Tokyo Dome: `food-hamburger` remains candidate because the exact branch page says it is known for burgers but does not state an explicit restaurant/category label.

### Blocked

- Spain Bar ALBA: assigned URL not reliably fetchable.
- 大樹: assigned URL not reliably fetchable.
- Al Mina: assigned `access.html` timed out. Other pages on the same domain were deliberately not substituted because they were not assigned.

## Next gate

These are worker proposals only. The 4 proposed accepts must pass central review before they can be copied into `data/classification_entity_reviewed.json` and materialized into the public entity overlay.
