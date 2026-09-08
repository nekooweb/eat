# 数据载入、重置和发布流程

更新日期：2026-09-08。

## 执行状态：修复准备好，后续按需运行

按 2026-09-08 用户最新要求，停止继续采集、持续重建和本地主库替换。本次修改保留在 [PR #32](https://github.com/nekooweb/eat/pull/32)，未合并，未据此启动新生产发布。

此前完整离线验证及扩展的 11 项回归已通过 [run 34216698239](https://github.com/nekooweb/eat/actions/runs/34216698239)。这些是已执行的验证记录，不是正在运行的任务。本地主库未用重建产物替换，旧库与恢复资料都保留。

全量 reset workflow 现为 manual-only。Pages 常规构建只执行 `--public-only`，不重置主库。后续字段和命令以 [字段契约](DATA_LOADING_FIELDS.md)为准。


## 1. 当前唯一离线入口

`scripts/reload_data.py` 按实际 Git checkout commit 执行：

```text
固定 revision 的 retained / reviewed 输入
  → cost policy
  → Hot Pepper fallback、canonical、provenance、source facts、official URL overlay
  → named runtime
  → runtime identity audit
  → 中文菜品及公开营业时间 materialize
  → materialized audit
  → 当前 detail queue、dish batch plan、independent source candidates
  → SQLite import / reset、validators
  → SQLite shadow exports、export validation、全量 task workplan
  → reload-manifest.json
```

该命令不抓取外部店铺页面，不调用旧付费数据 API。运行环境的标准 checkout/dependency 安装不算餐厅资料采集。

## 2. 三个操作

| 操作 | 命令 |
| --- | --- |
| 全量安全重置 | `python3 scripts/reload_data.py --database _local/eat-main.sqlite --outdir _audit/data-reload --reset` |
| 重复导入/增量载入 | 同一命令省略 `--reset` |
| 只重建公开 runtime 和队列 | `python3 scripts/reload_data.py --public-only --outdir _audit/data-reload` |

先停用其他主库写入进程再重置。重置锁防止多个重置同时执行，但不是对所有第三方数据库写入程序的全局互斥。

完整重建只从当前维护输入构造新库，不自动把旧主库独有的未导出证据并入新库。执行前必须备份旧库并检查是否有独有数据；备份可恢复，不可直接丢弃。

## 3. 安全重置

`build_master.py --reset` 调用 `safe_reset.py`：

1. 检查目标是明确的普通 SQLite 文件路径，拒绝目录和符号链接。
2. 获取 reset 锁；目标存在时，用 SQLite backup API 保存带唯一版本名的旧库。
3. 在同目录临时数据库中执行完整导入。
4. 校验 integrity、foreign keys、2,804 目录及 master 业务验证。
5. 验证通过后，用 SQLite backup 事务复制到目标；不先删除主库或手动删除正在使用的 WAL。
6. 替换失败时尝试恢复旧备份，异常继续抛出；备份文件不删除。

成功摘要包含备份路径。新增 migration 002 允许当前菜品任务类型并保留所有旧 task rows。schema_migrations 决定哪些迁移需要执行，不在每次导入时重跑结构迁移。

## 4. 数量与字段契约

- 冻结目录为 2,804 个唯一 Place ID；公开命名条目数由当前数据导出计算，不写死为 1,415。
- 队列必须与当前 runtime 的 ID 集合一致，重复或遗漏失败退出。
- 公开 runtime 的 identity 状态与 master eligibility 仍不同；各自统计，不能交叉复用分母。
- 公开营业时间只保留经过语义验证的统一字段；来源原文保存在维护数据及主库。
- 推荐菜和特色菜保留既有来源规则，拒绝 category/name/brand inference。
- 未取得的数据保持未知；网络失败不当作闭店，不覆盖已知来源事实。

## 5. 任务与失败状态

当前 planner 为 dish-first；migration、workplan 路由和验证器必须同步支持所有 task types。

每条 active task 恰好一个分片；failed active tasks 也保留在分片中供执行器判断重试。分片本身不会把任务标记为采集完成。散列桶超出 250 时继续拆分，空桶不生成输出。

输出 workplan 仍是 proposal-only，不能把分片成功当作网络执行完毕。没有 evidence/proposal 的任务保持其待处理状态。

## 6. 自动与手动边界

普通 push / PR 保留离线验证与发布；44 个旧维护/采集/写回 workflow 已改为 workflow_dispatch，保留其原有输入。这样修复代码不再隐式启动网站采集或多个旧 bot 写回。

Pages、PR、database-contract、parallel workplan 和独立候选计划入口重建所需的当前 runtime，不信任仓库内旧生成文件的更新时间。

单独手动采集任务仍需要来源许可、准确分店绑定和失败记录；不得恢复付费 Google 数据接口或绕过访问限制。

## 7. 公开包清理与缓存

最终 runtime 移除无前端消费的 `dishes`、`priceReference` 和四份嵌套统计：
`detailEvidenceSummary`、`publicWebFieldEvidenceSummary`、`reviewedOfficialOverlaySummary`、`sourceBasicProviders`。

这些删除不影响 source records / observations；具体来源 URL 和前端需要的字段继续保留。完整数据库和原始资料不复制进 `_site`。

Pages 装配以每个生成 JS 的 SHA-256 前缀替换旧固定查询版本，避免重新发布后用户继续读取旧缓存。审计报告只上传 JSON/log，SQLite 不进入公开 Pages artifact。

## 8. 当前发布的实际边界

Pages 通过统一入口验证公开 runtime 与队列；SQLite 校验由独立数据库契约/手动全量流程负责。浏览器仍消费 generated runtime；SQLite recommendation.shadow.json 尚未成为唯一发布源。本次修复消除的是构建顺序和版本脱节，不是一次未经回归的 eligibility 改写。

本地经过校验的主库副本可由 GitHub artifact 恢复。个人电脑离线不会自动同步到 GitHub；本地新增证据需要显式交接给维护输入或未来的直接主库发布器。

## 9. 已执行验证与恢复资料

[完整重置 run 34215698634](https://github.com/nekooweb/eat/actions/runs/34215698634)完成两次完整载入、所有主库/来源/导出验证和 7 项回归测试，全部通过。

清理前原始输入：artifact `data-loading-input-backup-34214401849`；重建数据库和输出：`data-loading-reset-result-34215698634`。本地另有旧主库备份，详见 [当天日志](logs/2026-09-08-data-loading-reset.md)。

未来验证必须区分：代码已提交、离线重建成功、主库已更新、网页已发布、网络资料已采集。这五个状态不能互相替代。
