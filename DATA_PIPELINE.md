# 主数据库输入、处理与输出流程

更新日期：2026-09-08。

## 数据方向

公开 / retained source → versioned source record → identity binding → field observation → resolver → field resolution → SQLite master → catalog/recommendation export → Pages。

2,804 frozen Place ID 始终保留。`id_only` 只下架、不删除；没有真实独立来源名称时不能进入 recommendation。当前 public named runtime 为 **1,415**，另有 **1,389** frozen Place-ID-only 不公开展示。

`recommendedDishes` 作为重要 detail field 采用独立 source-backed evidence path；它不允许通过 cuisine/name/brand inference 自动生成。

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

## Recommended-dish evidence pipeline

推荐菜详细契约见 `RECOMMENDED_DISH_PIPELINE.md`。核心是把菜品事实分成 R/F/C 三层，而不是把所有可识别菜名都写进 `recommendedDishes`。

### R — strict recommendation

```text
retained recommendedDishes + exact sourceRef claim
OR
bound official / retained Hot Pepper local text block
  + concrete dish term
  + explicit recommendation/signature marker
      ↓
source_recommendation_text
      ↓
recommendedDishes
```

推荐 marker 包括 `おすすめ / 名物 / 看板 / 自慢 / 一押し / 一番人気 / 売れ筋 / 必食 / signature / specialty / recommended / best seller / must try / most popular / house special` 等。菜名与 marker 必须出现在局部上下文，不做整页跨模块拼接。

### F — source-backed featured/menu dish

```text
retained dishes / featuredDishes + exact sourceRef
OR retained Hot Pepper concrete dish text without recommendation marker
OR bound official JSON-LD MenuItem
      ↓
retained_source_menu_item / provider_promotional_dish_text / structured_menu_item
      ↓
featuredDishes
```

F 只证明“来源中存在该菜品/菜单项”，不能自动升级为推荐菜。

### C — candidate only

`cuisine -> dish`、`restaurant name -> dish`、`brand -> fixed menu` 等推断只能留在内部 candidate/enrichment 层，禁止写入 public recommendation/featured fields。

### Retained-first extraction

`scripts/build_retained_dish_evidence.mjs` 无网络读取 `source_enrichment*.js`：

- 40 source shards；
- 584 source rows scanned；
- 110 rows 声明 dish-related fields；
- 100 retained dish values 可中文规范化；
- 136 featured evidence items；
- 覆盖 99 家；
- provider items：Tabelog 63 / official 37。

Tabelog live access 受限，因此只消费 retained + exact provenance，不绕过 403/access restriction。

### Official / Hot Pepper extraction

`scripts/collect_google_inventory_recommendations.mjs` 只对当前 1,415 个 named public rows 工作；2,804 是 frozen catalog baseline，不再错误要求 runtime 本身有 2,804 行。

- Hot Pepper 从已保存 `hotpepper_catalog_facts.json` 读取，不新增付费 API call；
- 官网只访问已经绑定的 independent official URL；
- Google/Tabelog/Hot Pepper/social URL 不作为 direct crawl target；
- 官网最多跟随少量 same-origin menu/food links；
- raw HTML 不 durable；
- JSON-LD `MenuItem` 只能进入 F。

本轮有效 fresh collector 曾识别 Hot Pepper strict recommendation 18 家、官网 strict recommendation 7 家、Hot Pepper featured 68 家。monotonic merge 后当前 detail evidence：

- evidence restaurants **277**；
- recommendation evidence restaurants **165**；
- featured evidence restaurants **163**；
- recommendation items **236**；
- featured items **214**。

### Merge/QC

`merge_google_inventory_detail_evidence.mjs` 使用 monotonic union；短期 crawl 失败不能删除以前已验证证据。

semantic dedupe key：

`nameZh + provider + sourceUrl + evidenceClass`

`nameJa/nameOriginal` 只是 metadata。这样同一来源页同一中文菜名不会因为原词写法不同重复计数。

`audit_google_inventory_detail_evidence.mjs` 要求 recommendation item 必须是 `source_recommendation_text`；普通 `retained_source_menu_item` / `provider_promotional_dish_text` / `structured_menu_item` 不能越级进入 R。

public materialized audit 继续强制：

- `approximateRecommendationsAllowed=false`；
- `genericFallbackAllowed=false`；
- 无 legacy approximate metadata；
- 中文 recommendation display；
- 同一双菜组合 >=20 家或同一单菜 >=60 家时 blocking review。

当前最大重复值为三明治 14、咖喱 13、意大利面 7、刺身 6；没有此前 100+ 家相同固定双菜组合。

### Public result

批处理前 strict baseline：185 recommendation / 291 any-dish display / 20.6%。

当前：

- `recommendedDishes` **192**（+7）；
- `featuredDishes` known **188**；
- featured-only display **108**；
- any Chinese dish display **300 / 1,415 = 21.2%**（+9 rows）；
- unfilled **1,115**；
- approximate recommendation **0**。

### Recommendation-first detail queue

当前 recommendation gap = **1,223**，按“来源是否真的可访问/可继续抽取”拆为三路：

- **229** `collect_strict_recommended_dishes`：已有 crawlable bound official URL；
- **647** `extract_retained_dish_source`：没有可直接访问官网，但有 retained Tabelog/Hot Pepper 等第三方来源；
- **347** `find_independent_dish_source`：需要寻找新的免费独立 dish source。

229 + 647 + 347 = 1,223。`sourceUrlCount` 不再直接等同于“可抓官网”。

连续批处理 workflow 采用同一 concurrency group，并在实际 extraction 开始前重新 `fetch/reset origin/main`；原因是 GitHub queued run 会 checkout 触发时的历史 event SHA，若不二次同步会与上一轮 bot evidence commit 在 rebase 时产生冲突。

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

SQLite master priority 仍为 identity conflict review > identity recovery > field completion > master dish semantic review。Public named-runtime detail enrichment 另有 recommendation-first queue；两者属于不同层次，不直接相加。

每次 accepted recovery/resolver 后重新 planner。Identity recovery 成功会从 identity task 转成 field task，因此以 task 类型与 field missing 变化衡量真实进度，而不是单独看 source row 数。

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

1. identity / field semantic evidence first；
2. 一次已确认来源尽量提取全部支持字段；
3. recommendation 先吃 retained dish facts，再访问已绑定官网，再寻找新独立来源；
4. 不恢复付费 Google Places/Text/Nearby API；
5. 不做 proximity-only binding；
6. 不绕过 login/CAPTCHA/robots/access restriction；
7. public endpoint 出现 restricted access 时停止，不做镜像轮询规避；
8. diagnostic 先量化收益，再决定 durable importer/promotion。

## Export / cutover

Catalog 始终 2,804；recommendation 只包含 eligibility 通过项。Shadow-only 新增必须追溯到 approved reviewed independent source。Pages 切换前继续要求幂等、collision quarantine、Google payload leakage check、backup/restore、field diff 和浏览器回归。

当前 Pages 仍走 generated runtime；SQLite recommendation export 在完成回归比较前保持 shadow-only。

每批实际开发同步更新 `DEVELOPMENT.md`、本文件、`RECOMMENDED_DISH_PIPELINE.md` 和当天 `logs/`。
