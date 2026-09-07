# Eat 开发状态与重构计划

更新日期：2026-09-07。

## 当前线上

- frozen catalog：2,804 Place ID 全部保留。
- 当前 Pages 仍发布 1,411 条已有真实名称记录；1,393 条 ID-only 已下架。
- Bulk completion 当前只更新 SQLite/shadow，不直接改 Pages。
- no-paid-data-API policy、Pages build/deploy 继续保持 blocking。

## 当前已验证 master 基线（Batch C 后）

- catalog：2,804；
- source records / bindings：**4,627**；
- observations：**46,201**；
- resolutions：**30,854**；
- identity：651 verified / 746 source_matched / 1,392 id_only / 15 conflict；
- collision：10 source-ID groups / 20 Place ID；
- active tasks：2,972。

任务组成：

1. identity conflict review：20；
2. identity recovery：1,392；
3. field completion：1,349；
4. dish semantic review：211。

当前 field 缺口：address 337、coordinates 1、cuisine 1、dinner budget 795、hours **672**、lunch budget 1,228、practical 912。

## Batch A — retained official identity recovery

状态：**完成 / blocking CI pass**。Commit `f43cffb`。

- input 194；193 reviewed；1 conflict-deferred；
- 新恢复 id-only 1；
- shadow safe-added 1 / unsafe-added 0。

## Batch B — retained verified OSM identity QC

状态：**完成 / blocking CI pass**。Commit `6aa04eb`。

- verified pairs 662；657 reviewed / 3 candidate / 2 conflict；
- 新恢复 id-only 0；
- 新发现 2 组跨层 collision，使总 conflict Places 16 -> 20；
- OSM retained 字段补入 master，hours 缺口 689 -> 679。

现有 retained official + historical verified OSM 身份层已经基本吃尽；剩余 1,392 id-only 后续需要新的免费公开来源发现。

## Batch C — deterministic retained-field resolver v2

状态：**完成 / blocking CI pass**。Commit `d948d45`。

只处理 publishable + no-conflict identity，只接受 retained `official / Tabelog` source facts，并要求 HTTPS provenance + claimed-field semantic。Missing-only，不覆盖任何 known 值，不改变 name/identity。

实际结果：

- candidate place-fields 检查：1,176；
- 安全 derived resolutions：**188**；
- Tabelog 156 / official 32；
- `closure.days.raw`：123；
- `closure.raw`：58；
- `hours.raw`：7；
- skipped already-known：968；
- skipped identity-conflict：20；
- hours field task：679 -> **672**；
- first build / repeat build / backup restore / shadow export 全部通过；
- resolver 重跑时新增 0，证明 missing-only 幂等成立。

Batch C 也说明 retained official/Tabelog 对 address/budget 等主要缺口已经没有更多安全自动补齐空间，因此继续扫描同一层收益很低。

## Batch D — Hot Pepper candidate field-only review

状态：**已实现，等待 blocking CI 实际计数**。

目标：安全利用 58 条 retained Hot Pepper candidate binding，但**绝不把 candidate identity 直接升级为 reviewed identity**。

### Identity consistency gate

只对当前已经 `verified/source_matched` 且无任何 conflict 的 Place ID 评估 candidate。当前 selected identity 与 Hot Pepper candidate 必须满足以下至少一条：

- 规范化店名完全一致且空间距离 ≤150m；
- name similarity ≥0.95 且距离 ≤80m；
- 地址规范化完全一致、name similarity ≥0.85 且距离 ≤100m。

没有当前已知坐标、名称不一致、距离过大、已有 conflict 的 candidate 全部继续留在 candidate，不做 promotion。

### Field-only promotion

通过 identity consistency 后，只填当前缺失字段：

- address；
- hours.raw；
- budget.dinner.range；
- closure.raw；
- conservative practical booleans：lunch/course/free drink/free food/private room/card/parking。

不填 name、coordinates、canonical cuisine；不调用 identity upgrade。所有采用值生成独立 derived source record / reviewed **field-only** binding，并保存原 Hot Pepper observation ID、identity consistency 结果与 rule version。

新增 blocking validator 要求：

- 原 Hot Pepper binding 必须仍是 candidate；
- derived binding 只能 field-only；
- 当前 identity 已可发布且 no-conflict；
- 原 source URL 必须是 HTTPS Hot Pepper；
- identity consistency 必须可重算通过；
- direct field 值必须与原 observation 完全一致；
- practical boolean 必须能由原 raw text 用保守 parser 重现；
- 禁止写入 name/coordinates/cuisine。

## 下一步

Batch D 通过后记录实际补齐量，然后开始 Batch E：针对剩余 1,392 id-only 的免费公开来源 collector。其身份恢复规则仍保持：不 proximity-only、不付费 Google Places/Text/Nearby API、不绕过登录/验证码；一次确认来源访问同时提取所有支持字段。

Shadow 继续不切 Pages，直到新身份和字段经过 provenance、backup/restore、field diff 与浏览器回归。

## 开发纪律

每批完成实际开发同步更新 `DEVELOPMENT.md`、`DATA_PIPELINE.md` 和 `logs/`；未过 CI 只标记“已实现/待验证”，通过后再写真实数量。
