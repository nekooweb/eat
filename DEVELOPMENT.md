# Eat 开发状态与后续计划

更新日期：2026-09-14。

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
