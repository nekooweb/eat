# 推荐菜证据与批量补全流程

更新日期：2026-09-08。

## 目标

`recommendedDishes` 是推荐页面的重要高优先级字段，但它表达的是“该餐厅存在来源支持的推荐/招牌/人气菜”，不能等同于“这个菜系通常会吃什么”。因此本项目采用 **coverage second to semantics**：尽可能扩大来源覆盖，但不使用菜系、店名或品牌模板伪造推荐菜。

当前 frozen catalog 始终为 **2,804 Place ID**；公开 runtime 只包含已经有独立来源名称并满足发布条件的餐厅。推荐菜采集只面向公开命名餐厅，剩余 Place-ID-only 身份恢复继续由独立 identity planner 处理。

## 三层菜品语义

### R — strict recommendation

进入公开 `recommendedDishes`。

必须满足以下任一条件：

1. retained source 已经明确声明 `recommendedDishes`，且对应 `sourceRef` 明确 claim 该字段；
2. 官网或 retained Hot Pepper 文案中，**具体菜名**与明确推荐语义出现在同一局部文本块，例如：
   - おすすめ / オススメ / お勧め
   - 名物 / 看板 / 看板メニュー / 自慢
   - 一押し / イチオシ / 一番人気 / 人気No.1 / 売れ筋 / 必食
   - スペシャリテ / シグネチャー
   - signature / specialty / recommended / best seller / must try / most popular / house special / chef recommendation

仅出现菜名、不出现推荐语义时，不允许升级为 R。

### F — source-backed featured/menu dish

进入公开 `featuredDishes`，用于保留有价值的菜单信息，但不冒充“推荐菜”。

允许来源：

1. retained Tabelog / official / Hot Pepper source row 的 `dishes` / `featuredDishes`，且 `sourceRefs.fields` 明确包含相应字段；
2. retained Hot Pepper `catch` 中出现具体菜名，但没有明确推荐词；
3. 已绑定官网页面中的 schema.org / JSON-LD `MenuItem`；
4. 其他未来新增的结构化菜单证据，前提是 provenance 可追踪。

### C — candidate only

只用于内部 enrichment queue，**不得进入公开 recommendation/featured 字段**：

- cuisine → 菜品模板；
- restaurant name → 菜品猜测；
- brand → 固定菜单模板，但没有实际来源页；
- generic tags；
- 大模型/规则仅凭常识推测的菜品。

## 当前批处理顺序

```text
retained source_enrichment facts
        │
        ├─ explicit recommendedDishes + sourceRef ──> R
        └─ dishes / featuredDishes + sourceRef ─────> F

retained Hot Pepper catalog facts
        │
        ├─ catch + recommendation marker + dish ────> R
        └─ catch + concrete dish only ──────────────> F

already-bound official websites
        │
        ├─ local recommendation block + dish ───────> R
        └─ JSON-LD MenuItem ────────────────────────> F

R/F evidence
        │
        └─ monotonic merge -> audit -> runtime rebuild -> public export
```

## 抽取器

共享实现：`scripts/recommended_dish_extractor.mjs`。

### 局部推荐上下文

旧逻辑先把整页 HTML 压成一个长字符串，再检查菜名前后固定字符数。这会把网页不同模块的“人気”等词与无关菜单项错误拼接。

新逻辑先把 `p/div/li/heading/table cell/section` 等块级元素拆成文本块；只有包含推荐 marker 的块及其紧邻块会构成推荐上下文。当前上下文上限约 420 characters，保存的 evidence snippet 上限 90 characters。

### specific-first 菜名词典

词典按照“具体菜名优先于大类”的顺序匹配，例如：

- `濃厚つけ麺` → `浓厚蘸面`，先于普通 `つけ麺`；
- `家系ラーメン` → `横滨家系拉面`，先于普通 `ラーメン`；
- `バターチキン` → `黄油鸡咖喱`，先于普通 `カレー`；
- `エビ炒飯` → `虾仁炒饭`，先于普通 `炒飯`；
- `鯖塩焼き` → `盐烤鲭鱼`；
- `だし巻き玉子` → `日式高汤玉子烧`；
- `カオマンガイ`、`海南鶏飯`、`バインミー`、`トムヤムクン` 等保留具体菜型。

词典只负责把**来源中已经实际出现的菜名**标准化为中文，不负责根据餐厅类别创造菜品。

## 来源访问边界

### Retained first

先消化仓库内已经保留的 provider facts。`build_retained_dish_evidence.mjs` 不进行任何网络请求，只读取已经有 provenance 的 source rows。

### Hot Pepper

当前 collector 使用已经保留的 `hotpepper_catalog_facts.json`，不因为推荐菜补全再次调用付费/额外 API。

### Tabelog

只使用已经 retained 且 sourceRef 明确的 Tabelog 事实。由于 live access 存在 403 / access restriction，不绕过限制、不做代理/镜像规避。

### Official websites

只访问已经绑定到餐厅的独立官网 URL，并最多跟随少量 same-origin menu/food 链接；Google / Tabelog / Hot Pepper / social URLs 不作为 direct crawl target。不绕过登录、CAPTCHA、robots/access restriction；raw HTML 不 durable。

## 证据结构

每个菜品 evidence 至少包含：

- `nameZh`
- source-native/original name
- `provider`
- `sourceUrl`
- `checkedAt`
- `evidenceClass`
- short `evidenceSnippet`
- 新抽取项额外包含 `evidenceRule`

主要 evidence class：

- `source_recommendation_text` — 可进入 recommended；
- `retained_source_menu_item` — featured only；
- `provider_promotional_dish_text` — featured only；
- `structured_menu_item` — featured only。

## 合并与保留

`merge_google_inventory_detail_evidence.mjs` 保持 monotonic union：新的网页访问失败或暂时找不到菜名时，不删除以前已经通过验证的来源证据。

去重 key 同时包含菜名、provider、source URL 和 evidence class，避免把不同来源的独立佐证互相覆盖。

## Recommendation-first queue

`build_google_inventory_detail_queue.mjs` 已与当前架构重新对齐：

- frozen catalog = 2,804；
- detail queue = 当前公开命名 runtime，而不是错误要求 runtime 本身有 2,804 rows；
- identity recovery 不再混入 detail queue；
- 对公开命名餐厅，缺 `recommendedDishes` 是 detail enrichment 的第一优先级；
- 有已知 source URL：`collect_strict_recommended_dishes`；
- 没有可用 source URL：`find_independent_dish_source`。

## 防止模板回归

公开 runtime 始终要求：

- `approximateRecommendationsAllowed = false`；
- `genericFallbackAllowed = false`；
- 不存在旧 approximate metadata；
- 推荐菜中文展示；
- recommendation evidence audit 不允许 featured/menu-only evidence 升级成 recommendation。

同时持续输出 `topRepeatedRecommendedPairs`，用于发现异常的批量固定组合。大规模重复应首先视为数据生成逻辑异常，而不是正常覆盖增长。

## 基线与衡量方式

strict-source-v1 修正后的批处理前基线：

- public named restaurants：1,415；
- `recommendedDishes`：185 restaurants；
- featured-only：106 restaurants；
- any Chinese dish display：291 / 1,415 = 20.6%；
- approximate recommendation：0。

后续不以“推荐菜覆盖率越高越好”单独作为成功指标，而同时报告：

1. strict recommendation restaurants；
2. featured-only restaurants；
3. source/provider 分布；
4. evidence class 分布；
5. fresh-vs-retained 增量；
6. top repeated recommendation values；
7. remaining recommendation gap with/without known source URL。

这样可以区分真实来源覆盖增长与错误模板填充。
