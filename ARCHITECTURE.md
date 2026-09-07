# Eat 数据架构

更新日期：2026-09-07。

## 当前部署

应用仍是静态 GitHub Pages 网站。2,804 个 Google Place ID 继续作为内部冻结 catalog；公开 `google_inventory_runtime.js` 已开始按发布条件收窄，不再发布只有 Place ID、没有真实名称的占位记录。

当前旧构建链仍提供 canonical/source-matched 数据和推荐菜等 retained evidence，但浏览器只消费经过 runtime builder 发布的有名称记录。`google_place_id_only` 条目保留在 catalog 输入中，补到真实名称与基础身份后再通过 builder 自动重新进入发布候选。

旧构建器、provenance、provider facts、Hot Pepper rich 层仍存在，多套派生文件尚未被新主库替换。

## 已确认的目标架构

公开来源及旧留存输入 → 版本化原始记录 → 身份绑定与字段观察 → 本地 SQLite 主库 → 同一版本的 catalog/recommendation 导出 → GitHub Pages。

- Google Place ID 是当前 2,804 frozen catalog 的稳定主键，不把其他公开候选自动增加为目录身份。
- Catalog membership 与 publication/recommendation eligibility 分离；保留身份不等于必须在网页推荐池展示。
- Source record 是带版本的原始事实输入；source binding 是身份判断，二者不能混淆。
- Field observation 保存原值和证据；field resolution 保存采用结果或冲突状态。
- 主库只由迁移/采集导入器写入；网页导出是只读派生结果。
- `id_only` 保存为空名称状态，不再使用“Google Maps 餐厅”伪名称。
- 所有 catalog 条目都可保留，缺失和冲突有明确状态；recommendation export 仅发布满足 eligibility 的记录。
- 公共网站不直接公开原始响应、授权记录或本地数据库文件。

## 当前过渡规则

在 SQLite cutover 前，旧 runtime builder 临时承担 publication gate：

1. 先构建完整 2,804 内部 rows；
2. 仅将 `nameKnown=true` 且名称非空、非 `google_place_id_only` 的记录写入公开 runtime；
3. ID-only 数量保留在统计中，但不进入随机推荐；
4. Hot Pepper retained 营业时间读取 `openingHoursText` / `closedText`；
5. 旧二维预算数组无法表示开放上界，因此 `N以上` 不再构造伪上界，等待 SQLite 用 `upper=null` 表达。

这只是迁移期保护，不是最终 resolver。最终 publication 状态应由数据库 binding / field resolution / eligibility 规则生成。

## Refactor mode

重构期间保留成本、安全、语法、2,804 catalog 完整性和 Pages 可部署性为 blocking gate。旧 canonical/overlay/覆盖率等架构耦合检查降级为 warning，避免阻断主库重构。新主库切换前会重新建立对应 SQLite/export strict gates。

## 部署边界

个人电脑上的 SQLite 不会自动被 GitHub 托管 runner 读取。需要经过校验的导出交接；Actions 只校验和发布收到的快照，不假装实时连接本地主库。

新管线未完成前保留旧网页及构建流程。完整切换需要导出兼容性、浏览器回归、备份恢复和旧 workflow 停用验证。

## 设计依据

[来源](docs/database/SOURCES.md) · [管线](DATA_PIPELINE.md) · [schema](DATA_SCHEMA.md) · [验证](docs/database/VALIDATION_2026-09-07.md) · [开发状态](DEVELOPMENT.md)。
