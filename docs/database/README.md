# 主数据库重构说明

更新日期：2026-09-07。

状态：过渡期公开 runtime 已完成 ID-only 下架并通过部署验证；persistent SQLite v1 工具已实现，等待/执行 Actions 实盘验证后作为后续 retained-data 迁移基础。

## 当前数据边界

- frozen catalog：2,804 Place ID，始终保留。
- 当前公开 runtime：1,411 条已有真实名称记录。
- 暂不公开：1,393 条 ID-only；不会使用“Google Maps 餐厅”伪名称。
- Hot Pepper retained facts：535 条，均保存 `openingHoursText` / `closedText` 等原始字段。

## 正式 SQLite v1

生产迁移 schema 位于：

`database/migrations/001_initial.sql`

本地构建：

```bash
python scripts/database/build_master.py --output _local/eat-main.sqlite --reset
```

验证：

```bash
python scripts/database/validate_master.py _local/eat-main.sqlite
```

数据库文件不提交仓库，也不直接发布到 Pages。`.gitignore` 排除 SQLite、WAL/SHM、`_local/` 与 `_tmp/`。

## 首批 importer 输入

1. `data/area1_google_ids.json`：2,804 catalog membership。
2. `data/production_area1.js`：现有 654 条 legacy canonical，其中 651 条在 catalog 内作为迁移 resolved snapshot；3 条目录外进入 `retained_exceptions`。
3. `data/google_basic_source_matches.json`：760 retained bindings；5 组 reused provider ID / 10 个 Place ID 保留为 conflict。
4. `data/hotpepper_catalog_facts.json`：535 完整 retained source records。

Legacy canonical snapshot 的作用是防止数据库迁移时丢失当前已经上线的已验证值。它使用单独的 `legacy_resolved_snapshot` provider 标记，不能被解释成新的官网/Hot Pepper/Google 来源；后续直接来源 observation 会逐步替代它。

## v1 核心表

- `catalog_entries`
- `source_records`
- `source_bindings`
- `field_observations`
- `field_resolutions`
- `ingestion_runs`
- `ingestion_tasks`
- `retained_exceptions`
- `exports`
- `schema_migrations`

`source_records` 保存取得方式、parser version、permission basis、content hash 与 raw payload；`field_observations` 支持 derived-from 与 transformation rule；`field_resolutions` 保存 resolver priority/rule version。

## Hot Pepper v1 映射

首批保存：名称、假名、地址、坐标、原分类/子分类、预算原文、营业原文、休息日原文、午餐供应原文、交通、车站、来源 URL、宣传文本、course、饮料/食物放题、包间、信用卡、吸烟、停车。

规范化预算只处理明确 provider band：

- `3001～4000円` → lower=3001, upper=4000
- `1000円以下` → lower=0, upper=1000
- `5000円以上` → lower=5000, upper=null

不再构造 `N+2000`。

## CI 契约

旧内存 prototype 仍保留但为 warning-only。新的 persistent master smoke test 是 blocking：

- build real SQLite file
- validate integrity/FK/schema/catalog/conflicts/retained sources
- repeat import and compare core table counts
- SQLite backup API + restore validation

因此 refactor mode 只是降低旧架构噪音，不会降低新主库自身的数据完整性门槛。

## 下一步

persistent smoke 通过后，继续将 `source_facts.js`、`source_provenance.js`、`hotpepper_rich_metadata.js`、dish evidence 和已绑定官网 retained evidence 导入同一 observation 模型，再构建 catalog/recommendation exporter。
