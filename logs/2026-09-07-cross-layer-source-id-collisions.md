# 2026-09-07 — Cross-layer source-ID collision 修复

## 第一次 persistent smoke 结果

`7588e18` 的新 SQLite importer 成功建立真实数据库，并实际导入：

- 2,804 catalog entries
- 651 in-catalog legacy canonical snapshots
- 3 retained outside-catalog exceptions
- 760 retained basic source records
- 535 Hot Pepper full retained records
- 535 `hours.raw`
- 535 `closure.raw`
- 1,946 source records / bindings
- 28,992 field observations
- 25,142 field resolutions

数据库 build 本身成功；strict validator 阻断了发布，因为联合 source records 后发现 provider/source-ID collision 为 8 组 / 16 Place ID，而旧 basic-only 验证只记录 5 组 / 10 Place ID。

## 修复

- 不降低 validator 门槛。
- 将现有大段 import primitives 保存在 `scripts/database/master_import_core.py`。
- `scripts/database/build_master.py` 改为正式入口，并在任何 binding 写入前建立跨 retained layer conflict index。
- basic-only 的 5 个 collision keys 继续作为历史基线；总 collision keys 动态从 basic + Hot Pepper full retained records 联合计算。
- 所有 colliding provider/source ID 在全部 source layer 中统一标记为 `conflict`。
- Conflict source raw evidence 继续保存，但 known field resolution 不得指向任何 conflict binding。
- Validator 改为检查“所有发现的 collision 都被隔离”，而不是错误地假定总数永远等于 5。
- Database workflow 同时语法检查 core/entrypoint/validator，并继续执行幂等导入和 backup/restore。

## 意义

本次失败证明新 SQLite 统一 source-record 模型能够发现旧分层 JS/JSON 审查无法看到的跨层身份冲突。修复方向是提高统一 identity QC，而不是减少数据或放宽新主库质量门槛。
