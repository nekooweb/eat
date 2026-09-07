# 主数据库重构说明

更新日期：2026-09-07。

## 已验证 master baseline

当前 SQLite master 已通过真实文件 build、严格 FK/integrity、二次幂等导入、resolver 重跑、SQLite backup/restore、shadow export 与 runtime/shadow membership 对照。

当前主库基线：

- catalog 2,804
- source records / bindings 3,583 / 3,583
- field observations 40,008
- field resolutions 29,501
- source-ID collision 8 组 / 16 Place ID
- shadow recommendation 1,395

## 字段级 diff 结果

共同 1,395 家的诊断显示：name 89 changed、address 49 changed、coordinates 126 changed、cuisine 169 changed、dinner budget 40 changed、hours 126 changed；lunch budget 无 changed。推荐菜有 151 shadowMissing，特色菜 50 shadowMissing，因此 dish evidence 暂不自动 promotion。Practical 有 480 家 shadowAdded。

这些差异用于选择 resolver v2，不作为旧 overlay 兼容性的 blocking gate。

## Source category / normalized cuisine 契约

Hot Pepper `genre` / `subGenre` 是 provider category，不等于本项目 canonical normalized cuisine。

新的 master import 规则：

- `retained_hotpepper_artifact` 保存 `cuisine_source` 与 `sub_cuisine_source`；
- 不再从 full Hot Pepper artifact 直接生成/采用 canonical `cuisine`；
- `cuisine` 当前只由已规范化 basic/canonical observation 提供；
- 未来若要从 provider genre 转为 canonical cuisine，必须通过单独、版本化的 category normalizer，并保存 derived-from / transformation rule provenance。

`validate_source_semantics.py` 在 build、repeat import 与 backup/restore 后检查：535 条 source genre 保留；full Hot Pepper artifact 的 canonical cuisine observation/resolution 均为 0。

## Shadow export

Catalog exact 2,804 / frozen order。Recommendation eligibility：`verified/source_matched + known real name + no conflict binding`。

已验证 current runtime 1,411 → shadow 1,395 的唯一 membership 差异为 16 个 conflict-binding Place ID。Shadow 仍只在 CI artifact 中生成，不接 Pages。

## 下一步

1. 重跑字段 diff，确认 cuisine 语义修复后的 changed 数量；
2. 建立统一 ingestion task queue，而不是继续增加散乱 workflow；
3. 再开发 budget/hours resolver v2；
4. dish recommendation 继续 evidence-only；
5. 主库稳定后开始 id-only identity/name recovery。
