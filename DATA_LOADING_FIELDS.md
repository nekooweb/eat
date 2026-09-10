# 后续数据载入：字段契约与执行方案

更新日期：2026-09-10。PR #32 已合并；字段载入和数据库边界仍保留。公开页面的精简规则另见 [PUBLIC_UI_FIELDS](PUBLIC_UI_FIELDS.md)，数据层待修事项见 [PIPELINE_ISSUES](PIPELINE_ISSUES.md)。本次 UI 修改不触发餐厅采集或主库替换。

## 1. 保留字段

| 层 | 保留内容 | 校验规则 |
| --- | --- | --- |
| 全量目录 | Place ID、范围快照、身份状态 | 保留全部 2,804 个 ID，未知或冲突不删除 |
| 基础展示 | 真实名称、地址、菜系、来源坐标、距离 | 仅采用有证据的实际值；不把占位文本作为店名 |
| 推荐/特色菜 | recommendedDishes、featuredDishes | 保留 R/F 区别及原始证据，中文译名不覆盖源菜名 |
| 公开时间 | hoursReference | 由语义校验生成；含糊或冲突原文不直接展示 |
| 金额 | lunch、dinner 及主库预算结构 | 不把菜单单价、午餐有无或开放上界伪装成有限人均预算 |
| 证据与历史 | source records、bindings、observations、原文、URL、时间、解析规则 | 留在主库/维护输入，保留可追溯性 |
| 任务 | task type、status、attempts、error | failed active tasks 不能遗漏；dish acquisition 类型必须有 schema 支持 |

已有地址、电话、预算或设施字段可以保留作为历史/辅助资料，但当前 planner 不因普通资料不完整创建主动补全任务。后续主动补全以来源支持的推荐菜/特色菜为主，身份恢复用于保证正确关联。

## 2. 从网页包移除的字段

| 字段 | 理由 | 原始资料去向 |
| --- | --- | --- |
| `dishes` | 旧菜单数组，无当前前端消费；与规范化菜品层重复 | 原始菜品观察继续保留 |
| `priceReference` | 泛化价格提示，不是明确餐段预算 | 来源价格原文继续保留 |
| `detailEvidenceSummary` | 嵌套采集诊断，不用于页面展示 | 维护证据文档/审计报告 |
| `publicWebFieldEvidenceSummary` | 同上 | 维护输入/审计报告 |
| `reviewedOfficialOverlaySummary` | 重复来源汇总 | 来源索引/审计报告 |
| `sourceBasicProviders` | 提供方分布诊断，不用于前端 | 原始来源/主库统计 |

清理发生在 `materialize_chinese_dish_runtime.mjs` 的公开边界，不批量删除底层有效 observations。仍有真实下游读取的 reconciliation/catalog 资料暂留；不得把「旧字段」等同于「没有用」。

## 3. 已移除的旧入口

3 个旧生成快照、对应 3 个生成器和 3 个 workflow，以及 5 个已禁用的空操作 workflow，共 14 个文件已在修复分支删除。详情与备份见 [重置日志](logs/2026-09-08-data-loading-reset.md)。

44 个旧维护/采集 workflow 已改为手动触发。全量 reset workflow 也只允许手动运行，不再因分支代码推送自动执行。

## 4. 后续运行顺序

1. 运行前确认当前提交和验证结果；保留原始来源及备份。
2. 需要刷新网页/队列时运行：
   `python3 scripts/reload_data.py --public-only --outdir _audit/data-reload`。
   该操作不更新 SQLite，不采集网站。
3. 需要增量主库导入时显式指定库：
   `python3 scripts/reload_data.py --database _local/eat-main.sqlite --outdir _audit/data-reload`。
4. 只有明确需要重新构建主库时加 `--reset`；先停其他写入进程并检查旧库独有数据。
5. reset 先备份旧库，再临时重建、校验、事务复制；不要手动删除主库/WAL。
6. 核对 `reload-manifest.json` 中 sourceCommit、目录数量、公开/queue ID 一致性、输出 SHA-256。
7. 真正网络采集是另一个手动操作，不由 reload 隐式启动。没有网络证据结果就不能标记采集完成。
8. 发布与主库替换分别确认；SQLite shadow export 尚未切换成网页唯一数据源。

用户要求 GitHub 插件修改仓库，不在本地克隆编辑；上述代码在 GitHub runner 或另行确认的数据执行环境中运行。

## 5. 已验证代码

- 动态 public count 和 current runtime/queue ID 检查。
- migration 002 与一次性 migration registry。
- 旧任务历史保留、failed task 不丢失、dish acquisition 路由。
- 超大散列桶拆分，不产生空分片。
- 输入失败、业务验证失败均保留旧库。
- 重置成功有旧库恢复副本。
- materialized runtime 不再含本表列出的无用字段。

11 项回归、主库契约和 Pages 预览均已有通过记录；最后的手动触发配置与说明提交按用户要求不再启动 CI/数据运行。后续实际执行前可手动复核。
