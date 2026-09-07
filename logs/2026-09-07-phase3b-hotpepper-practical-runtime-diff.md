# 2026-09-07 — Phase 3 通过与 Hot Pepper basic practical 扩展

## Phase 3 已验证结果

`1356915` 的 blocking database workflow 全部通过。

Persistent master：

- source records / bindings: 3,583 / 3,583
- observations: 36,737
- resolutions: 26,356
- safe rich practical resolutions: 1,194
- covered rich places: 133
- collision groups / places: 8 / 16
- repeat import/resolver count-stable
- backup/restore validator pass

Shadow export：

- catalog rows: 2,804
- recommendation rows: 1,395
- current public named runtime: 1,411
- excluded rows from catalog: 1,409
- shadow/current difference: 16 Place ID, exactly the conflict-binding set
- no shadow-only Place ID

因此 Phase 3 safe practical resolver 与 shadow exporter 改为“完成”。

## 本批 Phase 3B 实现

新增 `scripts/database/derive_hotpepper_practical.py`：从 reviewed Hot Pepper full retained raw facts 派生明确 practical booleans。

规则：

- `lunch_availability.raw` → `practical.lunch_available`
- `course.raw` → `practical.course_available`
- `free_drink.raw` → `practical.free_drink_available`
- `free_food.raw` → `practical.free_food_available`
- `private_room.raw` → `practical.private_room_available`
- `payment_card.raw` → `practical.card_available`
- `parking.raw` → `practical.parking_available`

只解析明确 `あり/なし`、`利用可/利用不可`；其他文本返回 unknown/不派生。每条 derived observation 保留 raw observation FK 与 rule version。

Build 顺序改为：Phase 2 evidence import → Hot Pepper basic practical derivation → rich practical resolver。这样 rich reviewed lunch metadata 可以在同 provider 下作为更具体结果最后采用。

新增 `validate_derived_practical.py`：要求 derived 数量等于 reviewed raw facts 中实际可解析数、不能来自 candidate/conflict binding、每个 derived place/field 最终存在 known resolution。

新增 runtime-shadow diff gate：shadow recommendation 必须等于当前 public runtime 去掉全部 conflict-binding Place ID 后的原顺序结果。

Shadow exporter 增加 course/free drink/free food/private room/card/parking practical fields，但仍不接 Pages。

## 状态

Phase 3B 已实现，等待 blocking smoke；通过前不标记完成。
