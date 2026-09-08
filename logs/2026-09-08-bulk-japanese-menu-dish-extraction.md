# 2026-09-08 — 日文菜单批量采集与中文规范化

## 目标

继续补齐餐厅菜品字段，并验证是否可以从“逐店补齐”转成稳定的大批量流程。

本轮再次确认语言契约：**来源不需要中文**。日文/其他 source-native 菜名是真实 evidence；数据库与前端使用规范化中文值。所有批量采集必须保留原始菜名、provider、URL、checkedAt 和 R/F evidence class。

固定安全边界：

- frozen catalog = 2,804 Google Place IDs；
- public named runtime = 1,415；
- paid Google data API = 0；
- 普通菜单项只能进入 F / `featuredDishes`；
- R / `recommendedDishes` 必须出现明确推荐语义；
- cuisine/name/brand inference 禁止进入公共菜品字段；
- worker 只产 evidence，central merge/resolver 才能写 truth；
- identity pipeline 与 dish pipeline 分离。

## 1. 增加 `source_menu_text` F evidence

此前官网菜品抽取主要依赖：

- explicit recommendation text；
- JSON-LD `MenuItem`；
- retained provider facts。

这会漏掉大量日本官网的普通 HTML 菜单。很多官网把真实菜单直接写在 `<div> / <li> / <p>` 中，不提供结构化 MenuItem。

本轮新增 `source_menu_text`：

- 只能来自 already-bound independent official/source website；
- 只在 root 或 same-origin menu/food 页面中提取；
- 必须命中 deterministic dish dictionary；
- 保存 source-native 原文、URL、checkedAt、rule、短 evidence snippet；
- 只进入 `featuredDishes`；
- 如果同一局部文本存在 `おすすめ / 名物 / 人気No.1 / 看板 / 自慢` 等严格推荐 marker，才由另一条规则进入 `source_recommendation_text` / R。

同步更新：

- `scripts/audit_google_inventory_detail_evidence.mjs`
- `scripts/database/resolve_dish_translation_evidence.py`
- `scripts/database/validate_dish_translation_resolution.py`

## 2. 官网批量 collector 扩容

修改 `scripts/collect_google_inventory_recommendations.mjs`：

- 已有 R/F 两侧都完整时才跳过；
- 允许从普通 menu page HTML 抽取 F；
- same-origin menu link follow；
- R extractor 保持严格；
- raw HTML 不持久化。

workflow 参数最终为：

- `INVENTORY_DETAIL_HOST_WORKERS=24`
- `INVENTORY_DETAIL_FETCH_TIMEOUT_MS=7000`
- `INVENTORY_DETAIL_SITE_PAGE_LIMIT=5`
- `INVENTORY_DETAIL_MENU_LINK_LIMIT=4`

菜单链接 marker 在原 `menu / food / 料理 / お品書 / メニュー / 食事 / おすすめ / 名物` 基础上增加：

- menus
- フード
- コース
- グランドメニュー
- アラカルト
- ドリンク
- 商品
- 朝食
- モーニング

## 3. 第一轮大批量官网 run

Workflow run: `34181373791`

结果：

- website tasks: 342
- website hosts: 290
- website pages visited: 668
- website plain-menu restaurants: 91
- website plain-menu items: 370
- fresh recommendation items: 170
- fresh featured items: 444

Merge 前后：

- recommendation restaurants: 170 -> 171
- featured restaurants: 176 -> 260
- evidence restaurants: 292 -> 319
- recommendation items: 241 -> 309
- featured items: 255 -> 617

Public：

- recommended: 197
- featured: 274
- Chinese-normalized dish display: 332 / 1,415

这证明大量普通日文菜单可以在不降低 R 标准的情况下显著提高 F 覆盖。

## 4. 增加稳定 8-shard bulk plan

新增：

- `scripts/build_dish_batch_plan.mjs`
- `data/dish_batch_plan.json`

使用 frozen Place ID 的 FNV-1a hash 做稳定分片，默认 8 shard。

Lane：

- `official_crawl`
- `retained_source_mining`
- `independent_source_discovery`
- `official_or_retained_featured`

原则：

- shard assignment 对同一 Place ID 稳定；
- worker 只产 proposal/evidence；
- central merge/resolver 单写 truth；
- proximity-only identity binding 禁止；
- 普通菜单只进 F；
- R 必须严格语义。

## 5. 24-worker / 8-shard 完整验证

Workflow run: `34181498254`

结果：

- workflow 完整 success；
- public featured = 277；
- public dish display = 333；
- dish work rows = 1,274；
- 8 shard 总量约 128–180 条/片，负载足够均衡。

此后确认大批量执行基础成立：不是逐店手动补，而是可重复的 queue -> shard -> evidence -> central merge -> runtime/SQLite 流程。

## 6. R 层没有放松

检查 `extractStrictRecommendationsFromHtml()` 后确认其已经覆盖常见相邻块：

- previous 1 block
- current recommendation-marker block
- next 2 blocks

因此“おすすめ”在标题、具体菜名在下一行的页面已经能够识别。

没有继续扩大上下文窗口，因为这样会提高把附近普通菜单误判为推荐菜的风险。R 覆盖增长慢是可接受的；不能为了数字降低证据标准。

## 7. Tabelog 8-shard 实验

新增：

- `scripts/collect_tabelog_dish_evidence.mjs`
- `.github/workflows/collect-tabelog-dishes.yml`
- F class `tabelog_menu_text`

设计：

- exact-bound Tabelog sourceRef only；
- root page 必须重新包含餐厅名；
- 只从该店菜单页抽 F；
- 评论正文禁用；
- R 仍然必须明确推荐语义；
- 8 shard 独立采集；
- central merge 单写者。

Workflow run: `34181963583`

8 个 shard 的 matrix 和 artifact/central merge 架构全部机械成功，但 GitHub-hosted runner 对 Tabelog 根页面无法获得可用 identity page。

代表 shard：

- targets 42
- successful identity pages 0
- menu pages attempted 0
- evidence restaurants 0
- error targets 42

central merge 对 8 个 shard 均得到：

- fresh recommendation = 0
- fresh featured = 0
- fresh evidence = 0

结论：

- 不是增加重试次数；
- GitHub-hosted runner 当前不适合作为 Tabelog 直接抓取环境；
- `.github/workflows/collect-tabelog-dishes.yml` 已改成 `workflow_dispatch` manual-only；
- 后续普通 push 不会产生 Tabelog 重试风暴；
- retained Tabelog evidence 仍正常使用；
- 8-shard / central-merge 结构保留给其他来源或未来可访问执行环境。

## 8. Extractor 回退风险与修复

在扩大 `MENU_LINK_MARKER` 时，曾发现一次 whole-file rewrite 会丢失旧版 specific dish dictionary 的风险。

处理：

1. 停止继续跑数据；
2. 从已知良好 blob `262abec47a1a2fb708d7ea305619eab4a7de44a9` / commit `765d8a6982458a10d30e5cb8fb2d7acae2a43308` 分段恢复完整词典；
3. 只保留菜单链接 marker 扩展；
4. 再重新运行批量 collector。

修复 commit：

`bdc319e7b26e11da8eb752c77e9d9d672875f768`

恢复后的 specific rules 包括：

- `真鯛のフィッシュ＆チップス` -> `真鲷炸鱼薯条`
- `神威豚ロース塩麹グリル` -> `盐麹烤神威猪里脊`
- `宇和島流鯛めし` -> `宇和岛式鲷鱼饭`
- 以及此前完整的日文→中文具体菜名词典。

## 9. 最终官网批量 run

Workflow run: `34182257357`

Fresh：

- website tasks: 280
- website hosts: 242
- pages visited: 459
- website recommendation restaurants: 31
- website featured/menu restaurants: 35
- plain-menu items: 139
- fresh recommendation items: 73
- fresh featured items: 213

Final merged detail evidence：

- evidence restaurants: **324**
- recommendation evidence restaurants: **176**
- featured evidence restaurants: **268**
- recommendation items: **325**
- featured items: **644**
- `source_menu_text`: **397**

Final public runtime：

- named restaurants: **1,415**
- `recommendedDishes`: **202**
- `featuredDishes`: **282**
- Chinese-normalized dish display: **337 / 1,415 = 23.8%**
- unfilled public dish rows: **1,078**
- approximate recommendation: **0**
- generic fallback: **false**

## 10. 当前 bulk queue

`recommendedDishes` gap: **1,213**

- `official_crawl`: **220**
- `retained_source_mining`: **646**
- `independent_source_discovery`: **347**

另外：

- `official_or_retained_featured`: **55**

因此 `data/dish_batch_plan.json` 中当前总 dish work rows = **1,268**。

8 shard 总量：

- 156
- 179
- 178
- 157
- 163
- 153
- 127
- 155

## 11. SQLite 最终验证

Database contract run: `34182366280`

完整 success。

Dish evidence / canonicalization：

- phase2 dish evidence observations: **969**
- accepted semantic + Chinese canonicalization: **941**
- accepted with source-original: **941 / 941**
- accepted recommendation evidence: 317
- accepted featured evidence: 624
- recommended items resolved: **298**
- recommended places resolved: **170**
- featured items resolved: **564**
- featured places resolved: **261**
- identity conflict evidence: 6
- identity not publishable evidence: 22
- validator failures: 0
- dish semantic review places: 0

相比本轮开始前 SQLite 的 164 recommended / 171 featured canonical places：

- recommended canonical: +6 家
- featured canonical: **+90 家**

同时通过：

- repeated build idempotency；
- backup / restore；
- shadow export；
- source semantics validation；
- identity isolation。

Database smoke artifact：

- artifact ID: `10039334916`
- ZIP SHA256: `e8d60b0ed9e0e5410e8a9558f28d77c339fd7524e1dda252ae04c11a133a4629`

## 12. Zero-paid validation

全过程保持：

- paidDataApiPolicy = pass
- mapMode = Leaflet + OpenStreetMap
- Google Maps usage = external navigation only
- paid Google data API hits = 0

没有为了菜品覆盖重新引入 Google Places/Embed 等付费数据访问。

## 13. 后续开发方向

1. 继续大批量跑 220 家 already-bound official source；
2. R 继续保持严格推荐语义，不为覆盖率放宽；
3. 646 家 retained-source lane 优先深挖仓库现有 source facts / snippets / retained data；
4. 不在 GitHub runner 上对 Tabelog 做重试风暴；
5. 347 家 independent-source gap 需要继续寻找免费、可追溯的新来源；
6. 继续扩充 source-native -> zh-CN specific dictionary，但只针对真实出现的菜名；
7. 保持 8-shard + central merge 单写者；
8. 保持 R/F/C、monotonic evidence、identity isolation、zero-paid-data-API 不变。
