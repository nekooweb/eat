# 2026-09-08 — 数据载入修复、重置与冗余清理

## 触发问题

用户要求识别现有流程问题、修复并重置载入，并允许删除无用数据/字段。仓库检查起点 `453fed8100f92df50434682f308ef8bec10bda88`。

已复现：

- Pages run `34213386205`：materialized audit 仍要求 1,415，但实际 runtime 1,422。
- dish collection run `34213319442`：独立来源候选计划也写死 1,415。
- 新 planner 输出两个 dish acquisition task types，旧 SQLite CHECK 不接受，master 构建报 IntegrityError。
- failed active tasks 被 workplan 排除。
- reset 在读取输入前删除数据库。
- PR audit 强制已退役 Google Embed，和当前 Leaflet 方案冲突。
- runtime 携带无消费的 legacy fields 和嵌套采集报告；多个旧 workflow 在普通 push 时启动。

## 证据优先的修复

回归测试先提交为 `839f964`。[run 34214401849](https://github.com/nekooweb/eat/actions/runs/34214401849)确认 6 个断言失败和 1 个 schema 错误，之后才修改生产代码。

修复 `5044b27` / `da60a70`：

- 当前 runtime / queue ID 集合与数量交叉校验。
- migration 002 及版本化 migration runner。
- 带备份、临时库验证与 SQLite 事务复制的 reset。
- failed tasks 保留、dish acquisition 路由、超大/空分片处理。
- `scripts/reload_data.py` 统一离线重建入口。
- Pages/PR/数据库/候选入口重新生成依赖，JS 缓存采用内容 hash。
- 44 个维护 workflow 改为手动；不启动新网络采集。

## 清理范围

删除 14 个文件：

- 3 份旧派生快照：area1_enrichment_matrix、area1_inventory_ledger、area1_inventory_expansion_queue；
- 对应 3 个生成器与 3 个 workflow；
- 5 个已禁用、只输出 disabled 提示的 workflow。

删除源文件大小合计 1,673,134 bytes。删除前已保存 data/database 原始输入。Git 历史还可恢复这些文件。保留仍有真实下游依赖的 catalog/reconciliation 数据。

公开 materialized runtime 删除 `dishes`、`priceReference`、detailEvidenceSummary、publicWebFieldEvidenceSummary、reviewedOfficialOverlaySummary、sourceBasicProviders。底层有效来源观察没有删除。

## 验证结果

[完整运行 34215698634](https://github.com/nekooweb/eat/actions/runs/34215698634)：

- catalog 2,804；
- public runtime / detail queue 1,422 / 1,422；
- recommendations 254、featured 424、任一菜品展示 486；
- public hours 629；
- master source records / bindings 7,124；
- observations 52,116、resolutions 34,192；
- master identity 651 verified / 757 source_matched / 1,381 id_only / 15 conflict；
- active tasks 2,641 / 17 shards；
- task types：identity conflict 20、identity recovery 1,381、dish acquisition 1,180、featured acquisition 60；
- 7 项 loading regression 全通过，fresh reset 与第二次 import 都通过；
- PR、数据库契约、无付费 API 和 Pages 预览检查均通过。

这些结果不表示所有餐厅资料已补全，也不表示 SQLite shadow eligibility 已切换到网页。

## 可恢复备份

本地旧主库：`/Users/neko/Documents/eat-database/backups/2026-09-08-before-reset/main.sqlite`；
SHA-256：`eb33e903da5d611187b60e5ddf813c21e72cd49d38aa91cf4d76007655be8c5b`。

清理前源输入 artifact 10051135615，SHA-256：
`853716f44ceb7685a2a52a5fe25556a504d668ebad2b746b14742b14f85ae8fd`。

已验证结果 artifact 10051671100，SHA-256：
`dc828d156128bd2fceb0bc5c47a0895bb07b631158158de2f28e36118c289869`。

原始 Google 历史 zip 备份没有修改，没有重新调用历史 Google 数据 API。主库恢复与生产发布状态以此次合并后的实际验证记录为准。

## 用户停止持续运行后的交付状态

- 用户明确只需要移除问题逻辑/无用字段，并准备后续代码和方案。
- 已结束的扩展验证：run 34216698239，11 项回归全通过；未继续启动新采集。
- 全量 reset workflow 改为仅 workflow_dispatch；Pages 只运行 public-only，不附带主库 reset。
- 修复留在 PR #32，未合并、未发布；不再用已下载结果替换本地 main.sqlite。
- 本地 main.sqlite 仍为 source commit 18da2aee 的既有版本，validated reset artifacts 仅作为可选恢复资料。
- 最后提交仅修改执行开关与文档，使用 [skip ci] 遵从用户停止运行的要求；此前核心代码验证记录保持有效，但不把未运行的最终配置提交说成重新全测通过。
- 后续字段保留/移除与命令入口见 [DATA_LOADING_FIELDS](../DATA_LOADING_FIELDS.md)。
