# 主数据库输入、处理与输出流程

更新日期：2026-09-07。

## 0. 重构期运行模式

当前进入 `EAT_REFACTOR_MODE=1`。整体流程修改期间只把成本、安全、语法、冻结目录完整性和当前 Pages 可部署性作为硬门槛。旧 canonical shape、overlay 一致性、coverage、旧推荐优先队列、旧 normalized-field 规则等改为 warning/report，避免旧模型阻断新模型开发。

Refactor mode 是临时兼容策略。切换新主库前必须重新建立新架构 strict checks，并将 warning 项逐步归零或明确迁移替代。

## 1. 唯一数据方向

公开来源 / 已有留存资料
→ versioned raw records
→ identity bindings
→ field observations
→ resolver
→ field resolutions
→ local SQLite master
→ catalog/recommendation exports
→ GitHub Pages

GitHub 保存代码、schema、文档、输入快照和发布 export；本地 SQLite 是唯一可写目标主库。Actions 临时目录、Pages JS 和旧 enrichment shards 都只能作为输入/派生物，不再作为事实主库。

## 2. 迁移输入与快照

正式迁移必须固定 source commit，并记录每个输入文件的 Git blob SHA、字节数和 SHA-256。旧文件保留原貌，不直接覆盖。

第一批迁移输入：

- `data/area1_google_ids.json`
- `data/google_basic_source_matches.json`
- `data/hotpepper_catalog_facts.json`
- `data/hotpepper_rich_metadata.js`
- `data/source_facts.js`
- `data/source_provenance.js`
- `data/google_inventory_detail_evidence.json`
- 旧 canonical / historical exception 数据

现有 82 个数据文件继续作为审计输入清单保存；新主库建立后再逐步判断哪些可以归档。

## 3. Catalog 导入

以冻结 2,804 Place ID 建立 catalog。要求：

- 数量保持 2,804；
- Place ID 唯一；
- 保留 membership snapshot；
- id-only 使用 `name=null`；
- 不因为缺失字段、冲突或来源访问失败删除目录条目。

旧核心库中 3 条不属于冻结目录的记录进入 retained exception 区，不自动扩展 scope。

## 4. Source records

每条来源记录保存：

- provider / provider_id；
- source URL；
- raw payload 或 retained raw text；
- observed_at / ingested_at；
- content hash；
- parser version；
- retrieval method；
- permission/licensing note（如适用）。

相同 provider ID 的不同内容版本分别保存，不用覆盖式更新破坏历史。

## 5. Identity bindings

Binding 与 source record 分离。状态至少包含：

- candidate；
- reviewed；
- conflict；
- retracted。

首批导入 760 retained bindings。5 组 reused provider ID / 10 bindings 直接进入 conflict queue，不允许因为旧记录写着 `strong` 就自动选择 canonical identity。

空间距离只能作为约束，不单独证明同一店。多分店、同楼层、同品牌、重复 listing 必须保留审查状态。

## 6. Field observations

所有字段先入 observation，不直接写最终网页字段。

### 名称/地址/坐标

必须来自与 Place ID 明确绑定的来源记录。来源字段保持 provider identity，不伪装成 Google 提供。

### 营业时间

- `openingHoursText` 保存 raw hours text；
- `closedText` 保存 raw closure text；
- weekly normalized schedule 独立生成；
- 临时休业、节假日、活动通知独立存储。

353 条 Hot Pepper retained hours/closure 是第一批回归迁移样本。

### 预算

保存 meal、currency、lower、upper、inclusive/open bound、raw text 和 evidence type。

`N以上` 必须表示 lower=N、upper=null；禁止生成 `N+2000`。

### 菜品/推荐

菜单 item、featured、signature、recommended 分开。只有存在明确推荐/招牌/名物语义和具体菜名关联时，才能进入 strict recommendation resolution。

## 7. Resolver

Resolver 是新架构的核心。最终值不得由文件导入顺序决定。

输入：

- binding state；
- observation state；
- source/provider；
- observed_at；
- parser/resolver rule version；
- correction/retraction；
- conflict state。

输出：

- selected observation；
- resolution state；
- rule version；
- reason / conflict note。

新空值、网络失败、页面无法访问不得清除旧 known resolution。

## 8. Derived fields

规范化 cuisine、distance、translated display name 等必须记录 derived provenance：

- source observation(s)；
- transformation rule；
- rule version；
- generated_at。

Derived 值不能伪装成 source raw field。

## 9. Incremental collection

新主库稳定前不扩张大规模采集。恢复采集后按以下顺序：

1. id-only identity/name；
2. address/coordinates/cuisine；
3. hours；
4. budget；
5. menu/recommendation；
6. practical metadata。

一次来源访问尽量抽取所有可支持字段，避免按字段重复请求。访问被限制、需要登录、验证码或不可用时停止，不绕过限制，也不回退付费 Google Data API。

## 10. Export

从同一 SQLite snapshot 生成：

### Catalog export

全部 2,804 条，包含 identity state、missing/conflict status、source timestamps、map link 等。

### Recommendation export

只包含满足 eligibility 的条目。必须输出 exclusion reason，例如：

- id_only；
- identity_conflict；
- closed/moved；
- insufficient_identity；
- outside_scope；
- blocked_by_policy。

`id_only` 不再因为 frozen membership 自动获得 recommendation eligibility。

Export metadata 包含：schema version、resolver version、source snapshot/hash、row count、generated_at、content hash。

## 11. GitHub/Pages handoff

本地 SQLite 不直接暴露给 GitHub runner。流程：

local SQLite
→ local integrity/foreign-key/export validation
→ commit validated export
→ Actions hard checks
→ warning/report compatibility checks
→ Pages deploy

电脑离线时继续发布上次已验证 export，不声称数据自动刷新。

## 12. 切换条件

Pages 切换前至少满足：

1. 2,804 catalog ID 集合一致；
2. 导入幂等；
3. 5 组 reused provider-ID conflict 不自动 canonicalize；
4. 353 Hot Pepper hours/closure raw fields 正确迁移；
5. open-ended budget 不再伪造上界；
6. known 值不被失败请求覆盖；
7. catalog/recommendation export 可从同一 snapshot 重现；
8. 新旧前端结果完成 regression diff；
9. backup/restore 通过；
10. 新架构 strict gates 已取代 refactor warning。

完成实际开发后必须同步更新 `DEVELOPMENT.md`、相关架构/数据文档和当日 `logs/`。
