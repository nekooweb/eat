# 2026-09-07 — Phase 3B 完成与字段级 shadow diff 开始

## Phase 3B 最终验证

`4a46d35` 的 database contract 已全部通过，包括：

- persistent master build / strict validator
- 3,271 Hot Pepper basic practical derived observations
- 1,194 reviewed rich practical resolutions
- second import/resolver count-stable
- SQLite backup/restore
- shadow catalog/recommendation validation
- runner 内重建当前 runtime 后的 strict runtime-shadow membership diff

最终 membership diff：

- current public runtime: 1,411
- shadow recommendation: 1,395
- current-only: 16
- shadow-only: 0
- expected conflict removals: 16
- current-only 集合与 identity conflict-binding Place ID 集合完全一致
- 顺序一致

因此此前 stale `google_inventory_runtime.js` 导致的 2,804-row compare 问题已经确认是测试输入错误并完成修复，Phase 3B 正式标记完成。

## 本批新开发

新增 `scripts/database/diff_runtime_shadow_fields.py`：

- database workflow 先临时重建当前 runtime；
- 对共同 1,395 个 recommendation Place ID 做字段级诊断；
- 比较 name/address/coordinates/cuisine/lunch budget/dinner budget/hours/recommended dishes/featured dishes/practical；
- 每字段分类 `equal / changed / shadowAdded / shadowMissing / absentBoth`；
- 输出统计与最多 12 个差异样例；
- 完整报告保存为 CI artifact。

字段差异在 refactor mode 下不作为 legacy compatibility blocking gate；该报告用于选择 resolver v2 的安全升级项。结构性 membership/order/conflict 规则继续严格阻断。

## 状态

字段 diff 工具与 workflow 已实现，等待 CI 生成实际结果后再决定下一批 budget/hours resolver。
