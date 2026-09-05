# Area1 Completion Log

## 2026-09-05 — Exact identity inventory and full-information expansion

### Exact 1.2 km identity inventory

The Area1 food-business identity universe is independently counted and fully enumerated for the repository's configured food-service type set.

- strict radius: 1,200 m;
- Places Aggregate exact count: **2,804**;
- unique enumerated Place IDs: **2,804 / 2,804**;
- inventory status: complete / coverage verified / independent count verified;
- method: `places_aggregate_geodesic_partition_boundary_qc_v3`;
- successful discovery workflow: `33953718846`;
- inventory commit: `81d874558e556a6942e81606a7855de455d8a7b4`.

Boundary audit:

- 1,200 m geodesic sector union: 2,801 IDs;
- 1,205 m guard-band union: 2,835 IDs;
- guard-band-only candidates checked: 34;
- candidates confirmed inside strict 1,200 m: 3;
- final IDs: 2,804, exactly equal to the independent Aggregate circle count.

Relative to the old 1,613-ID Nearby-search lead inventory:

- newly discovered IDs: 1,215;
- old IDs absent under the current exact operational/type/radius criteria: 24.

### OSM candidate universe — first complete pass

The original OSM query produced 990 candidates. Google QC-v4 processed all 990:

- verified source rows: 526;
- rejected source rows: 464;
- pending: 0;
- resulting canonical production: 517 entities / 517 unique Place IDs;
- production represented in exact inventory: 515.

### OSM source-scope correction

Reviewing the exact Google food-business type scope against the OSM collection query exposed a source-layer mismatch: the previous OSM query collected `restaurant`, `fast_food`, `cafe` and `food_court`, but did not collect OSM `bar`, `pub`, `biergarten` or `ice_cream` features even though bar/pub/ice-cream categories are part of the repository's exact Google food-business universe.

Commit `732dcf1ce7c0b80128d577cfa3a3e43b1ece826a` expanded `scripts/build_area1_osm.py` to include:

- `amenity=bar`;
- `amenity=pub`;
- `amenity=biergarten`;
- `amenity=ice_cream`;
- `shop=ice_cream`;
- existing restaurant/cafe/food-court/bakery/pastry/confectionery/deli/coffee/tea types.

Refresh workflow `33954378252` regenerated the OSM pool:

- previous candidates: 990;
- expanded candidates: **1,273**;
- net new independent-source candidates: **+283**.

Full Google QC workflow `33954408879` then processed all 1,273 candidates:

- selected candidates: 1,273;
- new API calls in this pass: 565;
- verified source rows: **658**;
- rejected source rows: **615**;
- pending: 0;
- verified delta vs the 990-candidate pass: **+132**.

The verification state was committed by the workflow after rebasing over concurrent enrichment work. A following canonical build is used to measure the resulting unique-production delta because multiple verified source rows may collapse to one Place ID.

## Full-information source batches

### Batch 1 — outer production

Commit `723173603aa321a27b6f4a7fe3b9b66333c758a6` added eight exact Place-ID source bindings:

1. そば酒房 笹陣 お茶の水店 — official;
2. 上海飯店 — Tabelog;
3. 中華ダイニング 台湾酒場 — Tabelog;
4. 純中国伝統料理四川料理 芊品香 — Tabelog;
5. 花臨蘭州牛肉麺 — Tabelog;
6. カフェダイニング クレアンテ 御茶ノ水店 — Tabelog;
7. おきなわ軒 — Tabelog;
8. スープストックトーキョー お茶の水店 — Tabelog.

Commit `0788170b9f84a13343e6cace9419bbc2df3b5d0e` recorded two explicit conflicts instead of forcing unsafe bindings:

- マクドナルド — historical 水道橋店 is closed while the current official nearby store is a different branch/address;
- Shisha Bar & Cafe Iwashiclub — exact address matches, but current-status evidence conflicts across sources.

Measured Batch 1 delta:

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Production entities | 517 | 517 | 0 |
| Usable Tabelog/official bindings | 237 | 245 | +8 |
| Explicit source resolutions | 32 | 34 | +2 |
| Source outcomes accounted for | 269 | 279 | +10 |
| Unresolved production identities | 248 | 238 | -10 |
| Cuisine known | 425 | 426 | +1 |
| Budget known | 95 | 102 | +7 |
| Schedule/holiday known | 202 | 206 | +4 |
| Representative dishes known | 20 | 24 | +4 |
| Address known | 95 | 102 | +7 |

### Batch 2 — next ten production identities

Commit `35aecba7639cf937b65dfc97d70cd83aa01def21` added exact branch-safe bindings for:

1. らーめん登楽 ふみや;
2. 喫茶 穂高;
3. 台北;
4. はなまるうどん 水道橋西口店;
5. リトルマーメイド 新御茶ノ水店;
6. 新潟発祥 なおじ 御茶ノ水店;
7. カレー屋ジョニー;
8. 麻辣四川;
9. カレーハウスCoCo壱番屋 水道橋外堀通り店;
10. 広島県府中市アンテナショップNEKI.

Batch 2 CI `33954279349` passed all canonical/repository/source audits.

Measured state after Batch 2:

- production: 517;
- usable source bindings: **255**;
- explicit resolutions: 34;
- source outcomes accounted for: **289**;
- unresolved live production: **228**;
- source-resolution coverage: 55.9%;
- cuisine known: 428;
- budget known: 111;
- schedule known: 215;
- dishes known: 27;
- address known: 111.

### Batch 3 — next ten production identities

Commit `f1c7aa73f386f9a6b0080c52a4624f204f3647db` added exact branch-safe bindings for:

1. 炭火焼干物定食 しんぱち食堂 水道橋店;
2. 小料理 小鈴;
3. トーキョーニューミクスチャーヌードル 八咫烏 CHIKARABO;
4. らーめん まとい;
5. タリーズコーヒー 飯田橋ガーデンエアタワー店;
6. 天下一品 水道橋店;
7. ARBOL;
8. つじ田 神田御茶ノ水店;
9. MD Bakery;
10. 季の庭 神田店.

Batch 3 Pages workflow `33954458234` passed build, repository audit, source-binding audit and deploy.

Measured state after Batch 3, before rebuilding canonical production with the newly expanded 1,273-row Google QC cache:

- production: 517;
- usable source bindings: **265**;
- explicit resolutions: 34;
- source outcomes accounted for: **299**;
- unresolved live production: **218**;
- source-resolution coverage: 57.8%;
- cuisine known: 431;
- budget known: 119;
- schedule known: 224;
- dishes known: 28;
- address known: 118;
- Tabelog bindings: 241;
- official bindings: 24.

## Remaining work model

Two queues remain distinct:

1. **Live-production full-information queue** — every production Place ID without a usable Tabelog/official source or explicit reviewed resolution. This queue is recalculated after each canonical rebuild.
2. **Exact-inventory reconciliation queue** — exact 2,804 Google Place IDs that still lack a verified independent-source identity. This is not equivalent to immediately admissible restaurants; each identity needs an independent source relationship or an explicit reconciliation outcome.

The OSM type expansion is specifically intended to reduce queue 2 before more expensive per-place source discovery.

## Rules retained

- Google remains the primary identity/QC layer and navigation identity.
- Persisted Google state is limited to Place IDs and compact QC outcomes; full Places response objects are not used as the durable restaurant database.
- OSM/Tabelog/official sources provide durable branch facts.
- Branch-specific source matching must be explicit; same-brand nearby stores are not interchangeable.
- Conflicting current/closed evidence is recorded rather than silently overwritten.
- Exact count completion and full-information completion are tracked separately.
