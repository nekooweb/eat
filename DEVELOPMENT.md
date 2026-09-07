# Eat 开发状态与批量补齐计划

更新日期：2026-09-07。

## 当前线上

- frozen catalog：2,804 Place ID 全部保留。
- Pages 仍发布 1,411 条已有真实名称记录；原 1,393 条 ID-only 已下架，不使用“Google Maps 餐厅”占位名。
- Bulk completion 目前只更新 SQLite / shadow；未直接切换 Pages。
- no-paid-data-API、2,804 catalog、语法、数据库契约和 Pages 可部署性继续 blocking。

## 当前已验证 master（Batch D 后）

- catalog：2,804；
- source records / bindings：4,686；
- observations：46,260；
- resolutions：30,913；
- identity：651 verified / 746 source_matched / 1,392 id_only / 15 conflict；
- collision：10 source-ID groups / 20 Place ID；
- active tasks：2,972。

任务组成：identity conflict review 20、identity recovery 1,392、field completion 1,349、dish semantic review 211。

主要字段缺口：address 337、coordinates 1、cuisine 1、dinner budget 789、hours 666、lunch budget 1,228、practical 906。

## Batch A — retained official identity recovery

状态：完成 / blocking CI pass。Commit `f43cffb`。

194 条 retained official identity 中 193 reviewed、1 conflict-deferred；新恢复 1 个 id-only：`ChIJ2yzmKgCNGGARujgyaVuRhy8`。Shadow safe-added 1、unsafe-added 0。

## Batch B — retained verified OSM identity QC

状态：完成 / blocking CI pass。Commit `6aa04eb`。

历史 verified OSM mapping 662：657 reviewed / 3 candidate / 2 conflict；新恢复 id-only 0。新增发现 2 组跨层 source-ID collision，使总 conflict Places 16 -> 20；OSM retained 字段进入主库并降低部分 address/hours/budget/practical 缺口。

## Batch C — deterministic retained-field resolver v2

状态：完成 / blocking CI pass。Commit `d948d45`。

只处理 publishable + no-conflict identity，只接受 retained official/Tabelog facts，HTTPS provenance + claimedFields 必须成立，missing-only、不覆盖 known、不改 identity。

实际 derived resolutions 188：Tabelog 156 / official 32；closure.days.raw 123、closure.raw 58、hours.raw 7。Hours 缺口 679 -> 672。Repeat build 新增 0，证明幂等。

## Batch D — Hot Pepper candidate field-only review

状态：**完成 / blocking CI pass**。Commit `a33fc72`。

58 条 retained Hot Pepper candidate 中：

- 6 条通过现有 identity 的严格 name/location consistency；
- 22 条 identity consistency rejected；
- 30 条当前 identity 不可发布；
- 原 candidate binding 全部保持 candidate，不升级身份。

通过的 6 家共补 **59 个字段**：

- dinner budget 6；
- hours.raw 6；
- closure.raw 6；
- practical.card 6；course 5；free drink 6；free food 6；lunch 6；parking 6；private room 6。

效果：dinner gap 795 -> **789**，hours 672 -> **666**，practical 912 -> **906**。Identity 数完全不变；repeat build 再新增 0；first/repeat/backup/export 全部通过。

## Batch E — expiring historical Google sweep → independent-source reconciliation

状态：**已实现 private probe，等待 CI 实际结果**。

发现 2026-09-06 两个历史私有 Actions artifact 仍未过期：

- run `34018919233` / `full-area1-collection-private-audit`；
- run `34019078280` / `full-area1-retry-private-audit`。

初始 artifact 含 2,159 条请求，其中 1,716 条成功、443 条失败；retry 对 443 条失败全部取得成功详情。因此这些历史结果覆盖了当时整批非核心 inventory，但当前不会重新发起 API 调用。

### 合规/持久化边界

Google 当前 Places policy 对 Places API content 的缓存/存储有限制，Place ID 是明确长期存储例外。因此 Batch E **不把历史 Google displayName / formattedAddress / location / businessStatus 等内容写入仓库或 durable master**。

历史 Google 内容仅在私有 CI job 中作为短期 match hint；durable proposal 只能包含：

- Google Place ID；
- 独立 Hot Pepper / OpenStreetMap / Overture source ID；
- 独立来源的 name/address/coordinates/cuisine/websites/hours；
- 不含任何 Google display payload。

### Probe 匹配门槛

仅针对当前 1,392 个 id-only：

1. 私有历史 hint 必须有成功 name + coordinates；
2. 独立 candidate 必须在 120m 内；
3. 单来源自动 proposal 只允许极严格匹配：exact normalized name ≤6m，或 similarity ≥0.995 且 ≤4m；
4. 更宽条件只能在至少两个 independent providers 相互一致时形成 multi-provider consensus；
5. provider ID 已绑定其他 Place ID 时拒绝；
6. 同 provider 存在近似竞争候选时拒绝；
7. proximity-only 永远不接受。

新增：

- `scripts/database/reconcile_private_google_hints.py`；
- `.github/workflows/private-historical-reconciliation.yml`。

Workflow 下载旧私有 artifact，构建当前 SQLite master，生成：

- private reconciliation report（含短期 match metrics）；
- durable independent proposal（只含独立来源字段）；
- Google display payload leakage blocking check。

本 probe **不会自动 commit proposal**。先看真实 proposal 数与来源分布；只有严格 proposal 足够且检查通过，下一批才把独立来源结果正式导入 master。

## 后续

1. Batch E probe 通过后，若存在严格新 proposal：导入独立 source records/bindings，重新计算 id-only 和 shadow eligibility。
2. 若 proposal 很少：不降低门槛，转入免费公开来源 collector；历史 Google hint 只用于私有发现，不持久化。
3. 一次确认来源访问尽量提取 name/address/coordinates/cuisine/hours/budget/practical/menu 全部支持字段。
4. dish recommendation 保持最后处理和高语义门槛。
5. Shadow 继续不切 Pages，直到 provenance、backup/restore、field diff 和浏览器回归全部完成。

## 开发纪律

每批实际开发同步更新 `DEVELOPMENT.md`、`DATA_PIPELINE.md` 和 `logs/`。未过 CI 只标记“已实现/待验证”；通过后才写入真实数量。
