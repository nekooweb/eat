# 2026-09-07 — Conflict evidence 不覆盖既有 known resolution

## 第二次 persistent smoke 结果

跨层 collision discovery 正常工作：

- 8 collision groups
- 16 Place ID with collision bindings
- basic bindings: 747 reviewed / 13 conflict
- Hot Pepper full bindings: 473 reviewed / 58 candidate / 4 conflict
- 2,804 catalog, 1,946 source records/bindings
- 535 hours raw / 535 closure raw

Validator 继续阻断，因为 3 个 collision Place ID 同时属于 legacy verified catalog。原 resolver 会用较高来源优先级的 `conflict` observation 把已有 legacy known name resolution 改成 conflict，导致 `resolvedNames=1395`，而 `verified + sourceMatched=1398`。

## 修复原则

Conflict evidence 必须保留并影响 identity/binding eligibility，但不能擦除来自另一个非 conflict binding 的既有 known field value。因此 production entrypoint 增加 monotonic known-retention rule：

- 如果当前 field resolution 已为 `known`，新 conflict observation 不覆盖该 field resolution；
- conflict source record / observation / binding 全部继续保存；
- recommendation eligibility 仍可因为 identity conflict 被阻断；
- validator 继续禁止任何 known resolution 直接选择 conflict binding。

同时移除过时的固定“resolved names >= 1401”硬门槛。重构期名称数量会因更严格 identity collision 隔离而合理下降；新的 blocking invariant 是：`resolved known names == verified + source_matched identities`，完整度作为报告而不是架构正确性的替代指标。
