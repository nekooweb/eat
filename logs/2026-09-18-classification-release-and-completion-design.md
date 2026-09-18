# 2026-09-18 — 分类第一阶段发布与数据补全设计

## 本轮起点

本轮接续 PR #77 的有效分类设计，但实际实现全部基于当前 `main`，没有直接合并已经落后的旧 PR 分支。

目标分两部分：

1. 记录 2026-09-17 已完成并生产发布的基础修复与三维分类；
2. 建立下一阶段 evidence-first 数据补全逻辑，避免重新回到“字段为空就全量扫描”的模式。

## 已完成并进入 `main`

### PR #80：V1 privacy / budget / review lifecycle

PR #80 已合并，merge commit：

`868d3fc1808ea533c73691af35e2a954c5adc1bf`

完成内容：

- 公开前端删除 Area1 private reference anchor 及对应 reference circle；
- `¥999以下` 改为与其他预算档一致的区间重叠语义；
- dish planner 开始读取 `data/agent_reviews/<marker>/S*.json` 的 terminal review；
- cooldown 按 `(lane, frozen Place ID)` 生效；
- 默认 cooldown：accepted evidence 30 天、candidate 30 天、no evidence 60 天、blocked 30 天；
- deferred row 保留 status、lastReviewedAt、retryAfter 和 review provenance，不静默删除；
- 新增 `test_v1_quality_fixes.mjs` 与 `test_dish_review_cooldown.mjs` 并进入 PR gate；
- 将 PR #77 的分类设计迁移为当前主线文档 `CUISINE_FILTER_PLAN.md`。

PR #80 合入时 cooldown 仍只按日期判断；该缺口随后已由 PR #83 的 source fingerprint lifecycle 完成。

### PR #81：三维分类第一阶段

PR #81 已合并，merge commit：

`aa0a2b4a6a03a1984f98e1e22ae82d022e09e96d`

完成内容：

- 新增 `classification.js` / `classification.css`；
- 三个独立维度：`cuisineStyle`、`foodType`、`venueType`；
- 固定 concept ID + exact alias taxonomy；
- 拉面/乌冬/荞麦面 → 面类、川菜 → 中餐等明确同维度父子关系；
- 禁止跨维度自动推导；
- `イタリアン・フレンチ`、`カフェ・スイーツ`、`焼肉・ホルモン` 等复合类别保持 unsplit；
- generic `餐厅 / restaurant / その他グルメ` 保持 unknown；
- 公开页面从单一菜系排除切换为三维分组排除；
- 排除父类会命中已登记后代，排除子类不会误伤 sibling；
- unknown 分类店铺仍可进入候选池；
- 分类、预算或距离变化后，旧随机结果立即失效并要求重新生成；
- 卡片与比较表使用同一 normalized classification result；
- Pages 将分类 JS/CSS 作为正式必需资产并进行 cache-busting。

第一阶段分类覆盖报告：

- public runtime：1,422；
- 至少一个 accepted classification：1,198；
- coverage：84.25%；
- cuisine style：476；
- food type：225；
- venue type：576；
- 多维命中：70。

这些分类全部来自现有 `cuisine/tags` 精确值；未使用店名、菜单或推荐菜关键词推断 accepted classification。

## 生产发布确认

PR #81 最终 head 的 PR Review、Pages preview build、no-paid-data-API policy 均通过。

合入 `main` 后：

- Pages production run #1332 / run ID `35237626516`：**success**；
- no-paid-data-API run #1033 / run ID `35237626737`：**success**。

因此三维分类第一阶段现在属于已生产发布状态，不再使用“待部署”描述。

## PR #82：report-only completion planner

下一阶段第一片实现放在 PR #82。它不采集网络、不改 canonical，只在维护式 `--public-only` rebuild 后读取同一 checkout 的：

- `data/google_inventory_runtime.js`；
- `classification.js`；
- `data/source_facts.js`；
- `data/source_provenance.js`；
- `data/google_inventory_detail_queue.json`。

新增：

- `DATA_COMPLETION_PLAN.md`；
- `scripts/build_completion_plan.mjs`；
- `scripts/test_completion_plan.mjs`；
- 本日志及 `DEVELOPMENT.md` 当前状态更新。

planner 明确区分：

```text
retained evidence review
  -> already-bound source review
  -> new-source discovery
```

并为任务生成稳定 SHA-256 `sourceFingerprint`，为下一步 source-change cooldown invalidation 做输入基础。

## 同一 checkout 的真实维护式结果

以下数字是 **PR #82 时点的历史 maintained baseline**，用于记录 planner 刚上线时的分层；PR #86 后 Google/navigation source eligibility 已收紧，当前数字见后文 PR #86 检查点。

### Dish queue

旧 committed `data/dish_batch_plan.json` 仍是 2026-09-16、cooldown 上线前的历史 snapshot，不能代表当前 active work。

当前 maintained plan：

- raw dish work：870；
- active dish work：**23**；
- recently-reviewed deferred：**847**。

847 条 deferred 按 terminal status：

| Status | Rows |
| --- | ---: |
| `no_evidence` | 509 |
| `candidate` | 171 |
| `accepted_evidence` | 93 |
| `blocked` | 74 |

当前 23 条 active 全部属于 `official_or_retained_featured` lane。S0–S7 分布为 2 / 3 / 6 / 1 / 0 / 2 / 3 / 6。

这证明 cooldown 已经把“刚完成审查但 runtime 仍有 gap”的重复扫描从 870 条压到 23 条，而不是把旧 870 snapshot 当成当前工作量。

### 分类补全 inventory

公开 runtime 仍为 1,422，其中：

- accepted exact classification：1,198；
- unknown：224；
- unmapped non-generic taxonomy token：113。

224 个 unknown 的下一步被 report-only planner 分为：

| 下一步 | Rows | 含义 |
| --- | ---: | --- |
| taxonomy token first | 63 | 先审 source token；一次映射可能覆盖多店 |
| review bound source | 102 | 已有绑定来源，先复查该来源而不是另找新来源 |
| name candidate first | 59 | 没有可先处理 token/绑定来源；仅允许生成 candidate |

当前 retained source facts 中没有可直接形成 exact entity classification overlay 的额外行，因此 retained exact entity recovery = 0。这个结果支持“taxonomy first”而不是 224 家逐店搜索。

当前高收益 unmapped token 示例：

- `印度菜`：影响 25 家，其中 22 家当前 unknown；
- `面包・烘焙`：19 / 16；
- `創作料理`：7 / 6；
- `食堂`：8 / 2；
- `披萨`：5 / 2；
- `天妇罗`：4 / 2；
- `印度咖喱`：3 / 2；
- `ビリヤニ`、`越南菜`、`各国料理`、`西班牙菜`、`美式`：各有 2 个当前 unknown。

这只是待审 token inventory，不表示这些词已经自动映射。

### 营业时间补全 inventory

生产公开字段契约不是旧 `openingHours`，而是 `hoursRuntimePolicy = single-field-zh-v2` 下的 `hoursReference`。

当前 public materializer：

| Hours outcome | Rows |
| --- | ---: |
| normalized / `hoursReference` 已知 | **640** |
| hidden unparseable | 119 |
| hidden conflict | 14 |
| hidden semantic | 1 |
| no schedule source | 648 |
| **合计** | **1,422** |

因此不能看到 `openingHoursRaw` 就再次自动“恢复”：public materializer 已经消费过 retained raw。没有得到 `hoursReference` 的 retained raw 行必须进入 review。

当前 782 个公开 hours gap 被 planner 分为：

| 下一步 | Rows |
| --- | ---: |
| retained review | **55** |
| already-bound source review | **462** |
| new-source discovery | **265** |

也就是说真正需要找新 hours 来源的不是 782 家，而是 265 家。

### Budget 补全 inventory

当前：

- lunch 已知 172，缺 1,250；
- dinner 已知 621，缺 801。

planner 没有发现能从当前 `source_facts` 直接无审查恢复的新 lunch/dinner range；缺口按“先已有绑定来源、最后新来源”分层：

| Field | bound-source review | new-source discovery |
| --- | ---: | ---: |
| lunch | **974** | **276** |
| dinner | **525** | **276** |

这里的 bound-source 只表示当前 Place ID 已经绑定至少一个来源，未宣称该来源一定包含目标字段；它的意义是避免在复查现有来源前就去寻找第二套来源。

## 补全逻辑的当前结论

1. **分类先 token、后 entity**：113 个 unmapped token 是第一层；59 家才需要进入 name-keyword candidate 起点，而且 candidate 不能直接公开。
2. **hours 使用 `hoursReference` 契约**：640 家已完成；retained raw 但 public materializer 未接受的行进入 review，不重复自动解析覆盖。
3. **预算优先已有绑定来源**：当前没有新的 retained exact range 可直接恢复；974/525 条先复查已绑定来源，真正新-source discovery 各 276。
4. **网络工作必须分两类**：`networkRequired` 不等于 `newSourceDiscoveryRequired`；重新查看已绑定 source 和寻找新 source 必须分开统计。
5. **source fingerprint 已实现**：PR #83 已把 assignment-time fingerprint 写入新任务契约，并接入 terminal review / cooldown invalidation；只有 task-relevant source change 才能提前重激活。
6. **旧 review 兼容已验证**：历史 review 没 fingerprint 时继续走 date cooldown；maintained CI 实测仍为 870 raw / 23 active / 847 deferred / 0 source-changed reactivation。

## PR #82 / #83 完成检查点

PR #82 已合并到 `main`，merge commit `d5273417a4531ed16c611ca11f6b241087ad3f3d`。其最终 PR Review #151（`35240651494`）、Pages preview #1338（`35240651473`）和 no-paid #1046（`35240651485`）全部 success。report-only completion planner 因此已经成为主线维护工具，而不是设计草案。

PR #83 已合并到 `main`，merge commit `12640c030f4e1a5bc5788bf34413f7c4e7c84ba9`。实现细节：

- 新增稳定 dish-task SHA-256 source fingerprint；
- fingerprint 只吸收 frozen Place ID、lane/action、稳定 source binding、dish-relevant claimed fields 和 lane-relevant source count；
- checkedAt、UI/cuisine/distance/priority、source 顺序、URL fragment/UTM、hours/phone 等 unrelated field 不触发；
- schema-v2 active assignment 携带 fingerprint，worker 原样回传，central review fail-closed 校验；
- legacy review 没 fingerprint 时继续 date-only cooldown；
- 新 fingerprint review 与当前 fingerprint 不一致时，才以 `activationReason=source_changed` 提前重激活。

PR #83 maintained rebuild 的验收结果为：

- raw dish work：870；
- active：23；
- deferred：847；
- source-changed reactivated：**0**。

PR Review #159（`35296657432`）、Pages preview #1347（`35296657418`）、no-paid #1064（`35296657412`）均 success；合入主线后 Pages production #1348（`35296719894`）与 no-paid #1065（`35296719888`）也均 success。

## 当前实施：taxonomy token central review batch 1

report-only planner 的 224 个 classification unknown 中有 63 条应先由 taxonomy token 解决。当前 batch 1 新增中央 review artifact `data/classification_taxonomy_review_20260918_batch1.json`，第一批只处理 15 个 source token。逐 token 统计的 affected/unknown token hit 求和分别为 94/65；原 maintained planner 的 taxonomy-token-first 是 63 个唯一 restaurant row，因此 token hit 存在重叠，不能把两个口径混为一谈。

这 15 个 token 只允许 exact source-token mapping，不允许店名/菜单/推荐菜推断。复合或跨语义 token 使用独立 unsplit concept；例如 `面包・烘焙` 进入 food-type unsplit concept 而不推断 bakery venue，`印度咖喱` 只作为 food-curry 子类而不跨维度推断 Indian cuisine。

新增 `test_classification_taxonomy_reviews.mjs` 将 central review artifact 与 `classification.js` 逐项对齐，并锁住 generic unknown、同维度父子和跨维度禁止推断规则。63 是 batch 前 unique taxonomy-first row，不是 token-hit 求和。

PR #84 maintained preview 的实际分类报告：

| Metric | Batch 1 前 | Batch 1 preview | Delta |
| --- | ---: | ---: | ---: |
| accepted classification rows | 1,198 | **1,257** | **+59** |
| unknown rows | 224 | **165** | **-59** |
| coverage | 84.25% | **88.40%** | +4.15 pp |
| cuisineStyle rows | 476 | **516** | +40 |
| foodType rows | 225 | **257** | +32 |
| venueType rows | 576 | **585** | +9 |
| multi-dimension rows | 70 | **90** | +20 |
| unmapped taxonomy tokens | 113 | **98** | -15 |
| taxonomy-token-first unique rows | 63 | **4** | -59 |

remaining taxonomy-first unknown token hit 为：`御好烧` 1、`スープ` 1、`摩洛哥菜` 1、`汤品` 1、`烧烤` 1；5 个 token hit 落在 4 个 unique restaurant row。bound-source review 仍为 102、name-candidate-first 仍为 59，因此 batch 1 只解决了 global taxonomy 能安全解决的部分，没有改变 entity-review 边界。

## Taxonomy batch 2：taxonomy-first 清零

PR #85 单独审查上述 5 个剩余 token，不把它们混进 entity review：

- `御好烧` → 独立 `food-okonomiyaki`，不并入已有 `お好み焼き・もんじゃ` 复合概念；
- `スープ` / `汤品` → `food-soup`；
- `摩洛哥菜` → `style-moroccan`；
- `烧烤` → `food-barbecue`，不推断 `food-yakiniku` 或任何 cuisine style。

central review regression 现在同时扫描 batch 1 + batch 2，禁止跨批次重复 token，并继续检查 zero-network、zero-paid-API、generic unknown 与 same-dimension ancestry。

PR #85 maintained preview：

| Metric | Batch 1 后 | Batch 2 preview | Delta |
| --- | ---: | ---: | ---: |
| accepted classification rows | 1,257 | **1,261** | **+4** |
| unknown rows | 165 | **161** | **-4** |
| coverage | 88.40% | **88.68%** | +0.28 pp |
| cuisineStyle rows | 516 | **517** | +1 |
| foodType rows | 257 | **261** | +4 |
| venueType rows | 585 | **585** | 0 |
| multi-dimension rows | 90 | **91** | +1 |
| unmapped taxonomy tokens | 98 | **93** | -5 |
| taxonomy-token-first unique rows | 4 | **0** | **-4** |

剩余 93 个 unmapped token 当前全部位于已经至少有一个 accepted classification 的记录中，因此不再阻塞 unknown restaurant。batch 2 当时 planner 显示 102 bound-source review + 59 name-candidate-first；PR #86 随后发现其中两条所谓 bound source 只是不可用于证据的导航/当前无公开绑定证据，因此进一步修正。

## PR #86：可复查 bound source 资格修正与 entity review plan

PR #86 首轮 planner 恢复出 102 个 bound-source target，其中 100 个可显式恢复 120 个非 Google URL，2 个只有 aggregate source count：

- `ChIJ0U7bhxaMGGARuqkd6TFfQcc` / Bon Vivant：旧 review 的所谓 official source 是 `maps.app.goo.gl` 导航链接；不能作为分类证据源；
- `ChIJ0ZuaPACJGGARD2WOsCllQdk` / Gluten-free Izakaya SHION：现有菜品 review 记录 owner notice 指向当前地址已停业/迁址寻找中，而当前公开 runtime/provenance 没有可复查的分类绑定 URL。

因此 upstream `build_completion_plan.mjs` 不再把 Google Maps/navigation、Google-hosted ref 或无效 URL 计入 `sourceUrlCount`。保留 `aggregateSourceUrlCount` 与 `excludedNavigationOrInvalidSourceCount` 用于审计，但 bound-source task 必须暴露至少一个明确非 Google HTTP(S) `sourceLinks`。

修正后的 maintained 分层：

| Field | retained | bound-source review | new-source / candidate |
| --- | ---: | ---: | ---: |
| classification unknown | 0 exact / 0 taxonomy-first | **100** | **61 name-candidate** |
| hours gap | 55 | **459** | **268 discovery** |
| lunch budget gap | 0 | **971** | **279 discovery** |
| dinner budget gap | 0 | **522** | **279 discovery** |

classification bound-source plan 的实测：

- total rows：**100**；
- review-ready：**100**；
- source-reference repair：**0**；
- explicit links：**120**；
- source provider row counts：Overture Maps 75、Tabelog 14、runtime-bound 11、official 3、Hot Pepper 2（同一 row 可含多个 provider）；
- provenance 已直接声明 `cuisine` 的 link：**0**。

因此这 100 家不能根据已有字段自动 accepted；下一步只能对已绑定 URL 做 branch/category evidence review。新增 `scripts/build_classification_bound_source_plan.mjs`、`data/classification_entity_bound_proposal_template.json` 与 blocking regression；worker 只产 proposal，禁止新 source discovery、店名 accepted inference、菜单菜品 accepted inference 与 canonical write。

## 下一实施顺序

### A. Bound-source entity classification review

taxonomy-first 已清零，navigation-only source 也已从 bound-source 资格中排除。下一步为 **100 家**已有可复查绑定来源的 unknown entity 使用 deterministic 8-shard review queue；proposal 必须引用 frozen Place ID、当前 catalog name、assigned bound URL/provider、source fingerprint 和 source-native category evidence。worker 只产 proposal，central review 才能批准 accepted entity classification overlay。

### B. Name-candidate entity review

剩余 **61 家**没有可先复查的非 Google 绑定来源；店名关键词只能形成 candidate，不得直接写 accepted overlay。只有后续找到并核实独立来源后才能升级。

对通过已绑定来源核实的实体分类，使用 frozen Place-ID keyed accepted overlay；不覆写原始 `cuisine/tags`。店名关键词只产生 candidate。

### C. Hours / budget proposals

按 retained review → bound-source review → new-source discovery 顺序执行。worker/proposal 不直接写 canonical；继续 central review、validator、rebuild、replay。

## 约束继续保持

- frozen Place ID 是实体主键；
- source alias 不替代 catalog/tool identity name；
- paid Google Data API = 0；
- proposal/worker 不直接改 canonical truth；
- candidate 不计入 accepted coverage；
- 不为提高统计覆盖率降低 evidence threshold；
- 所有 merge/rebuild 必须幂等，并继续经过 Pages / policy / field validators。


## PR #86 合入后：下一阶段补全执行设计

PR #86 已合并到 `main`，merge commit `083bf2c78b7b1e4d9219ec26273bd19f2fde636c`。合入后的 Pages production #1370（`35298033984`）与 no-paid #1103（`35298033957`）均 success。

当前生产基线：

- public runtime：1,422；
- accepted classification：1,261（88.68%）；
- classification unknown：161 = **100 bound-source + 61 name-candidate**；
- taxonomy-token-first：0；
- classification bound-source：100/100 review-ready，120 explicit non-Google URLs；
- hours：640 known；55 retained-review + 459 bound-source + 268 discovery；
- lunch budget：172 known；971 bound-source + 279 discovery；
- dinner budget：621 known；522 bound-source + 279 discovery；
- dish：619 R / 707 F / 774 display；维护式 active 23 / deferred 847。

### 执行原则：先来源、后字段

下一阶段不再分别为 classification / hours / lunch / dinner 重复访问相同网页。

新的 source-centric 单位：

```text
(googlePlaceId, normalized source URL)
  -> inspect once
  -> save source-native field evidence
  -> central review each field independently
```

一次已绑定来源复核允许同时保存：

- classification category/business evidence；
- hours raw evidence；
- lunch budget evidence；
- dinner budget evidence。

但保存 sidecar evidence 不等于字段 accepted。classification、hours、lunch、dinner 仍分别执行语义验证与 central review。

### 下一代码切片

1. **Accepted entity overlay contract/materializer**
   - 新增 Place-ID keyed reviewed classification artifact；
   - 只消费 central-reviewed `accepted_evidence`；
   - 不修改原始 `cuisine/tags`；
   - candidate/no_evidence/blocked 永不进入 public overlay；
   - provenance、reviewedAt、source fingerprint 必须保留。

2. **100 家 bound-source classification review**
   - deterministic 8-shard；
   - worker 只访问 assigned URL；
   - 店名、菜单菜品和品牌常识不得单独接受；
   - 若页面同时含 hours/budget，只保存 sidecar evidence candidate。

3. **Central review + maintained rebuild**
   - 输出 accepted delta，而不是预设 coverage KPI；
   - 运行 classification coverage / replay / Pages / policy gates。

4. **61 家 name-candidate lane**
   - 店名只产生 candidate；
   - candidate 只作为 source-discovery hint；
   - 必须找到 branch-bound independent evidence 后才允许进入 accepted review。

5. **Metadata source-centric review**
   - 先审 55 条 retained hours；
   - 再对 reviewable bound URLs 去重检查；
   - 一次 source inspection 产出多字段 evidence；
   - central field review 分别接受/拒绝。

6. **Residual discovery**
   - 每轮 accepted merge/rebuild 后重新生成 gap；
   - 只有仍无可复查来源的行才进入 discovery；
   - 当前 discovery 268/279/279 是基线，不冻结为长期任务量。

### 停止条件

补全不追求 100%：

- retained / high-value bound-source work 基本完成；
- residual discovery accepted yield 明显下降；
- 剩余主要为 blocked / stale / identity ambiguous；
- 继续提高覆盖率必须降低 evidence threshold；
- 产品层面的可见收益已经很小。

达到这些条件后停止继续扫描，保留缺失比低质量填值更优。
