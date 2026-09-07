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

状态：代码已实现；第一次真实 SQLite smoke 成功建立数据库，但严格 validator 发现跨 retained layer 的新增身份冲突，正在按冲突结果修正后重跑。

新增正式数据库工具：

- `database/migrations/001_initial.sql`
- `scripts/database/master_import_core.py`
- `scripts/database/build_master.py`
- `scripts/database/validate_master.py`

第一版 importer 不联网，直接迁移仓库已有 retained inputs：

1. 2,804 个 frozen catalog entries。
2. 651 条目录内 legacy canonical resolved snapshot；它只作为迁移基线，不伪装成新的外部来源。
3. 旧 canonical 中 3 条目录外记录进入 `retained_exceptions`，不自动扩展 catalog。
4. 760 条 retained basic source bindings。basic 层原先已知 5 组 / 10 Place ID 来源 ID 复用。
5. 535 条 Hot Pepper retained source records，保存名称、地址、坐标、分类、预算、营业/休息日原文、交通和设施等字段。
6. Hot Pepper budget band 生成显式结构化 observation；开放上界使用 `upper=null`。

### 第一次 persistent smoke 的新发现

真实数据库已经成功构建并得到：2,804 catalog、651 legacy snapshot、3 exceptions、760 basic bindings、535 Hot Pepper full records、535 hours raw 和 535 closure raw observations。

严格 validator 将 basic 与 Hot Pepper full records 联合后发现：来源 ID collision 不止 basic 层原先的 5 组 / 10 Place ID，而是 **8 组 / 16 Place ID**。这不是 schema build 失败，而是旧分层检查未暴露的跨层 identity conflict。

处理原则：不降低测试、不忽略新增冲突。`build_master.py` 现在先跨全部 retained source layer 建 provider/source-ID → Place-ID 索引；任何同一来源 ID 指向多个 Place ID 的 key 都统一进入 conflict。原始 evidence 保留，但 resolver 不允许从 conflict binding 选择 known field。

数据库文件本身为本地/临时产物，`*.sqlite`、`_local/`、`_tmp/` 已加入 `.gitignore`，不会被提交到 Pages。

### SQLite smoke test

新 database workflow 执行：

1. 建立真实临时 SQLite 文件；
2. 校验 `integrity_check` / `foreign_key_check`；
3. 校验 2,804 catalog、651 legacy snapshot、3 exceptions、535 Hot Pepper records、535 hours/closure raw observations；
4. 动态识别全部跨层 collision，并要求所有相关 source binding 都是 conflict；
5. 要求任何 known resolution 都不能选自 conflict binding；
6. 再运行一次 importer，要求核心表计数完全不增长；
7. 用 SQLite backup API 创建恢复副本并再次完整验证。

这些检查是新架构的 blocking gate，不跟随旧审查一起降级。

## Phase 2 — retained source 扩展

SQLite v1 smoke 通过后继续导入：

- `source_facts.js`
- `source_provenance.js`
- `hotpepper_rich_metadata.js`
- `google_inventory_detail_evidence.json`
- 已绑定的官网/公共来源 retained evidence

所有数据先成为 source record / observation，再由 resolver 选择，不再直接靠 JS overlay 顺序覆盖。

## Phase 3 — identity + field resolver

统一 resolver 根据 binding 状态、来源类型、时间、规则版本、冲突及 correction/retraction 选择 field resolution。`known / unknown / reviewed_none / not_applicable / conflict / retracted` 使用统一状态模型；derived field 保存来源 observation 和 transformation rule version。

## Phase 4 — 同版本双导出

- `catalog`：全部 2,804，允许名称待补/冲突。
- `recommendation`：只发布满足 eligibility 的记录，并记录 exclusion reason。

当前 1,411 条公开 runtime 是这一逻辑的过渡实现；最终由 SQLite export 取代旧 `google_inventory_runtime.js` builder。

## Phase 5 — Pages cutover

新 export 通过 ID 集合 diff、字段 provenance、浏览器行为、备份恢复后才切 Pages；同一批切换时再停用/归档旧 workflow 和 enrichment builders。

## Phase 6 — 恢复增量补全

新主库稳定后再批量补数据。当前最高优先级仍是 1,393 个 id-only 的名称/身份恢复，其次地址/坐标/菜系、营业时间、预算、菜单/推荐语义和实用字段。

## 开发纪律

每完成一批实际开发，同步更新 `DEVELOPMENT.md`、相关架构/数据文档和 `logs/`。文档只记录实际完成状态；测试未通过前不写成“已验证成功”。
