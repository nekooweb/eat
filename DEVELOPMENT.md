# Eat 开发状态与后续计划

更新日期：2026-09-10。

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
