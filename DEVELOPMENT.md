# Eat 开发状态与重构计划

更新日期：2026-09-07。

## 当前状态

项目进入整体流程重构阶段。已确认长期目标仍是：公开来源采集、原始记录留档、Place ID 关联、本地 SQLite 主库、统一字段采用以及单一网页导出。

当前线上仍使用旧静态构建链，但 2,804 个冻结 Place ID 目录保持稳定。数据库 schema、输入清单和内存关系模型已经验证；永久主库、正式迁移器、统一 resolver 与新导出尚未切换生产。

## Refactor mode

为避免整体重构期间旧架构审查造成大量无意义阻断，GitHub Actions 进入 `EAT_REFACTOR_MODE=1`。

### 继续阻断合并/部署的硬检查

- 禁止重新启用付费 Google 数据 API。
- JavaScript/Python 基础语法和必须存在的发布文件。
- 冻结目录 2,804 Place ID 不丢失、不重复。
- 已知 durable distance 不得超过 1.2 km。
- 禁止把受限制的 Google response 字段或凭据直接写入公开运行时。
- 当前 fallback Pages 必须仍可构建和发布。

### 重构期间降级为 warning 的旧架构检查

- 旧 canonical shape、旧 overlay 层及旧 runtime 脚本顺序的一致性。
- 字段完整度、推荐菜覆盖率、旧 enrichment shard 一致性。
- dish-first 队列是否仍是第一优先级。
- 旧 normalized-field 约束是否完全满足。
- 旧 strict provenance/legacy source-binding 审核中只与旧数据模型相关的失败。
- 数据库关系模型的业务约束测试暂时允许失败，但语法错误仍阻断。

Refactor mode 不是取消质量控制。所有 warning 必须保留在 Actions 日志中；切换新主库前会重新建立新架构对应的 strict gates。

## 新设计开发主线

### Phase 0 — 保持线上可用并降低旧审查耦合

已开始：保留成本、安全、语法、目录和部署硬门槛；旧语义审查改为 warning。旧 Pages 继续作为 fallback，不在主库重构完成前拆除。

### Phase 1 — 建立 persistent SQLite v1

1. 建立真正的 `main.sqlite` 初始化与迁移器，而不是只使用内存验证脚本。
2. 首批导入 2,804 catalog entries 和 760 retained bindings。
3. 将 5 组 reused provider ID / 10 bindings 直接进入 conflict，不选择 canonical name。
4. 3 条冻结目录外历史核心记录进入 retained exception 区，不自动扩展 catalog。
5. 迁移过程必须幂等、可回滚，并保存 source commit / parser version / content hash。

### Phase 2 — 迁移 retained source facts

优先级：

1. Hot Pepper 535 条 retained catalog facts。
2. 修正 `openingHoursText` / `closedText` 映射，并恢复 353 条已存在但旧 runtime 未展示的原文。
3. 移除 `N以上 -> N+2000` 的伪上界逻辑，开放上界保存为 null。
4. 导入 rich metadata、source facts、provenance 和 dish evidence 为 observations，而不是直接当最终 canonical truth。
5. 新空值或抓取失败不得覆盖历史已知值。

### Phase 3 — 统一 identity + field resolver

浏览器和旧 JS 文件不再决定最终字段。统一 resolver 根据：

- binding 状态；
- field observation 状态；
- 来源类型；
- 时间；
- 规则版本；
- 冲突状态；
- 明确 retraction/correction；

生成 field resolution。

`known / unknown / reviewed_none / not_applicable / conflict / retracted` 使用统一状态模型。derived fields 必须记录转换规则和来源 observation。

### Phase 4 — 两套同版本导出

从同一 SQLite snapshot 生成：

- `catalog`：保留全部 2,804，显示缺失、冲突和来源状态。
- `recommendation`：只包含满足 eligibility 的条目，并记录 exclusion reason。

`id_only` 不再伪造名称，也不应该因为 frozen membership 就自动进入推荐池。

### Phase 5 — Pages 切换

新 export 经过：ID 集合、回归 diff、字段 provenance、浏览器行为、备份恢复验证后，再替换旧 `google_inventory_runtime.js` 构建链。切换提交才停用/归档重复 workflow 和旧 enrichment builders。

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

2,804 数据集应被视为 Area1 的 frozen food-place identity catalog，而不是已经完成的 recommendation dataset。目录覆盖完整度高，字段覆盖仍不均衡。所有完整度指标在重构期间只作为报告，不作为阻断条件。

## 开发纪律

- 每次完成一批实际开发后，必须同步更新 `DEVELOPMENT.md`、相关架构/数据文档和 `logs/` 中的当天开发记录。
- 文档只记录实际完成状态，不把计划写成已完成。
- 不在新迁移器、备份和回滚存在前删除旧数据依赖。
- Refactor mode 结束时必须用新架构 strict checks 替换 warning，而不是永久弱化审查。

当前验证详情见 [验证报告](docs/database/VALIDATION_2026-09-07.md)，数据流程见 [DATA_PIPELINE](DATA_PIPELINE.md)，架构见 [ARCHITECTURE](ARCHITECTURE.md)。
