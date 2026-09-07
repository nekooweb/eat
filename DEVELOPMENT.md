# Eat 开发状态与重构计划

更新日期：2026-09-07。

## 当前线上

- frozen catalog：2,804 Place ID 全部保留。
- 当前 Pages 发布逻辑：1,411 条已有真实名称记录；1,393 条 ID-only 已下架，不使用“Google Maps 餐厅”伪名称。
- Hot Pepper runtime 已修复 `openingHoursText` / `closedText` 映射，hours coverage 363 → 716。
- `N以上 -> N+2000` 伪预算上界已移除。
- Pages build/deploy 与 no-paid-data-API policy 继续通过。

## Phase 1 — persistent SQLite

状态：完成并通过 blocking smoke。

真实 SQLite、二次幂等导入、cross-layer source-ID collision、known-value monotonic retention 与 backup/restore 均已验证。统一主库识别 8 collision groups / 16 Place ID；collision evidence 保留，但 known resolution 不允许直接选择 conflict binding。

## Phase 2 — retained evidence

状态：完成并通过 blocking smoke。

已迁移：575 provider facts、644 provenance links、135 Hot Pepper rich rows、283 dish evidence items。历史 JS assignment 使用 `JSONDecoder.raw_decode()` 安全解析，不执行 JS。

## Phase 3 — safe practical resolver / shadow export

状态：完成并通过 blocking smoke。

- reviewed Hot Pepper rich practical resolutions：1,194；
- Hot Pepper full conservative derived practical observations：3,271；
- master：3,583 source records/bindings、40,008 observations、29,501 resolutions；
- repeat import/resolver count-stable；
- SQLite backup/restore 后 validator 再通过。

Shadow eligibility 已验证：current runtime 1,411、shadow recommendation 1,395；current-only 16、shadow-only 0；16 条差异全部为 identity-conflict Place ID，移除后顺序完全一致。

## Phase 3C — 字段级 runtime / shadow diff

状态：完成并生成实际诊断结果。

共同 1,395 家中：

- `name`：1,306 equal / 89 changed。
- `address`：1,008 equal / 49 changed / 338 absentBoth。
- `coordinates`：1,269 equal / 126 changed。
- `cuisine`：1,068 equal / 169 changed / 158 absentBoth。
- `lunchBudget`：165 equal / 1,230 absentBoth，无 changed。
- `dinnerBudget`：559 equal / 40 changed / 5 shadowMissing / 791 absentBoth。
- `hours`：581 equal / 126 changed / 5 shadowMissing / 683 absentBoth。
- `recommendedDishes`：28 equal / 1 changed / 151 shadowMissing / 1,215 absentBoth。
- `featuredDishes`：121 equal / 6 changed / 50 shadowMissing / 1,218 absentBoth。
- `practical`：480 shadowAdded / 915 absentBoth。

共有 814 个 Place ID 至少一个字段与当前 runtime 不同。

### 由 diff 得出的处理结论

1. `lunchBudget` 完全一致，可继续保持现有迁移逻辑。
2. `dinnerBudget` 与 `hours` 有一批真实来源更新/表示差异，需要保留 provenance 后逐字段判断，不用旧 runtime 强制覆盖 SQLite。
3. 推荐/特色菜存在大量 shadowMissing，说明当前 dish evidence 仍不能直接作为 resolver v2 的自动 promotion；继续保持 evidence-only。
4. `practical` 的 480 家为 SQLite 新增有效信息，旧 runtime 本来没有对应字段。
5. `cuisine` 的 169 changed 暴露出语义错误：Hot Pepper 原始 genre 被当成 canonical normalized cuisine。这个必须在继续 resolver 前修复。

## Phase 3D — source category 与 normalized cuisine 分离

状态：已实现，等待 blocking smoke。

`retained_hotpepper_artifact` 继续保存 `cuisine_source` / `sub_cuisine_source`，但不再把 `genre.name` 直接写入/采用为 canonical `cuisine`。Canonical cuisine 只能来自已规范化 basic/canonical observation，未来再用版本化 category normalizer 从 source category 派生。

新增 `validate_source_semantics.py`：

- 535 条 Hot Pepper source genre 必须完整保留；
- full Hot Pepper artifact 不得产生 canonical `cuisine` observation；
- full Hot Pepper artifact 不得成为 canonical cuisine resolution 来源；
- 该规则必须在首次 build、二次幂等 build 和 backup/restore 后都成立。

字段 diff 会继续作为诊断报告，预计 cuisine changed 数应明显下降；实际结果以 CI 为准。

## 下一步

Phase 3D 通过后：

1. 基于新的 diff 确认 cuisine 语义修复效果；
2. 建立统一主库 ingestion task queue：1,393 id-only identity recovery、16 conflict review、1,395 上架候选的字段补全任务；
3. resolver v2 优先 budget / hours 的确定性规则；dish recommendation 继续高门槛；
4. shadow export 仍不切 Pages，直到字段差异和浏览器回归明确；
5. 后续网络补全只使用已验证的免费/公开来源，不能仅凭 Overture/OSM 空间邻近绑定未知 Place ID。

## Refactor mode

旧 canonical/overlay/coverage/queue 检查继续 warning-only；成本、安全、语法、2,804 catalog、公开 unnamed-ID-only 禁止、Pages 可部署性与新 SQLite/export contract 始终 blocking。

## 开发纪律

每批实际开发同步更新本文件、数据库/架构文档和 `logs/`；测试未通过只标记“已实现/待验证”，通过后再标记完成。
