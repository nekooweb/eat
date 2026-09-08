# Eat 开发状态与后续计划

更新日期：2026-09-08。

## 当前修复基线

本轮修复数据载入中断、危险重置、任务类型不一致和重复自动触发问题。核心修复提交 `da60a70` 已通过 [完整重建与回归](https://github.com/nekooweb/eat/actions/runs/34215698634)、数据库契约、PR 和 Pages 预览构建。生产是否已发布应以合并提交对应的 Pages deploy 状态为准，不以预览构建代替。

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
5. Pages、PR、数据库检查和候选计划分别使用不同构建步骤，容易读取旧生成文件。新增统一离线入口 `scripts/reload_data.py`，按同一 checkout revision 重建。
6. PR 仍要求已退役 Google Embed，阻断现行 Leaflet 页面。已调整为 Leaflet / OpenStreetMap 检查，并继续禁止 Google key/embed 配置回归。
7. 普通代码推送会触发许多旧采集/写回任务。44 个维护 workflow 改为手动触发，保留原有输入；自动任务只做当前构建、校验、规划和发布。

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

本次是离线载入、重建、清理与发布修复，没有发起新的全量网络采集。身份长尾和菜品缺口仍需新证据。SQLite shadow → 唯一公开数据源的切换需要单独比较准入、字段来源和浏览器行为，不能把本次统一入口描述成已经完成该切换。

详细过程见 [重置日志](logs/2026-09-08-data-loading-reset.md)，实际流程见 [DATA_PIPELINE](DATA_PIPELINE.md)。旧日期型日志为历史检查点，不作为当前统计来源。
