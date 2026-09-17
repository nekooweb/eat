# Eat 数据补全逻辑

更新日期：2026-09-18。状态：**report-only 计划器已实现并通过 PR gate；canonical 补全、网络采集和 source-change invalidation 尚未执行。**

## 1. 目标

下一阶段不再把“字段为空”直接等同于“立即重新搜索”。补全统一处理三类缺口：

1. **分类缺口**：第一阶段固定字典无法从现有 `cuisine/tags` 精确映射出的记录；
2. **营业时间 / 预算缺口**：公开 runtime 没有 accepted public value，但可能已有 retained evidence 或已绑定来源；
3. **重复审查**：已经 terminal-reviewed 的任务只在 cooldown 到期或任务相关来源发生实质变化后重新激活。

所有补全继续使用 frozen Google Place ID 作为实体主键，不替换 catalog/tool identity name，不调用付费 Google Data API，不因覆盖率目标生成推断事实。

## 2. 统一优先级

所有字段使用同一 evidence-first 顺序：

```text
accepted public/canonical value
  -> retained evidence review
  -> already-bound source review
  -> new-source discovery
```

这里必须区分：

- `networkRequired = true`：可能需要重新访问一个 URL；
- `newSourceDiscoveryRequired = true`：当前没有可先复查的已绑定来源，需要寻找新来源。

两者不能混为一类。复查已绑定来源必须排在寻找第二套来源之前。

当前 report-only planner：`scripts/build_completion_plan.mjs`。它在维护式 `--public-only` rebuild 后读取同一 checkout 的 public runtime、classification、source facts、source provenance 和 detail queue；不写 canonical，也不执行网络采集。

## 3. Terminal 状态

任何新线索先进入以下状态之一：

- `accepted_evidence`：身份、来源和字段语义明确，可进入中央 merge；
- `candidate`：有合理线索，但仍缺身份、字段语义或来源强度确认；
- `no_evidence`：检查完成但没有得到可接受证据；
- `blocked`：来源需要登录/CAPTCHA、不可访问或当前政策不允许继续检查。

只有 `accepted_evidence` 可以改变公开 canonical。其余 terminal 状态保留 checked date、来源、原因并进入 cooldown。

## 4. 分类补全

### 4.1 第一阶段现状

当前公开 runtime 1,422 家；1,198 家至少有一个 accepted exact classification，224 家 unknown，覆盖率 84.25%。第一阶段只读取现有 `cuisine/tags`，不使用店名关键词推断 accepted 分类。

### 4.2 Taxonomy token 优先

先统计所有**非泛化、尚未映射**的 `cuisine/tags` 原值，经 NFKC + trim + whitespace normalization 后按 token 聚合。

任务单位不是餐厅，而是 token：

```json
{
  "taskType": "classification_taxonomy_token",
  "normalizedToken": "...",
  "rawVariants": ["..."],
  "affectedRestaurantCount": 12,
  "unknownRestaurantCount": 8,
  "samplePlaceIds": ["..."]
}
```

规则：

- token 本身具有稳定、单一语义时，才可成为现有 concept alias 或新增明确 concept；
- 复合类别继续保持 unsplit；
- `restaurant / 餐厅 / その他グルメ` 等泛化词保持 unknown；
- 依赖具体店铺上下文的 token 不做 global alias，转 entity review；
- token mapping 不修改原始 `cuisine/tags`。

当前实测 unmapped non-generic token = 113。224 个 unknown 中，63 家优先由 taxonomy token review 处理。

### 4.3 Entity classification review

只有 taxonomy 不能解决时才进入实体层，顺序为：

1. retained source fact 中已有 exact taxonomy evidence；
2. 当前 Place ID 已绑定的官方/Tabelog/HotPepper/其他 retained source；
3. 最后才生成高精度店名关键词 candidate。

当前 224 unknown 实测分层：

| 下一步 | Rows |
| --- | ---: |
| taxonomy token first | 63 |
| review already-bound source | 102 |
| name candidate first | 59 |

当前 retained exact entity recovery = 0，因此不应编造“可直接恢复”的分类。

店名关键词**只能生成 `candidate`**。不能因为店名含 `寿司 / カレー / 焼鳥 / 蕎麦 / うどん / burger` 就直接公开分类。

通过中央复核的实体分类使用 Place-ID keyed accepted overlay：

```text
exact global taxonomy mapping
+ accepted entity classification overlay
= public accepted classification ids
```

Candidate 永远不进入公开 overlay。

### 4.4 禁止跨维度推导

继续保持：

- 寿司不自动推出日式；
- 咖喱不自动推出印度料理；
- 拉面不自动推出日式；
- 烧鸟不自动推出居酒屋；
- 单道推荐菜或普通菜单项不能自动推出主营分类；
- 多标签不能增加随机抽样权重。

## 5. 营业时间补全

### 5.1 公开字段契约

生产公开 hours 采用 `hoursRuntimePolicy = single-field-zh-v2`，用户可见字段是 `hoursReference`，不是旧 `openingHours`。

当前同一 checkout 的 public materializer 结果：

| Outcome | Rows |
| --- | ---: |
| normalized / `hoursReference` 已知 | 640 |
| hidden unparseable | 119 |
| hidden conflict | 14 |
| hidden semantic | 1 |
| rows without schedule source | 648 |
| **合计** | **1,422** |

public materializer 已经消费 retained raw hours。因此：**某行有 `openingHoursRaw` 但没有 `hoursReference`，不代表可以再次自动恢复。** 这类行必须先审查为什么 materializer 将其隐藏。

### 5.2 Hours 三层队列

782 个 hours gap 当前分为：

1. `review_retained_hours_gap`：55 行。已有 retained raw，但 public materializer 没有接受；只做 review，不新增来源；
2. `review_bound_hours_source`：462 行。没有可直接接受的 retained raw，但已经有绑定 source URL；优先复查现有来源；
3. `discover_hours_source`：265 行。没有可先消费的 retained raw，也没有当前已绑定 source URL，才寻找新来源。

因此真正的新-source hours discovery 是 265，不是 782。

### 5.3 Hours 不允许的推断

- 不把站点/footer 的总营业说明传播给所有分店；
- 不把预约时间、last order、设施开放时间当作餐厅营业时间；
- 不因某日缺少描述自动推断休息；
- 来源冲突时不自动选“更长”的时间；
- retained hidden/unparseable/conflict/semantic 行未经 review 不直接重新写回 public runtime。

## 6. 预算补全

预算继续使用 `[min, max]` range，并要求 lunch / dinner 语义明确。

当前：

| Field | Known | Gap | retained exact range | bound-source review | new-source discovery |
| --- | ---: | ---: | ---: | ---: | ---: |
| lunch | 172 | 1,250 | 0 | 974 | 276 |
| dinner | 621 | 801 | 0 | 525 | 276 |

当前 source facts 中没有新的 valid range 可以直接无审查补入，因此 planner 不伪造 retained recovery。

顺序固定为：

1. retained valid lunch/dinner range（如果以后出现）；
2. 已绑定来源复查；
3. 只有仍无来源时才新 source discovery。

以下内容不能直接成为预算 range：

- 单道菜价格；
- course 最低价但没有典型预算语义；
- 没有 lunch/dinner 上下文的模糊 `平均予算`；
- 另一分店的价格。

accepted price 必须继续通过现有 `isPriceRange` / production validator。

## 7. Dish cooldown 与 source-change invalidation

PR #80 已把维护式 dish plan 从 raw 870 条降到当前 active 23 条，847 条近期 terminal review 正确 deferred。

当前 deferred status：

- `no_evidence` 509；
- `candidate` 171；
- `accepted_evidence` 93；
- `blocked` 74。

下一步不能再次放开 847 条，而应给 terminal review 增加**任务相关来源指纹**。

### 7.1 Review fingerprint

新 review 保存：

```json
{
  "fingerprintVersion": 1,
  "sourceFingerprint": "sha256:...",
  "reviewedAt": "2026-09-18"
}
```

fingerprint 只由与该 task/target field 有关的已保存输入组成，例如：

- frozen Place ID；
- lane / target field；
- 排序后的 bound provider + source URL 集合；
- 与目标字段有关的 source-fact stable values；
- classification task 的 normalized `cuisine/tags` values。

不需要额外网络请求。

### 7.2 重新激活规则

```text
if no terminal review:
    active
else if review has fingerprint and current fingerprint != reviewed fingerprint:
    active (reason = source_changed)
else if now >= retryAfter:
    active (reason = cooldown_expired)
else:
    deferred
```

历史 review 没 fingerprint 时继续按现有 date cooldown，不因升级一次性重新激活全部旧任务。

### 7.3 不算 source change

以下变化不得打破 cooldown：

- runtime 展示顺序；
- 中文 UI label；
- unrelated 字段；
- source URL / provider 的纯顺序变化；
- canonical-equivalent 格式变化。

## 8. Report-only completion planner

当前已实现 `scripts/build_completion_plan.mjs`，schemaVersion 2。它：

- 优先读取维护重建后的 `data/google_inventory_runtime.js`；
- fallback 才使用 `data/production_area1.js`；
- 读取 `source_facts`、`source_provenance`、detail queue 和 classification；
- 不写 canonical；
- 不执行 network collection；
- paid Google Data API = 0；
- 为每个任务生成 SHA-256 `sourceFingerprint`；
- 把 retained / bound-source / new-source 分开统计；
- 在 PR Review 的 maintained `--public-only` rebuild 后执行 blocking regression。

`test_completion_plan.mjs` 校验：

- public runtime 必须是 1,422；
- 分类、hours、lunch、dinner 各 bucket 完整且互斥；
- Place ID 不重复；
- candidate 不算 accepted；
- source fingerprint 格式稳定；
- report-only 运行不修改输入文件；
- public hours materializer 的 640/119/14/1/648 outcome 必须加总回 1,422；
- bound-source review 不能误报为 new-source discovery。

## 9. Proposal 与 central review

继续复用现有 proposal-only 模型，不让 worker 直接改 canonical truth。

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
- 是否允许进入 taxonomy alias / entity overlay / canonical field；
- policy attestation。

## 10. 排序与去重

优先级：

1. 一次 taxonomy token review 可覆盖多家店的任务；
2. retained evidence review；
3. 已绑定来源 review；
4. entity candidate review；
5. new-source discovery。

同级再按影响餐厅数、字段缺失数、source strength、距离和 stable Place ID 做确定性 tie-breaker。

去重：

- entity task：`taskType + googlePlaceId + targetField`；
- taxonomy task：`normalizedToken`；
- 同一 token 多店只创建一个 taxonomy task；
- 已有 active/terminal review 的同字段不能再创建平行任务。

## 11. 验收

补全实现必须满足：

1. **幂等**：相同输入重复生成 plan / merge，active/deferred 与 canonical delta 不漂移；
2. **无覆盖率造假**：candidate 不计入 accepted coverage；
3. **原始字段不变**：分类补全不重写 source `cuisine/tags`；
4. **零付费 API**：继续通过 no-paid-data-API gate；
5. **source change 可解释**：提前激活必须给出 fingerprint before/after 与 `source_changed`；
6. **hours contract 不回退**：public 仍只使用 `hoursReference`；
7. **预算 validator 不降级**；
8. **生产证据不回退**：除非有单独纠错 review，不删除已有 accepted evidence；
9. **报告分层**：accepted / candidate / deferred / blocked / no_evidence 和 retained/bound/discovery 分开报告。

## 12. 实施顺序

第一步（已完成设计和 report-only 实现）：gap inventory + planner，不网络采集、不写 canonical。

第二步：source fingerprint + cooldown invalidation，兼容 legacy review。

第三步：taxonomy token central review；确认全局映射后再进入 entity review。

第四步：entity classification accepted overlay。

第五步：hours / budget proposal 按 retained review → bound source → new source 顺序执行。

最后才评估剩余 new-source discovery 的实际 worker/shard 数量，不提前启动大规模全量扫描。
