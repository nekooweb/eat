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

Batch A 后已验证 master：

- 2,804 catalog；
- 3,777 source records / bindings；
- 40,055 observations；
- 29,695 resolutions；
- 8 source-ID collision groups / 16 Place ID 全部隔离；
- identity state：651 verified / 748 source_matched / 1,392 id_only / 13 conflict。

## Cuisine 语义修复

Hot Pepper full source 的 535 条 provider genre 保留为 `cuisine_source`，不再直接覆盖 canonical cuisine。上一稳定 diff 中共同 1,395 家的 cuisine 为 1,237 equal / 158 absentBoth / 0 changed。

## Unified ingestion / review task plan

状态：完成并通过 blocking smoke。

Batch A 后 active task 仍为 2,972，但组成发生了正确迁移：

1. `identity_conflict_review`：16；
2. `identity_recovery`：**1,392**；
3. `field_completion`：**1,353**；
4. `dish_semantic_review`：211。

总任务数没有下降是因为 1 家成功恢复身份后，任务从 identity recovery 转成了 field completion；这符合 planner 设计。当前 field-completion 缺口为 address 339、coordinates 1、cuisine 1、dinner budget 797、hours 689、lunch budget 1,231、practical 916。

## Bulk completion — Batch A：retained official identity recovery

状态：**完成并通过 blocking CI**。

输入 `data/official_candidate_index.json` 共 194 条有效 retained official identity 记录：

- 193 reviewed；
- 1 因当前 identity conflict 延后为 candidate；
- 0 outside catalog；
- 新恢复 id-only：**1**；
- `id_only 1393 -> 1392`；
- `source_matched 747 -> 748`；
- shadow recommendation `1395 -> 1396`；
- unsafe shadow additions：**0**。

实际新增恢复 Place ID：`ChIJ2yzmKgCNGGARujgyaVuRhy8`。

这说明官网 retained index 的质量高，但 193/194 主要覆盖已有名称记录，因此它更适合作为高优先 provenance/name 校正层，而不是解决剩余 1,392 个 id-only 的主要来源。

## Bulk completion — Batch B：retained verified OSM identity QC

状态：**已实现，等待 blocking CI 实际计数**。

新增 `retained_osm_identity.py`，复用两个已经存在的 retained 层：

1. `google_entities.generated.js`：只读取历史 `sourceId / verified status / Google Place ID / qcVersion`，不读取或恢复 Google display payload；
2. `area1_osm.js`：从独立 OpenStreetMap candidate 取得真正要持久化的 name/address/coordinates/cuisine/tags/hours/distance。

安全规则：

- 只接受历史 `status=verified` 的 mapping；
- Google Place ID 必须属于当前 frozen 2,804；
- QC sourceId 必须能精确找到同一个 OSM candidate row；
- OSM source ID 若历史上绑定多个 Place ID，会在**导入 basic bindings 前**进入 cross-layer collision index，所有相关 binding 必须 conflict；
- Place ID 已存在其他 identity conflict 时，新 OSM 证据只 candidate，不自动 promotion；
- 只有 reviewed verified mapping 才能 `id_only -> source_matched`；
- 不允许根据距离近自动绑定；
- 本批不发起任何 Google Places/Text/Nearby API 请求。

新增 `validate_osm_identity.py` blocking 检查 retained pair 完整性、OSM URL、禁止 Google display key、collision quarantine、selected field 必须来自 reviewed binding、id-only 不得拥有 selected name。

Shadow comparison 的 approved recovery method 同步加入 `retained_verified_osm_identity_qc`；除此之外的新 shadow-only 条目仍 blocking fail。

## 下一批

Batch B 通过后：

1. 记录 OSM 实际恢复数量、剩余 id-only、field task 变化及新增 hours/address/coordinates/cuisine 覆盖；
2. 进入 **Batch C deterministic field resolver v2**，利用 retained official / Tabelog / Hot Pepper facts 填补已确认身份条目的 address/hours/budget/practical 缺口；
3. retained evidence 用尽后才开始网络 public-source collector；
4. dish recommendation 继续保持低优先级和严格语义审查。

Shadow 暂不切 Pages。正式切换仍需字段 diff、浏览器回归、backup/restore 和 provenance 验收。

## Refactor mode

旧 canonical/overlay/coverage/queue 检查 warning-only；成本、安全、语法、2,804 catalog、公开 unnamed-ID-only 禁止、Pages 可部署性与新 SQLite/export/task/recovery contract 始终 blocking。

## 开发纪律

每批实际开发同步更新本文件、数据库/架构文档和 `logs/`；测试未通过只标记“已实现/待验证”，通过后再标记完成并记录真实数量。
