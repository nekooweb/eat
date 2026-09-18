# 2026-09-18 — S6 classification central review

## Central decision

All 8 S6 worker proposals were reviewed independently.

Final S6 decisions:

- accepted_evidence: 3
- candidate: 1
- no_evidence: 1
- blocked: 3
- paid Google Data API calls: 0

Accepted:

- 鹿屋アスリート食堂 / 東京アスリート食堂 神田錦町本店
  - `venue-shokudo`
  - `venue-izakaya`
- 酒処 魚肴
  - `venue-izakaya`
  - `food-seafood`
- 東依
  - `venue-cafe`

The central review did not upgrade Sizzler, Good View Dining, or any blocked row.

## Conservative decisions retained

- Sizzler remains candidate because the assigned URL is a multi-store brand root rather than an exact branch page. No grill-to-barbecue mapping.
- Good View Dining remains no_evidence because オールデイダイニング has no equivalent current taxonomy concept; cafe/bar references are menu availability only.
- Cafe Cruise, Orchard Knight, and グリルやまだ remain blocked because the assigned URLs were not reliably retrievable and no replacement source was used.

## Maintained truth

The existing deterministic builder now aggregates S5 + S6 central review files into one reviewed truth. The central-review regression is generalized to all `S*.json` review files rather than hard-coding one shard's counts.

Before CI, the committed reviewed artifact contains:

- review files: 2
- reviewed rows: 16
- accepted rows: 7
- candidate rows: 2
- no_evidence rows: 1
- blocked rows: 6
- accepted overlay rows: 7

Actual coverage and residual assignment deltas are recorded from maintained CI after validation.

## Maintained preview result

PR validation measured:

- accepted classification: **1,265 -> 1,268 (+3)**
- unknown classification: **157 -> 154 (-3)**
- coverage: **88.96% -> 89.17%**
- rows with multiple dimensions: **94 -> 95**
- cuisineStyle rows: **518 -> 518**
- foodType rows: **263 -> 264**
- venueType rows: **589 -> 592**
- terminal reviewed deferred: **4 -> 9**
- source-changed reactivations: **0**
- active bound-source rows: **92 -> 84**
- active explicit bound links: **111 -> 95**
- S6 active assignment: **8 -> 0**

The eight-row S6 active shard is fully retired from immediate work: three rows became accepted public classifications and five non-accepted terminal rows entered cooldown.
