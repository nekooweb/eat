# Eat 开发状态与重构计划

更新日期：2026-09-07。

## 当前线上

- frozen catalog：2,804 Place ID 全部保留。
- 当前 Pages 发布逻辑：1,411 条已有真实名称记录；1,393 条 ID-only 已下架，不使用“Google Maps 餐厅”伪名称。
- Hot Pepper runtime 已修复营业字段映射；`N以上 -> N+2000` 伪预算上界已移除。
- Pages build/deploy 与 no-paid-data-API policy 继续通过。

## 已完成主库阶段

Persistent SQLite、retained evidence、cross-layer identity conflict、safe practical resolver、shadow catalog/recommendation、runtime-shadow membership diff 和字段级 diff 均已通过 blocking smoke。当前 master 为 2,804 catalog、3,583 source records/bindings、40,008 observations、29,501 resolutions；8 source-ID collision groups / 16 Place ID 全部隔离。

Shadow recommendation 为 1,395；当前 runtime 1,411，唯一 membership 差异是 16 个 conflict-binding Place ID。

## Cuisine 语义修复

Hot Pepper full source 的 535 条 provider genre 保留为 `cuisine_source`，不再直接覆盖 canonical cuisine。修复后共同 1,395 家的 cuisine diff 为 1,237 equal / 158 absentBoth / 0 changed；至少一个字段存在 runtime/shadow 差异的 Place ID 从 814 降到 595。

## Unified ingestion / review task plan

状态：已实现，等待 blocking smoke。

后续不再为补名字、补地址、补时间、补预算、补推荐菜分别建立散乱 queue/workflow。SQLite `ingestion_tasks` 保存执行状态，`ingestion_task_details` 保存 task type、priority、missing fields、payload、source hint、planner version 与 active state。

Planner：`scripts/database/plan_ingestion_tasks.py`。任务按优先级：

1. `identity_conflict_review`：全部 conflict-binding Place ID，最高优先级；当前应覆盖 16。
2. `identity_recovery`：全部 id-only，当前 1,393；只允许官网/已有公开 provider/公共身份来源，禁止付费 Google 数据 API，也禁止 proximity-only 自动绑定。
3. `field_completion`：verified/source-matched + known name + no conflict；每家一个任务，把 address/coordinates/cuisine/hours/lunch+dinner budget/practical 缺口合并，后续一次来源访问尽量全部提取。
4. `dish_semantic_review`：已有 recommendation/featured evidence 的店进入低优先级语义复核，不自动 promotion。

Task ID 由 `(task_type, Place ID)` 确定。重复 planner 不增长；旧计划不再需要时标记 inactive，不删除历史执行状态。

`validate_ingestion_plan.py` blocking 检查 active plan exact match、无逻辑重复、conflict/id-only 完整覆盖、field completion 不含 conflict/id-only、priority 严格为 conflict > identity > field > dish、source hint 不重新引入付费 Places/Text/Nearby API。Build、second build、backup/restore 都重复验证，并把 task tables 纳入幂等计数。

## 下一步

Task-plan smoke 通过后：记录实际 field-completion / dish-review 数和字段缺口；后续 collector 只消费 SQLite 任务；先复用 retained evidence，再使用验证过的免费公开来源。网络补全最高优先仍是 1,393 个 id-only identity recovery，但没有可靠身份锚点时不强行绑定。Resolver v2 继续优先确定性 budget/hours；dish recommendation 保持高门槛。Shadow 暂不切 Pages。

## Refactor mode

旧 canonical/overlay/coverage/queue 检查 warning-only；成本、安全、语法、2,804 catalog、公开 unnamed-ID-only 禁止、Pages 可部署性与新 SQLite/export/task contract 始终 blocking。

## 开发纪律

每批实际开发同步更新本文件、数据库/架构文档和 `logs/`；测试未通过只标记“已实现/待验证”，通过后再标记完成。
