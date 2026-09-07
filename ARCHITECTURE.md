# Eat 数据架构

更新日期：2026-09-07。

## 当前部署

应用仍是静态 GitHub Pages 网站。旧构建器生成 legacy canonical 数据，冻结 Google 目录运行时保留 2,804 个 Place ID，并叠加来源基础记录和菜品证据。浏览器当前仍优先消费 `google_inventory_runtime.js`。

整体重构期间启用 `EAT_REFACTOR_MODE=1`。旧数据层的部分语义审查降级为 warning，但成本、安全、语法、目录完整性和 Pages 可部署性仍是硬门槛。

## 新目标架构

公开来源 / 已有留存输入
→ 版本化 source records
→ identity bindings
→ field observations
→ field resolutions
→ local SQLite master
→ versioned catalog/recommendation exports
→ GitHub Pages

### 1. Catalog 与 recommendation 分离

- 2,804 个冻结 Place ID 构成 catalog scope。
- catalog entry 可以处于 `id_only`、`source_matched`、`verified`、`conflict`、`closed`、`moved` 等状态。
- catalog membership 不自动等于 recommendation eligibility。
- `id_only` 条目不再使用“Google Maps 餐厅”等伪名称。
- recommendation export 必须显式给出 eligibility / exclusion reason。

### 2. Source record 与 binding 分离

Source record 保存来源本身：provider、provider ID、URL、原始内容、时间、parser version、content hash、取得方式等。

Source binding 保存“这条来源是否属于这个 Place ID”的判断。候选、已审查、冲突和撤销是 binding 状态，而不是来源事实本身。

### 3. Observation 与 resolution 分离

原始来源中得到的名称、地址、坐标、营业时间原文、预算、菜单等先成为 field observations。最终网页采用哪个值由 resolver 决定，并产生 field resolution。

新空值、超时或无匹配不能清除旧 known observation。明确纠错、闭店或搬迁证据可通过 retraction/correction 更新 resolution，同时保留历史。

### 4. Raw 与 normalized 分离

- `openingHoursText` 与规范化 weekly hours 分开保存。
- `closedText` 与固定休息日、临时休业、节假日例外分开。
- 原始预算文本与 lower/upper/currency/meal 分开。
- `N以上` 的 upper 必须保持 null，禁止人为构造上界。
- 菜单单价与人均预算分开。
- 推荐语义与“页面上出现一道菜”分开。

### 5. Derived field 必须有来源链

规范化菜系、距离、中文展示名等 derived values 需要记录：

- source observation；
- transformation/resolver rule version；
- 生成时间。

不能把派生值伪装成来源直接提供的值。

### 6. SQLite 是唯一可写主库

目标 production 数据只由 migration/import/collector 写入 SQLite。浏览器、Pages JS 和 Actions 临时文件都不是主库。

GitHub 保存代码、schema、文档、输入快照清单和经过验证的 export；本地 SQLite 与原始记录留档不直接公开。

### 7. Export 是发布契约

同一 SQLite snapshot 生成至少两类 export：

- `catalog`：全部 2,804 条；
- `recommendation`：满足 eligibility 的条目。

Export metadata 应包含 schema version、resolver version、source snapshot/hash、row count、生成时间和内容 hash。

Pages 只消费 export，不再在浏览器中执行多来源 identity matching 或字段合并。

## 重构期兼容策略

在新主库尚未完成时：

1. 旧 Pages 继续作为 fallback；
2. 新 SQLite/import/export 代码可并行开发；
3. 旧 canonical/overlay/coverage 审查只保留 warning；
4. 不删除旧数据依赖；
5. 新旧 export 做 regression diff 后才切换；
6. 切换完成后重新启用基于新架构的 strict gates。

## 第一批实际迁移目标

1. 2,804 catalog entries。
2. 760 retained basic bindings。
3. 5 组 / 10 条 reused provider-ID conflict。
4. Hot Pepper 535 retained records。
5. 353 条 opening/closed raw text 映射恢复。
6. rich metadata、source facts、provenance、dish evidence 作为 observations 导入。
7. 生成第一版 catalog/recommendation export，但在完成回归前不切 Pages。

## 部署边界

本地 SQLite 不会被 GitHub-hosted runner 自动访问。发布流程必须是显式交接：本地生成并验证 export → 提交 export → Actions 做结构/安全/目录检查 → Pages 发布。

当前设计依据：[DATA_PIPELINE](DATA_PIPELINE.md) · [DATA_SCHEMA](DATA_SCHEMA.md) · [SOURCES](docs/database/SOURCES.md) · [验证报告](docs/database/VALIDATION_2026-09-07.md)。
