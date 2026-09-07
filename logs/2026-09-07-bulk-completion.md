# 2026-09-07 批量补齐开发记录

## Batch A — retained official identity recovery

完成，CI pass。194 input / 193 reviewed / 1 conflict-deferred；新恢复 id-only 1；shadow safe-added 1 / unsafe 0。

## Batch B — retained verified OSM identity QC

完成，CI pass。662 verified pairs / 657 reviewed / 3 candidate / 2 conflict；新恢复 id-only 0；新增发现 2 collision groups / 4 Place ID；总 conflict Places 20。

## Batch C — deterministic retained-field resolver v2

完成，CI pass。1,176 candidate place-fields 中安全 derived 188：closure.days.raw 123、closure.raw 58、hours.raw 7；Tabelog 156 / official 32；missing-only repeat build 新增 0。

## Batch D — Hot Pepper candidate field-only review

完成，CI pass。Commit `a33fc72`。

58 candidate bindings：

- eligible candidate identity consistency：6；
- consistency rejected：22；
- identity not publishable：30。

6 家共补 59 fields：dinner 6、hours 6、closure 6、card 6、course 5、free drink 6、free food 6、lunch 6、parking 6、private room 6。

Master：4,686 source records/bindings、46,260 observations、30,913 resolutions。Identity 保持 651 verified / 746 source_matched / 1,392 id_only / 15 conflict。Field gaps：address 337、coordinates 1、cuisine 1、dinner 789、hours 666、lunch 1,228、practical 906。Repeat build Batch D 新增 0；backup/export pass。

## Batch E — historical private Google hint reconciliation

### E1 — strict probe

完成，CI pass。相关实现 commit `cc4570a`。

历史来源：

- run `34018919233` / artifact `full-area1-collection-private-audit`；
- run `34019078280` / artifact `full-area1-retry-private-audit`。

本轮没有产生新的 Google API request / cost。历史 Google display content 仅在 private workflow 中作为短期 hint，不写入 durable master/repository/public export。

结果：

- current id-only：1,392；
- historical hints available：1,391；
- historical non-operational：1；
- id-only without historical hint：1；
- strict independent proposals：0；
- durable rows：0；
- Google display payload leakage：0。

说明剩余 id-only 并不是没有历史身份线索，而是当前 Hot Pepper / OSM / Overture retained layer 无法按严格 identity rule 对这些长尾店建立新的 durable binding。

### E2 — private near-match diagnostics

完成，CI pass。Commit `0579017`。

保持 durable acceptance 不变，只增加 private aggregation / near-match diagnostics。

统计：

- 1,390 / 1,392 在 120m 内存在至少一个 independent candidate；
- exact normalized name 在 <=10/20/30/50/80/120m 均只有 1；
- similarity >=0.90 / 0.95 / 0.98 / 0.99 / 0.995 在上述距离桶内也均只有 1；
- postcode match：801；
- provider coverage：1 provider 17、2 providers 65、3 providers 1,308；
- strictIndependentProposals：0。

结论：独立候选空间覆盖很高，但东京核心区记录密度过高，distance/postcode 不是足够的 identity evidence。不能通过放宽 6m/20m/50m 阈值批量上架，否则会引入大量错绑。下一阶段改为免费公开来源/官网取证，要求名称、地址、电话、官网等更可判别的信号。

Near-match 明细仍仅保存在短期 private artifact，不持久化 Google 名称、地址或坐标。

## Map display fix — Leaflet/OpenStreetMap only

用户反馈当前地图显示有问题，并要求不通过 API 读取地图数据。

发现旧 Pages 仍会读取 secret `GOOGLE_MAP_API`，把它注入 `google-maps-embed-key`，因此生产环境优先走 Google Maps Embed iframe；Leaflet/OpenStreetMap 只是 fallback。这与 `privacy.html` 当前声明不一致，也让页面地图继续依赖 key / Embed 可用性。

本轮修复：

1. `index.html` 删除 Google Maps embed key meta；
2. `.github/workflows/pages.yml` 删除 `GOOGLE_MAP_API` / `GOOGLE_MAPS_EMBED_KEY` secret 注入；
3. Pages assemble 改为 Leaflet + OpenStreetMap 模式；
4. 页面内三店总览和单店地图统一由现有 Leaflet 读取本地 runtime 坐标，再加载 OpenStreetMap tiles；
5. Google Maps 只保留外部普通导航链接，Place ID 作为导航兼容键，不通过 Google API 读取地点字段；
6. `scripts/audit_no_paid_apis.mjs` 删除旧 free-embed exception，并将 `app.js` / `index.html` 纳入扫描；
7. 新增对 Google map key secret、公开 index embed meta/placeholder 的 blocking 检查；
8. Pages assemble 再次检查公开页面不含 embed key/endpoint 配置，并确认 Leaflet/OpenStreetMap 标记存在。

目标：地图渲染和餐厅数据采集完全解耦。即使 Google API key 不存在或被删除，页面地图仍可正常显示。

### Overview navigation + silent NII reference

- 三家餐厅的 1–3 marker 继续可点击；popup 内保留普通 Google Maps 跳转链接。
- 总览中增加一个固定红色位置参考点，对应 NII 所在建筑位置。
- 红点仅保存 UI 坐标常量，不包含名称、地址或 Google URL 等字段。
- 红点设置 `interactive: false`，不绑定 popup、tooltip、链接或任何点击事件。
- 页面不显示“点 1–3 可跳转 Google Maps / 红点为 NII”等解释文字；总览只显示标题与地图。
- 红点仅参与 `fitBounds`，不进入 catalog/master、不参与筛选、距离条件或推荐随机逻辑。

## 下一阶段

### Batch F — free public-source identity collector

针对剩余 1,392 id-only：

- historical Google hint 仅可在 private job 作为导航提示；
- durable identity 必须由官网/公开店铺页/Hot Pepper/OSM/Overture 等独立来源重新证明；
- 至少保存真实名称 + stable source URL，并组合 address/postcode/phone/coordinates/domain 等证据；
- proximity-only 禁止自动绑定；
- ambiguous 结果保留 candidate；
- confirmed source 一次访问提取所有可支持字段；
- 每批 100–250 task，可中断、可重试、可统计；
- 不绕过登录/CAPTCHA/access restriction；
- 不恢复付费 Google Places/Text/Nearby API。

每批完成继续同步 `DEVELOPMENT.md`、`DATA_PIPELINE.md` 和本日志。