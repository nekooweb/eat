# 2026-09-07 — 字段级 diff 结果与 cuisine source 语义修复

## 字段级 runtime / shadow diff 已验证

`a3fbec0` 的 database contract 全部通过，并生成共同 1,395 家的字段诊断：

- name: 1,306 equal / 89 changed
- address: 1,008 equal / 49 changed / 338 absentBoth
- coordinates: 1,269 equal / 126 changed
- cuisine: 1,068 equal / 169 changed / 158 absentBoth
- lunch budget: 165 equal / 1,230 absentBoth
- dinner budget: 559 equal / 40 changed / 5 shadowMissing / 791 absentBoth
- hours: 581 equal / 126 changed / 5 shadowMissing / 683 absentBoth
- recommended dishes: 28 equal / 1 changed / 151 shadowMissing / 1,215 absentBoth
- featured dishes: 121 equal / 6 changed / 50 shadowMissing / 1,218 absentBoth
- practical: 480 shadowAdded / 915 absentBoth

814 个 Place ID 至少有一个字段差异。

## 重要判断

Cuisine 的大量 changed 不是应该强制接受的“更新”，而是字段语义混用：`hotpepper_catalog_facts` 中 provider 原始 `genre.name` 被旧 importer 额外写入 canonical `cuisine`，导致源分类覆盖原有规范化菜系。

## 修复

- `build_master.py` 在 full Hot Pepper import 期间保留全部 raw/source fields，但抑制额外的 canonical `cuisine` 写入。
- `cuisine_source` / `sub_cuisine_source` 继续完整保存。
- Basic source-match 中已经规范化/用于当前 runtime 的 `cuisine` 仍可进入 canonical field。
- Legacy canonical normalized cuisine 继续作为迁移 fallback。
- 未来 provider genre → canonical cuisine 必须走版本化 normalizer，不再直接复制字符串。

新增 `validate_source_semantics.py`：

- 要求 535 条 full Hot Pepper `cuisine_source` observation 保留；
- 要求 full Hot Pepper artifact 的 canonical cuisine observation = 0；
- 要求 full Hot Pepper artifact 被选为 canonical cuisine resolution = 0；
- build/repeat/backup 三阶段都执行。

## 状态

修复已实现，等待 blocking smoke 与下一次字段 diff 验证。通过前不标记 Phase 3D 完成。
