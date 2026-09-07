# 2026-09-07 批量补齐开发记录

## 基线

上一轮 blocking database smoke 已确认：2,804 catalog、651 verified、747 source_matched、1,393 id_only、13 conflict；共 2,972 active ingestion tasks，其中 identity recovery 1,393、field completion 1,352、identity conflict review 16、dish semantic review 211。

## Batch A — retained official identity recovery

状态：代码已实现，等待本提交 GitHub Actions blocking validation。

本批目标不是重新抓取 Google，而是先消费已经存在于仓库中的 `data/official_candidate_index.json`。该索引由此前独立官网页面抓取结果筛选生成，只保留 HTTPS candidate-official host 且页面名称匹配的记录。

新增：

- `scripts/database/retained_official_identity.py`
  - 读取 retained official index；
  - 拒绝 Google、聚合站、社交媒体 host；
  - Place ID 必须属于 frozen 2,804；
  - 不使用 discovery distance 作为身份或字段值；
  - 无 identity conflict 时建立 reviewed official binding；
  - 有 conflict 时只保存 candidate evidence；
  - reviewed official name 可把 `id_only` 升为 `source_matched`；
  - 保存 page/menu URL provenance；
  - 0 paid Google data API calls。

- `scripts/database/validate_official_identity.py`
  - official source record 与 retained index 一致；
  - URL 必须 HTTPS 且 host 合规；
  - conflict Place ID 不得 auto-review；
  - selected official name 必须来自 reviewed binding；
  - id-only 不得保留 selected name。

- `scripts/database/compare_runtime_shadow.py`
  - 原规则“shadow 不得增加任何新 ID”调整为“shadow 只允许 approved reviewed recovery method 增加新 ID”；
  - 当前非冲突线上记录仍不得消失；
  - 所有新增保持 frozen catalog order；
  - 未批准来源造成的 shadow-only 仍 blocking fail。

- `scripts/database/build_master.py`
  - official retained recovery 接在基础/Phase2 evidence 导入后、task planner 前执行；
  - planner 会基于恢复后的身份状态重新计算任务，因此真正完成的 identity recovery 会自动从 active queue 消失。

- `.github/workflows/database-contract.yml`
  - official index 变更会触发 database CI；
  - new importer/validator 进入 py_compile；
  - first build、repeat build、backup/restore 都执行 official identity validator。

## 下一批

本批 CI 通过并取得实际恢复数量后，更新本日志真实计数，然后继续 Batch B：读取历史 verified `sourceId -> Google Place ID` QC，并和 retained OSM rows 对接，批量恢复可证明身份的 name/address/coordinates/cuisine/hours。任何只有空间邻近、没有历史 verified mapping 的 OSM/Overture candidate 仍禁止自动 promotion。
