# 2026-09-07 批量补齐开发记录

## 初始基线

2,804 catalog；651 verified / 747 source_matched / 1,393 id_only / 13 conflict；2,972 active tasks，其中 identity recovery 1,393、field completion 1,352、identity conflict review 16、dish semantic review 211。

## Batch A — retained official identity recovery

状态：**完成，blocking CI 通过**。Commit：`f43cffbae4d73ac2e9fc73929cc02d2915d4838c`。

实际结果：

- official input 194；reviewed 193；conflict deferred 1；
- identity recovered 1：`ChIJ2yzmKgCNGGARujgyaVuRhy8`；
- identity：651 verified / 748 source_matched / 1,392 id_only / 13 conflict；
- 3,777 source records/bindings；40,055 observations；29,695 resolutions；
- shadow recommendation 1,396；safe added 1；unsafe added 0。

## Batch B — retained verified OSM identity QC

状态：**完成，blocking CI 通过**。Commit：`6aa04eb3cafffdf0c683f75035c65215365321b9`。

数据链：historical `status=verified` OSM source-ID/Place-ID verdict + exact retained OSM candidate facts。

实际结果：

- verified pairs 662；reviewed 657；candidate 3；conflict 2；missing candidate 0；
- identity recovered 0；历史 verified OSM 全部与已有身份集合重叠；
- 新暴露 cross-layer collision 2 组 / 4 Place ID；总 collision 10 组 / 20 Place ID；
- identity：651 verified / 746 source_matched / 1,392 id_only / 15 conflict；
- 4,439 source records/bindings；46,013 observations；30,673 resolutions；
- `hours.raw` observation 总数 998；
- active tasks 2,972：20 conflict review / 1,392 identity recovery / 1,349 field completion / 211 dish review；
- field missing：address 337 / coordinates 1 / cuisine 1 / dinner 795 / hours 679 / lunch 1,228 / practical 912；
- shadow recommendation 1,392；current-only 20 恰好全部为 conflict Place ID；safe added 1；unsafe added 0。

结论：现有 retained official + historical verified OSM 层已基本吃尽。OSM 的主要价值是补充字段和发现隐藏 identity collision，而不是恢复剩余 id-only。

## Batch C — deterministic retained-field resolver v2

状态：**代码已实现，等待 blocking CI**。

新增：

- `scripts/database/resolve_retained_fields.py`
- `scripts/database/validate_retained_field_resolver.py`
- `build_master.py` 在 identity recovery 后、task planner 前执行 missing-only retained-field resolution；
- database workflow 在 first build / repeat build / backup restore 全部验证该 resolver。

### 规则

仅处理当前 `verified/source_matched` 且无 identity conflict 的 Place ID。来源只接受 `retained_source_fact_overlay` 中 `official` / `Tabelog`。

可补字段：address、cuisine、hours.raw、budget.lunch.range、budget.dinner.range、closure.raw、closure.days.raw。

每个字段必须同时满足：

1. 当前产品等价字段全部缺失；
2. retained source fact `claimedFields` 支持该字段；
3. 至少一个 HTTPS retained provenance link；
4. value 类型/范围合法；
5. identity 可发布且无 conflict。

Resolver 只做 missing-only，不覆盖任何 known 值。若多个候选存在，按 provider priority（official > Tabelog）、observed time、stable source ID 确定性选择。

采用值会建立 field-only derived source record / reviewed binding，confidence=`field_only_not_identity`，绝不执行 identity upgrade。Derived observation 保存原 source observation ID 和 `retained-field-resolver-v2` rule version，且值必须与原 observation 完全一致。

Blocking validator 检查：allowed provider、HTTPS provenance、claimed-field semantic、publishable/no-conflict identity、field-only binding、derived provenance、value equality、selected known resolution，以及禁止 name/identity 修改。

Batch C CI 通过后立即记录实际 resolved field 数量及 task 缺口下降，再开始 Batch D 免费公开来源 collector。
