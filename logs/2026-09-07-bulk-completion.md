# 2026-09-07 批量补齐开发记录

## 初始基线

2,804 catalog；651 verified / 747 source_matched / 1,393 id_only / 13 conflict；2,972 active tasks。

## Batch A — retained official identity recovery

状态：完成，blocking CI pass。Commit `f43cffb`。

- official input 194；reviewed 193；conflict deferred 1；
- identity recovered 1：`ChIJ2yzmKgCNGGARujgyaVuRhy8`；
- shadow safe-added 1 / unsafe-added 0。

## Batch B — retained verified OSM identity QC

状态：完成，blocking CI pass。Commit `6aa04eb`。

- verified pairs 662；reviewed 657 / candidate 3 / conflict 2；
- identity recovered 0；
- 新暴露 cross-layer collision 2 组 / 4 Place ID；总 collision 10 组 / 20 Place ID；
- master 4,439 source records、46,013 observations、30,673 resolutions；
- hours field gap 689 -> 679。

## Batch C — deterministic retained-field resolver v2

状态：完成，blocking CI pass。Commit `d948d45`。

规则：publishable/no-conflict identity；provider 仅 official/Tabelog；HTTPS provenance；claimedFields 支持；missing-only；绝不覆盖 known 值；derived observation 必须链接原 observation。

实际：

- candidate place-fields 1,176；
- resolved 188；
- Tabelog 156 / official 32；
- closure.days.raw 123；closure.raw 58；hours.raw 7；
- already-known skip 968；identity-conflict skip 20；
- master 4,627 source records/bindings、46,201 observations、30,854 resolutions；
- hours task gap 679 -> 672；
- repeat build 再 resolved 0，计数保持稳定；
- backup/restore/export/regression 全通过。

## Batch D — retained Hot Pepper candidate field-only review

状态：代码已实现，等待 blocking CI。

目标：复用 58 条 retained Hot Pepper candidate，但 candidate identity 本身保持 candidate。

Identity consistency：

- 只允许当前 verified/source_matched + no-conflict；
- exact normalized name + ≤150m；或
- name similarity ≥0.95 + ≤80m；或
- exact normalized address + name similarity ≥0.85 + ≤100m。

通过后只补当前缺失的 address / hours.raw / dinner budget / closure.raw / conservative practical booleans。禁止 name、coordinates、canonical cuisine，禁止 identity upgrade。

所有 field promotion 生成新的 field-only derived source/binding，并记录原 observation、identity check、rule version。Blocking validator 会重算 identity consistency，确认原 Hot Pepper binding 仍是 candidate，并检查 direct value equality / practical parser reproducibility / no-conflict / no identity-field writes。

Batch D 通过后记录实际 resolved 数和 task 变化，然后进入针对剩余 1,392 id-only 的免费公开来源 collector。
