# 主数据库输入、处理与输出流程

更新日期：2026-09-07。

## 数据方向

公开 / retained source → versioned source record → identity binding → field observation → resolver → field resolution → SQLite master → catalog/recommendation export → Pages。

2,804 frozen Place ID 始终保留。`id_only` 只下架、不删除；没有真实独立来源名称时不能进入 recommendation。

## 当前 master 与 task planner

最新 validated master：

- catalog 2,804；
- identity：651 verified / 750 source_matched / 1,388 id_only / 15 conflict；
- active tasks：2,966 = 20 identity conflict + 1,388 identity recovery + 1,347 field completion + 211 dish semantic review；
- field missing：address 334 / dinner 792 / hours 633 / lunch 1,232 / practical 882。

当前 workplan：2,966 tasks / 35 shards / max shard 186。

主要 field worker：

- field-open-data 511；
- field-hotpepper 409；
- field-official 242；
- field-tabelog-retained 185。

## Identity recovery 层

### Durable retained identity

1. retained official：独立 HTTPS official candidate + name match；无 conflict 才可升为 source_matched。
2. retained verified OSM：historical verified sourceId↔Place ID 与同一 OSM candidate 精确 join；native source-ID collision 先隔离。
3. retained Hot Pepper / Overture：只消费独立来源的 durable fields 与 native provider ID；任何 historical Google display data 不成为 durable source。

### Historical Google private hint boundary

历史 Google private sweep 只在短期 Actions 中作为 linkage/navigation hint：

- 不把 display name/address/location/phone/status/types 写入 repo/master/export；
- private hint 不能单独建立 source binding；
- proximity/postcode/同建筑不能替代独立 identity evidence；
- diagnostic artifact 只短期保留 Place ID、independent provider/source ID、match metrics 和必要 hash。

### v2–v4 durable recovery

- v2 structured-address consensus：恢复 1；
- v3 independent multi-source consensus：恢复 1；
- v4 official public-page third evidence：恢复 2。

v4 之后 SQLite identity 为 651 verified / 750 source_matched / 1,388 id_only / 15 conflict。

### v5 strong consensus diagnostic

run `34123552810` success：

- 1,388 id-only；
- 566 有 multi-source independent cluster；
- exact cross-provider phone / official URL / domain+structured-address 下 strong candidates = **0**。

因此 retained HP/OSM/Overture payload 内未剩安全的强 discriminator；不调低 fuzzy name / distance threshold。

### v6 / v6.1 official detail diagnostics

v6 run `34125988881` success：

- 175 components carry allowed websites；
- landing 29 / 20 OK；
- hop1 209 links / 35 OK / 9 matches；
- hop2 358 links / 40 OK / 16 matches；
- 9 Place-ID-level provisional rows 全部命中共享 official listing URL；
- final = 0。

v6.1 run `34126400628` success：

- shared listing URLs 2；
- 9 provisional rows；
- 9 duplicate store-fact fingerprints deferred；
- unique store-fact accepted = 0。

这两层证明当前官网结构化事实仍无法把共享 listing 中的门店安全拆开。不得取消 URL/fact collision quarantine，也不使用页面布局启发式强拆。

## Parallel proposal-only execution

`SQLite master -> unified ingestion tasks -> deterministic shards -> evidence/proposal workers -> central validator/resolver -> master rebuild -> planner re-run`

worker family：

- `identity-public-recovery`
- `identity-conflict-review`
- `field-official`
- `field-hotpepper`
- `field-tabelog-retained`
- `field-open-data`
- `field-existing-source`
- `dish-semantic-review`

硬约束：

- 每条 active task 精确属于一个 shard；
- stable SHA-256 bucket；
- 每 shard <=250 tasks；
- worker 不能直接写 SQLite master；
- paid Google data API calls = 0；
- historical Google display payload 不进入 durable proposal；
- proximity-only identity binding 禁止；
- ambiguous identity 保持 candidate；
- accepted evidence 必须继续经过 collision quarantine、provenance、resolver、export 与 no-paid-API validation。

`.github/workflows/parallel-agent-workplan.yml` 已把 public-web practical evidence 纳入 trigger，保证 evidence 变化会重新构建 master/workplan。

## Field completion

### Retained deterministic resolvers

- retained official/Tabelog：publishable + no-conflict + HTTPS provenance + missing-only；
- Hot Pepper candidate field review：不升级 candidate identity，只补安全字段；
- reviewed OSM fields：name/address/coordinates/cuisine/hours；
- Overture/OSM metadata 不用于猜测 meal budget 或 practical。

### Public web evidence

source-basic / official web collector 与 importer 分离：

- network collector 只读许可允许的公开 HTTPS；
- robots/access restrictions 不绕过；
- raw HTML 不 durable；
- importer network requests = 0；
- identity 必须已经 verified/source_matched + non-conflict；
- missing-only；
- source URL / final URL / retrieved_at / content hash / parser version 全部保留。

当前 source-basic web evidence：57 rows / 40 canonical fields（address 3、coordinates 1、cuisine 1、hours 35）。

### Official practical evidence

landing + same-origin detail 已落库：

- landing 累计 26 rows / 42 practical fields；
- detail 4 rows / 5 practical fields；
- detail 增量：parking 2 / Wi-Fi 2 / card 1；
- practical restaurant gap 当前 882。

absence 从不解释成 false；只接受明确局部 label + positive/negative phrase。复杂 smoking policy 继续不做简单二值化。

## Budget semantics

### Official web meal budgets

官网 landing/detail 虽可读取大量页面，但严格 parser 要求 explicit lunch/dinner label + finite JPY range。当前 durable result = **0**。

不把：

- 菜单单品价格；
- course price；
- generic schema.org `priceRange`；
- 没有 meal label 的金额

转换成人均 lunch/dinner range。

### Hot Pepper lunch audit

run `34126682698` success。

reviewed Hot Pepper 且 lunch 未解析：432：

- strict eligible evidence 已存在但 resolver 漏吃：0；
- no retained lunch evidence：409；
- non-strict retained evidence：23（single value 14 / numeric unstructured 7 / open-ended or lower-only 2）。

因此 395 个 field-hotpepper lunch-only task 属于 source-coverage problem，不是 resolver bug。禁止把 single value 改写成 `[x,x]`。如果未来产品需要“平均/参考单值”，应新增独立 semantic field，而不是弱化 `budget.lunch.range`。

## Open-data pipeline

### Overture

当前 retained snapshot 已审计：

- release `2026-08-19.0`；
- scope center 35.6959,139.7576 / radius 1200m；
- 3,908 rows / 3,908 unique Overture IDs；
- addresses 3,908；
- phone 3,629；
- website 2,744；
- taxonomy 3,898。

截至 2026-09-07，它已经是当前最新公开 release，因此不重复下载同一 release。下一 Overture release 后再做 ID/phone/domain/address diff。

### OpenStreetMap

历史 `area1_osm.js` 是 flattened layer。它保留 name/address/coordinates/cuisine/opening_hours，但没有完整保留原始 `phone/contact:phone`、`website/contact:website` tags。

新增 `fresh-osm-rich-tag-diagnostic-v1`：

- 固定 frozen center/radius；
- 一次 bounded public Overpass request；
- 不写 master、不 promotion；
- 只比较 native OSM IDs 与 phone hash / website domain / structured address coverage；
- 401/403/429 不重试绕过；
- raw Overpass JSON 不 durable。

首个 `around:` query 在 GitHub runner 收到 HTTP 504，因此未记为完成。已改成 enclosing bbox query + 本地 Haversine 恢复精确 1,200m 半径；仍只有一次 request，等待验证结果。

## Unified tasks

priority：identity conflict review > identity recovery > field completion > dish semantic review。每次 accepted recovery/resolver 后重新 planner。Identity recovery 成功会从 identity task 转成 field task，因此以 task 类型与 field missing 变化衡量真实进度，而不是单独看 source row 数。

## Map/display path

`resolved coordinates -> static runtime export -> Leaflet -> OpenStreetMap tiles`

- 浏览器无 Google Maps API key；
- 无 Google Maps Embed iframe；
- map rendering 只读本地 runtime 坐标；
- Google Place ID 只用于普通外部导航 URL；
- reference point 仅 UI 坐标，不属于 source/observation/resolution，不参与推荐；
- no-paid audit 与 Pages assemble 阻止 Google key/embed 配置回归；
- 页面保留 OpenStreetMap attribution。

## Network-second

只有 retained evidence 用尽后才访问新的免费公开来源。原则：

1. identity evidence first；
2. 一次已确认来源尽量提取全部支持字段；
3. 不恢复付费 Google Places/Text/Nearby API；
4. 不做 proximity-only binding；
5. 不绕过 login/CAPTCHA/robots/access restriction；
6. public endpoint 出现 restricted access 时停止，不做镜像轮询规避；
7. diagnostic 先量化收益，再决定 durable importer/promotion。

## Export / cutover

Catalog 始终 2,804；recommendation 只包含 eligibility 通过项。Shadow-only 新增必须追溯到 approved reviewed independent source。Pages 切换前继续要求幂等、collision quarantine、Google payload leakage check、backup/restore、field diff 和浏览器回归。

当前 Pages 仍走 generated runtime；SQLite recommendation export 在完成回归比较前保持 shadow-only。

每批实际开发同步更新 `DEVELOPMENT.md`、本文件和当天 `logs/`。
