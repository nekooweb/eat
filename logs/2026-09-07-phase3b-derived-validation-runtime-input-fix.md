# 2026-09-07 — Phase 3B derived practical 验证结果与 runtime diff 输入修复

## 已通过的 Phase 3B 部分

`cee6ce0` 的 persistent master 实际成功完成：

- Hot Pepper reviewed basic practical derived observations: 3,271
- derived distinct place-fields: 3,271
- card available: 473
- course available: 433
- free drink available: 473
- free food available: 473
- lunch available: 473
- parking available: 473
- private room available: 473
- source records / bindings: 3,583 / 3,583
- field observations: 40,008
- field resolutions: 29,501
- rich practical resolutions: 1,194
- collision groups / places: 8 / 16
- master validator pass
- derived practical validator pass
- second import count-stable
- SQLite backup/restore + master/derived validator pass
- shadow export catalog 2,804 / recommendation 1,395 validator pass

因此数据派生和数据库状态本身没有失败。

## 最终 compare 失败原因

`compare_runtime_shadow.py` 首次报告 `currentPublicRows=2804`，导致 old-only=1,409，而期望 conflict removals 只有 16。

根因：database workflow 直接读取仓库跟踪的 `data/google_inventory_runtime.js`。该文件是生成快照，仓库中的内容仍来自下架 ID-only 之前的旧 2,804-row build；Pages workflow 实际发布前会执行当前 `build_google_inventory_runtime.mjs`，生成 1,411-row named runtime。

所以失败来自测试输入 stale，不是 SQLite eligibility 或 practical derivation 错误。

## 修复

- database workflow 增加 Node 22。
- shadow compare 前在 CI runner 临时运行 `node scripts/build_google_inventory_runtime.mjs`。
- 不提交该 runner 中生成的 runtime 文件。
- compare 随后读取同一 checkout 中刚生成的当前 runtime。
- blocking invariant 保持不变：shadow-only=0；current-only 必须恰好为 conflict-binding Place ID；顺序必须等于当前 runtime 删除 conflict IDs 后的顺序。

## 状态

该测试输入修复已实现，等待下一次 blocking database workflow。通过前 Phase 3B 仍标记为“核心通过 / 最终 diff 待验证”。
