# 主数据库输入、处理与输出流程

更新日期：2026-09-07。

## 数据方向

公开/retained 来源 → versioned source record → identity binding → field observation → resolver → field resolution → SQLite master → catalog/recommendation export → Pages。

2,804 frozen Place ID 始终保留。`id_only` 只下架、不删除；没有真实独立来源名称时不能进入 recommendation。

## Identity recovery 层

1. retained official：独立 HTTPS candidate-official + name-match；无 conflict 才可升为 source_matched。
2. retained verified OSM：historical verified sourceId↔Place ID 与同一 OSM candidate 精确 join；native source-ID collision 先隔离。
3. historical Google private sweep：只作为短期 match hint。Google displayName / formattedAddress / location / status/types 不进入 durable master/repo/export；长期关联只保留 Place ID。

## Historical-private reconciliation

现有私有 sweep 几乎覆盖当前 id-only，但 durable proposal 必须重新由 Hot Pepper / OpenStreetMap / Overture 等独立来源证明。Private match hint 不能直接成为 source record。

E1 ultra-strict probe：1,392 个 id-only 中 1,391 有历史 hint，但 durable proposal 为 0。

E2 near-match diagnostics 仍不改变 acceptance rule。结果：

- 1,390 / 1,392 在 120m 内存在独立 candidate；
- exact name 或 name similarity >=0.90 的近距离 candidate 实际都只有 1 条；
- postcode match 801；
- provider spatial coverage：1 provider 17、2 providers 65、3 providers 1,308。

这说明 independent candidate coverage 足够广，但东京核心区候选密度高，距离/postcode 不能充当 identity truth。后续不再继续放宽 proximity threshold，而转向能提供名称、地址、电话、官网等可判别证据的免费公开来源 collector。

Private diagnostic artifact 只保留 Place ID、独立 provider/source ID 和 match metrics，短期过期；不保存 Google 名称/地址/坐标。

## Batch F — free public-source collector

Retained evidence 用尽后的正式 identity-recovery 路径：

1. planner 读取当前 `identity_recovery` task；
2. 历史 Google hint 如仍可用，只允许在 private job 中作为导航/搜索提示；
3. collector 访问许可允许的官网/公开商店页/独立目录；
4. raw response 或解析后的 source record 必须记录 stable URL、retrieved_at、content hash、parser/rule version；
5. identity matcher 使用名称 + 地址/postcode/电话/坐标/官网域名等证据；禁止仅凭距离或同建筑绑定；
6. 模糊结果写 `candidate`，明确结果写 `reviewed`；collision 继续 quarantine；
7. reviewed identity 才允许 resolver 补字段并进入 recommendation eligibility；
8. 一次已确认来源访问尽量提取 name/address/coordinates/cuisine/hours/budget/practical/menu 全部可支持字段；
9. 每批 100–250 task，可中断、可重跑、可统计失败原因；
10. 不绕过登录/CAPTCHA/robots/access restriction，不调用付费 Google Places/Text/Nearby API。

## Parallel sub-agent execution

批量补齐改为 task-owner 明确的 proposal-only 并行层，而不是多个 workflow 同时全量扫描和直接改 master：

`SQLite master -> unified ingestion tasks -> deterministic agent shards -> parallel evidence/proposal workers -> central validator/resolver -> master rebuild -> planner re-run`

`build_agent_workplan.py` 读取 `ingestion_tasks` / `ingestion_task_details` 和当前 source bindings，将每条 active task 精确分配给一个 agent family：

- `identity-public-recovery`：剩余 id-only 的公开来源身份恢复；
- `identity-conflict-review`：source-ID collision / conflict；
- `field-official`：已有 official source 的字段补齐；
- `field-hotpepper`：已有 Hot Pepper source 的字段补齐；
- `field-tabelog-retained`：已有 retained Tabelog source 的字段补齐；
- `field-open-data`：OSM/Overture 等公开源字段补齐；
- `field-existing-source`：其他已有 source 的字段补齐；
- `dish-semantic-review`：推荐菜/特色菜证据的语义复核。

分片采用稳定 SHA-256 bucket，重复生成同一任务集时 ownership 保持稳定。默认 identity 8 shards、field family 6 shards、dish 2 shards；如果任务过多，自动增加 shard 数，保证每个 shard <=250 tasks。

所有 shard 都是 **proposal-only**：worker 不能直接写 SQLite master。worker 输出必须保留 `taskId` / `placeId` / source URL/provider / evidence / confidence / field claims，中央 importer 再执行 identity/binding/field acceptance。硬约束：

- 每条 active task 只属于一个 shard；
- paid Google data API calls = 0；
- historical Google display payload 不得进入 durable proposal；
- proximity-only identity binding 禁止；
- ambiguous identity 保持 candidate/review-required；
- accepted data 继续经过 collision quarantine、provenance、resolver、export 与 no-paid-API validation。

`.github/workflows/parallel-agent-workplan.yml` 负责从真实 master 生成短期 workplan artifact；planning 本身不访问外部数据源。后续 worker executor 只消费自己的 shard，避免重复请求同一来源。

## Field completion

Retained-field resolver v2：publishable/no-conflict only，official/Tabelog only，HTTPS provenance + claimedFields，missing-only，derived observation 链接原 observation。

Hot Pepper candidate field-only review：原 candidate 永不升级；只有现有可靠 identity 与 HP name/location 严格一致时，才补 missing address/hours/dinner/closure/practical。禁止 name/coordinates/canonical cuisine/identity promotion。

## Unified tasks

priority：identity conflict review > identity recovery > field completion > dish semantic review。每次 recovery/resolver 后重新 planner。Identity recovery 成功会从 identity task 转成 field task，因此以 task 类型和字段缺口变化衡量实际进度。

当前基线：2,972 active tasks = 20 identity conflict review + 1,392 identity recovery + 1,349 field completion + 211 dish semantic review。

## Map/display path

页面内地图与数据 pipeline 分离：

`resolved coordinates -> static JS/runtime export -> Leaflet -> OpenStreetMap tiles`

规则：

- 不向浏览器注入 Google Maps API key；
- 不使用 Google Maps Embed iframe；
- 地图渲染只读取已经存在于本地 runtime 的坐标，不向 Google 请求地点数据；
- Google Place ID 仅用于普通外部导航兼容链接；
- 三店总览中的 1–3 餐厅 marker popup 可生成 Google Maps 普通跳转 URL，但该链接只在用户点击餐厅 marker 后出现，不参与地点数据读取；
- 总览地图另有一个固定红色 reference point，仅作为 UI 坐标常量存在；不带 name/address/URL metadata，不绑定 popup/tooltip，`interactive: false`；
- reference point 不属于 restaurant source record / observation / resolution，不参与推荐、筛选或距离判断；
- overview `fitBounds` 同时包含 reference point 和三家餐厅，仅用于保持空间参照；
- 页面不显示关于红点含义或餐厅 marker 点击行为的额外说明文字；
- `audit_no_paid_apis.mjs` 和 Pages assemble 都阻止 Google key/embed 配置重新进入公开页面；
- 页面必须保留 OpenStreetMap attribution。

因此“地图显示”和“Google 数据采集”不再共享任何 API key 或运行时依赖。普通 Google Maps 跳转只属于 UI navigation surface。

## Network-second

Retained evidence 用尽后才进入网络免费公开来源。不得恢复付费 Google Places/Text/Nearby API，不做 proximity-only binding，不绕过登录/CAPTCHA/访问限制。一次已确认来源访问尽量提取全部支持字段。

## Export / cutover

Catalog 始终 2,804；recommendation 只包含 eligibility 通过项。Shadow-only 新增必须追溯到 approved reviewed independent source。Pages 切换前继续要求幂等、collision quarantine、Google payload leakage check、backup/restore、field diff 和浏览器回归。

当前 Pages 仍使用 legacy 1,411 named runtime；SQLite recommendation export 在完成足够回归比较前继续 shadow-only。

每批实际开发同步更新 `DEVELOPMENT.md`、本文件和当天 `logs/`。