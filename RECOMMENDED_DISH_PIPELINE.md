# 推荐菜证据、日文来源与中文数据库字段流程

更新日期：2026-09-08。

## 核心目标

`recommendedDishes` 是推荐页面的重要高优先级字段。这里的“中文菜品”指**最终写入数据库/公开 runtime 的规范化中文字段**，并不要求餐厅官网、Tabelog、Hot Pepper 或其他来源本身提供中文。

标准流程是：

```text
日文/其他 source-native 菜名
        ↓
保留原文 + provider + source URL + checkedAt + 语义证据
        ↓
菜名中文规范化 / 翻译
        ↓
R/F 语义审计
        ↓
SQLite canonical zh field
        ↓
recommendation/public export
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

这个词典只翻译来源中已经存在的菜名，不根据餐厅菜系创造菜品。

### Translation-pending

`scripts/build_retained_dish_evidence.mjs` 同时生成 `data/dish_translation_pending.json`。

如果一条记录满足：

- 菜品原文真实存在；
- 有 exact sourceRef / provider / URL；
- 但当前 deterministic dictionary 无法给出可靠中文；

则保留为：

`status = needs_zh_normalization`

而不是丢弃。

这类记录代表“**有菜品证据，但中文规范化尚未完成**”，不能计入 no-dish gap。

本轮建立 pending queue 时的首个基线为：

- pending items：53；
- pending restaurants：47；
- Japanese-language hint：52 / 53。

随后已经针对其中含义明确的日文菜名批量扩充词典；品牌自造名或含义不稳定的少数项继续保留 pending，避免硬翻。

## Retained-first 数据采集

`scripts/build_retained_dish_evidence.mjs` 不进行网络请求，先消化仓库已经保存并带 provenance 的 source facts。

在建立 source-native translation queue 前的 retained pass：

- 40 source enrichment shards；
- 584 source rows scanned；
- 110 rows 声明 dish-related fields；
- 100 retained dish values 已可中文规范化；
- 136 条 featured evidence；
- 覆盖 99 家；
- provider item：Tabelog 63 / official 37。

普通 `dishes` 即使已经成功翻译，也只进入 F，不能因为“已经有中文”就升级成推荐菜。

## Official / Hot Pepper extraction

`scripts/collect_google_inventory_recommendations.mjs` 只处理当前 named public runtime。

- Hot Pepper 使用已经保存的 retained facts，不为推荐菜补全增加付费 API；
- 官网只访问已绑定的 independent official URL；
- Google / Tabelog / Hot Pepper / social URL 不作为 direct crawl target；
- 官网最多跟随少量 same-origin menu/food links；
- raw HTML 不 durable；
- JSON-LD `MenuItem` 只证明 F，除非另有明确推荐语义。

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

## SQLite 当前验证结果

Database contract run `34180159419` 已完整 success。

已检查的 retained dish evidence：

- evidence observations：450；
- accepted semantic + translation items：**436**；
- 其中保留 source-original：**436 / 436**；
- canonical `recommended_dishes.zh`：**159 家 / 227 items**；
- canonical `featured_dishes.zh`：**158 家 / 204 items**；
- identity conflict evidence：4；
- identity not publishable：10；
- translation/canonical validator failures：0。

这证明当前数据库逻辑不是“来源必须有中文”，而是“来源原文可以是日文，最终 canonical field 必须规范成中文”。

旧 planner 中的 211 个 dish semantic review tasks 也已重新解释：已经有合法 source-native evidence + 中文规范化的记录不需要人工 review。planner `master-plan-v3` 下当前这类可执行 dish semantic review 已降为 **0**；identity 尚未 publishable 的菜品证据继续等待 identity recovery，而不是误算成翻译问题。

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

当前 public runtime 与 SQLite canonicalization 是两条尚未完全 cutover 的统计路径：

Public named runtime：

- 1,415 家；
- `recommendedDishes`：192 家；
- `featuredDishes` known：188 家；
- 已有中文规范化菜品字段可展示：300 家 / 21.2%。

这里的“300 家”表示**最终已有中文规范化值**，不是说 300 家餐厅的网站提供中文。

SQLite source-backed canonical subset：

- `recommended_dishes.zh`：159 家；
- `featured_dishes.zh`：158 家。

两组数字不能直接相减：public runtime 还包含 legacy/canonical 路径中的其他已验证菜品；SQLite shadow export 尚未正式替换 Pages runtime。

## Recommendation-first remaining queue

当前 public `recommendedDishes` gap = 1,223：

- **229** `collect_strict_recommended_dishes`：已有 crawlable bound official URL；
- **647** `extract_retained_dish_source`：有 retained Tabelog / Hot Pepper 等第三方来源；
- **347** `find_independent_dish_source`：需要寻找新的免费独立 dish source。

这条 queue 负责“找更多推荐菜来源”。`dish_translation_pending.json` 则负责“已有来源菜名尚未中文规范化”。两者是不同缺口，不能混为一谈。

## 继续开发顺序

1. 对 229 家绑定官网继续抽取推荐/菜单文本；
2. 对 647 家 retained third-party source 做更深的日文菜名/推荐语义提取；
3. source-native 菜名先进入 evidence，再批量中文规范化；
4. 不能可靠翻译的进入 translation-pending，不丢证据；
5. 对 347 家缺来源项寻找新的免费独立来源；
6. 保持 R/F/C 语义、semantic dedupe、重复聚类 guard 和 zero-paid-data-API 不变。
