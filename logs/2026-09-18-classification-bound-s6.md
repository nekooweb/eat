# 2026-09-18 — CLASSIFICATION-ENTITY-BOUND S6 review

## Scope

Reviewed all 8 current rows in deterministic shard S6 after the S5 lifecycle merge.

Policy held:

- only assigned bound URLs were used;
- no new-source discovery;
- no restaurant-name or menu-dish inference for accepted classification;
- brand-level category statements were not propagated to an unverified branch;
- inaccessible assigned pages were blocked rather than replaced;
- paid Google Data API calls = 0;
- no canonical/public classification was written.

## Worker outcomes

- reviewed: 8 / 8
- accepted_evidence proposals: 3
- candidate: 1
- no_evidence: 1
- blocked: 3

### Proposed accepted evidence

- 鹿屋アスリート食堂 / 東京アスリート食堂 神田錦町本店:
  - `venue-shokudo`
  - `venue-izakaya`
  - exact Tabelog page preserves the old catalog name and explicitly gives 食堂、居酒屋、鍋; the assigned Kanda page independently says 昼はバランス食堂、夜は大衆酒場.
- 酒処 魚肴:
  - `venue-izakaya`
  - `food-seafood`
  - exact branch page explicitly says 魚料理と日本酒の居酒屋 / 日本酒居酒屋 and describes 旬の魚介.
- 東依:
  - `venue-cafe`
  - exact site repeatedly identifies the food-service space as 喫茶 / 喫茶室.

### Candidate

- Sizzler: assigned URL is the multi-store brand root. It says サラダバー&グリルレストラン and lists 東京ドームホテル店, but does not provide an exact assigned branch page. No grill -> barbecue inference is made.

### No evidence

- Good View Dining: exact branch verified, but ホテルライクなオールデイダイニング has no matching current taxonomy concept. References to cafe/bar are menu availability and do not justify venue-cafe/venue-bar.

### Blocked

- Cafe Cruise: assigned JSF restaurant page returned an internal retrieval error.
- Orchard Knight: assigned Gurunavi URL returned an internal retrieval error.
- グリルやまだ 大手町店: assigned branch URL returned an internal retrieval error.

## Next gate

The three accepted proposals remain worker output only. They must pass central review before entering `classification_entity_reviewed.json` and the public accepted overlay.
