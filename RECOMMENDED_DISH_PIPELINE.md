# 推荐菜证据、日文来源与中文数据库字段流程

更新日期：2026-09-08。

## 核心目标

`recommendedDishes` 是推荐页面的重要高优先级字段。这里的“中文菜品”指**最终写入数据库 / public runtime 的规范化中文字段**，并不要求餐厅官网、Tabelog、Hot Pepper 或其他来源本身提供中文。

标准流程是：

```text
日文 / 其他 source-native 菜名
        ↓
保留原文 + provider + source URL + checkedAt + 语义证据
        ↓
菜名中文规范化 / 翻译
        ↓
R/F 语义审计
        ↓
SQLite canonical zh field
        ↓
recommendation / public export
```

因此：

- 日文来源完全有效，而且是当前最常见输入；
- evidence 中必须保留原始日文/原文，不能只保存中文翻译；
- 数据库中的 canonical dish label 使用中文；
- 暂时无法可靠翻译的 source-backed 菜名进入 translation-pending，而不是被当成“没有菜品”；
- 禁止用 cuisine / restaurant name / brand 常识凭空生成菜名来代替来源证据。

当前 frozen catalog 始终为 **2,804 Place ID**；公开 named runtime 为 **1,415 家**，其余 Place-ID-only 身份恢复继续由独立 identity pipeline 负责。

## 三层菜品语义

### R — strict recommendation

R 才能进入公开 `recommendedDishes`。

必须满足以下任一条件：

1. retained source 明确声明 `recommendedDishes`，且对应 `sourceRef` 明确 claim 该字段；
2. 已绑定官网或 retained Hot Pepper 文案中，具体菜名与明确推荐语义出现在同一局部文本块。

推荐语义包括但不限于：

- おすすめ / オススメ / お勧め
- 名物 / 看板 / 看板メニュー / 自慢
- 一押し / イチオシ / 一番人気 / 人気No.1 / 売れ筋 / 必食
- スペシャリテ / シグネチャー
- signature / specialty / recommended / best seller / must try / most popular / house special / chef recommendation

仅出现一个菜名，不足以证明它是“推荐菜”。

### F — source-backed featured/menu dish

F 表示来源中确实存在该菜品，但没有足够推荐语义，因此进入 `featuredDishes`，不能冒充 R。

允许来源包括：

- retained Tabelog / official / Hot Pepper 的 `dishes` / `featuredDishes` + exact sourceRef；
- retained Hot Pepper promotional/catch text 中的具体菜名；
- 已绑定官网的 schema.org / JSON-LD `MenuItem`；
- 未来新增且 provenance 可追踪的结构化菜单证据。

### C — candidate only

以下内容只能用于内部候选，不进入公开 recommendation/featured 字段：

- cuisine → 常见菜模板；
- restaurant name → 菜品猜测；
- brand → 固定菜单模板，但没有实际来源页；
- generic tags；
- 大模型/规则仅凭常识推测的菜品。

## 语言契约：source-native → zh-CN

### Evidence 层

每个菜品 evidence 至少保留：

- `nameOriginal` / 历史兼容字段 `nameJa`
- `nameZh`（已完成规范化时）
- `provider`
- `sourceUrl`
- `checkedAt`
- `evidenceClass`
- `evidenceRule`
- short evidence snippet（适用时）

`nameOriginal` 是来源事实，`nameZh` 是规范化值。两者职责不同，不能用中文翻译替换掉原文证据。

### 中文规范化器

共享实现：`scripts/recommended_dish_extractor.mjs`。

`translateDishText()` 对来源中真实出现的菜名进行中文规范化。specific-first 规则优先保留具体菜型，例如：

- `濃厚つけ麺` → `浓厚蘸面`
- `家系ラーメン` → `横滨家系拉面`
- `バターチキン` → `黄油鸡咖喱`
- `鯖塩焼き` → `盐烤鲭鱼`
- `だし巻き玉子` → `日式高汤玉子烧`
- `石焼ビビンパ` → `石锅拌饭`
- `純豆腐チゲ` → `嫩豆腐锅`
- `宇和島流鯛めし` → `宇和岛式鲷鱼饭`
- `スターバックス ラテ` → `星巴克拿铁`
- `ハニーミルクラテ` → `蜂蜜牛奶拿铁`
- `ズッパフォルテ` → `那不勒斯辣味炖猪杂`
- `神経〆活魚` → `神经处理鲜鱼`
- `釣り魚` → `钓获鲜鱼`

这个词典只翻译来源中已经存在的菜名，不根据餐厅菜系创造菜品。

### Translation-pending

`scripts/build_retained_dish_evidence.mjs` 同时生成 `data/dish_translation_pending.json`。

如果一条记录满足：

- 菜品原文真实存在；
- 有 exact sourceRef / provider / URL；
- 但当前 deterministic dictionary 无法给出可靠中文；

则保留为：

`status = needs_zh_normalization`

而不是丢弃。这类记录代表“**有菜品证据，但中文规范化尚未完成**”，不能计入 no-dish gap。

首个 translation-pending 基线：

- pending items：53；
- pending restaurants：47；
- Japanese-language hint：52 / 53。

在批量扩充日文→中文规则并针对含义明确的少数菜名核对来源后，当前已降为：

- pending items：**2**；
- pending restaurants：**2**；
- Japanese-language hint：**2 / 2**。

当前仅保留：

- `えびず焼き`：品牌/店铺自造菜名，现有来源没有足够清晰的菜品构成说明；
- `ソルベージュ®エスプレッソ`：商标产品名，继续保留原文，避免在未固定产品命名策略前强行创造中文商品名。

这两条都已经有 source evidence；它们不是“缺菜品”。

## Retained-first 数据采集

`scripts/build_retained_dish_evidence.mjs` 不进行网络请求，先消化仓库已经保存并带 provenance 的 source facts。

当前 retained normalization batch：

- 40 source enrichment shards；
- 584 source rows scanned；
- 110 rows 声明 dish-related fields；
- **151** retained dish values 已完成中文规范化；
- skipped/untranslated：**2**；
- **174** featured evidence items；
- 覆盖 **110 家**；
- provider item：Tabelog **79** / official **72**。

普通 `dishes` 即使已经成功翻译，也只进入 F，不能因为“已经有中文”就升级成推荐菜。

## Official / Hot Pepper extraction

`scripts/collect_google_inventory_recommendations.mjs` 只处理当前 named public runtime。

- Hot Pepper 使用已经保存的 retained facts，不为推荐菜补全增加付费 API；
- 官网只访问已绑定的 independent official URL；
- Google / Tabelog / Hot Pepper / social URL 不作为 direct crawl target；
- 官网最多跟随少量 same-origin menu/food links；
- raw HTML 不 durable；
- JSON-LD `MenuItem` 只证明 F，除非另有明确推荐语义。

最新 source-backed detail evidence：

- evidence restaurants：**292**；
- recommendation evidence restaurants：**170**；
- featured evidence restaurants：**176**；
- recommendation evidence items：**241**；
- featured evidence items：**255**；
- evidence class：`source_recommendation_text` 241 / `retained_source_menu_item` 175 / `provider_promotional_dish_text` 80。

最新 collector 本轮还从官网识别到 3 家新的 strict recommendation，说明日文官网文本可以直接作为推荐语义输入，再转换成中文 canonical dish value。

## SQLite canonicalization

过去 detail evidence 中虽然同时已有 source-native + `nameZh`，SQLite master 仍主要导出旧的 `recommended_dishes.legacy` / `featured_dishes.legacy`。这一层已修正。

新增：`scripts/database/resolve_dish_translation_evidence.py`。

它会：

1. 读取 `dish.recommendation.evidence` / `dish.featured.evidence`；
2. 要求 identity 已 `verified` / `source_matched` 且无 conflict；
3. 要求合法 source URL；
4. 保留 source-original；
5. 检查 `nameZh` 为中文 canonical label；
6. 按 R/F evidence class 做语义隔离；
7. 自动 materialize：
   - `recommended_dishes.zh`
   - `featured_dishes.zh`
8. 不修改 identity；
9. 不进行任何 network request；
10. 不做 cuisine/name/brand inference。

`export_master_core.py` 现在优先使用 `*.zh`，只有 canonical zh 不存在时才 fallback 到历史 `*.legacy`。

数据库级语言契约另见 `docs/database/dish_language_contract.md`。

## SQLite 当前验证结果

Database contract run `34180836433` 已在最新 detail evidence 上完整验证。

- retained dish evidence observations：**496**；
- accepted semantic + translation items：**480**；
- 保留 source-original：**480 / 480**；
- canonical `recommended_dishes.zh`：**164 家 / 232 items**；
- canonical `featured_dishes.zh`：**171 家 / 243 items**；
- identity-conflict evidence：6；
- identity-not-publishable evidence：10；
- translation/canonical validator failures：**0**。

数据库重建幂等、backup/restore、shadow export 也全部通过。planner `master-plan-v3` 下当前可执行 `dish_semantic_review` 为 **0**：已经有合法 source-native evidence + 中文规范化的记录不再进入人工语义任务；identity 尚未 publishable 的菜品证据等待 identity recovery，而不是误算成翻译问题。

## Merge / QC

`merge_google_inventory_detail_evidence.mjs` 使用 monotonic union：短期网页抓取失败不能删除以前已经验证的来源菜品证据。

semantic dedupe key：

`nameZh + provider + sourceUrl + evidenceClass`

原始日文/原文只作为 provenance metadata，不因日文写法差异让同一页同一中文菜重复计数。

Blocking QC：

- recommendation 必须来自 `source_recommendation_text`；
- menu/featured evidence 不能越级成为 R；
- `approximateRecommendationsAllowed = false`；
- `genericFallbackAllowed = false`；
- 不允许 legacy approximate metadata 回归；
- canonical/public dish label 使用中文；
- 同一双菜组合达到 20 家或同一单菜达到 60 家时阻止发布并审查。

## Public runtime 与 SQLite 指标不要混用

当前 public runtime 与 SQLite canonicalization 是两条尚未完全 cutover 的统计路径。

Public named runtime：

- restaurants：**1,415**；
- `recommendedDishes`：**196 家**；
- `featuredDishes` known：**190 家**；
- featured-only：109 家；
- 已有中文规范化菜品值可用于展示：**305 家 / 21.6%**；
- 无公开菜品值：1,110 家；
- approximate recommendation：0。

这里的“305 家”表示**最终已有中文规范化值**，不是说 305 家餐厅的网站提供中文。

SQLite source-backed canonical subset：

- `recommended_dishes.zh`：**164 家**；
- `featured_dishes.zh`：**171 家**。

两组数字不能直接相减：public runtime 仍包含 legacy/canonical 路径中的其他已验证菜品；SQLite shadow export 尚未正式替换 Pages runtime。

## Recommendation-first remaining queue

当前 public `recommendedDishes` gap = **1,219**：

- **226** `collect_strict_recommended_dishes`：已有 crawlable bound official URL；
- **646** `extract_retained_dish_source`：有 retained Tabelog / Hot Pepper 等第三方来源；
- **347** `find_independent_dish_source`：需要寻找新的免费独立 dish source。

226 + 646 + 347 = 1,219。

这条 queue 负责“找更多推荐菜来源”。`dish_translation_pending.json` 则负责“已有来源菜名尚未中文规范化”。两者是不同缺口，不能混为一谈。

## 继续开发顺序

1. 对 226 家绑定官网继续抽取日文推荐/菜单文本；
2. 对 646 家 retained third-party source 做更深的日文菜名/推荐语义提取；
3. source-native 菜名先进入 evidence，再批量中文规范化；
4. 不能可靠翻译的进入 translation-pending，不丢证据；
5. 对 347 家缺来源项寻找新的免费独立来源；
6. 保持 R/F/C 语义、semantic dedupe、重复聚类 guard 和 zero-paid-data-API 不变。
