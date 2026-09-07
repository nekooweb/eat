# Eat 数据架构

更新日期：2026-09-07。

## 当前部署

应用仍是静态 GitHub Pages 网站。旧构建器生成 654 条严格核心记录；冻结 Google 目录运行时保留 2,804 个 ID，并采用其中 651 条核心记录、760 条来源基础记录和菜品证据。

浏览器优先使用 `google_inventory_runtime.js`，同时保留 provenance、provider facts 和 Hot Pepper rich 层。多套派生文件尚未被新主库替换。

## 已确认的目标架构

公开来源及旧留存输入 → 版本化原始记录 → 身份绑定与字段观察 → 本地 SQLite 主库 → 同一版本的目录/推荐导出 → GitHub Pages。

- Google Place ID 是本次全量目录的稳定主键，不把其他公开候选自动增加为目录身份。
- Source record 是带版本的原始事实输入；source binding 是身份判断，二者不能混淆。
- Field observation 保存原值和证据；field resolution 保存采用结果或冲突状态。
- 主库只由迁移/采集导入器写入；网页导出是只读派生结果。
- 所有目录条目都展示，缺失和冲突有明确状态，推荐用途另行判定。
- 公共网站不直接公开原始响应、授权记录或本地数据库文件。

## 部署边界

个人电脑上的 SQLite 不会自动被 GitHub 托管 runner 读取。需要经过校验的导出交接；Actions 只校验和发布收到的快照，不假装实时连接本地主库。

新管线未完成前保留旧网页及构建流程。完整切换需要导出兼容性、浏览器回归、备份恢复和旧 workflow 停用验证。

## 设计依据

[来源](docs/database/SOURCES.md) · [管线](DATA_PIPELINE.md) · [schema](DATA_SCHEMA.md) · [验证](docs/database/VALIDATION_2026-09-07.md)。
