# 2026-09-18 — CLASSIFICATION-ENTITY-BOUND S2 review

## Scope

Reviewed all 11 current S2 rows from the post-S7 residual assignment.

Policy held:

- only assigned bound URLs were used;
- no new-source discovery;
- brand-root evidence was not propagated to a branch;
- restaurant names and menu items were not used as substitute accepted evidence;
- one mixed-use facility identity conflict was blocked instead of inventing a restaurant category;
- paid Google Data API calls = 0;
- no canonical/public classification was written.

## Worker outcomes

- reviewed: 11 / 11
- accepted_evidence proposals: 3
- candidate: 2
- no_evidence: 1
- blocked: 5

### Proposed accepted evidence

- サラファン -> `style-western`
  - exact Tabelog genre is ロシア料理、洋食; only the existing exact 洋食 mapping is proposed.
- WIZ CRAFT BEER and FOOD -> `style-italian`
  - exact branch site explicitly calls the venue an イタリアン酒場・ビアレストラン; only the Italian cuisine-style concept is proposed.
- さかなさま 大手町店 -> `food-seafood`
  - exact branch site consistently presents fresh/selected fish as the venue's core food offering.

### Candidate

- デニーズ 東京ドームシティ店: assigned URL is a brand root, not exact branch evidence; current taxonomy has no family-restaurant concept.
- Brussels: assigned root covers multiple BRUSSELS branches. Brand-level Belgian/craft-beer bar evidence is not propagated to the current branch.

### No evidence

- L'art et Mikuni: exact site verifies the branch but exposes no explicit cuisine/business category in reviewable text. No name/chef inference.

### Blocked

- Kanda Square: assigned source proves the entity is a mixed-use facility with offices, halls, restaurants and shops, not one restaurant. Blocked for identity cleanup.
- ワイン処 Oasi: assigned AMP/Tabelog URL retrieval failed.
- Craft Beer Market (Awajicho): assigned store URL retrieval failed.
- BAR 2000: assigned Tokyo Dome Hotel page inaccessible.
- Craft Beer Market (Otemachi): assigned store URL inaccessible.

## Next gate

The three accepted rows remain worker proposals until independent central review.
