# Eat 开发状态与重构计划

更新日期：2026-09-07。

## 当前状态

项目进入整体流程重构阶段。长期目标保持为：公开来源采集、原始记录留档、Place ID 关联、本地 SQLite 主库、统一字段采用以及单一网页导出。

冻结目录仍为 2,804 个 Google Place ID。当前网页不再把只有 Place ID、没有真实名称的条目当作可推荐餐厅发布；这类记录继续保留在内部 catalog，待补到真实名称和基础身份后再自动重新进入发布候选。

数据库 schema、输入清单和内存关系模型已经验证；永久主库、正式迁移器、统一 resolver 与新导出尚未切换生产。

## Refactor mode

为避免整体重构期间旧架构审查造成大量无意义阻断，GitHub Actions 使用 `EAT_REFACTOR_MODE=1`。

### 继续阻断合并/部署的硬检查

- 禁止重新启用付费 Google 数据 API。
- JavaScript/Python 基础语法和必须存在的发布文件。
- 冻结目录 2,804 Place ID 不丢失、不重复。
- 已知 durable distance 不得超过 1.2 km。
- 禁止把受限制的 Google response 字段或凭据直接写入公开运行时。
- 当前 fallback Pages 必须仍可构建和发布。
- 公开 recommendation runtime 不得包含无真实名称的 `google_place_id_only` 条目或“Google Maps 餐厅”占位名。

### 重构期间降级为 warning 的旧架构检查

- 旧 canonical shape、旧 overlay 层及旧 runtime 脚本顺序的一致性。
- 字段完整度、推荐菜覆盖率、旧 enrichment shard 一致性。
- dish-first 队列是否仍是第一优先级。
- 旧 normalized-field 约束是否完全满足。
- 旧 strict provenance/legacy source-binding 审核中只与旧数据模型相关的失败。
- 数据库关系模型的业务约束测试暂时允许失败，但语法错误仍阻断。

Refactor mode 不是取消质量控制。所有 warning 必须保留在 Actions 日志中；切换新主库前会重新建立新架构对应的 strict gates。

## 已完成的过渡修复

- 已验证 refactor mode 下 Pages build/deploy 与数据库契约 workflow 均可通过。
- 2,804 frozen catalog 继续保留，但当前公开 runtime 只发布有真实名称的记录；1,393 条 ID-only 条目暂时下架，补全后再上架。
- runtime builder 不再写入“Google Maps 餐厅”伪名称。
- Hot Pepper retained 字段改为读取真实的 `openingHoursText` / `closedText`，用于恢复旧 runtime 漏掉的营业/休息日原文。
- 旧数组预算表示无法正确表达开放上界，因此 `N以上` 不再被伪造成 `N -> N+2000`；原始预算文本留给 SQLite schema 以 `upper=null` 正确保存。

## 新设计开发主线

### Phase 0 — 保持线上可用并降低旧审查耦合

已完成当前阶段：保留成本、安全、语法、目录和部署硬门槛；旧语义审查改为 warning；ID-only 条目从公开推荐 runtime 下架。旧 Pages 继续作为 fallback，不在主库重构完成前拆除。

### Phase 1 — 建立 persistent SQLite v1

1. 建立真正的 `main.sqlite` 初始化与迁移器，而不是只使用内存验证脚本。
2. 首批导入 2,804 catalog entries 和 760 retained bindings。
3. 将 5 组 reused provider ID / 10 bindings 直接进入 conflict，不选择 canonical name。
4. 3 条冻结目录外历史核心记录进入 retained exception 区，不自动扩展 catalog。
5. 迁移过程必须幂等、可回滚，并保存 source commit / parser version / content hash。

### Phase 2 — 迁移 retained source facts

优先级：

1. Hot Pepper 535 条 retained catalog facts。
2. 保存 `openingHoursText` / `closedText` 原文，并将 353 条旧 runtime 漏映射记录作为回归样本。
3. 开放预算上界保存为 null，不再构造伪上界。
4. 导入 rich metadata、source facts、provenance 和 dish evidence 为 observations，而不是直接当最终 canonical truth。
5. 新空值或抓取失败不得覆盖历史已知值。

### Phase 3 — 统一 identity + field resolver

浏览器和旧 JS 文件不再决定最终字段。统一 resolver 根据 binding 状态、field observation 状态、来源类型、时间、规则版本、冲突状态及明确 retraction/correction 生成 field resolution。

`known / unknown / reviewed_none / not_applicable / conflict / retracted` 使用统一状态模型。derived fields 必须记录转换规则和来源 observation。

### Phase 4 — 两套同版本导出

从同一 SQLite snapshot 生成：

- `catalog`：保留全部 2,804，显示缺失、冲突和来源状态。
- `recommendation`：只包含满足 eligibility 的条目，并记录 exclusion reason。

`id_only` 不伪造名称，也不会因为 frozen membership 自动进入推荐池。

### Phase 5 — Pages 切换

新 export 经过 ID 集合、回归 diff、字段 provenance、浏览器行为、备份恢复验证后，再替换旧 `google_inventory_runtime.js` 构建链。切换提交才停用/归档重复 workflow 和旧 enrichment builders。

### Phase 6 — 恢复增量补全

只有新主库和 resolver 稳定后才继续批量补数据。优先顺序：

1. 1,393 个 id-only 的身份/名称恢复；
2. 地址、坐标、菜系；
3. 营业时间；
4. 预算；
5. 菜单/推荐语义；
6. 实用字段。

一次访问一个已确认来源时，尽量一次提取所有可支持字段，不按字段重复抓取。

## 当前数据判断

2,804 数据集是 Area1 frozen food-place identity catalog，而不是完成的 recommendation dataset。目录覆盖完整度高，字段覆盖仍不均衡。完整度指标在重构期间作为报告，不作为阻断条件。

## 开发纪律

- 每次完成一批实际开发后，同步更新 `DEVELOPMENT.md`、相关架构/数据文档和 `logs/` 当天开发记录。
- 文档只记录实际完成状态，不把计划写成已完成。
- 不在新迁移器、备份和回滚存在前删除旧数据依赖。
- Refactor mode 结束时必须用新架构 strict checks 替换 warning，而不是永久弱化审查。

当前验证详情见 [验证报告](docs/database/VALIDATION_2026-09-07.md)，数据流程见 [DATA_PIPELINE](DATA_PIPELINE.md)，架构见 [ARCHITECTURE](ARCHITECTURE.md)。
