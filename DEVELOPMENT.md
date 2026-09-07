# Eat 开发状态与重构计划

更新日期：2026-09-07。

## 当前线上

- 2,804 Place ID 全部保留为 frozen catalog。
- 公开 runtime 为 1,411 条已有真实名称记录；1,393 条 ID-only 已下架，不使用“Google Maps 餐厅”伪名称。
- Hot Pepper runtime 已修复营业字段映射，hours coverage 363 → 716。
- 禁止付费数据 API、语法、catalog 完整性、Pages 可部署性继续 blocking。

## Phase 1 — persistent SQLite

状态：完成。

真实 SQLite、幂等重复导入、cross-layer identity collision、backup/restore 均已通过。统一主库发现 8 collision groups / 16 Place ID；conflict evidence 保留，但 known resolution 不选择 conflict binding，也不能擦除其他 non-conflict known value。

## Phase 2 — retained evidence

状态：完成。

已纳入 SQLite：575 provider facts、644 provenance links、135 Hot Pepper rich rows、283 dish evidence items。主库达到 3,583 source records/bindings、36,737 observations；Phase 2 evidence 首轮保持 0 direct resolutions，并通过重复导入/恢复验证。

## Phase 3 — safe practical resolver + shadow export

状态：**完成并通过 blocking smoke**。

Reviewed、非 conflict Hot Pepper rich metadata 已安全解析出 1,194 个 practical `(Place ID, field)` resolutions，覆盖 133 家店：

- access 133
- amenities 133
- capacity 133
- lunch available 133
- mobile access 133
- mobile coupon available 133
- nearest station 133
- accepted credit cards 117
- party capacity 107
- special features 39

field resolutions 从 25,162 增至 26,356，二次 importer/resolver 仍完全幂等，backup/restore 后 validator 一致。

Shadow export 也已验证：

- catalog 2,804 / frozen order exact
- recommendation 1,395
- 当前 public runtime 1,411
- shadow 比当前少 16 条，全部为存在 identity conflict binding 的 Place ID
- shadow 没有新增当前 public runtime 之外的 Place ID
- id-only 继续 name=null / ineligible

Shadow 仍只存在 CI artifact，不接 Pages。

## Phase 3B — Hot Pepper full practical derivation + runtime diff gate

状态：**已实现，等待 blocking smoke。**

新增 `derive_hotpepper_practical.py`，只从 reviewed `retained_hotpepper_artifact` raw observations 派生可明确解释的布尔 practical 字段：

- lunch availability
- course availability
- free drink availability
- free food availability
- private room availability
- card availability
- parking availability

只接受明确 `あり/なし` 或 `利用可/利用不可` 前缀；其他文本不推断。Derived observation 保存 `derived_from_observation_id` 和 `hotpepper-basic-practical-v1` rule version。

Rich practical resolver 在 derived pass 之后执行，因此同一 Hot Pepper 来源的 rich reviewed metadata 可覆盖较基础的 derived lunch state；其余字段使用独立 practical key。

新增 blocking validator：derived observation 数必须等于 reviewed raw facts 中可解析数量，不能来自 candidate/conflict binding，每个 derived `(Place ID, field)` 最终都必须有 known resolution。

新增 `compare_runtime_shadow.py`：要求 shadow recommendation 与当前 1,411 runtime 的差异只能是 conflict Place ID，并保持原 frozen/public 顺序。这个 gate 为未来 Pages cutover 做准备。

## 下一步

Phase 3B 通过后：

1. 更新文档记录实际 derived field counts；
2. 构建旧 runtime vs SQLite shadow 的字段级 diff（name/address/cuisine/budget/hours/dishes/practical）；
3. 继续 resolver v2：优先 hours/budget 的确定性规则，dish recommendation 仍保持高门槛；
4. 再决定何时将 SQLite recommendation export 接到 Pages；
5. 主库稳定后继续 1,393 id-only 的真实名称/身份补全，不能仅凭 Overture/OSM 空间邻近自动绑定。

## 开发纪律

每批实际开发同步更新本文件、数据库/架构文档和 `logs/`；测试未通过只标记“已实现/待验证”，通过后再标记完成。
