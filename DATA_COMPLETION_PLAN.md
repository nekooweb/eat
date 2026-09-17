# Eat 数据补全逻辑

更新日期：2026-09-18。状态：**设计已开始；本文件定义下一阶段实现边界，尚未表示补全任务已经执行。**

## 1. 目标

下一阶段不再把“字段为空”直接等同于“立即重新搜索”。补全流程统一解决三类实际缺口：

1. **分类缺口**：第一阶段固定字典无法从现有 `cuisine/tags` 精确映射出的记录；
2. **营业时间 / 预算缺口**：公开 runtime 没有可用 `openingHours`、`lunch` 或 `dinner`，但仓库可能已经保存了可解析来源；
3. **重复审查问题**：已经得到 terminal review 的任务只在 cooldown 到期或来源发生实质变化后重新进入 active queue。

所有补全继续使用 frozen Google Place ID 作为实体主键，不替换身份名称，不调用付费 Google Data API，不因覆盖率目标生成推断事实。

## 2. 总体原则

### 2.1 已有证据优先

补全顺序固定为：

```text
current canonical value
  -> retained source facts / retained source snapshots
  -> current bound official source
  -> current bound retained third-party source
  -> independent discovery (only when still necessary)
```

能从已有 `source_facts`、source enrichment、官方结构化数据、HotPepper additive candidate 或其他已绑定来源恢复的字段，不应再次进入网络 discovery。

### 2.2 Candidate 不等于 accepted

任何新线索先明确属于以下状态之一：

- `accepted_evidence`：来源与当前 Place ID 绑定可靠，字段语义明确，可进入 canonical merge；
- `candidate`：有合理线索，但仍缺身份、字段语义或来源强度确认；
- `no_evidence`：检查完成但没有得到可接受证据；
- `blocked`：来源需要登录/CAPTCHA、不可访问或不能在当前政策内继续检查。

只有 `accepted_evidence` 可以改变公开数据。`candidate/no_evidence/blocked` 都必须留下 checked date、来源和原因，并进入 cooldown，而不是下一次 rebuild 立即重新派工。

## 3. 分类补全

当前分类第一阶段只读取现有 `cuisine/tags` 的精确值。下一阶段不直接从店名生成公开分类，而拆成两条路径。

### 3.1 Taxonomy token 补全：优先执行

先统计公开 runtime 中所有**非泛化但尚未映射**的 `cuisine/tags` 原值，NFKC + trim + whitespace normalization 后按 token 聚合。

任务单位不是餐厅，而是规范化 token：

```json
{
  "taskType": "classification_taxonomy_token",
  "normalizedToken": "...",
  "rawVariants": ["..."],
  "restaurantCount": 12,
  "samplePlaceIds": ["..."]
}
```

审核规则：

- 来源分类词本身具有稳定、单一语义时，可把它作为 `classification.js` 现有 concept 的 alias，或新增明确 concept；
- 复合类别继续保持 unsplit，不为了覆盖率拆成多个确定标签；
- `restaurant / 餐厅 / その他グルメ` 等泛化词保持 unknown；
- 只要 token 语义依赖具体店铺上下文，就不能做全局 alias，转为 entity candidate；
- 一个 token 的 accepted mapping 可以覆盖所有使用相同来源类别词的餐厅，因此优先级应高于逐店关键词搜索。

这一步只扩展 taxonomy，不修改餐厅原始 `cuisine/tags`。

### 3.2 Entity classification candidate：第二优先级

仅在 taxonomy token 无法解决时，按 frozen Place ID 建立实体级候选。线索来源按强度排序：

1. 已绑定官方页面中的明确经营类别/结构化类型；
2. 已绑定 Tabelog / HotPepper 等来源中的明确类别字段；
3. 已保存 source facts 中的明确分类事实；
4. 店名中的高精度关键词。

店名关键词**只能生成 `candidate`**。不能仅因店名含 `寿司 / カレー / 焼鳥 / 蕎麦 / うどん / burger` 就直接进入公开 accepted 分类。

验证通过的实体级分类不应写回原始 `cuisine/tags`。建议新增维护层 accepted classification evidence，并在公开构建时生成 Place-ID keyed classification overlay：

```text
exact global taxonomy mapping
+ accepted entity classification overlay
= public accepted classification ids
```

Candidate 永远不进入公开 overlay。

### 3.3 分类不允许的推断

继续保持第一阶段规则：

- 寿司不自动推出日式；
- 咖喱不自动推出印度料理；
- 拉面不自动推出日式；
- 烧鸟不自动推出居酒屋；
- 单道推荐菜或普通菜单项不能自动推出主营分类；
- 多标签不能增加随机抽样权重。

## 4. 营业时间补全

`openingHours` 缺失时先检查已经保存的来源，而不是直接 discovery。

### 4.1 已有 raw/source fact 恢复

优先利用现有：

- `source_facts` 中的 hours 事实；
- official JSON-LD `openingHours` / `openingHoursSpecification`；
- source enrichment 中的 `openingHoursRaw`；
- 已有 HotPepper additive candidate。

若已有原文但 canonical 为空，先运行现有 normalization / validation 路径。只有通过 `normalizeOpeningHours` + `validateOpeningHours` 的结果才能成为 accepted canonical hours。

### 4.2 不做的推断

- 不把页面 footer 的总营业说明传播到所有分店；
- 不把预约时间、last order、设施开放时间当作餐厅营业时间；
- 不因某日缺少描述自动推断休息；
- 来源冲突时不自动选“更长”的营业时间，以 checked date、分店绑定和来源强度进入 review。

## 5. 预算补全

预算继续使用 `[min, max]` 范围语义，并要求 lunch / dinner 上下文明确。

优先级：

1. 已绑定官方来源中明确的 lunch/dinner budget；
2. 已绑定 Tabelog / HotPepper 的对应预算字段；
3. 已保存 source facts 中能确定用餐时段的预算事实；
4. 仍缺失时才建立 discovery task。

以下内容不能直接成为预算范围：

- 单道菜价格；
- course 的最低价但没有说明典型预算；
- 没有 lunch/dinner 语义的模糊 `平均予算`（可保存为 candidate，但不强行写入某一时段）；
- 另一分店的价格。

所有 accepted price 必须继续通过现有 `isPriceRange` / production validator。

## 6. Source-change invalidation

当前 dish cooldown 只使用 terminal status + `reviewedAt`。下一阶段增加**来源指纹**，使“来源真的变了”可以提前打破 cooldown，而无变化来源继续延期。

### 6.1 Review fingerprint

新 terminal review 保存：

```json
{
  "fingerprintVersion": 1,
  "sourceFingerprint": "sha256:...",
  "reviewedAt": "2026-09-18"
}
```

fingerprint 只由与该任务有关的已保存输入组成，不需要额外网络请求。例如：

- 当前 Place ID 绑定的相关 provider / source URL 集合；
- retained source snapshot/content hash（已有时）；
- 与目标字段有关的 source-fact stable keys / values；
- 分类任务使用当前 `cuisine/tags` normalized source values。

### 6.2 重新激活规则

```text
if no terminal review:
    active
else if current fingerprint != reviewed fingerprint:
    active (reason = source_changed)
else if now >= retryAfter:
    active (reason = cooldown_expired)
else:
    deferred
```

旧 review 没有 fingerprint 时先继续使用现有 date cooldown，避免升级后把所有历史任务一次性重新激活。只有新 review 开始强制写 fingerprint。

### 6.3 什么不算 source change

以下变化不应打破 cooldown：

- runtime 展示顺序；
- 中文 UI label 变化；
- unrelated 字段变化；
- source URL 顺序变化；
- 相同 canonical value 的格式化差异。

## 7. 统一补全计划器

建议新增 report-first `scripts/build_completion_plan.mjs`，第一版只生成计划和审计，不写 canonical 数据。

任务类型至少包括：

- `classification_taxonomy_token`；
- `classification_entity_review`；
- `recover_retained_hours`；
- `recover_retained_lunch_budget`；
- `recover_retained_dinner_budget`；
- `discover_hours_source`；
- `discover_budget_source`；
- 现有 dish task（继续由现有 dish planner 负责，统一展示 active/deferred 原因）。

### 7.1 排序逻辑

优先处理“无需网络即可恢复”和“一次审核可覆盖多家店”的任务：

1. taxonomy token exact mapping；
2. retained/source-fact 可直接解析的 hours/budget；
3. 已绑定来源但尚未抽取的字段；
4. entity classification review；
5. 独立 discovery。

同级中再考虑：影响餐厅数、当前 source 是否已绑定、缺失字段数、距离等确定性 tie-breaker。不得因为某一类任务更容易提高统计覆盖率而降低证据门槛。

### 7.2 去重

- 实体任务按 `taskType + googlePlaceId + targetField` 唯一；
- taxonomy task 按 `normalizedToken` 唯一；
- 相同来源 token 出现在多家店时只生成一个 taxonomy task；
- 同一字段已有 active/terminal review 时不重复创建另一套任务。

## 8. Proposal 与 central review

继续复用现有 agent/proposal 思路，不让 worker 直接改 canonical truth。

建议 marker：

- `CLASSIFICATION-TAXONOMY`；
- `CLASSIFICATION-ENTITY`；
- `METADATA-HOURS`；
- `METADATA-BUDGET`。

每条 proposal 至少保存 Place ID（taxonomy task 除外）、source URL/provider、checked date、source-native text/value、target field、proposed normalized value、status、reason、source fingerprint。

central review 负责：

- Place ID / branch identity；
- 字段语义；
- 跨分店污染；
- source freshness；
- 值冲突；
- 是否允许进入 global taxonomy alias 或 entity overlay；
- policy attestation。

## 9. 验收与 CI

补全功能至少满足：

1. **幂等**：相同输入重复生成 completion plan，active/deferred 和 canonical delta 不漂移；
2. **无覆盖率造假**：candidate 不计入 accepted coverage；
3. **原始字段不变**：分类补全不重写 source `cuisine/tags`；
4. **零付费 API**：继续通过 no-paid-data-API gate；
5. **来源变化可解释**：每个提前重新激活任务必须给出 `source_changed` 及 fingerprint before/after；
6. **字段验证不降级**：hours / budget 必须继续通过现有 validator；
7. **生产计数不回退**：补全不得删除已有 accepted evidence 或降低现有公开字段覆盖，除非有单独、明确的纠错 review；
8. **报告分层**：同时报告 `unknown / candidate / accepted / deferred / blocked / no_evidence`，不能只报一个“完成率”。

## 10. 实施顺序

第一步先实现**只读 gap inventory + plan generator**，验证真实缺口、可从 retained evidence 恢复的数量和 taxonomy token 聚合效果；不做任何网络调用，也不写 canonical。

第二步接入 source fingerprint / cooldown invalidation，并给旧 review 保持兼容。

第三步实现 taxonomy token central review 和 entity classification overlay。

第四步再开启 hours/budget 的 source-backed proposal merge；最后才评估是否需要对仍为空的项目启动新的网络 discovery。
