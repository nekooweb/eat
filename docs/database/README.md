# 主数据库重构说明

更新日期：2026-09-07。

## 已验证 master baseline

当前 SQLite master 已通过真实文件 build、严格 FK/integrity、二次幂等导入、resolver 重跑、SQLite backup/restore 和 shadow export validation。

当前主库：

- catalog 2,804
- source records / bindings 3,583 / 3,583
- field observations 40,008
- field resolutions 29,501
- verified 651
- source-matched 747
- conflict identity state 13
- id-only 1,393
- resolved names 1,398
- source-ID collision 8 组 / 16 Place ID

## Retained evidence 与 practical resolution

已迁移：575 provider facts、644 provenance links、135 Hot Pepper rich metadata、283 dish evidence items。

已安全采用：

- reviewed rich practical `(Place ID, field)`：1,194
- reviewed Hot Pepper full practical derived observations：3,271

Derived practical 只接受明确 `あり/なし`、`利用可/利用不可` 等可机械解释文本，并保留 raw observation FK 与 rule version。Candidate/conflict binding 不参加派生。

## Shadow export

Shadow catalog 必须 exact 2,804 / frozen order。Shadow recommendation eligibility：

`verified or source_matched` + `known real name` + `no conflict binding`。

最终已验证：当前 runtime 1,411、shadow recommendation 1,395；差异 16 条全部是 conflict-binding Place ID，shadow-only=0，移除 conflict 后顺序一致。

Shadow 当前仍只在 CI artifact 中生成，不接 Pages。

## 字段级 diff

新增 `scripts/database/diff_runtime_shadow_fields.py`，比较共同 1,395 个推荐 Place ID 的 name/address/coordinates/cuisine/budget/hours/dishes/practical。

报告类别：

- `equal`
- `changed`
- `shadowAdded`
- `shadowMissing`
- `absentBoth`

字段差异当前是诊断报告，不用来强迫新模型兼容旧 overlay；membership、order、identity conflict、raw/private data leakage 等仍是 blocking contract。

下一步根据该报告选择 resolver v2，而不是凭直觉批量 promotion。

## 本地运行

```bash
python scripts/database/build_master.py --output _local/eat-main.sqlite --reset
python scripts/database/validate_master.py _local/eat-main.sqlite
python scripts/database/export_master.py _local/eat-main.sqlite --outdir _local/export
```

SQLite/WAL/SHM 和 raw master 不进入 Pages。
