# 2026-09-19 — S2 classification central review

## Central decision

All 11 S2 worker proposals were reviewed independently against the existing fail-closed contract and only the assigned bound-source evidence.

Final S2 decisions:

- accepted_evidence: 3
- candidate: 2
- no_evidence: 1
- blocked: 5
- paid Google Data API calls: 0

Accepted:

- サラファン -> `style-western`
- WIZ CRAFT BEER and FOOD -> `style-italian`
- さかなさま 大手町店 -> `food-seafood`

Conservative decisions retained:

- Kanda Square remains blocked because the assigned site identifies a mixed-use facility rather than one restaurant entity.
- L'art et Mikuni remains no_evidence because the exact branch evidence contains no explicit cuisine/business category.
- デニーズ 東京ドームシティ店 and Brussels remain candidate because their assigned pages are brand-level rather than exact-branch classification evidence.
- ワイン処 Oasi, Craft Beer Market (Awajicho), BAR 2000, and Craft Beer Market (Otemachi) remain blocked because the assigned URLs could not be reviewed reliably.
- No unassigned replacement source was introduced.

## Independent source checks

The central pass re-opened only already-assigned sources. It independently confirmed:

- サラファン: exact Tabelog branch genre includes ロシア料理 and 洋食; only the existing `style-western` mapping is accepted.
- WIZ: exact branch page identifies the address and describes the venue as an イタリアン酒場・ビアレストラン; only `style-italian` is accepted.
- KANDA SQUARE: the official site describes offices, halls/conference facilities, and a restaurant/shop collection, confirming the catalog identity conflict.
- Denny's and BRUSSELS roots remain multi-store/brand-level evidence and are not propagated to an exact branch.

## Maintained truth before CI

The deterministic reviewed truth now aggregates S2 + S5 + S6 + S7:

- review files: 4
- reviewed rows: 36
- accepted rows: 14
- candidate rows: 4
- no_evidence rows: 4
- blocked rows: 14
- accepted overlay rows: 14

Actual coverage and residual-assignment deltas are recorded after maintained PR validation.
