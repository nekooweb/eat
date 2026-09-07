# 2026-09-07 — 下架 ID-only 占位记录与过渡数据修复

## 本批实际开发

- 保留 `data/area1_google_ids.json` 中完整 2,804 个 frozen Place ID 作为内部 catalog，不删除任何身份。
- 修改 `scripts/build_google_inventory_runtime.mjs`：公开 runtime 仅发布 `nameKnown=true`、名称非空且不是 `google_place_id_only` 的记录。
- 1,393 条只有 Place ID、没有真实名称的记录从网页随机推荐池下架；后续补到来源支持的真实名称后，重新 build 即可自动上架。
- 删除 runtime builder 中“Google Maps 餐厅”占位名称写法，ID-only 内部行名称保持空值。
- 修正 Hot Pepper retained 营业字段映射：使用 `facts.openingHoursText` 与 `facts.closedText`，不再读取不存在的 `facts.open` / `facts.close`。
- 删除旧 `N以上 -> [N, N+2000]` 的伪预算上界。旧 runtime 无法表达开放上界时不构造范围；原始文本留给后续 SQLite importer 用 `upper=null` 保存。
- 重写 `scripts/audit_google_inventory_runtime.mjs` 的发布审查：继续验证完整 2,804 catalog，同时要求公开 runtime 只能是 catalog 子集、不得有重复、不得出现 ID-only 或“Google Maps 餐厅”占位名，并保持 catalog 原始顺序。
- 更新 `DEVELOPMENT.md` 与 `ARCHITECTURE.md`，明确 catalog membership 与 publication/recommendation eligibility 分离。

## 设计意义

当前网页不再把“已知 Place ID”误等同于“已具备可展示餐厅资料”。目录身份继续保留用于补全，而公开推荐只使用至少已有真实名称的记录。这是未来 SQLite `catalog` / `recommendation` 双导出的过渡实现。

## 后续

本批通过 Actions 后继续 Phase 1：实现 persistent SQLite v1 初始化/迁移器，导入 2,804 catalog、760 retained source bindings，并将 5 组 reused provider ID / 10 bindings 进入 conflict。随后导入 Hot Pepper 535 条 retained facts。
