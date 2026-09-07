# 主数据库重构说明

更新日期：2026-09-07。

状态：过渡期公开 runtime 已完成 ID-only 下架并通过部署验证；persistent SQLite v1 已能建立真实数据库。第一次 strict smoke 发现跨 retained layer identity collision 比旧 basic-only 审查更多，现已把 collision discovery 提升到 importer 前置步骤并准备重跑。

## 当前数据边界

- frozen catalog：2,804 Place ID，始终保留。
- 当前公开 runtime：1,411 条已有真实名称记录。
- 暂不公开：1,393 条 ID-only；不会使用“Google Maps 餐厅”伪名称。
- Hot Pepper retained facts：535 条，均保存 `openingHoursText` / `closedText` 等原始字段。

## 正式 SQLite v1

生产迁移 schema：`database/migrations/001_initial.sql`

共享 importer primitives：`scripts/database/master_import_core.py`

入口：

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
2. `data/production_area1.js`：654 条 legacy canonical；651 条在 catalog 内作为迁移 resolved snapshot，3 条目录外进入 `retained_exceptions`。
3. `data/google_basic_source_matches.json`：760 retained bindings。basic-only 审查原先已知 5 组 / 10 Place ID source-ID reuse。
4. `data/hotpepper_catalog_facts.json`：535 完整 retained source records。

Legacy canonical snapshot 只防止迁移时丢失线上已采用值，provider 标记为 `legacy_resolved_snapshot`；它不伪装成新的官网/Hot Pepper/Google 来源，后续直接来源 observation 会逐步替代它。

## Cross-layer collision discovery

第一次真实 SQLite build 已成功生成：2,804 catalog、651 legacy source records、760 basic records、535 Hot Pepper full records，合计 1,946 source records/bindings。

随后 validator 将所有 retained records 按 `provider + provider_id` 联合检查，发现 collision 为 **8 组 / 16 Place ID**，高于 basic-only 的 5 组 / 10 Place ID。这说明有 3 组冲突只有在 basic mapping 与 Hot Pepper full retained layer 合并后才显现。

因此现在的规则不是硬编码“只有 5 组冲突”，而是：

1. importer 在写 binding 前扫描全部本轮 retained source layers；
2. 任一 provider/source ID 指向多个 Place ID 即形成 collision key；
3. 该 key 在所有 source layer 中的 binding 全部标为 `conflict`；
4. raw evidence 继续保存；
5. validator 要求没有任何 known field resolution 可以选自 conflict binding。

basic 层 5 组仍作为历史基线检查，防止已知冲突意外消失；总 collision 数由当前 retained 数据动态计算。

## v1 核心表

`catalog_entries`、`source_records`、`source_bindings`、`field_observations`、`field_resolutions`、`ingestion_runs`、`ingestion_tasks`、`retained_exceptions`、`exports`、`schema_migrations`。

`source_records` 保存 acquisition method、parser version、permission basis、content hash 与 raw payload；`field_observations` 支持 derived-from 与 transformation rule；`field_resolutions` 保存 resolver priority/rule version。

## Hot Pepper v1 映射

保存：名称、假名、地址、坐标、原分类/子分类、预算原文、营业原文、休息日原文、午餐供应、交通、车站、URL、catch、course、free drink/food、private room、card、smoking、parking。

规范化预算：

- `3001～4000円` → lower=3001, upper=4000
- `1000円以下` → lower=0, upper=1000
- `5000円以上` → lower=5000, upper=null

不再构造 `N+2000`。

## CI 契约

旧内存 prototype 为 warning-only；persistent master smoke 是 blocking：

- build real SQLite file
- validate integrity/FK/schema/catalog/source collisions/retained sources
- require every colliding source binding to be conflict
- prohibit known resolution from conflict binding
- repeat import and compare core table counts
- SQLite backup API + restore validation

Refactor mode 只降低旧架构噪音，不降低新主库数据完整性门槛。

## 下一步

persistent smoke 通过后继续导入 `source_facts.js`、`source_provenance.js`、`hotpepper_rich_metadata.js`、dish evidence 与已绑定官网 retained evidence，再构建 catalog/recommendation exporter。
