# 2026-09-07 — Phase 2 验证完成与 safe resolver / shadow export 开始

## Phase 2 最终验证

`7c756e1` 的 blocking master workflow 完整通过：

- source records / bindings: 3,583 / 3,583
- field observations: 36,737
- field resolutions: 25,162
- source facts: 575
- provenance links: 644
- Hot Pepper rich metadata: 135
- dish evidence items: 283
- Phase 2 selected resolutions: 0
- collision groups / places: 8 / 16
- second import count-stable
- SQLite backup/restore + full validator pass

因此 Phase 2 从“已实现/待验证”改为“完成”。

## 本批 Phase 3 实现

### Safe practical resolver

新增 `scripts/database/resolve_master.py`，只允许 reviewed、非 conflict Hot Pepper rich observations 的 practical whitelist 进入 field resolution：cards、special features、mobile coupon、station、access、lunch availability、capacity、party capacity、amenities。

Source facts、provenance、dish evidence 继续不得进入 resolution；rich metadata 的非 practical 字段也不得进入 resolution。

### Shadow exporter

新增 `scripts/database/export_master.py` 和 `validate_export.py`：

- catalog shadow exact 2,804 / frozen order
- recommendation shadow = verified/source-matched + known real name + no conflict binding
- id-only name=null、不可 eligible
- conflict binding 不进入 recommendation
- 不导出 raw payload / permission metadata
- 导出记录 exclusion reasons、missing fields、evidence counts、database hash 与 eligibility version

数据库 workflow 增加 exporter/validator blocking step。当前仍不将 shadow JSON 接入 Pages。

## 状态

Phase 3 代码已提交准备，等待 blocking smoke；未通过前不标记为完成。
