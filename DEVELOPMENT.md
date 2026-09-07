# Eat 开发状态与重构计划

更新日期：2026-09-07。

## 当前线上

- 2,804 Place ID 全部保留为 frozen catalog。
- Pages 当前发布逻辑为 1,411 条已有真实名称记录；1,393 条 ID-only 已下架，不使用“Google Maps 餐厅”伪名称。
- Hot Pepper runtime 已修正 `openingHoursText` / `closedText`，hours coverage 363 → 716。
- `N以上 -> N+2000` 伪预算上界已移除。
- no-paid-data-API、语法、catalog 完整性、Pages 可部署性继续 blocking。

## Phase 1 — persistent SQLite

状态：完成并通过 blocking smoke。

统一主库已验证真实 SQLite build、二次幂等 import、8 组 / 16 Place ID cross-layer identity collision 隔离、known-value monotonic retention 以及 SQLite backup/restore。

## Phase 2 — retained evidence

状态：完成并通过 blocking smoke。

已纳入 SQLite：575 provider facts、644 provenance links、135 Hot Pepper rich rows、283 dish evidence items。Phase 2 首轮不直接改变 field resolution；主库达到 3,583 source records/bindings 与 36,737 observations。

## Phase 3 — safe practical resolver + shadow export

状态：完成并通过 blocking smoke。

Reviewed、非 conflict Hot Pepper rich metadata 已安全采用 1,194 个 practical `(Place ID, field)` resolutions，覆盖 133 家店。Shadow export 已验证：catalog exact 2,804；SQLite recommendation 1,395；id-only 保持 name=null / ineligible；16 个 conflict-binding Place ID 不进入 recommendation。

## Phase 3B — Hot Pepper full practical derivation

状态：**数据派生、主库验证、幂等与 backup/restore 已通过；runtime-shadow diff 测试输入已修正，等待最终重跑。**

从 473 个 reviewed `retained_hotpepper_artifact` source 中保守派生：

- `practical.lunch_available`: 473
- `practical.course_available`: 433
- `practical.free_drink_available`: 473
- `practical.free_food_available`: 473
- `practical.private_room_available`: 473
- `practical.card_available`: 473
- `practical.parking_available`: 473

合计 **3,271 条 derived observations / 3,271 distinct place-fields**。每条都保留 `derived_from_observation_id` 和 `hotpepper-basic-practical-v1` rule version；candidate/conflict binding 不参加派生。

Phase 3B 后主库实测：

- source records / bindings: 3,583 / 3,583
- field observations: 40,008
- field resolutions: 29,501
- rich practical resolutions: 1,194
- cross-layer collision groups / places: 8 / 16
- second import count-stable
- backup/restore validator pass

### 当前唯一失败：runtime-shadow compare 输入使用了旧生成文件

Database workflow 的最终 compare 第一次失败，因为仓库跟踪的 `data/google_inventory_runtime.js` 仍是旧的 2,804-row generated snapshot；真正 Pages build 会先运行当前 builder，把它重建为 1,411-row named runtime。因此 compare 实际拿了错误的 stale input，报告 `currentPublicRows=2804`，而不是当前发布逻辑的 1,411。

修复：database workflow 现在增加 Node 22，并在 compare 前临时运行 `node scripts/build_google_inventory_runtime.mjs`。该文件只在 CI runner 工作区重建，不提交仓库。随后再执行 `compare_runtime_shadow.py`，要求：

- current runtime 1,411；
- shadow recommendation 1,395；
- current-only 必须恰好是 16 个 conflict-binding Place ID；
- shadow-only 必须为 0；
- 移除 conflict 后顺序必须完全一致。

Phase 3B 在该最终 diff gate 通过前仍不标记全部完成。

## 下一步

Phase 3B 最终通过后：

1. 生成旧 runtime vs SQLite shadow **字段级 diff**，不是只比较 ID：name/address/coordinates/cuisine/budget/hours/dishes/practical；
2. 根据 diff 选择 resolver v2 的安全升级项；优先明确 budget/hour 规则，dish recommendation 继续保持高门槛；
3. shadow export 保持不接 Pages，直到字段差异和浏览器回归明确；
4. 主库和 resolver 稳定后继续处理 1,393 个 id-only 的真实名称/身份补全；不得仅凭 Overture/OSM 空间邻近自动绑定。

## Refactor mode

旧 canonical/overlay/coverage/queue 检查继续 warning-only；成本、安全、语法、2,804 catalog、公开 unnamed-ID-only 禁止、Pages 可部署性与新 SQLite/export contract 始终 blocking。

## 开发纪律

每批实际开发同步更新本文件、数据库/架构文档和 `logs/`；测试未通过只标记“已实现/待验证”，通过后再标记完成。
