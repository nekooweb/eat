# 主数据库输入、处理与输出流程

更新日期：2026-09-07。

## 1. 数据方向

公开来源 / retained data → versioned source records → identity bindings → field observations → resolver → field resolutions → SQLite master → catalog/recommendation exports → Pages。

2,804 frozen Place ID 始终保留在 catalog。`id_only` 只下架，不删除；只有真实名称和可发布 identity 才能进入 recommendation。

## 2. Refactor mode

`EAT_REFACTOR_MODE=1` 期间，付费 API 禁令、语法、catalog 完整性、敏感 Google payload 泄漏、数据库/导出契约与 Pages 可部署性继续 blocking；旧 canonical/overlay/coverage 规则降为 warning。切换新主库前重新建立完整 strict gates。

## 3. Identity recovery

### Retained official

`official_candidate_index.json` 只接受此前独立 fetch 成功、HTTPS candidate-official、name-match 的记录。无 conflict 时可 `id_only -> source_matched`；有 conflict 只 candidate。

### Retained verified OSM

historical `sourceId -> Place ID` verified verdict 必须与 `area1_osm.js` 中同一 OSM ID 精确 join。Native OSM source ID 在 binding 导入前就进入 cross-layer collision discovery；相同 OSM ID 对多个 Place ID 时全部 conflict。

### Historical Google private sweep

2026-09-06 已存在的两个私有 Actions artifact 只允许用于**短期 identity matching hint**，不会重新调用 Google API：

- run 34018919233 / `full-area1-collection-private-audit`；
- run 34019078280 / `full-area1-retry-private-audit`。

Google Places display content 不作为 durable source record，不提交仓库，不进入 public export。长期可保存的 Google 标识仍仅使用 Place ID。

Private reconciliation 的 durable proposal 只能保存独立 Hot Pepper / OSM / Overture 内容。Match metrics 与 Google hint 保持 private artifact，并在很短 retention 后过期。

## 4. Source/field resolver

所有字段先进入 observation。Identity conflict 的 observation 不能成为 selected known resolution；失败/空值不能覆盖旧 known。

### Retained-field resolver v2

只处理 publishable + no-conflict Place ID；provider 仅 official/Tabelog；要求 `claimedFields` 支持目标字段且有 HTTPS provenance。Missing-only，不覆盖当前等价 known 值。Derived observation 保存原 observation ID 与 rule version。

### Hot Pepper candidate field-only review

原 HP candidate binding 永远保持 candidate。只有当前已有 publishable identity，且现有 selected name/coordinates 与 HP candidate 通过严格一致性检查，才允许补 missing address/hours/dinner/closure/practical。Derived binding 标记 `field_only_not_identity`，禁止 name/coordinates/canonical cuisine/identity promotion。

## 5. Historical-private reconciliation probe

`scripts/database/reconcile_private_google_hints.py` 只在 private CI 中读取历史 Google hint，并尝试寻找当前 1,392 id-only 对应的独立 candidate。

自动 proposal 门槛：

- 单来源：exact normalized name ≤6m，或 similarity ≥0.995 且 ≤4m；
- 较宽匹配必须至少两个 independent providers 形成一致 consensus；
- provider ID 已被其他 Place ID 使用则拒绝；
- 存在近似竞争 candidate 则拒绝；
- proximity-only 禁止。

输出分两层：

- private report：PID + match metrics，仅 Actions artifact；
- durable proposal：PID + independent provider/source fields，不含 Google displayName/formattedAddress/location/status/types。

Probe 不自动写回 main。只有实际 proposal 经过 leakage/uniqueness/identity review 后才进入下一批 master import。

## 6. Unified task plan

SQLite task priority：identity conflict review > identity recovery > field completion > dish semantic review。每次 recovery/resolver 后立即重新 planner；成功 identity recovery 会从 identity task 转成 field completion，因此看 task 类型变化而不只看总数。

## 7. Network-second 原则

Retained evidence 用尽后才访问免费公开来源。不得回退到付费 Places/Text/Nearby API，不绕过登录/CAPTCHA/访问限制。一次确认来源访问应尽量提取全部支持字段，避免按字段重复请求。

## 8. Export/Pages

Catalog export 始终 2,804；recommendation 只包含 eligibility 通过项，并记录 exclusion reason。Shadow-only 新增必须能追溯到 approved reviewed independent source。Pages 切换前要求 idempotence、collision quarantine、backup/restore、provenance、field diff 和浏览器回归全部通过。

## 9. 开发记录

每批完成必须同步更新 `DEVELOPMENT.md`、本文件和当天 `logs/`；未通过 CI 不写“完成”。
