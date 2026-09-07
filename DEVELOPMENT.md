# Eat 开发状态与重构计划

更新日期：2026-09-07。

## 当前线上

- frozen catalog：2,804 Place ID 全部保留。
- 当前 Pages 发布逻辑：1,411 条已有真实名称记录；1,393 条 ID-only 已下架，不使用“Google Maps 餐厅”伪名称。
- Hot Pepper runtime 已修复 `openingHoursText` / `closedText` 映射，hours coverage 363 → 716。
- `N以上 -> N+2000` 伪预算上界已移除。
- Pages build/deploy 与 no-paid-data-API policy 继续通过。

## Refactor mode

旧 canonical/overlay/coverage/queue 等架构耦合检查继续 warning-only；成本、安全、语法、2,804 catalog、公开 unnamed-ID-only 禁止、Pages 可部署性以及新的 SQLite/export contract 始终 blocking。

## Phase 1 — persistent SQLite

状态：完成并通过 blocking smoke。

真实 SQLite、二次幂等导入、cross-layer source-ID collision、known-value monotonic retention 与 backup/restore 均已验证。统一主库识别 8 collision groups / 16 Place ID；collision evidence 保留但 known resolution 不允许直接选择 conflict binding。

## Phase 2 — retained evidence

状态：完成并通过 blocking smoke。

已迁移：575 provider facts、644 provenance links、135 Hot Pepper rich rows、283 dish evidence items。旧 JS wrapper 使用 `JSONDecoder.raw_decode()` 安全解析，不执行 JS。

## Phase 3 — safe resolver / shadow export

状态：完成并通过 blocking smoke。

- reviewed Hot Pepper rich practical resolutions：1,194；
- Hot Pepper full conservative derived practical observations：3,271；
- master：3,583 source records/bindings、40,008 observations、29,501 resolutions；
- repeat import/resolver count-stable；
- SQLite backup/restore 后 validator 再通过。

### Shadow eligibility 已验证

CI 内临时重建当前 runtime 后：

- current public runtime：1,411
- SQLite shadow recommendation：1,395
- current-only：16
- shadow-only：0
- 16 条 current-only 恰好全部是 identity-conflict Place ID
- 移除这 16 条后顺序完全一致

因此 Phase 3B 已正式完成。Shadow 仍只作为 CI artifact，不接 Pages。

## Phase 3C — 字段级 runtime / shadow diff

状态：已实现，等待诊断报告。

新增 `scripts/database/diff_runtime_shadow_fields.py`。在同一 CI runner 中先重建当前 1,411-row runtime，再对 SQLite shadow 的共同 1,395 个 Place ID 比较：

- name
- address
- coordinates
- cuisine
- lunch budget
- dinner budget
- hours
- recommended dishes
- featured dishes
- practical fields

每个字段只分类为：`equal / changed / shadowAdded / shadowMissing / absentBoth`，并输出少量样例。该报告在 refactor 阶段是诊断项，不因为旧/新字段值存在差异而阻断；membership/order/identity conflict 等结构性规则仍由 strict validator 阻断。

这个 diff 的目的不是强迫新 SQLite 完全复制旧 overlay，而是判断：哪些字段可安全由 direct source/resolver 升级，哪些字段仍依赖 legacy snapshot 或需要人工/语义规则。

## 下一步

字段级 diff 通过生成后，按实际差异选择 resolver v2：

1. 优先确定性 budget 规则和低风险 hours raw/normalized 规则；
2. dish recommendation/featured evidence 继续保持高门槛，不自动全部 promotion；
3. shadow export 不切 Pages，直到字段差异、浏览器回归和 fallback 方案明确；
4. 主库稳定后开始 1,393 个 id-only 的真实名称/身份补全；不能只靠 Overture/OSM 空间邻近自动绑定。

## 开发纪律

每批实际开发同步更新本文件、数据库/架构文档和 `logs/`；失败和修复也记录。未通过测试只写“已实现/待验证”，通过后再标记完成。
