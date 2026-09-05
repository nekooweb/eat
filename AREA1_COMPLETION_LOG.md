# Area1 Completion Log

## 2026-09-05 — Exact identity inventory and first full-information batch

### Exact 1.2 km identity inventory

The Area1 food-business identity universe is now independently counted and fully enumerated for the repository's configured food-service type set.

- strict radius: 1,200 m;
- Places Aggregate exact count: 2,804;
- unique enumerated Place IDs: 2,804;
- inventory status: complete / coverage verified / independent count verified;
- discovery method: `places_aggregate_geodesic_partition_boundary_qc_v3`;
- successful discovery workflow: `33953718846`;
- exact inventory commit: `81d874558e556a6942e81606a7855de455d8a7b4`.

Boundary audit details:

- 1,200 m geodesic sector union: 2,801 IDs;
- 1,205 m guard-band union: 2,835 IDs;
- guard-band-only candidates checked: 34;
- candidates confirmed inside strict 1,200 m: 3;
- final IDs: 2,804, exactly equal to the independent Aggregate circle count.

Relative to the old 1,613-ID Nearby-search inventory:

- newly discovered IDs: 1,215;
- old IDs absent under current exact operational/type/radius criteria: 24.

### Full OSM verification

All 990 current OSM candidates were processed through Google QC-v4.

- verified: 526;
- rejected: 464;
- pending: 0;
- resulting canonical production: 517 entities / 517 unique Place IDs;
- production represented in exact inventory: 515.

### First outer-production source/field completion batch

Commit `723173603aa321a27b6f4a7fe3b9b66333c758a6` added eight exact Place-ID source bindings:

1. そば酒房 笹陣 お茶の水店 — official source;
2. 上海飯店 — Tabelog;
3. 中華ダイニング 台湾酒場 — Tabelog;
4. 純中国伝統料理四川料理 芊品香 — Tabelog;
5. 花臨蘭州牛肉麺 — Tabelog;
6. カフェダイニング クレアンテ 御茶ノ水店 — Tabelog;
7. おきなわ軒 — Tabelog;
8. スープストックトーキョー お茶の水店 — Tabelog.

Commit `0788170b9f84a13343e6cace9419bbc2df3b5d0e` added two explicit branch/status conflicts instead of forcing unsafe source bindings:

- マクドナルド — historical 水道橋店 is closed while the current official nearby store is a different branch/address; branch identity remains ambiguous;
- Shisha Bar & Cafe Iwashiclub — exact address matches, but Tabelog closure status conflicts with other current-source/Google status evidence; kept as an explicit ambiguity for recheck.

### Measured batch delta

Latest CI build for commit `0788170b9f84a13343e6cace9419bbc2df3b5d0e`:

| Metric | Before batch | After batch | Delta |
| --- | ---: | ---: | ---: |
| Production entities | 517 | 517 | 0 |
| Usable Tabelog/official bindings | 237 | 245 | +8 |
| Explicit source resolutions | 32 | 34 | +2 |
| Source outcomes accounted for | 269 | 279 | +10 |
| Unresolved production identities | 248 | 238 | -10 |
| Source-resolution coverage | 52% | 54% | +2 pp |
| Cuisine known | 425 | 426 | +1 |
| Budget known | 95 | 102 | +7 |
| Schedule/holiday known | 202 | 206 | +4 |
| Representative dishes known | 20 | 24 | +4 |
| Address known | 95 | 102 | +7 |

Provider totals after the batch:

- Tabelog bindings: 228;
- official bindings: 17;
- total source-backed production: 245 / 517 (47.4%).

All canonical, repository and source-binding audits passed for the batch. The source queue now begins at approximately 766 m rather than 755 m.

### Remaining work

Two different queues remain and must not be conflated:

1. **238 production identities** already live in the recommendation pool but still needing a usable Tabelog/official source or an explicit reviewed resolution. This is the highest-priority full-information queue.
2. **2,291 exact-inventory Place IDs** without a verified independent-source identity. These identities exist in the exact Google food-business universe, but they must not be admitted merely from Google data; an independent durable identity/source relationship or explicit reconciliation outcome is still required.

The next production source queue starts with: ふみや, 穂高, 台北, はなまるうどん, リトルマーメイド, なおじ, カレー屋ジョニー, 麻辣四川, CoCo壱番屋, 広島県府中市アンテナショップ, and subsequent outer-ring identities.

### Rules retained

- Google remains the primary identity/QC layer and navigation identity.
- Full Google Places response objects are not persisted as the durable restaurant database.
- OSM/Tabelog/official sources provide durable branch facts.
- Branch-specific source matching must be explicit; same-brand nearby stores are not interchangeable.
- Conflicting current/closed evidence is recorded rather than silently overwritten.
- Exact count completion and full-information completion are tracked separately.
