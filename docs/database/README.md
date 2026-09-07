# 主数据库重构说明

更新日期：2026-09-07。

## 已验证的 persistent baseline

`2fdf8a44f238c0b096fae558ea2e128f7eb83031` 的 master database workflow 已完整通过：真实 SQLite build、strict validator、二次幂等导入、SQLite backup/restore 全部成功。

通过时的基线：2,804 catalog、1,946 source records/bindings、28,992 observations、25,162 resolutions、651 verified、747 source-matched、13 conflict-state、1,393 id-only、1,398 resolved names、535 Hot Pepper full records、535 raw hours/closures。

统一 retained layer 后实际 source-ID collision 为 8 组 / 16 Place ID；所有相关 binding 均为 conflict，known resolution 不允许直接选择 conflict source。

## 当前 Phase 2

新增 `scripts/database/retained_phase2.py`，把旧 overlay 数据迁进 source/observation 层：

- `source_facts.js`：575 provider fact records；
- `source_provenance.js`：644 source links；
- `hotpepper_rich_metadata.js`：135 rich metadata rows；
- `google_inventory_detail_evidence.json`：283 dish evidence items。

这批数据在首次导入阶段只增加 evidence/provenance，不改变当前 resolver 结果。CI 会动态读取这些输入计算 expected count，并要求所有 Phase 2 acquisition methods 的 record count 与输入一致，同时要求 `phase2SelectedResolutions=0`。

## Identity handling

Native identity key 与 evidence link 分离：

- Hot Pepper `hotpepperId` 是 native provider ID，参加 collision discovery；
- Tabelog/official URL 不是默认 branch primary key，一个品牌/菜单页可服务多个分店；
- 非 native provider fact/provenance 使用 content-addressed synthetic retained ID；URL 保存在 `source_url`；
- URL 共享不会自动导致 Place ID merge；
- candidate evidence 可以保存 known value observation，但在 review/resolver 升级前不进入 field resolution。

## Phase 2 fields

Source facts 保存名称、地址、菜系、tags、lunch/dinner range、dishes、hours raw、closure days/note、百名店及已有 price derivation 等 provider-specific facts。

Provenance 保存 exact source URL、claimed fields、checkedAt 和 price evidence class。

Hot Pepper rich 保存名称/假名、地址/坐标、area/genre/budget、信用卡、special features、车站/交通、capacity/party capacity、营业/休息日原文、amenities、service text、coupon URL、review mode 等 practical metadata。

Dish evidence 分开保存：

- `dish.recommendation.evidence`
- `dish.featured.evidence`

每个 item 保留 provider、source URL、checkedAt、evidenceClass 和 snippet；本阶段不直接把 evidence 当最终推荐菜 resolution。

## 本地运行

```bash
python scripts/database/build_master.py --output _local/eat-main.sqlite --reset
python scripts/database/validate_master.py _local/eat-main.sqlite
```

SQLite/WAL/SHM 不进入 GitHub Pages。Actions 只生成 `_tmp` smoke database，并做重复 import 与 backup/restore。
