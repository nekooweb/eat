# 2026-09-07 — Persistent SQLite master v1 实现

## 本批实际开发

- 新增 `database/migrations/001_initial.sql`，建立正式 persistent SQLite v1 表结构。
- 新增 `scripts/database/build_master.py`，不联网地迁移现有 retained repository inputs。
- 新增 `scripts/database/validate_master.py`，校验 integrity、foreign keys、catalog、source-ID collision、Hot Pepper retained fields、开放预算和 resolver 选择来源。
- legacy canonical 654 条不直接丢弃：651 条目录内记录作为 `legacy_resolved_snapshot` 迁移快照，3 条目录外记录进入 `retained_exceptions`。
- 导入 760 retained basic bindings；5 组 reused provider ID / 10 个 Place ID 作为 conflict evidence，resolver 不允许从 conflict binding 选择 known field。
- 导入 535 Hot Pepper retained source records，并保存营业/休息日、预算、地址、坐标、分类、交通及设施字段。
- Hot Pepper budget band 使用结构化上下界；`N以上` 保存 `upper=null`。
- 新数据库 workflow 改为：真实 SQLite build → validate → 二次重复 import 幂等检查 → SQLite backup API → restore validate。
- 新架构 smoke test 保持 blocking；旧内存 prototype 在 refactor mode 下仅为 warning。
- 新增 `.gitignore`，防止本地主库、WAL/SHM 和临时数据库进入仓库/Pages。
- 同步更新 `DEVELOPMENT.md` 与 `docs/database/README.md`。

## 重要设计决定

`legacy_resolved_snapshot` 只用于防止迁移期间丢失当前线上已经解析/采用的字段，不代表新的外部事实来源。直接 Hot Pepper/官网等 source observations 将在后续 resolver 中以更高优先级逐步替换迁移快照。

Catalog membership、identity state、source binding、field observation、field resolution 和 publication eligibility 继续分层，避免重新出现“有 Place ID 就直接上架”或“后导入文件直接覆盖真值”的旧逻辑。

## 验证状态

本记录描述已经提交的实现内容。具体 persistent SQLite 数量与恢复测试只有在本批 GitHub Actions 完成后才记为验证成功；如果 CI 暴露结构或导入问题，将按实际结果修复并追加日志，而不会降低新主库 blocking gate。
