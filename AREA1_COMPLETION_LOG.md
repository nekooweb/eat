# Area1 Completion Log

## 2026-09-05 — Exact count and full-information expansion

### 1. Exact 1.2 km identity inventory completed

Area1 food-business identity counting is complete for the repository's configured food-service types.

- strict radius: 1,200 m;
- exact Places Aggregate count: **2,804**;
- unique Place IDs: **2,804 / 2,804**;
- method: `places_aggregate_geodesic_partition_boundary_qc_v3`;
- discovery run: `33953718846`;
- inventory commit: `81d874558e556a6942e81606a7855de455d8a7b4`.

Boundary proof:

- geodesic 1,200 m sector union: 2,801;
- 1,205 m guard-band union: 2,835;
- boundary-only candidates checked: 34;
- recovered inside strict circle: 3;
- final IDs: 2,804.

The previous Nearby-search lead inventory had 1,613 IDs. The exact inventory added 1,215 and removed 24 under current operational/type/radius criteria.

### 2. Full OSM verification — original pool

Original source pool:

- OSM candidates: 990;
- verified: 526;
- rejected: 464;
- pending: 0;
- canonical production after the pass: 517.

### 3. OSM food-scope correction

The original OSM query omitted bar/pub/biergarten/ice-cream features although those categories were part of the Google exact food-business scope.

Commit `732dcf1ce7c0b80128d577cfa3a3e43b1ece826a` expanded `scripts/build_area1_osm.py`.

Refresh run `33954378252`:

- OSM candidates: 990 -> **1,273** (+283).

Full QC run `33954408879`:

- verified source rows: **658**;
- rejected source rows: **615**;
- pending: 0;
- verified-row delta: +132.

Following canonical rebuild:

- production: 517 -> **648** (+131);
- unique production Place IDs: 648.

### 4. Canonical identity-name bug fixed

The larger OSM pool exposed a merge issue: historical rich metadata could become the canonical display-name source even when the exact verified OSM identity represented another business.

Examples observed during review included source/name disagreement around `おかん`, `大衆酒場けいちゃん` and `あつ盛`.

Commit `697e85581317216f014d2f7ae1b5dd641663ee4e` changed canonicalization so:

- explicit Place-ID source enrichment that claims `name` wins;
- otherwise the verified OSM identity name wins;
- geospatial identity remains independent-source anchored;
- historical rich rows cannot rename a verified identity by detail-score priority.

Pages run `33954834163` passed after the correction.

## Source/field completion batches

### Batch 1

Source commit `723173603aa321a27b6f4a7fe3b9b66333c758a6`:

- そば酒房 笹陣 お茶の水店;
- 上海飯店;
- 中華ダイニング 台湾酒場;
- 純中国伝統料理四川料理 芊品香;
- 花臨蘭州牛肉麺;
- カフェダイニング クレアンテ 御茶ノ水店;
- おきなわ軒;
- スープストックトーキョー お茶の水店.

Conflict commit `0788170b9f84a13343e6cace9419bbc2df3b5d0e` recorded rather than guessed:

- マクドナルド branch mismatch/closure conflict;
- Shisha Bar & Cafe Iwashiclub status conflict.

### Batch 2

Commit `35aecba7639cf937b65dfc97d70cd83aa01def21` added:

- らーめん登楽 ふみや;
- 喫茶 穂高;
- 台北;
- はなまるうどん 水道橋西口店;
- リトルマーメイド 新御茶ノ水店;
- 新潟発祥 なおじ 御茶ノ水店;
- カレー屋ジョニー;
- 麻辣四川;
- CoCo壱番屋 水道橋外堀通り店;
- 広島県府中市アンテナショップNEKI.

CI `33954279349`: pass.

### Batch 3

Commit `f1c7aa73f386f9a6b0080c52a4624f204f3647db` added:

- 炭火焼干物定食 しんぱち食堂 水道橋店;
- 小料理 小鈴;
- 八咫烏 CHIKARABO;
- らーめん まとい;
- タリーズコーヒー 飯田橋ガーデンエアタワー店;
- 天下一品 水道橋店;
- ARBOL;
- つじ田 神田御茶ノ水店;
- MD Bakery;
- 季の庭 神田店.

CI `33954458234`: pass.

### Batch 4

Commit `fe128c9078a351010ea92f4a430324e0b6ad8b7f` added 10 exact branch bindings:

- 馬さん餃子酒場 神保町店;
- 神保町 加賀廣;
- CRAFT BEER MARKET 神保町店;
- 大金星 神保町店;
- Bar Plat 本店;
- Bar 37℃;
- 鳥貴族 神保町店;
- おかん;
- 大衆酒場 けいちゃん 神保町店;
- あつ盛.

Batch 4 build `33954926963` passed canonical, repository, source-binding and exact-identity audits.

Measured Batch 4 state:

| Metric | Before Batch 4 | After Batch 4 | Delta |
| --- | ---: | ---: | ---: |
| Production | 648 | 648 | 0 |
| Tabelog/official bindings | 265 | **275** | +10 |
| Explicit resolutions | 34 | 34 | 0 |
| Source outcomes accounted | 299 | **309** | +10 |
| Unresolved production | 349 | **339** | -10 |
| Budget known | 119 | **126** | +7 |
| Schedule known | 230 | **239** | +9 |
| Representative dishes known | 28 | **31** | +3 |
| Address known | 131 | **140** | +9 |

Provider totals:

- Tabelog: 249;
- official: 26;
- total source-backed production: **275 / 648 (42.4%)**.

Source-resolution coverage including explicit terminal outcomes: **309 / 648 (47.7%)**.

## Latest exact-reconciliation audit

Every Pages build now runs `scripts/audit_area1_identity_coverage.mjs`.

Latest result:

- exact inventory: 2,804;
- unique verified IDs in QC cache: 647;
- verified IDs covered by exact inventory: **643**;
- exact inventory IDs without verified independent source: **2,161**;
- rejected source-match IDs present in exact inventory: 106;
- verified source IDs outside exact inventory: 4;
- exact coverage gate: pass.

## Next queue

The nearest unresolved live-production identities now begin at about 167 m:

1. やまじょう;
2. レピック神保町;
3. 森のブッチャーズ;
4. 座楽;
5. Beer Pub 8taps;
6. 餃子八;
7. 兵六;
8. 酉たけ;
9. 花の樹;
10. スタイリッシュバー ダブルオー.

After live-production source completion, the larger exact-inventory reconciliation queue remains **2,161 Place IDs**.

## Rules retained

- Google is the identity/QC/navigation layer, not the durable restaurant-fact database.
- Place IDs and compact QC outcomes may persist; branch facts are sourced independently.
- OSM/Tabelog/official sources provide durable identity/field evidence.
- Same-brand nearby branches are not interchangeable.
- Conflicting evidence is recorded rather than forced.
- Exact identity-count completion and full-information completion remain separate milestones.
