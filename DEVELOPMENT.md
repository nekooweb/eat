# Eat 开发状态与重构计划

更新日期：2026-09-07。

## 当前线上

- frozen catalog：2,804 Place ID 全部保留。
- 当前 Pages 发布逻辑：1,411 条已有真实名称记录；1,393 条 ID-only 已下架，不使用“Google Maps 餐厅”伪名称。
- Hot Pepper runtime 已修复营业字段映射；`N以上 -> N+2000` 伪预算上界已移除。
- Pages build/deploy 与 no-paid-data-API policy 继续通过。

## 已完成主库阶段

Persistent SQLite、retained evidence、cross-layer identity conflict、safe practical resolver、shadow catalog/recommendation、runtime-shadow membership diff、字段级 diff 和 unified ingestion task plan 均已通过 blocking smoke。

最近一次已验证 master 基线：

- 2,804 catalog；
- 3,583 source records / bindings；
- 39,473 observations；
- 29,501 resolutions；
- 8 source-ID collision groups / 16 Place ID 全部隔离；
- identity state：651 verified / 747 source_matched / 1,393 id_only / 13 conflict；
- active ingestion tasks：2,972。

Shadow recommendation 为 1,395；当前 runtime 1,411，上一基线的唯一 membership 差异是 16 个 conflict-binding Place ID。

## Cuisine 语义修复

Hot Pepper full source 的 535 条 provider genre 保留为 `cuisine_source`，不再直接覆盖 canonical cuisine。修复后共同 1,395 家的 cuisine diff 为 1,237 equal / 158 absentBoth / 0 changed；至少一个字段存在 runtime/shadow 差异的 Place ID 从 814 降到 595。

## Unified ingestion / review task plan

状态：完成并通过 blocking smoke。

SQLite `ingestion_tasks` / `ingestion_task_details` 已成为统一补全队列。当前任务：

1. `identity_conflict_review`：16；
2. `identity_recovery`：1,393；
3. `field_completion`：1,352；
4. `dish_semantic_review`：211。

当前 field-completion 缺口：address 338、dinner budget 796、hours 688、lunch budget 1,230、practical 915。Task ID 由 `(task_type, Place ID)` 确定，重复 planner 不增长，旧任务仅 deactivate 不删除历史状态。

## Bulk completion — Batch A：retained official identity recovery

状态：已实现，等待 blocking CI 实际计数。

新增 `scripts/database/retained_official_identity.py`，开始真正消费 identity-recovery 任务。输入为已经留存在仓库中的 `data/official_candidate_index.json`，该索引只包含此前独立抓取成功、被分类为 candidate official host、且页面名称匹配的 HTTPS 页面。

自动恢复条件：

- Place ID 必须属于冻结 2,804 catalog；
- 店名非空；
- page URL 必须为 HTTPS；
- 排除 Google、Tabelog、Hot Pepper、Retty、Tripadvisor、社交媒体等非官网 host；
- 当前 Place ID 不得存在 identity conflict；
- 不使用索引里的 discovery distance 作为身份或字段事实；
- 不发起任何新的 Google Places / Text Search / Nearby Search 数据 API 请求。

满足条件时建立 versioned official source record、reviewed binding、name/source URL observations，并允许 `id_only -> source_matched`。已有 identity conflict 的官方证据只保存为 candidate，不能自动解除冲突或进入 recommendation。

新增 `validate_official_identity.py` 作为 blocking validator；shadow/runtime comparison 也改为只允许来自明确 approved recovery method 的新增条目。未被批准的 shadow-only ID 仍直接失败。

本批实际恢复数量、identity/task 下降量和 shadow recommendation 增量以 CI 结果为准；测试通过后再写成完成状态。

## 后续批量补齐顺序

Batch A 通过后继续：

1. **Batch B — retained verified OSM identity QC**：复用历史已验证 `sourceId -> Place ID` QC，再从 OSM retained candidate 取得 name/address/coordinates/cuisine/hours；严禁 proximity-only 自动绑定。
2. **Batch C — deterministic field resolver v2**：对已经确认身份、无冲突的餐厅，从 retained official / Tabelog / Hot Pepper facts 中只填补缺失 address/hours/budget/practical 等确定字段。
3. **Batch D — public-source collector**：只有 retained evidence 用尽后才消费仍 active 的 SQLite tasks；一次已确认来源访问提取全部可支持字段。
4. **Dish semantic review** 保持低优先级和高门槛，不因为存在菜名 evidence 就自动变成“推荐菜”。

Shadow 暂不切 Pages。批量 recovery 可以让新条目进入 shadow，但正式 Pages 切换仍需字段 diff、浏览器回归、backup/restore 和 provenance 验收。

## Refactor mode

旧 canonical/overlay/coverage/queue 检查 warning-only；成本、安全、语法、2,804 catalog、公开 unnamed-ID-only 禁止、Pages 可部署性与新 SQLite/export/task/recovery contract 始终 blocking。

## 开发纪律

每批实际开发同步更新本文件、数据库/架构文档和 `logs/`；测试未通过只标记“已实现/待验证”，通过后再标记完成并记录真实数量。
