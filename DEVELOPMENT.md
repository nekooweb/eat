# Eat 开发状态与重构计划

更新日期：2026-09-07。

## 当前状态

项目处于整体数据流程重构阶段。长期主线：公开/留存来源 → versioned source record → Place ID binding → field observation/resolution → 本地 SQLite master → catalog/recommendation export → GitHub Pages。

线上过渡层已完成并验证：

- frozen catalog 继续保留全部 2,804 Place ID；
- 公开 runtime 只发布 1,411 条已有真实名称记录；
- 1,393 条 `google_place_id_only` 已下架，不再显示“Google Maps 餐厅”伪名称；
- Hot Pepper 营业字段使用真实 `openingHoursText` / `closedText`，公开 hours coverage 从 363 增至 716；
- 旧 `N以上 -> N+2000` 伪预算上界已移除。

## Refactor mode

`EAT_REFACTOR_MODE=1` 继续启用。旧 canonical/overlay/coverage/queue 等架构耦合检查为 warning；付费 API 禁令、语法、2,804 catalog 完整性、公开 runtime 不得包含 unnamed ID-only、明显越界/敏感字段泄漏、Pages 可部署性仍为 blocking。

新 SQLite 架构自身的 smoke tests 始终 blocking，不随 refactor mode 降级。

## Phase 0 — 线上保护

状态：完成并通过 CI/Pages deploy。

Catalog membership 与 publication eligibility 已分离；ID-only 保留内部身份但不上架。旧 Pages 继续作为 fallback，直到 SQLite export 完成 cutover。

## Phase 1 — persistent SQLite v1

状态：**已完成并通过真实 persistent smoke、幂等导入与 backup/restore**。

正式工具：

- `database/migrations/001_initial.sql`
- `scripts/database/master_import_core.py`
- `scripts/database/build_master.py`
- `scripts/database/validate_master.py`

当前通过的主库基线：

- catalog: 2,804
- legacy canonical migration snapshots: 651
- outside-catalog retained exceptions: 3
- source records / bindings: 1,946 / 1,946
- field observations: 28,992
- field resolutions: 25,162
- verified identities: 651
- source-matched identities: 747
- conflict identity state: 13
- id-only: 1,393
- resolved names: 1,398
- Hot Pepper full retained records: 535
- Hot Pepper raw hours / closures: 535 / 535
- normalized Hot Pepper budget observations: 530

统一主库发现旧 basic-only QC 没看到的跨层冲突：basic 层原先 5 组 / 10 Place ID，合并 retained layers 后为 8 组 / 16 Place ID。所有 collision source binding 均隔离为 conflict，且 validator 要求任何 known resolution 都不能直接选择 conflict binding。

另外已经确认 resolver 的 monotonic rule：新 conflict evidence 保留，但不能擦除另一 non-conflict binding 已建立的 known field value。

Smoke test 已验证：第一次 build、第二次重复 import 核心表计数完全不增长、SQLite backup API 副本 integrity/FK/全部主库 validator 再通过。

## Phase 2 — retained evidence 扩展

状态：**代码已实现，正在进入 blocking smoke；在验证通过前不改变当前 field resolutions。**

新增 `scripts/database/retained_phase2.py`，将旧 JS/JSON overlay 迁移为真正 source record / observation：

1. `source_facts.js`：当前 575 条 provider fact records。
2. `source_provenance.js`：当前 644 条公开 source links。
3. `hotpepper_rich_metadata.js`：当前 135 条 reviewed rich metadata。
4. `google_inventory_detail_evidence.json`：当前 283 个 recommendation/featured evidence items。

### Phase 2 的身份原则

- Hot Pepper native `hotpepperId` 继续参加跨 layer collision discovery。
- Tabelog/official URL 只作为 provenance/evidence，不当作 branch identity primary key，因为一个菜单/品牌页可能支持多个分店。
- Source facts 与 provenance 使用 synthetic retained record IDs，保持 evidence 可追踪但不制造错误 identity merge。
- Hot Pepper rich metadata 保留真实 shop ID 和 reviewed binding；若 native ID collision 则仍是 conflict。

### Phase 2 的采用原则

这批数据先进入 evidence layer，不直接修改现有 field resolutions：

- source facts → candidate observations；
- provenance links → candidate provenance observations；
- rich metadata → reviewed binding + rich/practical observations，但 core resolution 暂不改变；
- dish evidence → candidate recommendation/featured evidence observations，严格推荐语义留给后续 resolver。

Validator 会从当前输入动态计算应导入数量，并要求：Phase 2 source record 数与输入完全一致，且这些新 evidence 在这一阶段 **0 条直接进入 field resolution**。

## Phase 3 — resolver v2

Phase 2 smoke 通过后开始字段级 resolver，而不是继续靠 overlay 顺序。重点：

- direct source 与 legacy migration snapshot 的字段级优先规则；
- source recency / correction / retraction；
- hours raw → normalized hours 的可验证 parser；
- budget meal/bounds/evidence semantics；
- recommendation / featured / signature / representative dish semantic separation；
- identity conflict 与 field conflict 分开。

## Phase 4 — catalog / recommendation 双导出

- catalog export：全部 2,804，允许 name missing / conflict，并显示 exclusion/missing state；
- recommendation export：仅发布满足 eligibility 的记录。

最终由 SQLite export 替换当前 `google_inventory_runtime.js` 过渡 builder。

## Phase 5 — Pages cutover

新 export 必须通过：ID set diff、field provenance、浏览器行为、旧/新推荐结果差异、backup restore，再切 Pages。切换批次才停用/归档旧 enrichment builders/workflows。

## Phase 6 — 新增/补全数据

主库与 resolver 稳定后再恢复网络增量补全。第一优先仍是 1,393 个 id-only 的名称/身份恢复；其次地址/坐标/菜系、营业时间、预算、菜单/推荐语义和实用字段。一个已确认来源尽量一次提取所有可支持字段。

## 开发纪律

每完成一批实际开发，同步更新 `DEVELOPMENT.md`、相关数据库/架构文档和 `logs/`。测试未通过的功能只写“已实现/待验证”，通过后再改为“已验证”。
