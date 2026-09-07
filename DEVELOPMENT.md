# Eat 开发状态与重构计划

更新日期：2026-09-07。

## 当前线上

- frozen catalog：2,804 Place ID 全部保留。
- 当前 Pages 发布逻辑：1,411 条已有真实名称记录；1,393 条 ID-only 已下架，不使用“Google Maps 餐厅”伪名称。
- Hot Pepper runtime 已修复营业字段映射；`N以上 -> N+2000` 伪预算上界已移除。
- Pages build/deploy 与 no-paid-data-API policy 继续通过。
- Bulk recovery 目前只改变 SQLite/shadow；尚未把新恢复记录直接切到 Pages。

## 已完成主库阶段

Persistent SQLite、retained evidence、cross-layer identity conflict、safe practical resolver、shadow catalog/recommendation、runtime-shadow membership diff、字段级 diff 和 unified ingestion task plan 均已通过 blocking smoke。

Batch B 后已验证 master：

- 2,804 catalog；
- 4,439 source records / bindings；
- 46,013 observations；
- 30,673 resolutions；
- 10 source-ID collision groups / 20 Place ID 全部隔离；
- identity state：651 verified / 746 source_matched / 1,392 id_only / 15 conflict；
- active ingestion tasks：2,972。

## Unified ingestion / review task plan

Batch B 后任务：

1. `identity_conflict_review`：20；
2. `identity_recovery`：1,392；
3. `field_completion`：1,349；
4. `dish_semantic_review`：211。

当前 field-completion 缺口：address 337、coordinates 1、cuisine 1、dinner budget 795、hours 679、lunch budget 1,228、practical 912。

## Bulk completion — Batch A：retained official identity recovery

状态：**完成并通过 blocking CI**。Commit：`f43cffbae4d73ac2e9fc73929cc02d2915d4838c`。

- retained official input：194；
- reviewed：193；
- conflict deferred：1；
- 新恢复 id-only：1；
- `id_only 1393 -> 1392`；
- shadow recommendation `1395 -> 1396`；
- unsafe shadow additions：0。

恢复 Place ID：`ChIJ2yzmKgCNGGARujgyaVuRhy8`。

## Bulk completion — Batch B：retained verified OSM identity QC

状态：**完成并通过 blocking CI**。Commit：`6aa04eb3cafffdf0c683f75035c65215365321b9`。

历史 verified OSM mapping 与独立 OSM candidate 精确 join：

- verified pairs：662；
- reviewed：657；
- candidate deferred：3；
- conflict bindings：2；
- missing OSM candidate：0；
- 新恢复 id-only：0。

这批没有解决新的 ID-only，因为 662 条 historical verified mapping 均落在已有身份集合中；但它补充了大量 retained OSM field observations，并暴露了此前跨层未识别的 2 组 native source-ID collision，使：

- collision groups：8 -> **10**；
- conflict Places：16 -> **20**；
- source_matched：748 -> **746**；
- conflict identity：13 -> **15**。

字段效果：

- `hours.raw` 总 observation：867 -> **998**；
- field task 的 hours 缺口：689 -> **679**；
- address 缺口：339 -> **337**；
- lunch budget 缺口：1,231 -> **1,228**；
- dinner budget 缺口：797 -> **795**；
- practical 缺口：916 -> **912**。

Shadow recommendation 因新增冲突隔离从 1,396 变为 **1,392**；当前 runtime 1,411 与 shadow 的 current-only 正好是 20 个 conflict Place ID，unsafe additions 仍为 0。

结论：现有 retained official/OSM 身份证据已经基本吃尽，剩余 **1,392 ID-only** 需要后续免费公开来源发现；但在开始新网络采集前，先把已确认身份的 retained 字段彻底利用完。

## Bulk completion — Batch C：deterministic retained-field resolver v2

状态：**已实现，等待 blocking CI 实际计数**。

新增 `resolve_retained_fields.py`，只对当前 `verified/source_matched` 且无任何 identity conflict 的 Place ID 工作。输入只接受 `retained_source_fact_overlay` 中 provider 为 `official` 或 `Tabelog` 的 observation。

### Missing-only 规则

只填补当前产品逻辑真正缺失的字段：

- `address`；
- `cuisine`；
- `hours.raw`（只有 `hours.raw / hours.reference.legacy / hours.normalized.legacy` 全缺时）；
- `budget.lunch.range`（只有 canonical + legacy lunch 都缺时）；
- `budget.dinner.range`（只有 canonical + legacy dinner 都缺时）；
- `closure.raw` / `closure.days.raw`。

任何已有 known 值都不覆盖。因此 Batch C 的目标是缩小 missing task，而不是强行把旧 runtime 改写成另一套来源值。

### Provenance / semantic gate

每个 promoted field 必须：

- provider ∈ `official / Tabelog`；
- source fact 的 `claimedFields` 明确支持该字段；
- retained source link 至少有一个 HTTPS URL；
- value 通过字段类型检查；预算 range 必须非负且 `upper >= lower`；
- Place ID 已可发布且无 identity conflict。

采用时新建 field-only derived source record / reviewed binding；它**不参与身份升级**。Derived observation 保存 `derived_from_observation_id` 和 `retained-field-resolver-v2` transformation rule，并要求值与原 retained observation 完全一致。

新增 `validate_retained_field_resolver.py` blocking validator，first build、repeat/idempotence、backup/restore 都检查 provenance、identity、binding、value、rule version 与 selected resolution。

Batch C 实际补齐数量和 task 缩减量以本提交 CI 为准；通过后写回真实数字。

## 后续批量补齐

Batch C 后：

1. 根据剩余 field tasks 决定是否再做 retained Hot Pepper / official practical resolver；
2. 启动 **Batch D public-source collector**，主要目标为剩余 1,392 个 id-only；
3. identity recovery 只能使用官网/公共 provider/可验证公开身份来源，不能 proximity-only，不能恢复付费 Google Places/Text/Nearby API；
4. 一次确认来源访问尽量提取 name/address/coordinates/cuisine/hours/budget/practical/menu 全部支持字段；
5. dish recommendation 继续最后处理，保持严格推荐语义门槛。

Shadow 暂不切 Pages。正式切换仍需字段 diff、浏览器回归、backup/restore 和 provenance 验收。

## Refactor mode

旧 canonical/overlay/coverage/queue 检查 warning-only；成本、安全、语法、2,804 catalog、公开 unnamed-ID-only 禁止、Pages 可部署性与新 SQLite/export/task/recovery/resolver contract 始终 blocking。

## 开发纪律

每批实际开发同步更新本文件、数据库/架构文档和 `logs/`；测试未通过只标记“已实现/待验证”，通过后再标记完成并记录真实数量。
