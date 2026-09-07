# 主数据库契约

更新日期：2026-09-07。状态：persistent SQLite v1 已实现，正式 smoke test 由 GitHub Actions 验证；旧 `docs/database/schema-v1.sql` 仅保留为早期原型，生产迁移使用 `database/migrations/001_initial.sql`。

## 表及职责

| 表 | 主键或关联键 | 职责 |
| --- | --- | --- |
| `schema_migrations` | version | 数据库迁移版本 |
| `catalog_entries` | `place_id` | 2,804 frozen catalog 范围、成员快照、身份状态 |
| `source_records` | content-addressed ID | 版本化来源记录、raw payload、取得方式、parser、permission、hash |
| `source_bindings` | Place ID + source record | reviewed / candidate / conflict / retracted 身份关联 |
| `field_observations` | observation ID | 字段原值/状态/时间及 derived-from 信息 |
| `field_resolutions` | Place ID + field | 被采用 observation、resolver rule/priority 或未解决状态 |
| `ingestion_runs` | run ID | 每次导入的提交、parser、状态与摘要 |
| `ingestion_tasks` | task ID | 后续增量采集/复核任务状态 |
| `retained_exceptions` | exception ID | 不应静默丢弃但不属于当前 catalog 的历史资料 |
| `exports` | export ID | catalog/recommendation/public/audit 导出版本与校验信息 |

## 身份状态

`catalog_entries.identity_state`：

- `id_only`：仅有 catalog Place ID，当前不公开推荐。
- `source_matched`：存在 reviewed source binding 和可采用真实名称。
- `verified`：迁移自现有严格 canonical identity 或未来完成更高等级核验。
- `closed` / `moved`：有明确状态证据。
- `conflict`：身份存在未解决冲突。

Catalog membership 与 publication eligibility 分离。即使 `id_only` 或 `conflict` 也保留 Place ID，不等于必须展示。

## Source record 与 binding

`source_records` 不负责宣布“这是哪一家 Google Place”；它保存来源原记录和版本。一个 provider/source ID 可存在多个内容版本。

`source_bindings` 才表示该 source record 与 Place ID 的身份判断。相同 provider source ID 对多个 Place ID 时全部保留并标记 conflict，不自动合并。当前 retained basic 数据已知 5 组 reused provider ID / 10 个 Place ID。

候选或 conflict source 仍保存原始 evidence，但 candidate 不能自动生成 resolution；conflict 不能被 resolver 选择为 known observation。

## Field observation 与 resolution

字段状态：`known / unknown / reviewed_none / not_applicable / conflict / retracted`。

- 空抓取、超时或新空值不能覆盖旧 known。
- `known` 必须有实际 JSON value。
- derived field 可记录 `derived_from_observation_id` 和 `transformation_rule_version`。
- `field_resolutions` 的复合外键限制采用 observation 必须属于同一 Place ID 和 field key。
- resolver 使用明确 rule version / priority，不由文件导入顺序决定。

当前初始来源优先级用于迁移稳定性：official > Hot Pepper > legacy resolved snapshot > Overture > OpenStreetMap。它不是永久业务规则；后续 resolver 会结合字段类型、时间、retraction 与冲突证据细化。

## Legacy canonical 迁移

现有 `production_area1.js` 是多来源解析后的派生状态，不应假装成新的直接来源，但如果完全忽略会让 SQLite 首次导出丢失当前线上字段。因此 v1 将：

- 651 条 frozen catalog 内 canonical 作为 `legacy_resolved_snapshot` source record 导入；
- identity 设为 `verified`；
- 字段以较低于 direct official/Hot Pepper 的迁移优先级保留；
- 3 条目录外 canonical 进入 `retained_exceptions`。

未来 direct source observation 覆盖后，legacy snapshot 仍保留为历史 provenance，而不继续主导字段。

## Hot Pepper v1

保存 raw：名称、假名、地址、坐标、genre/subgenre、budget、营业原文、休息日原文、午餐供应、access、station、URL、catch、course、free drink/food、private room、card、smoking、parking。

显式 derived budget range：

- 区间 → lower/upper
- `N以下` → lower=0, upper=N
- `N以上` → lower=N, upper=null

`openingHoursText` / `closedText` 是原始 evidence；在可靠 parser 完成前不强行把全部 535 条转换为 weekly normalized schedule。

## Public export 契约

最终从同一数据库 snapshot 生成：

- catalog：全部 2,804；
- recommendation：仅满足 eligibility，必须有真实名称并无阻断身份冲突。

当前旧 runtime 已提前执行这一 publication gate：1,393 个 ID-only 下架、1,411 个 named rows 在线。SQLite exporter 完成后再替换这段过渡逻辑。

## 本地与 CI

本地 DB 默认 `_local/eat-main.sqlite`，SQLite 文件和 WAL/SHM 不提交仓库。Actions 仅构建 `_tmp` smoke database，执行两次幂等导入和 backup/restore；公开 Pages 不包含整个 SQLite。
