# Eat 开发状态与批量补齐计划

更新日期：2026-09-07。

## 当前线上

- frozen catalog：2,804 Place ID 全部保留。
- Pages 仍发布旧 runtime 的 1,411 条已有真实名称记录；未命名 Place-ID-only 不展示。
- Bulk completion 继续只更新 SQLite / shadow，未切 Pages。
- no-paid-data-API、catalog 完整性、Google payload 泄漏、数据库契约和 Pages 可部署性保持 blocking。

## 当前已验证 master（Batch D）

- 2,804 catalog；
- 4,686 source records / bindings；
- 46,260 observations；
- 30,913 resolutions；
- identity：651 verified / 746 source_matched / 1,392 id_only / 15 conflict；
- collision：10 source-ID groups / 20 Place ID；
- active tasks：2,972 = 20 conflict review + 1,392 identity recovery + 1,349 field completion + 211 dish review。

主要字段缺口：address 337、coordinates 1、cuisine 1、dinner budget 789、hours 666、lunch budget 1,228、practical 906。

## 已完成批次

### Batch A — retained official identity recovery

完成 / blocking CI pass。194 retained official records 中 193 reviewed、1 conflict-deferred；恢复 1 个 id-only：`ChIJ2yzmKgCNGGARujgyaVuRhy8`。

### Batch B — retained verified OSM identity QC

完成 / blocking CI pass。662 verified mappings 中 657 reviewed / 3 candidate / 2 conflict；没有新增 id-only recovery，但发现 2 个新 collision groups，使 conflict Places 16 -> 20，并补入 OSM retained fields。

### Batch C — deterministic retained-field resolver v2

完成 / blocking CI pass。只处理 publishable/no-conflict identity，provider 仅 official/Tabelog，missing-only。安全 derived 188：closure.days.raw 123、closure.raw 58、hours.raw 7；repeat build 新增 0。

### Batch D — Hot Pepper candidate field-only review

完成 / blocking CI pass。58 candidate 中 6 家通过严格 existing-identity consistency，补 59 fields；原 candidate identity 不升级。Dinner gap 795 -> 789、hours 672 -> 666、practical 912 -> 906。

## Batch E — historical private hint reconciliation

第一版 private probe **完成 / CI pass**。2026-09-06 已付费取得的两个私有 Actions artifact 只在短期 CI 中作为 identity match hint，不把 Google display content 写入仓库、SQLite 或公开导出。

实际结果：

- current id-only：1,392；
- 有历史成功 hint：1,391；
- historical non-operational：1；
- 没有历史 hint：1；
- 在现有 Hot Pepper / OSM / Overture 中满足第一版 ultra-strict independent reconciliation：**0**；
- durable proposal：0；
- Google display payload leakage：0；
- new Google API calls：0。

结论：剩余 id-only 几乎全部有历史身份线索，但现有 independent candidate layers 与这些长尾 Place 的重合度不足；不能通过简单放宽距离门槛解决。

### Batch E2 — private near-match diagnostics

状态：**已实现，等待 private CI 统计**。

`reconcile_private_google_hints.py` 增加聚合诊断，但仍不增加任何 durable proposal 门槛。对每个 id-only 的最佳 independent candidate 统计：

- 是否存在 120m 内 candidate；
- exact normalized name 在 10/20/30/50/80/120m 的数量；
- name similarity ≥0.995/0.99/0.98/0.95/0.90 的距离分布；
- postcode/address 一致性；
- independent provider 覆盖数；
- 两个 provider 是否同时支持、且是否相互 name/location 一致。

Near-miss 明细只放 2-day private artifact，记录 Place ID + independent provider/source ID + similarity/distance，不保存 Google 名称、地址、坐标等 display content。

目的不是降低门槛，而是判断下一步应走：

1. 如果存在明显的 exact-name/postcode 或 multi-provider 安全簇，新增一个可解释的 strict reconciliation rule；
2. 如果 independent coverage 本身很低，则停止继续调 matching threshold，直接进入免费公开来源 collector/官网取证。

## 下一步

E2 结果出来后直接选路径，不重复扫描已证明低收益的 retained 层。任何新 identity recovery 都必须来自可持久化独立来源；禁止 proximity-only、禁止重新调用付费 Google Places/Text/Nearby API、禁止绕过登录/CAPTCHA。

每批开发完成同步更新 `DEVELOPMENT.md`、`DATA_PIPELINE.md` 和 `logs/`；未通过 CI 只标记“已实现/待验证”。
