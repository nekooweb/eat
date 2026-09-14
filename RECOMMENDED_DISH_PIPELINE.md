# 推荐菜来源与中文字段流程

更新日期：2026-09-14。

## 2026-09-14 20:06 JST：中央审查入口实施中

本轮基于最新基线执行 `reload_data.py --public-only` 后，实际范围为 Official 219、Retained 318，共 537 行。旧队列的 Minatoya 官网已被既有字段隔离规则移除，该行转入 Discovery；不再沿用错误来源。原 220 / 318 数量仅是下文保留的历史快照。

新增审查层保持原始 proposal 不变：

```text
data/agent_proposals/<marker>/*
  -> 完整原文、身份、时效与 R/F/C 审查及重复协调
  -> data/agent_reviews/<marker>/Sx.json
  -> 中央 reviewer 批准每份文件的 SHA-256
  -> build_reviewed_agent_dish_evidence.mjs（仅输出 _audit 文件）
  -> merge_google_inventory_detail_evidence.mjs
  -> correct_dish_specificity_evidence.mjs + evidence audit
  -> reload_data.py + 逐证据保留/身份/实际增量审计
```

审查适配器与增量审计已有通过的回归测试，但本轮 manifest 仍为 `pending_central_review`，禁止直接导入。适配器不会把候选、无证据、访问受限或跳过行写进 R/F。只有精确匹配或逐项审查的原菜名中文规范化可以输出，不能用泛称吞掉具体菜品。

维护合并器已增加完整中央审查来源快照的去重保留：较新采集记录更新同一 evidence key 时，也必须保留既有 `reviewedSourceEvidence`。原文、来源身份及证据快照保留在维护层，公开展示限量不改变证据存储。

每个 shard 的真实完成状态和每次验证结果持续更新到[Official / Retained 日志](logs/2026-09-14-official-retained-completion.md)，而不是在全部结束后追填。当前公开覆盖仍为 R 595、F 675、展示 740；尚无本轮新证据导致的覆盖增量。

## 2026-09-14 并行 Agent proposal 层

当前推荐菜补全新增一个 proposal-only 并行层，目的不是让多个 Agent 直接写生产数据，而是让它们在固定 shard 内收集可重放的来源证据，再由中央 reviewer 统一决定是否进入 canonical merge。

完整路径：

```text
data/dish_batch_plan.json
  -> marker + deterministic shard assignment
  -> worker reads current row / skips already-complete rows
  -> exact-branch identity + source evidence collection
  -> R / F / C classification
  -> data/agent_proposals/<marker>/<shard>.json
  -> central review + duplicate/reconciliation checks
  -> accepted evidence enters existing canonical merge
  -> normal public/runtime/queue rebuild + regression/audit
```

### 当前 892-row snapshot

2026-09-14 snapshot：

- public named runtime：1,422；
- recommended dishes known：595；
- featured dishes known：675；
- any display dish known：740；
- no display dish：682；
- recommendation gap：827；
- executable dish work：892；
- dish-complete rows：530。

892 个工作行互斥分到：Official R 220、Retained R 318、Discovery R 289、F-source 65。具体 assignment/shard contract 见 `data/agent_library/README.md` 和 `data/agent_library/manifest.json`。

截至 2026-09-14 19:24 JST，按唯一 assignment row 统计，346/892（38.8%）已经形成可审查 proposal：Official 138/220、Retained 172/318、Discovery 36/289、F-source 0/65。central branch 已含 300 行；Retained S0 的 46 行在 PR #66，已提交但尚未并入 central branch。

完成 shard：Official S1/S2/S3/S4/S7；Retained S0/S1/S2/S4；Discovery S7。Official S3 存在两份独立结果，两份覆盖同一 21 个 row，只计一次，并在 central review 中逐 Place ID reconciliation。

### Worker 约束

- 只能处理被分配的 `MARKER:Sx`，不得扩展到其他 shard。
- 每次开始前重读 current row；如果 canonical/current queue 已经完成，必须 skip。
- frozen Place ID 是 identity key；来源名称、officialName、页面标题只能作为 alias/evidence。
- exact branch identity 需要名称、地址、电话、官方 ownership 等可复核证据；同楼、距离、邮编、菜系不能单独形成 binding。
- 付费 Google Data API 调用必须为 0；禁止 key/billing 依赖、登录/CAPTCHA 绕过和 access-limit evasion。
- 每条 proposal 保留 provider、exact URL、checked date、source-native dish name/text、evidence class、identity evidence 和 classification rationale。

### Proposal 与 canonical 的边界

`data/agent_proposals/**` 是审查输入，不是 production truth。proposal 完成只能表示该 assignment 已被 Agent 检查并给出 evidence/candidate/no-evidence/blocked 结论；它不会自动改变推荐菜覆盖率、公开 runtime 或 SQLite master。

central reviewer 必须至少检查：

1. row 仍属于当前 marker/shard，且未被其他 canonical 更新完成；
2. frozen Place ID 与来源是否是 exact branch；
3. R 是否有 concrete dish + explicit recommendation semantics；
4. 普通 menu item 是否仍保持 F；
5. course/general recommendation 是否错误传播到 component dish；
6. brand-level recommendation 是否在没有 branch availability 证据时被错误下放；
7. duplicate Place ID / duplicate source / independent duplicate submission 是否正确 reconciliation；
8. source provenance、checked date、policy attestation 是否完整；
9. ambiguous evidence 是否仍保持 candidate/blocked/no_evidence。

只有 central review 通过的 evidence 才进入原有 monotonic evidence merge 和后续 rebuild。独立重复 proposal（例如 S3）是复核信号，不增加完成 row 数。

## 固定语义

来源不需要提供中文。保留日文或其他原菜名、具体 URL、提供方、检查时间和证据片段，再确定性规范化成中文。不能根据菜系、店名或品牌常识补造菜品。

- **R / recommendedDishes**：具体菜名与来源明确表达的推荐、名物、看板、人气或 signature 等局部语义。
- **F / featuredDishes**：来源明确出现的普通菜单菜品；没有足够推荐语义时不能升级为 R。
- **C / candidate**：推测、分类模板及尚未完成身份核验的线索，只用于内部任务。

普通菜单项允许的 evidence class 包括 retained_source_menu_item、provider_promotional_dish_text、structured_menu_item、source_menu_text；Tabelog 菜单通道仍需准确分店绑定，不读取顾客评论充当菜单。

## 输入与规范化

1. `build_retained_dish_evidence.mjs` 无网络读取已保存且有来源声明的菜品事实。
2. 公开采集任务仅访问已确认的独立来源，按域名限流并遵守访问限制。
3. `recommended_dish_extractor.mjs` 使用 specific-first 菜名规则；词典只翻译来源中真实出现的词。
4. 不确定的品牌/自造词保留原文并进入 translation-pending，不强制生成中文。
5. `merge_google_inventory_detail_evidence.mjs` 以 nameZh + provider + sourceUrl + evidenceClass 去重，短期抓取失败不删除既有有效证据。
6. SQLite `resolve_dish_translation_evidence.py` 在可靠、无冲突身份上保存 recommended_dishes.zh / featured_dishes.zh，原文留在证据层。
7. materialize 阶段校验中文显示、禁止 generic/approximate filler，公开包不再携带旧 `dishes` 数组。

明确闭店、错绑或来源撤销仍需单独更正；monotonic union 不是永远不能纠错。

## 当前载入与计数

不再写死 public named count。冻结目录仍为 2,804；公开 runtime 数量、queue ID 集合和候选计划必须由同一次离线构建产生。

2026-09-14 的 current assignment snapshot 使用 1,422 public named runtime，并以 `data/google_inventory_detail_queue.json` / `data/dish_batch_plan.json` 的同一生成状态作为 dish-work 计数来源。旧日期日志中的 1,230-row 或更早 coverage 数量是历史检查点，不应覆盖当前 892-row assignment snapshot。

推荐与特色集合有重叠，不能直接相加。SQLite eligibility 与 generated runtime 当前仍不同，两者的菜品覆盖也必须分别报告。

## 任务与执行

统一刷新命令：

```sh
python3 scripts/reload_data.py --public-only --outdir _audit/data-reload
```

该命令只重新载入已有数据并生成队列，不访问餐厅页面。完整主库重建省略 `--public-only`，需要重置时显式加 `--reset`。

当前公开 dish assignment 是 892 个互斥 row：official_crawl 220、retained_source_mining 318、independent_source_discovery 289、official_or_retained_featured 65。

这些公开工作行与 SQLite active tasks 不属于同一指标，不能相加。所有采集 workflow 需手动触发；不得将普通代码 push 当作全量采集指令。Tabelog 访问受限时使用 retained evidence，不进行规避式重试。

## 门禁

- 目录完整、公开/queue ID 集合一致。
- 来源、分店身份和原文可追溯；R/F 不越级。
- 中文规范化不得吞掉 specific dish，无法确定时保留 pending。
- 禁止付费 Google 数据接口、登录或验证码绕过。
- 同一推荐组合大量重复触发人工审查，不通过模板填充来增加覆盖。
- 仅真实 accepted evidence 可改变字段；规划成功、proposal submitted 或 CI success 都不等于 canonical 采集完成。
- central merge 前必须去重同一 Place ID 的重复 proposal，并显式处理独立 Agent 判断冲突。

完整载入、重置、备份和发布说明以 [DATA_PIPELINE](DATA_PIPELINE.md) 为准；并行 Agent 当前进度与逐 shard 结果见 [2026-09-14 parallel agent log](logs/2026-09-14-parallel-agent-data-completion.md)。
