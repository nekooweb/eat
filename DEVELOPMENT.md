# Eat 开发状态与重构计划

更新日期：2026-09-07。

## 当前线上状态

- frozen catalog：2,804 Place ID 全部内部保留。
- 公开 runtime：1,411 条已有真实名称记录。
- 1,393 条 ID-only 已下架，不显示“Google Maps 餐厅”伪名称；补齐真实名称和基础身份后再上架。
- Hot Pepper runtime 已修正 `openingHoursText` / `closedText`，hours coverage 363 → 716。
- `N以上 -> N+2000` 伪预算上界已移除。
- Pages 与 no-paid-data-API policy 保持 blocking。

## Phase 1 — persistent SQLite v1

状态：完成并通过 blocking smoke。

基线：2,804 catalog、651 legacy migration snapshots、3 retained exceptions、1,946 source records/bindings、28,992 observations、25,162 resolutions；8 source-ID collision groups / 16 Place ID 全部隔离；二次导入幂等，SQLite backup/restore 再验证通过。

## Phase 2 — retained evidence

状态：**完成并通过 blocking smoke**。

已进入 master：

- 575 provider source facts
- 644 provenance links
- 135 Hot Pepper rich metadata rows
- 283 dish recommendation/featured evidence items

Phase 2 后 master：

- source records / bindings：3,583 / 3,583
- field observations：36,737
- field resolutions：仍为 25,162
- Phase 2 evidence selected resolutions：0
- collision groups / places：仍为 8 / 16
- 二次导入核心表计数完全不增长
- backup/restore validator 再通过

历史 JS wrapper 现使用 `JSONDecoder.raw_decode()` 安全解析，不执行 JS，也不会被字符串内部的分号截断。

## Phase 3 — safe resolver + shadow export

状态：**已实现，等待 blocking smoke。**

### 3A. reviewed Hot Pepper practical fields

新增 `scripts/database/resolve_master.py`。第一批只允许 reviewed、非 conflict 的 Hot Pepper rich observations 进入 resolution，字段白名单：

- accepted credit cards
- special features
- mobile coupon availability
- nearest station
- access / mobile access
- lunch availability
- capacity / party capacity
- amenities

不在白名单内的 rich/core 字段不允许因此进入 resolution；source facts、provenance、dish evidence 继续保持 evidence-only。

### 3B. shadow catalog / recommendation export

新增：

- `scripts/database/export_master.py`
- `scripts/database/validate_export.py`

Shadow export 目前只用于 CI/比较，不接 Pages：

- `catalog.shadow.json`：必须保留全部 2,804，按 frozen catalog 原顺序。
- `recommendation.shadow.json`：只允许 `verified/source_matched + known name + 无 conflict binding`。
- id-only 必须 `name=null` 且不可 eligible。
- conflict binding Place ID 不得进入 recommendation。
- raw source payload / permission metadata 不进入 public shadow rows。

Export 同时带 `exclusionReasons`、`missingFields`、evidence count、database SHA-256 和 eligibility version，为后续旧/新 runtime diff 做准备。

### Phase 3 blocking checks

- safe practical resolution 数必须等于当前 reviewed rich observation 中白名单的 distinct `(Place ID, field)` 数。
- source facts / provenance / dish evidence 仍不得被选入 resolution。
- Hot Pepper rich 非 practical 字段不得被选入 resolution。
- importer + resolver 二次运行核心表计数不得增长。
- backup/restore 后 resolver 状态仍一致。
- shadow catalog 必须 exact 2,804；recommendation IDs 必须与 SQLite eligibility 计算完全一致。

通过后再考虑 resolver v2 的 hours/budget/dish semantic promotion，并做旧 runtime vs shadow export 差异报告。

## Refactor mode

旧 canonical/overlay/coverage/queue 检查继续 warning-only；成本、安全、语法、2,804 catalog、公开 unnamed-ID-only 禁止、Pages 可部署性与新 SQLite/export contract 始终 blocking。

## 后续数据补全

主库和 shadow export 稳定后，继续处理 id-only。第一优先是恢复真实名称/身份，其次地址/坐标/菜系、hours、budget、dish semantics 与 practical fields。不能仅凭空间邻近把 Overture/OSM 候选自动绑定到未知 Place ID。

## 开发纪律

每批实际开发同步更新本文件、数据库/架构文档和 `logs/`；测试未通过前只写“已实现/待验证”，通过后再标记完成。
