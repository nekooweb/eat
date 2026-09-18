# 2026-09-18 — CLASSIFICATION-ENTITY-BOUND S7 review

## Scope

Reviewed all 9 current S7 rows from the post-S6 residual assignment.

Rules held:

- only the 11 assigned bound URLs were used;
- no new-source discovery;
- inaccessible assigned URLs were blocked rather than replaced;
- restaurant names and menu items were not promoted into accepted classification;
- paid Google Data API calls = 0;
- no canonical/public classification was written.

## Worker outcomes

- reviewed: 9 / 9
- accepted_evidence proposals: 4
- candidate: 0
- no_evidence: 2
- blocked: 3

### Proposed accepted evidence

- GARB Cheers OTEMACHI -> `venue-bar`
  - exact branch site explicitly labels itself as a sports bar and shows the exact Otemachi address.
- Hanoi Kanda -> `style-vietnamese`, `venue-izakaya`
  - exact site explicitly gives genre ベトナム料理・居酒屋.
- 炭火焼肉 さんこう苑 -> `food-yakiniku`
  - exact official page identifies the business as 炭火焼肉 and gives exact branch address/phone.
- 9INETY4OUR Sports and Music Bar -> `venue-bar`, `venue-dining-bar`, `venue-izakaya`
  - exact Tabelog branch genres are スポーツバー、ダイニングバー、居酒屋.

### No evidence

- Gourmands: exact genres are ジビエ料理、ビストロ, for which the current taxonomy has no exact concept. No bistro -> French/dining-bar inference.
- つじ田: exact branch identity is verified, but assigned branch page has no explicit business category. Assigned menu/product pages remain menu evidence and are not promoted to classification.

### Blocked

- 日比谷 Bar 神保町 別邸: assigned root returned a gateway error.
- Gravy: assigned business.site URL was inaccessible through the review path.
- THE LOUNGE: assigned Four Seasons URL returned an internal retrieval error.

## Next gate

The four accepted rows remain worker proposals until independent central review.
