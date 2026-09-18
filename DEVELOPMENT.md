# Eat 开发状态与后续计划

更新日期：2026-09-18。

## 2026-09-18：当前生产状态与下一阶段补全

2026-09-17 已完成两批当前主线修复并正式生产发布。

PR #80（merge `868d3fc1808ea533c73691af35e2a954c5adc1bf`）完成：

- 公开前端移除 Area1 private reference anchor / reference circle；
- `¥999以下` 与其他预算档统一为区间重叠语义；
- dish planner 接入中央 terminal review + lane-specific cooldown；
- cooldown 默认：accepted evidence 30 天、candidate 30 天、no evidence 60 天、blocked 30 天；
- deferred row 保留 review provenance、lastReviewedAt 与 retryAfter；
- PR #77 的分类方案迁移到当前主线设计文档，不直接合并旧分支。

PR #81（merge `aa0a2b4a6a03a1984f98e1e22ae82d022e09e96d`）完成三维分类第一阶段：

- `cuisineStyle` / `foodType` / `venueType` 三个独立维度；
- 固定 concept ID、exact alias、同维度父子关系；
- 禁止跨维度自动推断，复合类别保持 unsplit，generic 分类保持 unknown；
- 页面启用三维分组排除、父子排除、清除分类排除和条件变化后旧结果失效；
- 卡片、比较表和筛选使用同一份 normalized accepted classification；
- 第一阶段只消费现有 `cuisine/tags`，不从店名、菜单或推荐菜推断 accepted 分类。

当前分类覆盖报告：公开 runtime 1,422 家，其中 1,198 家至少有一个 accepted classification，覆盖率 84.25%；cuisine style 476、food type 225、venue type 576，70 家同时命中多个维度。

生产验证：

- Pages production run #1332 / `35237626516`：success；
- no-paid-data-API run #1033 / `35237626737`：success。

因此分类第一阶段已属于生产功能。详细过程见 [`logs/2026-09-18-classification-release-and-completion-design.md`](logs/2026-09-18-classification-release-and-completion-design.md)，分类语义见 [`CUISINE_FILTER_PLAN.md`](CUISINE_FILTER_PLAN.md)。

下一阶段不恢复“字段为空就重新全量搜索”的旧模式。新的 [`DATA_COMPLETION_PLAN.md`](DATA_COMPLETION_PLAN.md) 将补全拆为：

1. taxonomy token 级分类补全：先聚合尚未映射的非泛化 `cuisine/tags` source token，一次审核可覆盖多家店；
2. entity classification candidate：只有全局 token 无法解决时才按 frozen Place ID 核对，店名关键词只能产生 candidate；
3. retained hours/budget recovery：先从已有 source facts、official structured data、source enrichment 和 HotPepper additive candidate 恢复；
4. source-change invalidation：terminal review 增加 source fingerprint，只有来源实质变化或 cooldown 到期才重新激活；
5. independent discovery 最后执行，且继续禁止付费 Google Data API。

第一实施步已经由 PR #82（merge `d5273417a4531ed16c611ca11f6b241087ad3f3d`）完成：新增 report-only `build_completion_plan.mjs` 与阻塞回归，不网络采集、不写 canonical。以下分层是 **PR #82 合入时的历史基线**；当前 source eligibility 修正后的数值见下方 PR #86：

- classification：1,198 accepted / 224 unknown；113 个 unmapped taxonomy token；unknown 中 63 条先走 taxonomy token、102 条先复查已绑定来源、59 条仅进入 name candidate；
- hours：640 已知；782 gap = 55 retained review + 462 bound-source review + 265 new-source discovery；
- lunch budget：172 已知；1,250 gap = 974 bound-source review + 276 discovery；
- dinner budget：621 已知；801 gap = 525 bound-source review + 276 discovery；
- dish：870 raw work 中只有 23 active，847 条近期 terminal review 被 cooldown defer。

PR #83（merge `12640c030f4e1a5bc5788bf34413f7c4e7c84ba9`）随后完成 source fingerprint / cooldown invalidation：

- active dish assignment 带 `fingerprintVersion/sourceFingerprint`；
- worker 必须原样回传 assignment-time fingerprint，central review 校验一致性；
- 只有与当前 dish lane 相关的来源绑定/菜品字段发生实质变化才可在 cooldown 到期前以 `source_changed` 重激活；
- checkedAt、UI/cuisine、距离/priority、URL fragment/UTM、hours/phone 等无关字段不会打破 dish cooldown；
- 历史 review 没有 fingerprint 时继续 date-only cooldown，不做批量重激活。

PR #83 maintained CI 实测保持 **870 raw / 23 active / 847 deferred / 0 source-changed reactivation**。PR Review #159（`35296657432`）、Pages preview #1347（`35296657418`）、no-paid #1064（`35296657412`）均通过；合入 main 后 Pages production #1348（`35296719894`）与 no-paid #1065（`35296719888`）也均 success。

classification taxonomy 补全已拆成两批中央 review。PR #84（merge `5f57aeae63919edea314a052a2528f78ed26a70f`）完成 batch 1：accepted classification **1,198 → 1,257（+59）**，unknown **224 → 165（-59）**，coverage **84.25% → 88.40%**，taxonomy-token-first unique rows **63 → 4**。

PR #85（merge `87d24556d87decc64eb23ba8b1479da427a75b2e`）完成剩余 batch 2：只审 `御好烧`、`スープ`、`摩洛哥菜`、`汤品`、`烧烤` 5 个 exact token hit，并保持 `御好烧` 与“御好烧·文字烧”复合概念分离、`烧烤` 不推断为日式烧肉。实测 accepted classification **1,257 → 1,261（+4）**，unknown **165 → 161（-4）**，coverage **88.40% → 88.68%**；cuisineStyle 517、foodType 261、venueType 585，多维命中 91。taxonomy-token-first unique rows **4 → 0**；unmapped taxonomy token 仍有 93，但它们当前只出现在已经有 accepted classification 的记录中，不再阻塞 unknown entity。合入后 Pages production #1359（`35297349908`）与 no-paid #1083（`35297349821`）均 success。

PR #86（merge `083bf2c78b7b1e4d9219ec26273bd19f2fde636c`）已完成 entity bound-source plan，并同时修正 completion planner 的 source eligibility：Google Maps/navigation、Google-hosted ref 与无效 URL 不再计作“已有可复查来源”。这项修正把 classification unknown 从旧的 102 bound / 59 name-candidate 调整为 **100 bound / 61 name-candidate**；100 家全部可恢复精确非 Google URL，共 120 个 link，source-reference repair = 0。来源分布为 Overture Maps 75、Tabelog 14、runtime-bound 11、official 3、Hot Pepper 2（按 row/provider 计数可重叠）；当前没有任何 link 已在 provenance 中直接声明 `cuisine`，因此不能自动接受，必须逐来源复核。

同一修正也纠正 metadata 分桶：hours 55 retained + **459 bound + 268 discovery**；lunch **971 bound + 279 discovery**；dinner **522 bound + 279 discovery**。合入后 Pages production #1370（`35298033984`）与 no-paid #1103（`35298033957`）均 success。下一实施片是 accepted entity overlay contract/materializer + 100 家 bound-source proposal/review；61 家店名线索仍只允许 candidate，不能提前进入 accepted overlay。

当前 committed `data/dish_batch_plan.json` 仍可作为历史 snapshot 留存，但当前 active work 数必须以同一 checkout 上重新生成的 maintained plan 为准。

## 2026-09-18：下一阶段数据补全执行流程

结论：**继续补，但不再扩餐厅数量，也不恢复全量扫描。** 当前 1,422 家公开 runtime 已足够支撑产品；下一阶段目标是提高现有记录的 accepted classification、hours 与 budget 完整度，并保持 evidence-first / proposal-only / central-review 边界。

### Phase A：100 家已有来源的 classification entity review

输入：PR #86 生成的 `CLASSIFICATION-ENTITY-BOUND` 队列，100 家 / 120 个明确非 Google URL，8 个 deterministic shard。当前已新增 assignment materializer：maintained rebuild 后自动生成 `_audit/classification-bound/plan.json`、`manifest.json` 与 `S0..S7.json`，只作为 review artifact，不写 canonical。

执行规则：

1. worker 只访问 assignment 中已经绑定的 URL，不自行寻找第二来源；
2. frozen Place ID 与当前 catalog name 是身份基准，来源名称只作为 alias / identity evidence；
3. accepted classification 必须有**当前分店或可明确绑定到该分店**的 category / business-type / cuisine-style 原文证据；
4. 店名、菜单菜名、推荐菜、附近分店、品牌常识都不能单独构成 accepted classification；
5. worker 只提交 `accepted_evidence / candidate / no_evidence / blocked` proposal，不写 canonical；
6. proposal 必须带 assignment-time source fingerprint、source URL/provider、checked date、source-native text 与 proposed concept IDs。

为了避免后续重复访问网页，Phase A 允许在同一次页面检查中**旁路记录**明确出现的 hours / lunch budget / dinner budget 原始 evidence candidate；这些 sidecar evidence 只保存证据，不在分类 review 中自动写入对应字段。后续 metadata central review 可以复用它们。\n\nS5 已完成第一批完整生命周期：8/8 worker review 后，经独立 central review 保留 4 条 `accepted_evidence`、1 条 candidate、3 条 blocked，paid Google Data API = 0。4 条 accepted 由 deterministic reviewed-truth builder 写入 accepted entity overlay；candidate/blocked 使用 terminal cooldown，只有 cooldown 到期或 assignment-style source fingerprint 改变时才重新激活。 maintained preview 实测 accepted **1,261 → 1,265（+4）**、unknown **161 → 157（-4）**、coverage **88.68% → 88.96%**；4 条 terminal non-accepted 被 deferred，source-changed reactivation = 0，active bound-source **100 → 92**，S5 active assignment **8 → 0**。 S6 也已完成 central review：8/8 worker review 的 3 条 `accepted_evidence` proposal 全部保留，另有 1 candidate、1 no_evidence、3 blocked；reviewed truth 现累计 16 条，其中 accepted 7 条。S6 非 accepted terminal 状态沿用同一 cooldown/source-change lifecycle。 maintained preview 实测 accepted **1,265 → 1,268（+3）**、unknown **157 → 154（-3）**、coverage **88.96% → 89.17%**；terminal deferred **4 → 9**，active bound-source **92 → 84**，S6 active assignment **8 → 0**。 S7 worker review 已完成 9/9：4 条 `accepted_evidence` proposal、2 条 no_evidence、3 条 blocked；仍为 proposal-only，等待 central review。

### Phase B：central review + Place-ID keyed accepted entity overlay

Phase A 完成后，由中央审查统一决定哪些 proposal 可以进入公开分类。

PR #88 已完成这一基础设施：

- Place-ID keyed reviewed entity-classification artifact；
- fail-closed materializer，只消费 `accepted_evidence`；
- provenance / source fingerprint / reviewedAt 保留；
- candidate / no_evidence / blocked 永远不进入公开 overlay；
- 不覆写原始 `cuisine/tags`，公开分类继续是：
  `exact taxonomy + accepted entity overlay`。

每次 merge 后运行 maintained `--public-only` rebuild、classification coverage report、replay/幂等检查和 Pages/policy gates。**不设“必须达到某个覆盖率”的人为目标**；只报告真实 accepted delta。

### Phase C：61 家 name-candidate lane

当前没有可先复查非 Google 来源的 unknown 为 61 家。

这一 lane 只允许：

1. 高精度店名规则生成 candidate；
2. candidate 保存命中的词、规则、Place ID 和 reason；
3. candidate 本身不进入 public classification；
4. 只有后续找到独立、可绑定到当前分店的来源后，才转入与 Phase A 相同的 evidence review / central review。

因此 name keyword 是**source discovery hint**，不是分类事实。

### Phase D：metadata 补全改为 source-centric，而不是 field-centric

当前 maintained gap：

- hours：640 已知；55 retained-review + 459 bound-source + 268 discovery；
- lunch budget：172 已知；971 bound-source + 279 discovery；
- dinner budget：621 已知；522 bound-source + 279 discovery。

后续不分别对 hours/lunch/dinner 重复访问相同网页。计划建立 source-centric bound-source review：

`(Place ID, normalized source URL) -> one inspection -> multiple field-evidence candidates`

一次页面检查可以同时保存：

- opening-hours source-native text；
- lunch budget range / source-native budget text；
- dinner budget range / source-native budget text；
- classification side evidence（若该记录仍需要）；
- checked date、provider、branch identity 与 source fingerprint。

但**字段验收仍分开**：

- hours 继续通过 `hoursReference` 语义与 conflict/unparseable/semantic validator；
- lunch/dinner 继续要求明确 meal context + valid `[min,max]` range；
- 单道菜价格、course 最低价、无 meal context 的平均预算不能直接成为 budget；
- 同一证据可被多个字段 review 引用，但一个字段通过不代表其他字段自动通过。

执行顺序固定：

1. 55 条 retained hours review；
2. 已绑定 source 的 source-centric review；
3. central field review + materialize；
4. 仅对仍然无可用来源的行进入 discovery；
5. discovery 当前上限基线为 hours 268、lunch 279、dinner 279，但应在每轮 accepted merge 后**重新生成**，不能把这些数字当成固定任务量。

### Phase E：discovery 只处理真正剩余缺口

新来源 discovery 永远最后执行，并遵循：

- 先官方 store locator / official menu / official branch page；
- 再明确 branch-bound 的 retained third-party；
- 不使用付费 Google Data API；
- Google Maps/navigation 只做导航，不作为 evidence source；
- 禁止 proximity-only identity binding；
- 来源受限、冲突或无法确定当前分店时保持 candidate / blocked / no_evidence。

### Phase F：生命周期与停止条件

所有新 classification / metadata review 都应逐步复用 dish 已验证的 lifecycle：

`assignment snapshot -> sourceFingerprint -> proposal -> central review -> accepted/candidate/no_evidence/blocked -> cooldown/source-change invalidation`

停止条件不是“所有字段 100%”，而是：

- 当前高价值 bound-source work 已完成；
- retained evidence 已审；
- discovery 只剩低收益/无法验证来源；
- 新一轮扫描的 accepted 增量明显下降；
- 继续补全会要求降低 evidence threshold 时立即停止。

### 当前不做

- 不继续扩大 1,422 家公开餐厅数量；
- 不优先处理 1,382 个 Place-ID-only 长尾；
- 不开启 open-now 筛选，直到 hours coverage 与语义稳定度明显提高；
- 不恢复 800+ dish 全量扫描；
- 不让店名/菜名推断直接进入 accepted classification；
- 不为了覆盖率强制填值。

下一代码实施顺序：**100 家 bound-source review -> central review / accepted overlay merge -> 61 家 name-candidate planner -> source-centric metadata planner -> retained/bound metadata review -> residual discovery**。accepted entity overlay contract/materializer 已完成。

## 2026-09-14 20:06 JST：Official / Retained 逐步完成检查点

工作分支为 `codex/official-retained-completion-20260914`，基于 `agent-data-library-2026-09-14` 的 `5179bad`。本节随已验证的阶段更新；下方 19:24 检查点保留为历史状态。

当前阶段：基线已重建、审查适配器与回归已验证，菜品证据仍在审查。[草稿 PR #67](https://github.com/nekooweb/eat/pull/67) 已开启，用于提前运行 CI；尚未完成全量中央审查或导入新菜品证据，不可标为完成或合并。

草稿首个 head `83cfc1f` 的 PR Review、Pages 预览构建和 policy 检查已通过，部署跳过。具体 run 链接见[本轮日志](logs/2026-09-14-official-retained-completion.md)；CI 通过不替代逐行证据审查。

| 已核实事项 | 当前结果 |
| --- | --- |
| 实际重建后范围 | Official 219、Retained 318，合计 537 个唯一 assignment |
| 旧队列差异 | Minatoya 的已隔离错误官网被移除；Official S6 → Discovery S6，本任务不继续处理该行 |
| 外部分支复用 | PR #66 的 Retained S0 原始 46 行已 cherry-pick 到完成分支，仍待内容审查 |
| 重复提交 | Official S3 两份 21 行；Retained S1 中央版与独立分支版 37 行，均需按 Place ID 协调 |
| 公开基线 | 冻结目录 2,804、命名 runtime 1,422；R 595 家、F 675 家、任一展示菜 740 家，推荐缺口 827 家 |
| SQLite 审计副本基线 | R 559 家、F 657 家；单独通过维护入口构建，未替换用户主库 |
| 工程门禁 | 离线审查适配器、逐证据增量审计、完整来源快照保留回归通过；公开与 10 项主库校验基线通过 |
| 付费 Google Data API | 0 次 |

20:11 JST 补充验证：维护入口重复导入审计 SQLite 后，8 张核心表计数完全不变（目录 2,804、来源及绑定各 9,969、观察 57,540、决议 37,252、任务及详情各 2,308）。这验证了本次基线的重复导入幂等性，不代表未完成的菜品审查已通过。

逐行审查补充：Luna 已保存 ARBOL 跨分店引用、Sta. Kanda 失效页面、Sombreuil 过期菜单、文銭堂非当季草莓大福、らくごカフェ历史菜单等降为候选的修正。べっぴん舎仅有「特別／他にはない」描述，保持候选；Keidanren 的「伝統」不单独构成推荐，R 降为 F。最终 shard 数量仍以正在执行的审查验证为准。

Official 缺失 S0/S5/S6 已完成提案和 worker 自检：81/81 行，其中接受 3、候选 7、无证据 37、受限 34、跳过 0；接受项全部为 F，没有 R。全体 Official 219 行的成员、去重和 summary 检查通过，内容仍须独立中央复核后才可批准导入。

全范围结构审计现已通过：Official 219/219、Retained 318/318，合计 537/537 个唯一 assignment，全部有且仅有一项终态。当前草稿统计为接受 105、候选 48、无证据 319、受限 65、跳过 0；该统计尚未通过完整独立内容复核，不代表最终接受量或生产增量。

Retained worker 已完成 318 行及适配器自检：接受 70、候选 6、无证据 240、受限 2；43 条 R、229 条 F，其中 107 条暂缺精确中文规范化。独立交叉审查仍在核对 PR #66 的原文可追溯性，并补齐 Official 9 条受限记录的尝试来源说明。该阶段不批准原文不足的证据，也不为提高覆盖率强制翻译。

批量读取、来源挖掘和逐行审查由 Luna worker 执行。主进程负责关键争议复核、审查批准、维护管线集成、验证和文档。每完成一个 shard 或一次验证，就将结果补充到[本轮日志](logs/2026-09-14-official-retained-completion.md)。草稿、已审查、已导入、已重建和 CI 通过分别记录；不以 proposal 数量替代实际覆盖增量。

## 2026-09-14：并行 Agent 数据补全层

当前在 `agent-data-library-2026-09-14` / PR #65 上新增了并行数据补全层。该层只负责分配任务、保存来源证据和 proposal，不直接修改 canonical runtime、`data/production_area1.js` 或 SQLite master。

本轮公开 dish-work 基线来自 2026-09-14 snapshot：冻结目录 2,804、公开 runtime 1,422、推荐菜已知 595、特色菜已知 675、任一展示菜已知 740、recommendation gap 827、可执行 dish-work 共 892 行。892 行按已有 `data/dish_batch_plan.json` 划分为 4 个互斥 lane：

| Marker | 工作类型 | 总行数 |
| --- | --- | ---: |
| `DISH-R-OFFICIAL` | 已知官方来源上的严格推荐菜证据 | 220 |
| `DISH-R-RETAINED` | 仓库已保留来源中的菜品证据挖掘 | 318 |
| `DISH-R-DISCOVERY` | 为缺少可用菜品来源的记录寻找独立来源 | 289 |
| `DISH-F-SOURCE` | 官方/保留来源上的普通菜单项（F） | 65 |
| **合计** |  | **892** |

每个 lane 使用现有 deterministic S0-S7 shard；worker 在开始前重读当前 row，已完成的 row 必须跳过。Place ID 是冻结 identity key，来源别名只作为 identity evidence，不允许替换 catalog/tool identity name。

### 当前 proposal 进度（2026-09-14 19:24 JST 检查点）

进度按“唯一 assignment row 已经形成可审查 proposal”计数，不按文件数或 Agent 次数计数；同一 shard 的独立复核不能重复计算。

| Lane | 已形成 proposal | 总行数 | 进度 | 已完成 shard |
| --- | ---: | ---: | ---: | --- |
| `DISH-R-OFFICIAL` | 138 | 220 | 62.7% | S1, S2, S3, S4, S7 |
| `DISH-R-RETAINED` | 172 | 318 | 54.1% | S0, S1, S2, S4 |
| `DISH-R-DISCOVERY` | 36 | 289 | 12.5% | S7 |
| `DISH-F-SOURCE` | 0 | 65 | 0.0% | - |
| **合计** | **346** | **892** | **38.8%** |  |

其中 central branch 已经落盘 300 行：Official S1/S2/S3/S4/S7、Retained S1/S2/S4、Discovery S7。Retained S0 的 46 行已经在 PR #66 完成并提交，因此计入“全局已提交 346”，但尚未进入 central branch；central branch 本身的可见进度是 300/892（33.6%）。剩余尚未形成 proposal 的唯一 row 为 546。

Official S3 当前有两份独立 Agent 结果。两份都覆盖同一 21 个 assignment row，所以进度只计 21 行；其 accepted/candidate/no-evidence/blocked 分类存在少量差异，必须在 central review 中逐 Place ID reconciliation，不能任选一份直接作为 canonical truth。

当前尚未形成 proposal 的 shard：Official S0/S5/S6；Retained S3/S5/S6/S7；Discovery S0-S6；F-source S0-S7。

### 并行开发逻辑

1. **Assignment/index**：`data/agent_library/manifest.json` 记录 marker、lane、总量和 shard 分布；`data/dish_batch_plan.json` 继续是 dish row source of truth，不复制另一套任务表。
2. **Worker scope**：Agent 只能处理指定 `MARKER:Sx`，开始前重新检查当前 row，不能扩展到其他 shard/餐厅。
3. **Evidence-first**：保留 provider、精确 URL、checked date、source-native dish text、evidence class 和 branch/identity evidence。禁止付费 Google data API、登录/CAPTCHA 绕过、访问限制规避和 proximity-only identity binding。
4. **R/F/C 语义**：R 必须同时有具体菜名和明确的おすすめ/名物/看板/人気/signature/specialty 等语义；普通菜单项只能是 F；身份或语义不确定时保持 C/candidate、blocked 或 no_evidence。
5. **Proposal-only handoff**：结果写入 `data/agent_proposals/<marker>/<shard-or-batch>.json`。worker 不直接修改 canonical runtime、production data 或 SQLite master。
6. **Central review**：按 frozen Place ID 检查 shard membership、branch identity、R/F/C 分类、source provenance、重复 evidence、跨分店传播、course-level semantics 误传播及 policy attestation。独立重复结果用于 reconciliation，不增加完成量。
7. **Canonical merge/rebuild**：只有 central review 通过的 evidence 才能进入现有 canonical merge；随后通过正常 pipeline 重建 runtime/queue、运行 regression/audit，再决定是否发布。proposal 文件存在本身不代表 production 已改变。

状态口径固定为：`unassigned/working -> proposal submitted -> central reviewed -> canonical merged/rebuilt`。对外报告必须同时说明处在哪一层，禁止把 proposal completion 当成 canonical coverage 增长。

当前 PR #65 最新 proposal checkpoint 的 PR Review 与 Pages preview 均通过；CI 通过只证明现有代码/数据约束未被 proposal 文件破坏，不代表 proposal 内容已经完成 central semantic review。

详细 assignment contract 见 [`data/agent_library/README.md`](data/agent_library/README.md)，proposal schema 见 [`data/agent_library/proposal-template.json`](data/agent_library/proposal-template.json)，本轮过程与逐 shard 检查点见 [`logs/2026-09-14-parallel-agent-data-completion.md`](logs/2026-09-14-parallel-agent-data-completion.md)。

## 2026-09-10：页面精简与问题清单

本轮只精简公开界面，不采集新数据、不重置 SQLite，也不删除原始来源。显示/筛选/选店分组统一菜系别名，常见按钮优先显示，对比表默认折叠并省略全空行，首页只保留可选店数，页脚保留必要署名与法律链接。

详细字段边界见 [PUBLIC_UI_FIELDS](PUBLIC_UI_FIELDS.md)。证据合并截断、缺失名称字符串化、固定公开数量回归、发布交接及时效问题已逐项写入 [PIPELINE_ISSUES](PIPELINE_ISSUES.md)，这些数据层事项仍未修复。

PR #56 初始及补充回归测试已先复现问题；本轮实现的最终 CI/浏览器/部署验证见 [UI 日志](logs/2026-09-10-public-ui-simplification.md)。


## 执行状态：主线已合并；按需运行

2026-09-08 的数据载入修复 PR #32 已实际合并到 `main`。此前文档中“PR #32 未合并”的描述已过期；当前主线继续采用其安全重载、manual-only 全量 reset、普通 Pages 仅 `--public-only` 的执行边界。

此前完整离线验证及扩展的 11 项回归已通过 [run 34216698239](https://github.com/nekooweb/eat/actions/runs/34216698239)。这些是已执行的验证记录，不是正在运行的任务。本地主库是否已被新的离线重建产物替换，仍必须根据具体执行记录判断，不能仅根据代码已合并推断。

全量 reset workflow 维持 manual-only。Pages 常规构建只执行 `--public-only`，不重置主库。后续字段和命令以 [字段契约](DATA_LOADING_FIELDS.md)为准。

## 2026-09-09 工具身份名称契约修复

新发现的错误表明，来源/官网别名不能进入下游工具的身份名称字段。例如 `めいどりーみん 秋葉原 AKIBA` 是来源侧当前名称/别名，而冻结 catalog 中相同 Place ID 的工具身份名称应保持 `Maidreamin Akihabara Himitsukichi`。

因此新增统一约束：

- 工具 task 的 `name` 必须来自当前 runtime/catalog；
- `officialName`、页面标题及来源名称仅作为 source alias / identity evidence；
- runtime 没有已知名称时必须跳过，不允许用来源别名补成工具身份；
- 来源别名仍可参与页面身份文本过滤，但不得替代 catalog name；
- PR Review 在 `--public-only` 重建后执行 `scripts/test_tool_identity_name_contract.mjs`，并使用真实 Maidreamin Place ID 做回归验证。

详细记录见 [2026-09-09 tool identity-name contract log](logs/2026-09-09-tool-identity-name-contract.md)。

## 当前修复基线

2026-09-08 修复数据载入中断、危险重置、任务类型不一致和重复自动触发问题。核心修复提交 `da60a70` 已通过 [完整重建与回归](https://github.com/nekooweb/eat/actions/runs/34215698634)、数据库契约、PR 和 Pages 预览构建。生产是否已发布应以对应的 Pages deploy 状态为准，不以预览构建代替。

| 当前重建结果 | 数量 |
| --- | ---: |
| 冻结目录 | 2,804 |
| 公开命名 runtime | 1,422 |
| runtime 未命名保留项 | 1,382 |
| 有中文推荐菜 / 特色菜 | 254 / 424 |
| 任一中文菜品展示 | 486 |
| 通过公开时间语义校验 | 629 |
| SQLite source records / bindings | 7,124 / 7,124 |
| SQLite observations / resolutions | 52,116 / 34,192 |
| 主库 active tasks / shards | 2,641 / 17 |

主库身份：651 verified、757 source_matched、1,381 id_only、15 conflict。主库与旧公开 runtime 的准入规则不同，两个 id-only 分母不能互换。SQLite 全目录仍为 2,804；当前 SQLite recommendation export 仍是 shadow 校验结果，尚未作为网页唯一数据源。

## 本轮解决的根因

1. materialized audit、独立菜品来源计划和 reviewer 写死 1,415 家。新增真实记录到 1,422 家后被错误拒绝。现在按当前 runtime、队列和冻结目录的数量与 ID 集合校验。
2. planner 新增 `dish_source_acquisition` 和 `featured_dish_source_acquisition`，数据库 CHECK 约束仍是旧类型。新增 migration 002，保留旧任务数据并更新约束；迁移只应用一次，验证器按实际迁移文件列表核对。
3. `--reset` 原先先删除数据库，输入失败后旧库也丢失。现在先生成旧库备份，再在临时库重建及验证，最后通过 SQLite backup 事务复制替换；失败保留旧库。
4. failed active tasks 被分片器忽略。现在进入 workplan，新增菜品任务有明确路由；桶过大继续拆分，空桶不生成无效分片。
5. Pages、PR、数据库检查和候选计划原先分别使用不同构建步骤，容易读取旧生成文件。新增统一离线入口 `scripts/reload_data.py`，按同一 checkout revision 重建。
6. PR 仍要求已退役 Google Embed，阻断现行 Leaflet 页面。已调整为 Leaflet / OpenStreetMap 检查，并继续禁止 Google key/embed 配置回归。
7. 普通代码推送会触发许多旧采集/写回任务。44 个维护 workflow 改为手动触发，保留原有输入；自动任务只做当前构建、校验、规划和发布。
8. 2026-09-09 修复官方来源名称被下游工具当成 catalog identity 的问题；来源别名与工具身份名称现在强制分离并有 PR 回归测试。

## 数据清理

已移除 3 份无实际下游事实消费的旧生成快照、对应 3 个生成器/3 个 workflow，以及 5 个已禁用的空操作 workflow，共 14 个文件，约 1.67 MB。原文件可由 Git 历史恢复，全部原始 data 输入另有清理前备份。

网页 materialized runtime 不再携带 `dishes`、`priceReference` 及 4 份嵌套诊断摘要。源观察、具体出处、身份和原始证据没有因此删除。

有下游依赖的旧 reconciliation/catalog 输入继续保留，不能仅凭「旧」就删除。下一步可在迁移完其消费者后继续清理。

## 当前执行方式

完整离线重建：

```sh
python3 scripts/reload_data.py --outdir _audit/data-reload --database _local/eat-main.sqlite --reset
```

增量重导入省略 `--reset`。仅刷新网页/队列使用 `--public-only`，不会更新 SQLite。上述命令在 GitHub runner 或获准的数据运行环境执行；不得违反用户要求在本地克隆仓库编辑。

`reload-manifest.json` 记录实际 checkout commit、模式、目录/公开数量和生成文件 SHA-256。公开 JS 的缓存版本在 Pages 装配时按内容 hash 生成。

## 当前任务方向

保留最新菜品优先策略：

- identity conflict review：20；
- identity recovery：1,381；
- dish source acquisition：1,180；
- featured dish source acquisition：60。

普通地址、电话、预算、设施不再单独生成补全任务；已有可信字段仍保留。推荐菜严格区分来源推荐语义与普通菜单，禁止菜系/品牌模板造数据。

## 后续边界

身份长尾和菜品缺口仍需新证据。SQLite shadow → 唯一公开数据源的切换需要单独比较准入、字段来源和浏览器行为，不能把统一入口描述成已经完成该切换。

详细过程见 [重置日志](logs/2026-09-08-data-loading-reset.md) 与 [2026-09-09 identity-name 修复日志](logs/2026-09-09-tool-identity-name-contract.md)，实际流程见 [DATA_PIPELINE](DATA_PIPELINE.md)。旧日期型日志为历史检查点，不作为当前统计来源。


## 2026-09-15：菜品数据最终统一整合

892 条 dish-work 已全部形成 terminal decision；Official/Retained 537 行与 Discovery/F-source 355 行均完成最终覆盖。S0–S7 的独立 E2E 结果先按共同 PR #67 基线提取 canonical delta，再与 Official/Retained 的 fail-closed 中央复核结果做单调 union。

最终维护管线验证通过：review digest approval → evidence union → maintained merge → specificity correction → evidence audit → public rebuild → integration audit → disposable SQLite full rebuild/validators → logical replay。全程付费 Google Data API 调用为 0。

最终公开 runtime：R 619 家、F 707 家、任一展示菜 774 家、recommendation gap 803 家；相对原始基线 R +24、F +32、展示 +34、推荐缺口 -24。canonical evidence item 为 R 1036、F 2722。第二次 replay 新增 R/F evidence 均为 0，所有 count delta 均为 0。

详细结果与中央降级、translation-pending 数量、各 shard delta 见 [`data/final_dish_integration_metrics.json`](data/final_dish_integration_metrics.json) 与 [`logs/2026-09-15-final-dish-integration.md`](logs/2026-09-15-final-dish-integration.md)。最终整合已经合入 `main` 并完成生产发布；当前正式 checkpoint 见 [`RELEASE.md`](RELEASE.md)。