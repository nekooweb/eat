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
- `data/google_entities.generated.js`
- `data/area1_osm.js`
- 旧 canonical / historical exception 数据

`official_candidate_index.json` 只作为此前独立抓取并完成官网候选/name-match 筛选后的 retained identity evidence；不会重新请求 Google 数据 API，也不会把 discovery distance 当成官网事实。

`google_entities.generated.js` 在新主库中只作为历史 identity-QC verdict 输入：读取 `sourceId / verified status / Place ID / qcVersion`，不恢复 Google display response；真正持久化的店名、地址、坐标、菜系和 OSM opening-hours 均来自独立的 `area1_osm.js` candidate row。

## 3. Catalog 导入

以冻结 2,804 Place ID 建立 catalog。要求：

- 数量保持 2,804；
- Place ID 唯一；
- 保留 membership snapshot；
- id-only 使用 `name=null`；
- 不因为缺失字段、冲突或来源访问失败删除目录条目。

旧核心库中 3 条不属于冻结目录的记录进入 retained exception 区，不自动扩展 scope。

## 4. Source records

每条来源记录保存 provider/provider_id、source URL、raw payload 或 retained raw text、observed/ingested time、content hash、parser version、retrieval method 和 permission/licensing note（如适用）。

相同 provider ID 的不同内容版本分别保存，不用覆盖式更新破坏历史。

## 5. Identity bindings

Binding 与 source record 分离。状态至少包含 candidate、reviewed、conflict、retracted。

Retained provider/source-ID 复用必须先形成 cross-layer collision index；同一 native provider ID 对应多个 Place ID 时全部进入 conflict，不能因为旧记录写着 `strong` 或历史 `verified` 就自动选择 canonical identity。

空间距离只能作为约束，不单独证明同一店。多分店、同楼层、同品牌、重复 listing 必须保留审查状态。

### 5.1 Retained official identity recovery

自动 `id_only -> source_matched` 必须同时满足：

1. Place ID 属于冻结 catalog；
2. retained name 非空；
3. retained page URL 是 HTTPS；
4. host 不属于 Google / 聚合站 / 社交媒体；
5. 该索引此前已完成独立页面抓取、candidate-official 分类和 name-match；
6. 当前 Place ID 没有任何 identity conflict。

导入时建立 `retained_verified_official_identity_index` source record 和 reviewed binding。存在 conflict 时只以 candidate 保存证据，不自动清除 conflict。索引 discovery distance 不写入 `distance_m`。

### 5.2 Retained verified OSM identity QC

历史 OSM recovery 必须由两部分精确 join：

- historical QC 中 `status=verified` 的 OSM `sourceId -> Place ID`；
- `area1_osm.js` 中相同 `id=sourceId` 的 OpenStreetMap candidate。

所有 verified OSM native source ID 在 basic binding 导入前就加入 cross-layer collision discovery。若同一 OSM object 在任意 retained layer 对应多个 Place ID，全部相关 binding 进入 conflict；如果 Place ID 因其他来源已经 conflict，新 OSM evidence 只保留 candidate。

只有 reviewed verified mapping 才能贡献 selected field 或把 id-only 升为 source_matched。禁止仅凭空间邻近自动绑定。

## 6. Field observations

所有字段先入 observation，不直接写最终网页字段。

### 名称/地址/坐标

必须来自与 Place ID 明确绑定的来源记录。来源字段保持 provider identity，不伪装成 Google 提供。

### 营业时间

- `openingHoursText` / OSM `openingHoursRaw` 保存 raw hours text；
- `closedText` 保存 raw closure text；
- weekly normalized schedule 独立生成；
- 临时休业、节假日、活动通知独立存储。

### 预算

保存 meal、currency、lower、upper、inclusive/open bound、raw text 和 evidence type。`N以上` 必须表示 lower=N、upper=null；禁止生成 `N+2000`。

### 菜品/推荐

菜单 item、featured、signature、recommended 分开。只有存在明确推荐/招牌/名物语义和具体菜名关联时，才能进入 strict recommendation resolution。

## 7. Resolver

Resolver 的最终值不得由文件导入顺序决定。输入包括 binding state、observation state、source/provider、observed_at、rule version、correction/retraction 和 conflict state。

新空值、网络失败、页面无法访问不得清除旧 known resolution。Identity conflict 的 observation 不得成为 known selected value。

### 7.1 Retained-field resolver v2

Batch C 使用 `retained_source_fact_overlay` 做**missing-only**确定性补全，而不是覆盖式 canonical rebuild。

自动 promotion 的前提：

- Place ID 当前必须是 `verified` 或 `source_matched`；
- Place ID 不得存在任何 identity conflict；
- provider 只能为 `official` 或 `Tabelog`；
- retained source fact 的 `claimedFields` 必须支持目标字段；
- 至少一个 retained provenance link 为 HTTPS；
- source value 通过字段类型/范围验证。

第一版目标字段：address、cuisine、hours.raw、lunch/dinner budget range、closure.raw、closure.days.raw。

“Missing” 按产品等价字段判断。例如已有 `hours.reference.legacy` 或 `hours.normalized.legacy` 时，不再额外用 source fact 覆盖 `hours.raw`；已有 legacy lunch/dinner range 时，也不创建新的 canonical budget range。

采用后建立 acquisition=`derived_retained_field_resolution_v2` 的 field-only source record / reviewed binding。该 binding 的 confidence 明确标记 `field_only_not_identity`，绝不调用 identity upgrade。Derived observation 必须：

- 值与原 retained source observation 完全一致；
- `derived_from_observation_id` 指向原 observation；
- `transformation_rule_version=retained-field-resolver-v2`；
- selected resolution 仍保留完整 provenance。

重复 build 时已 known 字段直接跳过，因此导入计数和 resolution 结果保持幂等。

## 8. Derived fields

任何规范化/派生值必须记录 source observation(s)、transformation rule、rule version 和 generated time。Derived 值不能伪装成 source raw field。

## 9. Unified ingestion tasks 与批量补齐

所有补全工作由 SQLite task plan 统一表达：

1. `identity_conflict_review`；
2. `identity_recovery`；
3. `field_completion`；
4. `dish_semantic_review`。

批量执行采用 retained-first / network-second：先消费已有、可追溯证据，再访问验证过的免费公开来源。一次已确认来源访问尽量提取所有可支持字段；遇到登录、验证码或访问限制停止，不绕过，也不回退付费 Google Data API。

### 批次设计

- Batch A：independently verified official identity index；
- Batch B：historical verified OSM sourceId ↔ Place ID QC；
- Batch C：missing-only retained-field resolver v2；
- Batch D：消费仍 active 的免费公开来源 network tasks。

每批结束后重新运行 planner，以 identity/field missing task 的变化作为补全效果指标，而不是只看新增 source-record 数量。

## 10. Export

从同一 SQLite snapshot 生成全部 2,804 的 catalog export，以及只包含 eligibility 通过条目的 recommendation export。Recommendation 必须记录 exclusion reason，id-only 不再因 frozen membership 自动获得 recommendation eligibility。

Export metadata 包含 schema/resolver version、source snapshot/hash、row count、generated time 和 content hash。

## 11. GitHub/Pages handoff

local SQLite → integrity/foreign-key/export validation → commit validated export → Actions hard checks → compatibility reports → Pages deploy。

电脑离线时继续发布上次已验证 export，不声称数据自动刷新。

## 12. 切换条件

Pages 切换前至少满足：

1. 2,804 catalog ID 集合一致；
2. 导入幂等；
3. 所有 discovered provider-ID collision 不自动 canonicalize；
4. retained hours/closure 正确迁移；
5. open-ended budget 不伪造上界；
6. known 值不被失败请求或 missing-only resolver 覆盖；
7. catalog/recommendation export 可从同一 snapshot 重现；
8. 所有 shadow-only 新增都能追溯到 approved reviewed recovery source；
9. derived field 可追溯到原 retained observation；
10. 新旧前端结果完成 regression diff；
11. backup/restore 通过；
12. 新架构 strict gates 已取代 refactor warning。

完成实际开发后必须同步更新 `DEVELOPMENT.md`、相关架构/数据文档和当日 `logs/`。
