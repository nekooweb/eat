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
- 三店总览中的 1–3 marker popup 可生成 Google Maps 普通跳转 URL，但该链接只在用户点击后离开本站，不参与数据读取；
- 总览地图固定加入 `国立情報学研究所（学術総合センター）` reference point（東京都千代田区一ツ橋2-1-2）并以红色 circle marker 展示；该 reference point 是 UI 常量，不属于 restaurant source record / observation / resolution，也不参与推荐逻辑；
- overview `fitBounds` 同时包含 NII reference point 和三家餐厅，作为地区1️⃣的空间参照；
- `audit_no_paid_apis.mjs` 和 Pages assemble 都阻止 Google key/embed 配置重新进入公开页面；
- 页面必须保留 OpenStreetMap attribution。

因此“地图显示”和“Google 数据采集”不再共享任何 API key 或运行时依赖。普通 Google Maps 跳转只属于 UI navigation surface。

## Network-second

Retained evidence 用尽后才进入网络免费公开来源。不得恢复付费 Google Places/Text/Nearby API，不做 proximity-only binding，不绕过登录/CAPTCHA/访问限制。一次已确认来源访问尽量提取全部支持字段。

## Export / cutover

Catalog 始终 2,804；recommendation 只包含 eligibility 通过项。Shadow-only 新增必须追溯到 approved reviewed independent source。Pages 切换前继续要求幂等、collision quarantine、Google payload leakage check、backup/restore、field diff 和浏览器回归。

当前 Pages 仍使用 legacy 1,411 named runtime；SQLite recommendation export 在完成足够回归比较前继续 shadow-only。

每批实际开发同步更新 `DEVELOPMENT.md`、本文件和当天 `logs/`。