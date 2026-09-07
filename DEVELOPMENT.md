# Eat 开发状态与批量补齐计划

更新日期：2026-09-07。

## 当前线上与发布边界

- frozen catalog：**2,804 Place ID** 全部保留。
- Pages 继续使用 generated runtime；未命名 Place-ID-only 不展示。SQLite recommendation export 尚未切换成线上唯一数据源。
- no-paid-data-API、catalog 完整性、Google display payload 泄漏、数据库契约和 Pages 可部署性均保持 blocking。
- 页面内地图统一使用 **Leaflet + OpenStreetMap**；不注入 Google Maps API key、不使用 Google Embed iframe。Google Maps 只保留普通外部导航链接。
- 历史 Google Places 结果仅允许在短期私有 Actions artifact 中作为 linkage/navigation hint；不得作为 durable restaurant display source。
- identity 仍禁止 proximity-only / postcode-only 绑定；冲突或模糊结果必须留在 candidate/deferred。

## 当前已验证 SQLite master

最新 database-contract 已通过，当前基线：

- catalog：**2,804**；
- source records / bindings：**4,796 / 4,796**；
- observations：**48,312**；
- resolutions：**32,762**；
- identity：**651 verified / 750 source_matched / 1,388 id_only / 15 conflict**；
- active tasks：**2,966** = 20 conflict review + 1,388 identity recovery + 1,347 field completion + 211 dish review。

当前 field-completion 缺口：

- address：**334**；
- dinner budget：**792**；
- hours：**633**；
- lunch budget：**1,232**；
- practical：**882**。

coordinates / cuisine 已不再出现在当前 planner 的缺失统计中。

## 当前并行 workplan

最新 validated workplan：**2,966 tasks / 35 shards / max shard 186**。

worker family：

- `identity-public-recovery`：1,388；
- `field-open-data`：511；
- `field-hotpepper`：409；
- `field-official`：242；
- `field-tabelog-retained`：185；
- `dish-semantic-review`：211；
- `identity-conflict-review`：20。

field 结构中的关键事实：

- `field-hotpepper` 409 个任务全部缺 lunch budget，其中 **395 个为 lunch-only**；
- `field-open-data` 511 个任务几乎都同时缺预算与 practical，因此不能把 OSM/Overture categories 当作预算来源；
- `field-official` 中仍有 44 个 lunch-only；
- Tabelog live runner 受 403 限制，只继续使用已经保留且 provenance 明确的 retained facts，不绕过访问限制。

执行模型仍为：

`master tasks -> deterministic shards -> parallel workers -> evidence/proposals -> central resolver/importer -> master rebuild -> re-plan`

worker 不能直接修改 master；每条 active task 只能属于一个 shard；accepted evidence 必须继续经过 collision/provenance/no-paid-API validation。

## 已完成基础批次

### Batch A — retained official identity recovery

完成 / blocking CI pass。194 retained official records 中 193 reviewed、1 conflict-deferred；恢复 1 个 id-only：`ChIJ2yzmKgCNGGARujgyaVuRhy8`。

### Batch B — retained verified OSM identity QC

完成 / blocking CI pass。662 verified mappings 中 657 reviewed / 3 candidate / 2 conflict；补入独立 OSM fields，并保留 collision quarantine。

### Batch C — deterministic retained-field resolver v2

完成 / blocking CI pass。仅处理 publishable/no-conflict identity，missing-only；安全 derived 188：closure.days.raw 123、closure.raw 58、hours.raw 7。

### Batch D — Hot Pepper candidate field-only review

完成 / blocking CI pass。58 candidate 中 6 家通过严格 existing-identity consistency，补 59 fields；candidate identity 不升级。

## Identity recovery：v2–v6.1

### v2 — structured address consensus

通过私有历史 hint + 独立 structured-address evidence 严格恢复 1 家：Tully's Coffee（Place ID `ChIJswfCsA-MGGARIz1TprVs`），durable provider 为 Overture Maps。

### v3 — independent multi-source consensus

在 Hot Pepper / OSM / Overture 先互相证明同一实体后，再使用私有历史 hint 连接 frozen Place ID。严格自动恢复 1 家：`和Dining三十`（Place ID `ChIJq9lWshaMGGARk5S-OqNwPUU`）。

### v4 — public official-page third evidence

只访问独立来源记录中已有的公开 HTTPS website，遵守 robots/access restrictions，不保存 raw HTML。第一轮 31 个 unique candidate pages 中 22 成功读取，最终严格恢复 **2 家**。

### v5 — strong retained-source consensus

Workflow run `34123552810`：success。

在剩余 **1,388 ID-only** 中检查：

- exact cross-provider phone；
- exact cross-provider official URL；
- official domain + structured address。

结果：

- 有 multi-source independent cluster：566；
- no strong signal：1,386；
- historical non-operational：1；
- no historical hint：1；
- **strong candidates：0**。

结论：现有 HP / OSM / Overture retained payload 中未剩可直接利用的强 phone/domain/URL 共识。不得通过降低距离/名称阈值追数量。

### v6 — same-origin official detail pages

Workflow run `34125988881`：success。

对 multi-source component 已携带的官网做最多两跳 same-origin store/access/info traversal：

- multi-source cluster：566；
- components with allowed website：175；
- landing pages：29 scheduled / 20 OK；
- hop1：209 links / 35 pages OK / 9 page-level matches；
- hop2：358 links / 40 pages OK / 16 page-level matches；
- 9 个 Place-ID-level provisional 结果全部命中共享 official listing URL；
- **final strong candidates：0**。

### v6.1 — shared listing unique store fact

Workflow run `34126400628`：success。

允许共享 listing URL 只有在每个 Place ID 都对应不同且可判别的 official store-fact fingerprint 时继续。结果：

- shared official listing URLs：2；
- provisional rows：9；
- duplicate store-fact fingerprint deferred：9；
- unique-store-fact accepted：0；
- **final strong candidates：0**。

因此 v2–v6.1 已经把当前 retained sources + 它们直接携带的官网强信号基本穷尽。下一阶段必须增加真正新的独立公开证据覆盖，而不是继续调 fuzzy name / distance / postcode 阈值。

详细记录：`logs/2026-09-07-identity-recovery-v5-v6-1.md`。

## Public-web field completion

### source-basic / official field evidence

公开网页 evidence importer 均为 missing-only；只有 identity 已 `verified` / `source_matched` 且 non-conflict 才可使用。网络抓取与 SQLite import 分离，importer 本身 network requests = 0。

当前已有效补入：

- source-basic web evidence：57 rows / 40 canonical fields；
- address +3；
- coordinates +1；
- cuisine +1；
- hours +35。

### official practical landing pages

第一批 run `34122726395` 全链路 success：

- 144 targets；
- 118 pages OK；
- 23 restaurants produced evidence；
- 新增 35 practical fields。

随后累计 landing evidence 达 26 rows / 42 canonical fields。

### official practical same-origin detail pages

run `34123205772` success：

- 143 targets；
- 93 homepage identity reconfirmed；
- 54 detail links；
- 52 detail pages OK；
- 4 durable detail evidence rows；
- 新增 5 fields：parking 2、Wi-Fi 2、card 1。

当前 official practical 累计使 restaurant-level practical gap 降到 **882**。

详细记录：`logs/2026-09-07-official-practical-enrichment.md`。

## Budget completion 结论

### official web meal-budget

landing + same-origin detail collector 已执行。官网页面虽然大量可访问，但在严格要求“明确 lunch/dinner 标签 + finite JPY range”下 **0 durable meal-budget claims**。不把菜单单品价格、套餐价或 generic `priceRange` 误当人均午/晚餐预算。

### Hot Pepper lunch retained-evidence audit

Workflow run `34126682698`：success。

当前 reviewed Hot Pepper 中 lunch 仍未解析的 432 家：

- 已存在严格 eligible evidence 但 resolver 漏吃：**0**；
- 无 retained lunch-budget evidence：**409**；
- retained 但非严格 lunch evidence：23：
  - single value 14；
  - numeric unstructured 7；
  - open-ended / single lower bound 2。

因此 395 个 `field-hotpepper` lunch-only 任务不是 resolver bug。禁止把单值伪造成 `[x,x]` 或擅自补上下界。

详细记录：`logs/2026-09-07-hotpepper-lunch-gap-audit.md`。

## Open data 当前状态

### Overture Maps

`data/overture_area1_candidates.json` 已重新审计：

- release：**2026-08-19.0**；
- scope：TOKYO / 地区1️⃣；center 35.6959, 139.7576；radius 1,200 m；
- rows：3,908；
- Overture IDs：3,908 / 全唯一；
- phone coverage：3,629；
- website coverage：2,744；
- structured addresses：3,908；
- taxonomy：3,898。

该 snapshot 已经是 2026-09-07 时 Overture 当前公开最新 release，因此立即重新下载同 release 不会增加数据。等待下一 release 再做 refresh 更合理。

### OpenStreetMap

历史 `area1_osm.js` 是 flattened candidate layer，master 已消费 name/address/coordinates/cuisine/hours；但 flattening 没有保留原始 OSM `phone/contact:phone`、`website/contact:website` 等 tags，而这些正是剩余 identity recovery 最缺的 discriminator。

已新增 `fresh-osm-rich-tag-diagnostic-v1`：固定同一 1.2 km scope，只做一次 public Overpass query，比较现有 native OSM source IDs 与 fresh rich tags。该阶段只输出 short-lived diagnostic，不写 master、不 promotion；访问限制不重试绕过。

## 地图显示修复

已实现：

1. 删除 `index.html` 的 Google Maps embed key 配置；
2. Pages 不再读取/注入 Google map API key；
3. 单店与三店总览统一 Leaflet + OSM tile；
4. Google Place ID 仅生成普通外部导航 URL；
5. no-paid audit 阻止 Google embed/API 配置重新进入前端；
6. reference marker 仅为前端空间参考，不进入 catalog/master/recommendation logic。

## 下一阶段优先级

1. **Fresh OSM rich tags**：先量化现有 OSM native rows 新增 phone/domain/structured-address 的覆盖，再决定是否构建 v7 identity consensus；
2. **Identity new-source coverage**：只有新独立来源才能继续推进剩余 1,388 ID-only；v2–v6.1 阈值保持冻结；
3. **Field completion**：hours / practical 继续走独立网页或 structured source；budget 只接受语义明确的 lunch/dinner evidence；
4. **Overture refresh**：当前已是 2026-08-19.0，等下一公开 release 后再 diff，而不是重复下载同版本；
5. **Dish semantic review**：211 个任务保持独立低优先级队列；
6. **Conflict review**：20 个 collision/conflict tasks 保持严格人工/证据式处理。

## 开发纪律

每批开发完成同步更新 `DEVELOPMENT.md`、`DATA_PIPELINE.md` 和 `logs/`。只有 CI/数据验证实际通过才写“完成”；代码已提交但验证未结束统一标记为“已实现/待验证”。任何来源访问继续遵守其公开访问条件，不绕过登录、CAPTCHA、robots/access restriction，也不恢复付费 Google Places/Text/Nearby API。
