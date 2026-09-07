# 2026-09-07 — Phase 2 retained evidence 进入 SQLite master

## 前置验证

Persistent master 在 `2fdf8a4` 已完整通过 blocking smoke：

- real SQLite build pass
- 2,804 catalog
- 8 cross-layer collision groups / 16 Place ID 全部隔离
- known resolution 不选 conflict binding
- 二次 importer 核心表计数完全不增长
- SQLite backup API / restore / validator pass

因此按开发计划开始 retained-data 扩展。

## 本批实现

新增 `scripts/database/retained_phase2.py`，迁移现有但过去只存在于 JS/JSON overlay 的资料：

1. `source_facts.js` — 575 provider fact records。
2. `source_provenance.js` — 644 public source links。
3. `hotpepper_rich_metadata.js` — 135 reviewed rich metadata rows。
4. `google_inventory_detail_evidence.json` — 283 recommendation/featured evidence items。

## 身份与 evidence 分离

- Hot Pepper native shop ID 继续参加 provider-ID collision index。
- Tabelog/official URL 只保存为 provenance，不把 URL 默认当作 branch identity key。
- 非 native provider fact/provenance 使用 content-addressed synthetic retained ID，避免共享菜单/品牌 URL 导致错误 merge。
- 若 Phase 2 中的 Hot Pepper native ID 属于既有 collision key，所有对应 record/binding 继续标为 conflict。

## Resolution 安全策略

本批目标是“先把 evidence 收进主库”，不是立即重算线上真值：

- source facts 保存 observations，但 binding 为 candidate（collision 则 conflict）；
- provenance 只作为 candidate source evidence；
- Hot Pepper rich 使用 reviewed/conflict binding，但 rich/practical observations 暂不改变 core resolutions；
- dish recommendation/featured evidence 作为 candidate semantic evidence，不直接成为最终推荐字段。

Validator 新增 blocking invariants：

- Phase 2 四类 source record 数量必须与当前输入动态计算值完全一致；
- 所有新 Phase 2 evidence 在本阶段 `phase2SelectedResolutions` 必须等于 0；
- 原有 catalog、collision、known resolution、Hot Pepper core、幂等和 backup/restore 检查继续保留。

## 状态

代码与文档已准备提交；Actions 通过前，本批只标记为“已实现、待验证”，不标记为完成。
