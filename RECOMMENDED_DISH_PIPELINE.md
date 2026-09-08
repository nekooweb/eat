# 推荐菜证据、日文来源与中文数据库字段流程

更新日期：2026-09-08。

## 核心目标

`recommendedDishes` / `featuredDishes` 的来源页面**不要求提供中文**。当前项目把日文或其他 source-native 菜名作为事实证据，保留原文和来源，再规范化成中文写入数据库与 public runtime。

```text
日文 / source-native 菜名、推荐文案
        ↓
保留原文 + provider + source URL + checkedAt + evidence class
        ↓
确定性中文规范化 / 翻译
        ↓
R / F 语义隔离
        ↓
SQLite canonical zh fields
        ↓
recommendation / public export
```

固定约束：

- frozen catalog：**2,804 Google Place IDs**；
- public named runtime：**1,415 家**；
- 其余 **1,389 Place-ID-only** 继续走独立 identity recovery；
- paid Google data API calls：**0**；
- Leaflet + OpenStreetMap；Google Maps 仅作为外部导航链接；
- 不允许 cuisine / restaurant name / brand 常识生成公共菜品；
- source-native 原文不能被中文译名覆盖或丢弃。

## R / F / C 三层语义

### R — strict recommendation

只有明确推荐语义才能进入 `recommendedDishes`。

允许的明确语义包括：

- おすすめ / オススメ / お勧め
- 名物 / 看板 / 自慢
- 一押し / イチオシ / 一番人気 / 人気No.1
- 売れ筋 / 必食 / スペシャリテ / シグネチャー
- signature / specialty / recommended / best seller / must try / most popular / house special / chef recommendation

`extractStrictRecommendationsFromHtml()` 会在推荐 marker 周围读取“前 1 块 + 当前块 + 后 2 块”，因此可以覆盖“标题写 おすすめ、下一行才写菜名”的日本官网常见结构，但不会继续扩大窗口，以免把附近普通菜单误判为推荐菜。

### F — source-backed featured/menu dish

来源中真实存在具体菜名，但没有足够推荐语义时，只进入 `featuredDishes`。

当前批准的 F evidence class：

- `retained_source_menu_item`
- `provider_promotional_dish_text`
- `structured_menu_item`
- `source_menu_text`
- `tabelog_menu_text`（仅为 exact-bound Tabelog 菜单页通道预留；当前 GitHub-hosted runner 自动抓取已停用）

其中 `source_menu_text` 是本轮批量扩展的核心：只在**已经绑定的 independent official/source website** 及其少量 same-origin menu/food 页面中，从实际 HTML 菜单文本识别具体日文菜名。普通菜单项绝不升级成 R。

### C — candidate only

以下只能内部候选，不能发布：

- cuisine → 常见菜模板；
- restaurant name → 菜品猜测；
- brand → 固定菜单模板但没有实际来源页；
- generic tags；
- 仅凭模型/规则常识产生的菜名。

## 语言契约：source-native → zh-CN

Evidence 至少保留：

- `nameOriginal` / 兼容字段 `nameJa`
- `nameZh`
- `provider`
- `sourceUrl`
- `checkedAt`
- `evidenceClass`
- `evidenceRule`
- short evidence snippet（适用时）

共享中文规范化器：`scripts/recommended_dish_extractor.mjs`。

specific-first 规则示例：

- `濃厚つけ麺` → `浓厚蘸面`
- `家系ラーメン` → `横滨家系拉面`
- `バターチキン` → `黄油鸡咖喱`
- `鯖塩焼き` → `盐烤鲭鱼`
- `宇和島流鯛めし` → `宇和岛式鲷鱼饭`
- `真鯛のフィッシュ＆チップス` → `真鲷炸鱼薯条`
- `神威豚ロース塩麹グリル` → `盐麹烤神威猪里脊`
- `ズッパフォルテ` → `那不勒斯辣味炖猪杂`
- `神経〆活魚` → `神经处理鲜鱼`
- `釣り魚` → `钓获鲜鱼`

词典只翻译来源中已经真实出现的菜名，不根据菜系创造菜品。

## Translation-pending

`data/dish_translation_pending.json` 表示“已有真实 source evidence，但 deterministic normalizer 暂时没有可靠中文名”，不是 no-dish gap。

首个基线：53 items / 47 restaurants；Japanese hint 52 / 53。

当前：**2 items / 2 restaurants**：

- `えびず焼き`
- `ソルベージュ®エスプレッソ`

两条都继续保留日文原文与来源，避免硬造中文商品名。

## Retained-first 数据采集

`scripts/build_retained_dish_evidence.mjs` 不联网，优先消费仓库已经保存并带 provenance 的 source facts。

当前 retained normalization：

- 40 source enrichment shards；
- 584 source rows scanned；
- 110 rows 声明 dish-related fields；
- **151** retained dish values 已完成中文规范化；
- untranslated/pending：**2**；
- **174** retained featured evidence items；
- 覆盖 **110 家**；
- provider item：Tabelog **79** / official **72**。

## 官网大批量采集

`scripts/collect_google_inventory_recommendations.mjs` 已改为批量菜单页模式：

- 仅处理 1,415 家 named public runtime；
- 只访问已经绑定的 independent official/source website；
- Google / Tabelog / Hot Pepper / social URL 不作为 direct official crawl target；
- retained Hot Pepper 只消费仓库现有数据；
- 同一官网最多访问 root + 少量 same-origin menu/food 页面；
- 普通菜单 HTML 中真实菜名 → `source_menu_text` / F；
- 明确推荐 marker 周围的具体菜名 → `source_recommendation_text` / R；
- raw HTML 不持久保存，只保留最小 evidence snippet、URL、原始菜名和检查日期。

当前 workflow 参数：host workers **24**；timeout **7 s**；site page limit **5**；same-origin menu-link limit **4**。

### 批量运行结果

首个 `source_menu_text` 大批量 run `34181373791`：

- website tasks 342 / hosts 290 / pages visited 668；
- plain-menu restaurants 91 / plain-menu items 370；
- merged featured restaurants 176 → **260**；
- public dish display 305 → **332**。

扩容后的 run `34181498254`：

- 24 host workers；
- merged featured restaurants **263**；
- public featured **277**；
- public dish display **333**。

恢复完整词典并扩大日文菜单链接 marker 后，run `34182257357`：

- website tasks **280** / hosts **242** / pages visited **459**；
- website recommendation restaurants 31；
- website featured/menu restaurants 35；
- website plain-menu items 139；
- fresh recommendation items 73；
- fresh featured items 213。

最终 merged detail evidence：

- evidence restaurants：**324**；
- recommendation evidence restaurants：**176**；
- featured evidence restaurants：**268**；
- recommendation evidence items：**325**；
- featured evidence items：**644**；
- `source_menu_text`：**397 items**。

## Public runtime 当前结果

- restaurants：**1,415**；
- `recommendedDishes` known：**202 家**；
- `featuredDishes` known：**282 家**；
- 至少有一项可展示中文规范化菜品：**337 家 / 23.8%**；
- 无公开菜品值：**1,078 家**；
- approximate recommendation：**0**；
- generic fallback：**false**。

“337 家有中文菜品”只表示**我们已经把 source-native 菜名规范化成中文**，不表示这些餐厅官网提供中文。

## SQLite canonicalization

`scripts/database/resolve_dish_translation_evidence.py`：

1. 读取 R/F dish evidence；
2. identity 必须 `verified` / `source_matched` 且无 conflict；
3. 要求合法 source URL；
4. 保留 source-original；
5. `nameZh` 必须通过中文 canonical label 检查；
6. R/F evidence class 严格隔离；
7. materialize `recommended_dishes.zh` / `featured_dishes.zh`；
8. 不修改 identity；
9. 不联网；
10. 不做 cuisine/name/brand inference。

`export_master_core.py` 优先使用 `*.zh`，没有 canonical zh 时才 fallback 历史 legacy 字段。

### 最新 SQLite 验证

Database contract run `34182366280` 完整 success：

- phase2 dish evidence observations：**969**；
- accepted semantic + Chinese canonicalization：**941**；
- accepted with source-original：**941 / 941**；
- accepted recommendation evidence：317；
- accepted featured evidence：624；
- canonical `recommended_dishes.zh`：**170 家 / 298 items**；
- canonical `featured_dishes.zh`：**261 家 / 564 items**；
- identity-conflict evidence：6；
- identity-not-publishable evidence：22；
- translation/canonical validator failures：**0**；
- `dishSemanticReviewPlaces`：**0**。

数据库重复构建幂等、backup/restore、shadow export 全部通过。

## 大批量工作计划

新增 `scripts/build_dish_batch_plan.mjs` 和 `data/dish_batch_plan.json`。

默认按 frozen Google Place ID 做稳定 FNV-1a hash，分为 **8 个 shard**；worker 只采集 proposal/evidence，最终 truth 只能由 central merge/resolver 写入。

当前 dish work rows：**1,268**。

Lane：

- `official_crawl`：**220**；
- `retained_source_mining`：**646**；
- `independent_source_discovery`：**347**；
- `official_or_retained_featured`：**55**。

8 个 shard 总量：**156 / 179 / 178 / 157 / 163 / 153 / 127 / 155**。负载足够均衡，可继续用于并行 worker / CI 分片。

## Tabelog 8-shard 实验与限制

为了验证 646 家 retained-third-party lane 是否能通过网络直接批量补菜单，新增：

- `scripts/collect_tabelog_dish_evidence.mjs`
- `.github/workflows/collect-tabelog-dishes.yml`

严格规则：exact-bound Tabelog sourceRef only；root 重新验证餐厅名；只从该餐厅菜单页提取 F；评论正文禁止作为菜单证据；R 仍要求明确推荐语义；8 shard 独立采集，central merge 单写者。

workflow run `34181963583` 机械结构全部成功，但 8 个 shard 对 Tabelog root 的实际请求全部无法得到可用 identity page；代表 shard 为 42 targets / 0 successful identity pages / 0 menu pages。central merge 验证 8 个 shard fresh evidence 全为 0。

因此：

- GitHub-hosted runner 当前**不适合作为 Tabelog 直接抓取环境**；
- workflow 已改为 `workflow_dispatch` manual-only；
- 普通 push 不会自动重试 Tabelog；
- 已 retained 的 Tabelog evidence 继续正常消费；
- 8-shard / central-merge 架构保留，可用于其他可访问数据源或未来不同执行环境。

## Merge / QC

`merge_google_inventory_detail_evidence.mjs` 使用 monotonic union；短期网页抓取失败不能删除过去已验证 evidence。

semantic dedupe key：`nameZh + provider + sourceUrl + evidenceClass`。

Blocking QC：

- R 必须 `source_recommendation_text`；
- ordinary menu/featured evidence 不能越级成为 R；
- `source_menu_text` 必须来自 already-bound source website；
- `tabelog_menu_text` 必须保持 Tabelog provider；
- `approximateRecommendationsAllowed = false`；
- `genericFallbackAllowed = false`；
- canonical/public dish label 使用中文；
- source-original 必须保留；
- zero-paid-data-API audit 必须通过。

## 当前剩余 recommendation-first queue

`recommendedDishes` gap：**1,213**：

- **220** `collect_strict_recommended_dishes`：已有 crawlable bound official URL；
- **646** `extract_retained_dish_source`：有 retained Tabelog / Hot Pepper 等第三方 source；
- **347** `find_independent_dish_source`：需要寻找新的免费 independent dish source。

220 + 646 + 347 = 1,213。

这和 `dish_translation_pending.json` 是两个不同问题：前者缺更多推荐/菜单来源，后者是已经有来源但中文规范化尚未完成。

## 下一步开发顺序

1. 继续自动批量跑 220 家 bound official source，优先提取明确推荐语义，同时继续补 F 菜单；
2. 对 646 家 retained-source lane 优先消化仓库内已有文本与 exact source facts，不对被阻断的 Tabelog 做重试风暴；
3. 对 347 家缺 independent dish source 的记录寻找新的免费公开来源；
4. 扩充 Japanese/source-native → zh-CN specific dictionary，但只针对真实来源菜名；
5. translation-pending 继续保留不确定品牌自造名；
6. 继续使用 8-shard bulk plan + central merge 单写者；
7. 保持 R/F/C 边界、monotonic evidence、identity 隔离和 zero-paid-data-API 不变。
