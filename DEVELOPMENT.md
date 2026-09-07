# Eat 开发状态与重构计划

更新日期：2026-09-07。

## 当前状态

项目处于整体数据流程重构阶段。长期主线保持为：公开/留存来源 → 原始记录 → Place ID binding → field observation/resolution → 本地 SQLite 主库 → catalog/recommendation 导出 → GitHub Pages。

当前线上已经完成第一轮过渡修复并通过 Pages build/deploy：

- 2,804 个 Place ID 继续全部保留为 frozen catalog。
- 公开 recommendation runtime 当前发布 1,411 条有真实名称记录。
- 1,393 条 `google_place_id_only` 已下架，不再显示“Google Maps 餐厅”伪名称；补到真实名称和基础身份后才重新发布。
- Hot Pepper 旧错误营业字段映射已修正，公开 runtime 的营业时间覆盖从 363 增至 716（恢复 353 条 retained 原文）。
- 旧 `N以上 -> N+2000` 伪预算上界已移除。

## Refactor mode

`EAT_REFACTOR_MODE=1` 继续启用。旧 canonical/overlay/完整度/queue 等架构耦合审查为 warning；以下仍为 blocking：付费数据 API 禁令、语法、2,804 catalog 完整性、明显越界/敏感字段泄漏、公开 runtime 不得含 unnamed ID-only、Pages 可部署性。

新架构自身的 SQLite smoke tests 为 blocking，即使处于 refactor mode 也不能跳过或改成 warning。

## Phase 0 — 线上保护

状态：已完成当前阶段并通过 CI。

- 旧 Pages 仍作为 fallback。
- Catalog membership 与 publication/recommendation eligibility 已分离。
- ID-only 仅留内部 catalog，不进入公开随机推荐。
- Hot Pepper 营业原文映射与开放预算过渡逻辑已修复。

## Phase 1 — persistent SQLite v1

状态：代码已实现，真实 SQLite 已连续暴露并修复两类旧分层模型没有发现的问题；当前等待第三次完整 smoke。

正式数据库工具：

- `database/migrations/001_initial.sql`
- `scripts/database/master_import_core.py`
- `scripts/database/build_master.py`
- `scripts/database/validate_master.py`

Importer 不联网，迁移：

1. 2,804 frozen catalog entries。
2. 651 条目录内 legacy canonical resolved snapshot；3 条目录外进入 `retained_exceptions`。
3. 760 retained basic source bindings。
4. 535 Hot Pepper retained full source records及其名称、地址、坐标、分类、预算、营业/休息日、交通和设施字段。
5. Hot Pepper budget band 结构化保存，开放上界为 `upper=null`。

### Persistent smoke 发现 1：跨层 source-ID collision

Basic-only 层原先记录 5 组 / 10 Place ID collision；把 basic 与 Hot Pepper full retained records 放进同一 SQLite 后实际发现 **8 组 / 16 Place ID**。

因此 importer 现在先跨全部本轮 retained source layer 建立 `provider + source_id -> Place IDs` 索引；所有碰撞 key 在全部 layer 中统一标为 conflict。Raw evidence 保留，但 known resolution 不能选择 conflict binding。

### Persistent smoke 发现 2：conflict 不能擦除其他来源的 known

8 组 collision 中有 3 个 Place ID 同时属于 651 条 legacy verified catalog。第二次 smoke 发现旧 resolver 会让较高优先级的 conflict observation 覆盖已有 non-conflict known name，从而出现 `resolvedNames < verified + sourceMatched`。

当前修复规则：

- conflict evidence / binding / observation 全部保留；
- identity/recommendation eligibility 仍可被 conflict 阻断；
- 但如果某字段已经从另一非 conflict binding 得到 `known` resolution，新 conflict observation 不擦除该 known value；
- validator 继续严格禁止 known resolution 指向 conflict binding。

固定“名称至少 1401”不再作为 blocking gate，因为更严格 collision 隔离可能合理降低可采用名称数量。Blocking invariant 改为 `resolved known names == verified + source_matched identities`；覆盖率继续报告但不冒充结构正确性。

### SQLite smoke test

Database workflow 必须完成：

1. 建立真实临时 SQLite；
2. `integrity_check` / `foreign_key_check`；
3. 2,804 catalog、651 legacy snapshot、3 exceptions、535 Hot Pepper records、535 hours/closure raw；
4. 动态识别全部 cross-layer collision，并要求所有相关 binding 为 conflict；
5. 要求 known resolution 不得选择 conflict binding；
6. 二次运行 importer，核心表计数完全不增长；
7. SQLite backup API 创建副本并再次完整验证。

这些都是 blocking gate。

## Phase 2 — retained source 扩展

SQLite v1 smoke 通过后继续导入：

- `source_facts.js`
- `source_provenance.js`
- `hotpepper_rich_metadata.js`
- `google_inventory_detail_evidence.json`
- 已绑定官网/公共来源 retained evidence

所有数据先成为 source record / observation，再由 resolver 选择，不再直接靠 JS overlay 顺序覆盖。

## Phase 3 — identity + field resolver

统一 resolver 根据 binding 状态、来源类型、时间、规则版本、冲突及 correction/retraction 选择 field resolution。`known / unknown / reviewed_none / not_applicable / conflict / retracted` 使用统一状态模型；derived field 保存来源 observation 和 transformation rule version。

## Phase 4 — 同版本双导出

- `catalog`：全部 2,804，允许名称待补/冲突。
- `recommendation`：只发布满足 eligibility 的记录，并记录 exclusion reason。

当前 1,411 条公开 runtime 是过渡实现；最终由 SQLite export 取代旧 builder。

## Phase 5 — Pages cutover

新 export 通过 ID 集合 diff、字段 provenance、浏览器行为、备份恢复后才切 Pages；同一批切换时再停用/归档旧 workflow 和 enrichment builders。

## Phase 6 — 恢复增量补全

新主库稳定后再批量补数据。最高优先级仍是 id-only 的名称/身份恢复，其次地址/坐标/菜系、营业时间、预算、菜单/推荐语义和实用字段。

## 开发纪律

每完成一批实际开发，同步更新 `DEVELOPMENT.md`、相关架构/数据文档和 `logs/`。文档只记录实际完成状态；测试未通过前不写成“已验证成功”。
