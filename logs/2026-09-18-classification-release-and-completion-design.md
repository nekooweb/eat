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

当前 cooldown 仍只按日期判断；source-change invalidation 尚未实现，已转入下一阶段设计。

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

以下数字来自 PR #82 最新维护式 rebuild + blocking regression，不使用仓库中旧的 committed snapshot。

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
5. **source fingerprint 下一步实现**：当前 planner 已生成任务级 fingerprint；下一 PR 才把 fingerprint 写入 terminal review 并接入 cooldown invalidation。
6. **旧 review 兼容**：历史 review 没 fingerprint 时继续走 date cooldown，不能因升级一次性重新激活 847 条 deferred work。

## 下一实施顺序

### A. Source fingerprint / cooldown invalidation

新 terminal review 保存 `fingerprintVersion` + `sourceFingerprint`。只有当前任务相关输入发生实质变化时，才能在 cooldown 到期前重新激活；URL 顺序、UI label 和 unrelated 字段变化不得触发。

### B. Taxonomy token central review

先审高收益 source token。能确定为稳定单一概念的才加 alias / concept；复合、模糊、上下文依赖 token 保持 unresolved 或转 entity review。

### C. Entity classification overlay

对通过已绑定来源核实的实体分类，使用 frozen Place-ID keyed accepted overlay；不覆写原始 `cuisine/tags`。店名关键词只产生 candidate。

### D. Hours / budget proposals

按 retained review → bound-source review → new-source discovery 顺序执行。worker/proposal 不直接写 canonical；继续 central review、validator、rebuild、replay。

## 约束继续保持

- frozen Place ID 是实体主键；
- source alias 不替代 catalog/tool identity name；
- paid Google Data API = 0；
- proposal/worker 不直接改 canonical truth；
- candidate 不计入 accepted coverage；
- 不为提高统计覆盖率降低 evidence threshold；
- 所有 merge/rebuild 必须幂等，并继续经过 Pages / policy / field validators。
