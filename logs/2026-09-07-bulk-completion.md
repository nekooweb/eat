# 2026-09-07 批量补齐开发记录

## 初始基线

上一轮 blocking database smoke：2,804 catalog、651 verified、747 source_matched、1,393 id_only、13 conflict；2,972 active tasks，其中 identity recovery 1,393、field completion 1,352、identity conflict review 16、dish semantic review 211。

## Batch A — retained official identity recovery

状态：**完成，blocking CI 通过**。Commit：`f43cffbae4d73ac2e9fc73929cc02d2915d4838c`。

实现内容：

- 新增 `retained_official_identity.py`；
- 新增 `validate_official_identity.py`；
- official source 只接受 retained HTTPS candidate-official/name-match 证据；
- Google/聚合站/社交媒体 host 拒绝；
- current identity conflict 只 candidate；
- reviewed official name 可将 id-only 升为 source_matched；
- discovery distance 不作为官网字段；
- shadow 只允许 approved reviewed recovery method 安全新增；
- build/repeat/backup/restore/export 全部纳入 blocking validation。

实际 CI：

- official index input：194；
- reviewed：193；
- conflict deferred：1；
- outside catalog：0；
- identity recovered：**1**；
- recovered Place ID：`ChIJ2yzmKgCNGGARujgyaVuRhy8`；
- identity：651 verified / 748 source_matched / 1,392 id_only / 13 conflict；
- master：3,777 source records/bindings、40,055 observations、29,695 resolutions；
- shadow recommendation：**1,396**；
- safe added：1；unsafe added：0。

Task 变化：identity recovery 1,393 -> 1,392；field completion 1,352 -> 1,353。总 active tasks 仍为 2,972，因为成功恢复的一家从“缺身份”转成“缺字段”，不是任务消失。

## Batch B — retained verified OSM identity QC

状态：代码已实现，等待本批 blocking CI。

数据链：

`google_entities.generated.js` historical verified mapping
+ `area1_osm.js` independent OSM facts
→ cross-layer source-ID collision discovery
→ versioned OSM source record
→ reviewed/candidate/conflict binding
→ safe field observations/resolutions
→ identity recovery
→ task re-plan
→ shadow export regression。

关键限制：

- 只用 `status=verified` mapping；
- QC sourceId 必须精确命中 OSM candidate ID；
- historical source-ID 多 Place ID 先进入 collision index，再导入 basic binding，避免旧 reviewed 状态漏网；
- 已有 conflict Place ID 不自动解除冲突；
- 不使用 proximity-only 绑定；
- durable restaurant fields 全部来自 OSM candidate，不把 Google display response 写入 master；
- 0 new paid Google data API calls。

新增：

- `scripts/database/retained_osm_identity.py`
- `scripts/database/validate_osm_identity.py`
- `build_master.py` 增加 OSM native identity collision pre-index 和 bulk recovery stage；
- `compare_runtime_shadow.py` approved method 增加 `retained_verified_osm_identity_qc`；
- database workflow 对 `google_entities.generated.js` / `area1_osm.js` 变化触发并在 build/repeat/backup 全部验证。

Batch B 通过后立即记录真实 recovered 数量和字段覆盖变化，然后进入 Batch C deterministic field resolver v2。
