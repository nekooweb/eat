# 主数据库输入、处理与输出流程

更新日期：2026-09-07。

## 0. 重构期运行模式

当前进入 `EAT_REFACTOR_MODE=1`。整体流程修改期间只把成本、安全、语法、冻结目录完整性和当前 Pages 可部署性作为硬门槛。旧 canonical shape、overlay 一致性、coverage、旧推荐优先队列、旧 normalized-field 规则等改为 warning/report，避免旧模型阻断新模型开发。

Refactor mode 是临时兼容策略。切换新主库前必须重新建立新架构 strict checks，并将 warning 项逐步归零或明确迁移替代。

## 1. 唯一数据方向

公开来源 / 已有留存资料
→ versioned raw records
→ identity bindings
→ field observations
→ resolver
→ field resolutions
→ local SQLite master
→ catalog/recommendation exports
→ GitHub Pages

GitHub 保存代码、schema、文档、输入快照和发布 export；本地 SQLite 是唯一可写目标主库。Actions 临时目录、Pages JS 和旧 enrichment shards 都只能作为输入/派生物，不再作为事实主库。

## 2. 迁移输入与快照

正式迁移必须固定 source commit，并记录每个输入文件的 Git blob SHA、字节数和 SHA-256。旧文件保留原貌，不直接覆盖。

当前已接入主库的 retained 输入包括：

- `data/area1_google_ids.json`
- `data/google_basic_source_matches.json`
- `data/hotpepper_catalog_facts.json`
- `data/hotpepper_rich_metadata.js`
- `data/source_facts.js`
- `data/source_provenance.js`
- `data/google_inventory_detail_evidence.json`
- `data/official_candidate_index.json`
- 旧 canonical / historical exception 数据

`official_candidate_index.json` 只作为此前**独立抓取并完成官网候选/name-match 筛选**后的 retained identity evidence；不会重新请求 Google 数据 API，也不会把 discovery distance 当成官网事实。

现有旧数据文件继续作为审计输入保存；新主库建立后再逐步判断哪些可以归档。

## 3. Catalog 导入

以冻结 2,804 Place ID 建立 catalog。要求：

- 数量保持 2,804；
- Place ID 唯一；
- 保留 membership snapshot；
- id-only 使用 `name=null`；
- 不因为缺失字段、冲突或来源访问失败删除目录条目。

旧核心库中 3 条不属于冻结目录的记录进入 retained exception 区，不自动扩展 scope。

## 4. Source records

每条来源记录保存：

- provider / provider_id；
- source URL；
- raw payload 或 retained raw text；
- observed_at / ingested_at；
- content hash；
- parser version；
- retrieval method；
- permission/licensing note（如适用）。

相同 provider ID 的不同内容版本分别保存，不用覆盖式更新破坏历史。

## 5. Identity bindings

Binding 与 source record 分离。状态至少包含 candidate、reviewed、conflict、retracted。

Retained provider/source-ID 复用必须先形成 cross-layer collision index；同一 native provider ID 对应多个 Place ID 时全部进入 conflict，不能因为旧记录写着 `strong` 就自动选择 canonical identity。

空间距离只能作为约束，不单独证明同一店。多分店、同楼层、同品牌、重复 listing 必须保留审查状态。

### 5.1 Retained official identity recovery

Bulk completion 首先消费已经留存的官网验证索引。自动 `id_only -> source_matched` 必须同时满足：

1. Place ID 属于冻结 catalog；
2. retained name 非空；
3. retained page URL 是 HTTPS；
4. host 不属于 Google / 聚合站 / 社交媒体；
5. 该索引来源此前已完成独立页面抓取、candidate-official 分类和 name-match；
6. 当前 Place ID 没有任何 identity conflict。

导入时建立 `retained_verified_official_identity_index` source record 和 reviewed binding。存在 conflict 时只以 candidate 保存证据，不自动清除 conflict。索引中的 discovery distance 不写入 `distance_m`，防止把来源发现过程误写成官网字段。

Shadow 可以因这一 approved recovery method 新增推荐候选，但 regression validator 必须验证：新增条目的 selected name 确实来自 reviewed approved source；否则 blocking fail。

## 6. Field observations

所有字段先入 observation，不直接写最终网页字段。

### 名称/地址/坐标

必须来自与 Place ID 明确绑定的来源记录。来源字段保持 provider identity，不伪装成 Google 提供。

### 营业时间

- `openingHoursText` 保存 raw hours text；
- `closedText` 保存 raw closure text；
- weekly normalized schedule 独立生成；
- 临时休业、节假日、活动通知独立存储。

Hot Pepper retained hours/closure 已作为回归迁移输入；原文可入库，不预设全部可转换成每周时段。

### 预算

保存 meal、currency、lower、upper、inclusive/open bound、raw text 和 evidence type。

`N以上` 必须表示 lower=N、upper=null；禁止生成 `N+2000`。

### 菜品/推荐

菜单 item、featured、signature、recommended 分开。只有存在明确推荐/招牌/名物语义和具体菜名关联时，才能进入 strict recommendation resolution。

## 7. Resolver

Resolver 是新架构的核心。最终值不得由文件导入顺序决定。

输入包括 binding state、observation state、source/provider、observed_at、parser/resolver rule version、correction/retraction、conflict state。

输出包括 selected observation、resolution state、rule version、reason/conflict note。

新空值、网络失败、页面无法访问不得清除旧 known resolution。Identity conflict 的 observation 不得成为 known selected value。

## 8. Derived fields

规范化 cuisine、distance、translated display name 等必须记录 derived provenance：source observation(s)、transformation rule、rule version、generated_at。

Derived 值不能伪装成 source raw field。

## 9. Unified ingestion tasks 与批量补齐

所有补全工作由 SQLite task plan 统一表达，不再按字段建立互相覆盖的旧 queue。

执行优先级：

1. `identity_conflict_review`；
2. `identity_recovery`；
3. `field_completion`；
4. `dish_semantic_review`。

批量执行采用“两阶段”原则：

- **retained-first**：先重新利用仓库中已经取得、可追溯且通过身份规则的官网/OSM/Hot Pepper/Tabelog 等证据；
- **network-second**：只有 retained evidence 无法完成任务时才访问验证过的免费公开来源。

一次已确认来源访问尽量抽取所有可支持字段，避免按 address/hours/budget 分别请求。访问被限制、需要登录、验证码或不可用时停止，不绕过限制，也不回退付费 Google Data API。

### 批次设计

- Batch A：independently verified official identity index；
- Batch B：历史 verified OSM sourceId ↔ Place ID QC，与 retained OSM candidate 结合；不得 proximity-only promotion；
- Batch C：对无 conflict 的已确认身份执行 deterministic field resolver v2，优先补 address/hours/budget/practical；
- Batch D：消费仍 active 的网络补全 task。

每批结束后重新运行 planner，以 task 数下降量作为补全效果指标，而不是只看新增 source record 数量。

## 10. Export

从同一 SQLite snapshot 生成：

### Catalog export

全部 2,804 条，包含 identity state、missing/conflict status、source timestamps、map link 等。

### Recommendation export

只包含满足 eligibility 的条目。必须输出 exclusion reason，例如 id_only、identity_conflict、closed/moved、insufficient_identity、outside_scope、blocked_by_policy。

`id_only` 不再因为 frozen membership 自动获得 recommendation eligibility。

Export metadata 包含 schema version、resolver version、source snapshot/hash、row count、generated_at、content hash。

## 11. GitHub/Pages handoff

本地 SQLite 不直接暴露给 GitHub runner。流程：

local SQLite
→ local integrity/foreign-key/export validation
→ commit validated export
→ Actions hard checks
→ warning/report compatibility checks
→ Pages deploy

电脑离线时继续发布上次已验证 export，不声称数据自动刷新。

## 12. 切换条件

Pages 切换前至少满足：

1. 2,804 catalog ID 集合一致；
2. 导入幂等；
3. 所有 discovered provider-ID collision 不自动 canonicalize；
4. retained Hot Pepper hours/closure raw fields 正确迁移；
5. open-ended budget 不再伪造上界；
6. known 值不被失败请求覆盖；
7. catalog/recommendation export 可从同一 snapshot 重现；
8. 所有 shadow-only 新增都能追溯到 approved reviewed recovery source；
9. 新旧前端结果完成 regression diff；
10. backup/restore 通过；
11. 新架构 strict gates 已取代 refactor warning。

完成实际开发后必须同步更新 `DEVELOPMENT.md`、相关架构/数据文档和当日 `logs/`。
