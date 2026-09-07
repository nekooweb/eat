# 主数据库输入、处理与输出流程

更新日期：2026-09-07。

## 数据方向

公开/retained 来源 → versioned source record → identity binding → field observation → resolver → field resolution → SQLite master → catalog/recommendation export → Pages。

2,804 frozen Place ID 始终保留。`id_only` 只下架、不删除；没有真实独立来源名称时不能进入 recommendation。

## Identity recovery 层

1. retained official：独立 HTTPS candidate-official + name-match；无 conflict 才可升为 source_matched。
2. retained verified OSM：historical verified sourceId↔Place ID 与同一 OSM candidate 精确 join；native source-ID collision 先隔离。
3. historical Google private sweep：只作为短期 match hint。Google displayName / formattedAddress / location / status/types 不进入 durable master/repo/export；长期关联只保留 Place ID。

## Historical-private reconciliation

现有私有 sweep 几乎覆盖当前 id-only，但 durable proposal 必须重新由 Hot Pepper / OpenStreetMap / Overture 等独立来源证明。Private match hint 不能直接成为 source record。

第一版 ultra-strict probe 得到 0 durable proposal，因此新增 E2 诊断层：不改变 acceptance rule，只统计最佳独立 candidate 的 name similarity、distance、postcode/address signal、provider coverage 和 cross-provider mutual consensus。

E2 private output 只保存 Place ID、独立 provider/source ID 和 match metrics，2 天后过期；不保存 Google 名称/地址/坐标。根据统计决定是否存在可解释的 strict matching cluster。若 independent coverage 本身不足，则不继续放宽 threshold，而转免费公开来源/官网 collector。

## Field completion

Retained-field resolver v2：publishable/no-conflict only，official/Tabelog only，HTTPS provenance + claimedFields，missing-only，derived observation 链接原 observation。

Hot Pepper candidate field-only review：原 candidate 永不升级；只有现有可靠 identity 与 HP name/location 严格一致时，才补 missing address/hours/dinner/closure/practical。禁止 name/coordinates/canonical cuisine/identity promotion。

## Unified tasks

priority：identity conflict review > identity recovery > field completion > dish semantic review。每次 recovery/resolver 后重新 planner。Identity recovery 成功会从 identity task 转成 field task，因此以 task 类型和字段缺口变化衡量实际进度。

## Network-second

Retained evidence 用尽后才进入网络免费公开来源。不得恢复付费 Google Places/Text/Nearby API，不做 proximity-only binding，不绕过登录/CAPTCHA/访问限制。一次已确认来源访问尽量提取全部支持字段。

## Export / cutover

Catalog 始终 2,804；recommendation 只包含 eligibility 通过项。Shadow-only 新增必须追溯到 approved reviewed independent source。Pages 切换前继续要求幂等、collision quarantine、Google payload leakage check、backup/restore、field diff 和浏览器回归。

每批实际开发同步更新 `DEVELOPMENT.md`、本文件和当天 `logs/`。
