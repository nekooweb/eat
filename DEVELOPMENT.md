# Eat 开发状态与重构计划

更新日期：2026-09-07。

## 当前线上状态

- frozen catalog：2,804 Place ID，内部全部保留。
- 当前公开 runtime：1,411 条已有真实名称记录。
- 1,393 条 `google_place_id_only` 已下架，不显示“Google Maps 餐厅”伪名称；补到真实名称和基础身份后再上架。
- Hot Pepper runtime 已改用 `openingHoursText` / `closedText`，hours coverage 由 363 增至 716。
- `N以上 -> N+2000` 伪预算上界已移除。
- Pages build/deploy 与 no-paid-data-API policy 均保持通过。

## Refactor mode

`EAT_REFACTOR_MODE=1`：旧 canonical/overlay/coverage/queue 等架构耦合检查为 warning；成本、安全、语法、2,804 catalog 完整性、公开 unnamed-ID-only 禁止、Pages 可部署性仍 blocking。新 SQLite smoke 始终 blocking。

## Phase 1 — persistent SQLite v1

状态：**完成并通过真实数据库、幂等导入和 backup/restore**。

通过基线：

- catalog 2,804
- legacy canonical snapshots 651
- retained exceptions 3
- source records / bindings 1,946 / 1,946
- field observations 28,992
- field resolutions 25,162
- verified 651
- source-matched 747
- conflict identity state 13
- id-only 1,393
- resolved names 1,398
- Hot Pepper full retained records 535
- raw hours / closures 535 / 535
- normalized Hot Pepper budget observations 530

统一 retained layer 后实际发现 8 source-ID collision groups / 16 Place ID；所有 collision binding 隔离为 conflict，known resolution 不选择 conflict source。Conflict evidence 不能擦除另一 non-conflict binding 已建立的 known value。

## Phase 2 — retained evidence 扩展

状态：**实现中，第一次 smoke 暴露旧 JS wrapper 解析问题，已修复 parser，等待重跑。**

目标输入：

- `source_facts.js`：575 provider fact records
- `source_provenance.js`：644 public source links
- `hotpepper_rich_metadata.js`：135 rich metadata rows
- `google_inventory_detail_evidence.json`：283 dish evidence items

### 数据原则

- Hot Pepper native `hotpepperId` 继续参与 collision discovery。
- Tabelog/official URL 只作为 provenance，不默认作为 branch identity key。
- Source facts/provenance 使用 content-addressed synthetic retained IDs，避免共享 URL 导致错误合并。
- Phase 2 只增加 source/evidence observations；首次导入阶段 `phase2SelectedResolutions` 必须为 0，不改变当前已验证 field resolutions。

### 第一次 Phase 2 smoke 发现

失败不是数据库约束或数据冲突，而是历史 JS assignment parser 使用“找到赋值后第一个 `;`”截断 JSON。`source_facts.js` 的字符串内容本身含分号，因此产生 `JSONDecodeError`。

修复：

- 保留 importer 逻辑到 `scripts/database/retained_phase2_core.py`；
- `scripts/database/retained_phase2.py` 使用 `json.JSONDecoder().raw_decode()` 从 `window.X=` 右侧直接解析完整 JSON value；
- 不执行历史 JS；字符串内部的分号/其他文本不会再被当作结构分隔符；
- workflow 同时 py_compile wrapper/core 后再跑 persistent smoke。

Phase 2 通过后才进入 resolver v2。

## Phase 3 — resolver v2

后续统一处理 direct source vs legacy snapshot、时间/correction/retraction、hours raw→normalized、meal budget、dish recommendation/featured/signature semantics，以及 identity conflict 与 field conflict 分离。

## Phase 4 — 双导出

- `catalog`：全部 2,804，允许 name missing/conflict。
- `recommendation`：仅满足 eligibility 的记录，并记录 exclusion reason。

SQLite export 完成后再替换当前 `google_inventory_runtime.js` 过渡 builder。

## Phase 5 — Pages cutover

必须通过 ID diff、field provenance、浏览器回归、旧/新推荐结果差异、backup restore 后切换。切换批次才停用/归档旧 builders/workflows。

## Phase 6 — 新增数据

主库和 resolver 稳定后再继续网络补全。最高优先级仍是 1,393 个 id-only 的名称/身份恢复，其次地址/坐标/菜系、营业时间、预算、菜单/推荐语义、实用字段。

## 开发纪律

每完成一批实际开发，同步更新本文件、相关数据库/架构文档和 `logs/`。失败原因和修复也写入日志；未通过 smoke 的功能不标记为完成。
