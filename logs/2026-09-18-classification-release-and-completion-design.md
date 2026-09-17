# 2026-09-18 — 分类第一阶段发布与数据补全设计

## 本轮起点

本轮接续 PR #77 的有效分类设计，但实际实现全部基于当前 `main`，没有直接合并已经落后的旧 PR 分支。

目标分两部分：

1. 记录 2026-09-17 已经完成并生产发布的基础修复与三维分类；
2. 开始设计下一阶段 evidence-first 数据补全逻辑，避免重新回到“字段为空就全量扫描”的模式。

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

当前 cooldown 仍只按日期判断；source-change invalidation 尚未实现，已转入本轮补全设计。

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
- 分类、预算或距离变化后，旧随机结果立即标记失效并要求重新生成；
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

## 关于旧 dish batch snapshot

仓库中 committed `data/dish_batch_plan.json` 的 `generatedAt` 仍是 2026-09-16，summary 仍显示 870 条旧 dish work。该文件早于 PR #80 cooldown 逻辑，属于历史 snapshot，不能再作为当前 active work 数量来源。

当前 planner 会在维护式 rebuild 时重新读取 terminal review/cooldown；后续文档和报告应以同一 checkout 上重新生成的 plan 为准，禁止拿旧 committed snapshot 描述当前重新扫描量。

## 本轮新增：补全逻辑设计

新增 [`DATA_COMPLETION_PLAN.md`](../DATA_COMPLETION_PLAN.md)。核心方向：

1. 已保存证据优先，先恢复 retained/source-fact 中的 hours/budget/classification 信息；
2. 分类先按“未映射 source token”聚合审核，一个 taxonomy mapping 可覆盖多家店；
3. 店名关键词只产生 entity `candidate`，不能直接进入公开 accepted 分类；
4. entity accepted classification 使用 Place-ID keyed evidence/overlay，不覆写原始 `cuisine/tags`；
5. hours 必须继续通过 normalization + validation；
6. budget 必须有明确 lunch/dinner 语义并通过 price-range validator；
7. terminal review 增加 source fingerprint，只有来源实质变化或 cooldown 到期才重新激活；
8. 第一实现阶段只生成 gap inventory / completion plan，不网络采集、不写 canonical。

## 下一实施顺序

### A. Report-only gap inventory

新增统一 planner，统计：

- unmapped non-generic classification tokens；
- 当前完全 unknown classification rows；
- missing hours 但 retained source facts 已有 raw hours 的 rows；
- missing lunch/dinner budget 但已有 retained candidate 的 rows；
- 真正需要新 discovery 的 rows；
- terminal review active / deferred / stale-by-source-change。

先看真实分布，再决定 worker 数量和 shard，不先创建大规模网络任务。

### B. Source fingerprint

给新 review 增加 `fingerprintVersion` + `sourceFingerprint`。旧 review 没 fingerprint 时继续按 date cooldown，避免升级瞬间把全部历史任务重新激活。

### C. 分类第二阶段

先做 taxonomy token review；只有 token 无法全局映射时才进入 entity review。Entity evidence 通过中央复核后进入 classification overlay；candidate 不进入公开 runtime。

### D. Hours / budget

先从 retained source facts 和已有 additive candidate 恢复；最后才对仍缺失且确实重要的行启动 independent discovery。

## 约束继续保持

- frozen Place ID 是实体主键；
- source alias 不替代 catalog/tool identity name；
- paid Google Data API = 0；
- proposal/worker 不直接改 canonical truth；
- candidate 不计入 accepted coverage；
- 不为提高统计覆盖率降低 evidence threshold；
- 所有 merge/rebuild 必须幂等，并继续经过 Pages / policy / field validators。
