# 2026-09-18 — S7 classification central review

## Central decision

All 9 S7 worker proposals were reviewed independently.

Final S7 decisions:

- accepted_evidence: 4
- candidate: 0
- no_evidence: 2
- blocked: 3
- paid Google Data API calls: 0

Accepted:

- GARB Cheers OTEMACHI -> `venue-bar`
- Hanoi Kanda -> `style-vietnamese`, `venue-izakaya`
- 炭火焼肉 さんこう苑 -> `food-yakiniku`
- 9INETY4OUR Sports and Music Bar -> `venue-bar`, `venue-dining-bar`, `venue-izakaya`

Conservative decisions retained:

- Gourmands remains no_evidence: ジビエ料理 / ビストロ have no exact current concepts.
- つじ田 remains no_evidence: exact branch identity exists, but assigned category-like information is menu/product evidence.
- 日比谷 Bar, Gravy, and THE LOUNGE remain blocked because assigned URLs were not reliably retrievable.

## Maintained truth before CI

The deterministic reviewed truth now aggregates S5 + S6 + S7:

- review files: 3
- reviewed rows: 25
- accepted rows: 11
- candidate rows: 2
- no_evidence rows: 3
- blocked rows: 9
- accepted overlay rows: 11

Actual coverage and residual assignment deltas are recorded from maintained CI after validation.

## Maintained preview result

PR validation measured:

- accepted classification: **1,268 -> 1,272 (+4)**
- unknown classification: **154 -> 150 (-4)**
- coverage: **89.17% -> 89.45%**
- rows with multiple dimensions: **95 -> 96**
- cuisineStyle rows: **518 -> 519**
- foodType rows: **264 -> 265**
- venueType rows: **592 -> 595**
- terminal reviewed deferred: **9 -> 14**
- source-changed reactivations: **0**
- active bound-source rows: **84 -> 75**
- active explicit bound links: **95 -> 84**
- S7 active assignment: **9 -> 0**

The full S7 shard is retired from immediate work: four rows became accepted classifications and five non-accepted terminal rows entered cooldown.
