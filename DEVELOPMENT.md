# Eat 开发状态与批量补齐计划

更新日期：2026-09-07。

## 当前线上与发布边界

- frozen catalog：2,804 Place ID 全部保留。
- Pages 仍发布旧 runtime 的 1,411 条已有真实名称记录；未命名 Place-ID-only 不展示。
- Bulk completion 继续只更新 SQLite / shadow，未切 SQLite recommendation export 到 Pages。
- no-paid-data-API、catalog 完整性、Google payload 泄漏、数据库契约和 Pages 可部署性保持 blocking。
- 地图显示已切换为 **Leaflet + OpenStreetMap**：页面不再注入 Google Maps API key，不再使用 Google Embed iframe。Google Maps 只保留普通外部导航链接，不用于页面内数据读取。
- 三店位置总览中，1–3 餐厅 marker 的 popup 保留对应 Google Maps 普通跳转链接；另有一个固定红色空间参考点，仅作为 UI 坐标参照，不显示字段且不可点击。

## 当前已验证 master（Batch D 后基线）

- 2,804 catalog；
- 4,686 source records / bindings；
- 46,260 observations；
- 30,913 resolutions；
- identity：651 verified / 746 source_matched / 1,392 id_only / 15 conflict；
- collision：10 source-ID groups / 20 Place ID；
- active tasks：2,972 = 20 conflict review + 1,392 identity recovery + 1,349 field completion + 211 dish review。

主要字段缺口：address 337、coordinates 1、cuisine 1、dinner budget 789、hours 666、lunch budget 1,228、practical 906。

## 已完成批次

### Batch A — retained official identity recovery

完成 / blocking CI pass。194 retained official records 中 193 reviewed、1 conflict-deferred；恢复 1 个 id-only：`ChIJ2yzmKgCNGGARujgyaVuRhy8`。

### Batch B — retained verified OSM identity QC

完成 / blocking CI pass。662 verified mappings 中 657 reviewed / 3 candidate / 2 conflict；没有新增 id-only recovery，但发现 2 个新 collision groups，使 conflict Places 16 -> 20，并补入 OSM retained fields。

### Batch C — deterministic retained-field resolver v2

完成 / blocking CI pass。只处理 publishable/no-conflict identity，provider 仅 official/Tabelog，missing-only。安全 derived 188：closure.days.raw 123、closure.raw 58、hours.raw 7；repeat build 新增 0。

### Batch D — Hot Pepper candidate field-only review

完成 / blocking CI pass。58 candidate 中 6 家通过严格 existing-identity consistency，补 59 fields；原 candidate identity 不升级。Dinner gap 795 -> 789、hours 672 -> 666、practical 912 -> 906。

## Batch E — historical private hint reconciliation

### E1 — ultra-strict reconciliation

完成 / CI pass。2026-09-06 已付费取得的两个私有 Actions artifact 只在短期 CI 中作为 identity match hint，不把 Google display content 写入仓库、SQLite 或公开导出。

实际结果：

- current id-only：1,392；
- 有历史成功 hint：1,391；
- historical non-operational：1；
- 没有历史 hint：1；
- 在现有 Hot Pepper / OSM / Overture 中满足 ultra-strict independent reconciliation：**0**；
- durable proposal：0；
- Google display payload leakage：0；
- new Google API calls：0。

结论：历史 Google hint 几乎覆盖全部 id-only，但不能作为 durable source；现有独立来源不能在当前严格 identity rule 下直接恢复新餐厅。

### E2 — private near-match diagnostics

完成 / CI pass。只做 private diagnostics，不改变 durable acceptance rule。

实际统计：

- 1,392 id-only 中，1,390 在 120m 内至少有一个 Hot Pepper / OSM / Overture candidate；
- exact normalized name 在 10m–120m 内都只有 **1** 条；
- name similarity >=0.90、0.95、0.98、0.99、0.995 在 10m–120m 内同样都只有 **1** 条；
- best candidate postcode match：801；
- provider spatial coverage：1 provider = 17、2 providers = 65、3 providers = 1,308；
- durable proposal 仍为 0。

解释：独立候选的**空间覆盖并不低**，但东京核心区候选密度很高，距离/postcode 本身无法证明 Google Place ID 与独立记录是同一实体；真正缺的是可判别的名称/地址/电话/官网等 identity evidence。因此不采用 proximity-only，也不通过放宽 6m/20m/50m 阈值来追数量。

## 地图显示修复

已实现：

1. 删除 `index.html` 的 `google-maps-embed-key` meta；
2. Pages 不再读取或注入 `GOOGLE_MAP_API` / Google Maps embed key；
3. 页面内单店地图和三店总览统一走现有 Leaflet + OpenStreetMap tile；
4. Google Place ID 仅用于普通 Google Maps 外部导航链接，不触发 Places API / Embed API 数据读取；
5. `audit_no_paid_apis.mjs` 新增前端/Pages 防回归检查，阻止 Google map key、embed placeholder 和公开页面 embed 配置重新进入部署；
6. Pages assemble 阶段再次检查公开 `index.html` 不含 Google Embed 配置，并确认 Leaflet/OpenStreetMap 存在；
7. 总览地图的 1–3 餐厅 marker popup 增加普通 Google Maps 跳转链接，使用现有 Place ID/name/address 生成 URL，不发起数据 API 请求；
8. 总览固定增加一个红色 reference marker，仅在前端保存经纬度常量；不保存/显示名称、地址或链接，不绑定 popup/tooltip，`interactive: false`；
9. reference marker 不写入餐厅 catalog/master，不参与距离过滤、推荐 eligibility 或随机权重；
10. 总览 `fitBounds` 将 reference point 纳入视野范围；页面不显示任何关于该红点或 marker 点击行为的说明文字。

这与 `privacy.html` 已声明的“内嵌地图使用 OpenStreetMap/Leaflet、不注入 Google Maps API key”保持一致。

## 下一阶段：Batch F — free public-source identity collector

目标不是继续调 retained matching threshold，而是为剩余 1,392 个 id-only 建立真正可持久化的公开来源证据。

设计原则：

1. **private hint only for navigation**：历史 Google hint 只能在短期私有 workflow 中帮助定位搜索目标，Google display 字段不得进入 durable record；
2. **durable source must be independent**：正式写入必须来自官网、公开店铺页面、Hot Pepper、OSM、Overture 或其他许可明确的公开来源；
3. **identity evidence first**：至少取得真实名称 + 稳定 source URL，并优先结合地址/postcode/电话/坐标/官网域名等信号确认实体；
4. **no proximity-only**：单纯距离近、同 postcode、同建筑不能自动绑定；
5. **one visit, multi-field extraction**：身份确认后，同一次来源访问尽量提取 name/address/coordinates/cuisine/hours/budget/practical/menu 等全部支持字段；
6. **candidate -> reviewed**：模糊结果先保存 candidate，不直接上架；只有通过规则或人工复核才升级 reviewed/source_matched；
7. **batchable and resumable**：按 100–250 条一批执行，记录 source hash、retrieved_at、parser/rule version、失败原因和下一次重试状态；
8. **access-respectful**：不绕过登录、CAPTCHA、robots/access restriction，不恢复付费 Google Places/Text/Nearby API。

优先执行顺序仍为：identity conflict review > identity recovery > field completion > dish semantic review。Identity recovery 成功后自动进入 field-completion 队列。

## 开发纪律

每批开发完成同步更新 `DEVELOPMENT.md`、`DATA_PIPELINE.md` 和 `logs/`。只有 CI/数据验证实际通过才写“完成”；代码已提交但验证未结束统一标记为“已实现/待验证”。