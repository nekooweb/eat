# 2026-09-08 — SQLite-reviewed official source overlay 与 dish-source queue 对齐

## 背景

在继续处理 `find_independent_dish_source` 队列时发现一个架构分裂：

- SQLite `retained_official_identity.py` 已经把 `data/official_candidate_index.json` 中 independently fetched、official-host、name-matched、且不在 cross-layer conflict 集合中的记录写成 `reviewed` official binding，并解析 `source_websites`；
- Pages/runtime 的 `sourceWebsites` 却没有消费这层 reviewed official identity；
- 因此一部分 SQLite 已经认可官网来源的餐厅，在 runtime queue 中仍被错误归类为 `find_independent_dish_source`。

在 overlay 前的 queue 中：

- recommendation gap：1,198；
- `official_crawl`：218；
- `retained_source_mining`：633；
- `find_independent_dish_source`：347；
- `official_or_retained_featured`：56。

此前 proposal-only 交叉计划 `data/independent_dish_source_candidates.json` 已经提示：347 家 independent gap 中有 **46 家**在历史 `official_candidate_index` 中拥有官网候选，其中 **27 家**还有明确 menu URL。这说明问题不是重新搜索来源，而是 runtime 未接入 SQLite 已认可的来源层。

## 1. 复用 SQLite collision 规则导出 reviewed official overlay

新增：

`scripts/database/export_reviewed_official_runtime_sources.py`

Commit：

`400c103bf533ca1b519151600340f3b2cd5ddc44`

脚本不是重新实现一个宽松的 website matcher，而是直接复用 SQLite master 的 retained collision 与 official identity 逻辑：

- frozen catalog = 2,804；
- `build_master.retained_conflict_index(...)`；
- `retained_official_identity.load_index()`；
- conflict Place ID 全部 deferred；
- 只有 SQLite 会写成 `reviewed` 的 official candidate 才能进入 overlay。

固定基线：

- `official_candidate_index` rows：**194**；
- reviewed：**193**；
- conflict deferred：**1**；
- outside catalog：0；
- all retained conflict source keys：10；
- all retained conflict places：20。

输出：

`data/reviewed_official_runtime_sources.json`

### Overlay 权限边界

Overlay **只能提供来源 URL**：

- 允许 runtime mutation：`sourceWebsites`；
- 禁止修改 name；
- 禁止修改 coordinates；
- 禁止修改 identity state；
- 禁止直接写 dish evidence；
- network requests = 0；
- paid Google data API = 0；
- Google display payload 不持久化。

## 2. Runtime 只在已命名 public row 上消费 overlay

修改：

`scripts/build_google_inventory_runtime.mjs`

Commit：

`bebc6d9ef34054a13909bcd7ddb4da55e62f296d`

应用条件：

- row 已经存在于 named runtime；
- `basicInfoState !== google_place_id_only`；
- `nameKnown === true`；
- name 非空。

因此 official overlay **不能让 ID-only row 进入 public runtime**。

应用行为只有：

`mergeWebsite(row, reviewedOfficialUrl)`

并添加 trace marker：

- `reviewedOfficialSourceOverlay=true`；
- `reviewedOfficialSourceCheckedAt`。

没有修改：

- public name；
- lat/lng；
- distance；
- source provider identity；
- dish fields。

## 3. Blocking runtime audit

`scripts/audit_google_inventory_runtime.mjs` 增加 overlay blocking assertions：

- SQLite collision contract 必须一致；
- reviewedRowsOnly = true；
- conflictRowsPublished = false；
- baseline 必须是 194 / 193 / 1；
- conflict Place ID 不得进入 reviewed overlay；
- overlay URL 必须 HTTPS；
- runtime marker 必须能追溯到 overlay row；
- overlay source URL 必须实际存在于对应 runtime `sourceWebsites`；
- applied count 必须与 runtime stats 对账；
- ID-only row 仍不得发布；
- overlay 不得直接提升 dish evidence。

原有 strict-source-zh dish audit 同时继续生效：

- approximate recommendation = 0；
- generic fallback = false。

## 4. Collector 接入 reviewed source overlay

修改：

`.github/workflows/collect-google-inventory-details.yml`

Commit：

`86082a2c86ea273028c42c88f6696a9fecb9c541`

新顺序：

```text
zero-paid audit
  -> export SQLite-reviewed official source overlay
  -> rebuild runtime + queue
  -> retained dish mining
  -> retained Hot Pepper promotional mining
  -> bound official crawl
  -> bounded official sitemap crawl
  -> monotonic merge
  -> rebuild runtime + queue + 8-shard plan
  -> bot generated-data commit
  -> reusable SQLite contract (sync latest main)
```

Overlay 本身不产生菜品；它只是让已经 reviewed 的官网重新进入现有 source-backed collector。

## 5. Overlay-enabled bulk run

Workflow run：

`34184954944`

Collector bot data commit：

`4049daaa906b99a2e1756212d563ae6799b9797a`

### Official overlay 实际应用

- reviewed rows：**193**；
- reviewed rows with menu URL：113；
- conflict deferred：1；
- applied to current named public runtime：**192**；
- applied public rows with menu URL：**112**。

Public runtime 总数保持：

**1,415**

没有 ID-only row 因 overlay 被发布。

### Queue split-brain 被消除

Run 初次 runtime rebuild 后：

- recommendation gap：1,198；
- `collect_strict_recommended_dishes`：264；
- `extract_retained_dish_source`：633；
- `find_independent_dish_source`：**301**；
- `collect_source_backed_featured_dishes`：75。

最关键变化：

`find_independent_dish_source: 347 -> 301`

恰好减少 **46 家**，与此前 proposal-only `official_candidate_index` 交叉结果完全一致。

这证明 46 家不是需要重新寻找独立来源，而是 runtime 漏接了 SQLite reviewed official source。

## 6. 官网批量抓取扩容结果

接入 overlay 后，普通 bound-official collector：

- website tasks：**531**；
- website hosts：**302**；
- pages visited：**670**；
- website recommendation restaurants：89；
- website featured/menu restaurants：66；
- plain-menu items：257；
- source-backed recommendation restaurants：109；
- source-backed featured-only restaurants：123；
- fresh R items：181；
- fresh F items：331。

这比 overlay 前约 280 个 official tasks 明显扩大，但来源仍全部来自已经 reviewed 的 official URL，没有新增付费 discovery API。

## 7. Monotonic evidence 增量

Run 开始前：

- evidence restaurants：434；
- recommendation evidence restaurants：192；
- featured evidence restaurants：377；
- R items：349；
- F items：840。

普通 official crawl merge 后：

- evidence restaurants：**475**；
- recommendation evidence restaurants：226；
- featured evidence restaurants：411；
- R items：426；
- F items：989。

随后 bounded sitemap 再产生少量净新增，最终：

- evidence restaurants：**477**；
- recommendation evidence restaurants：**228**；
- featured evidence restaurants：**414**；
- R items：**437**；
- F items：**1,009**。

Evidence classes：

- `source_recommendation_text`：437；
- `retained_source_menu_item`：167；
- `provider_promotional_dish_text`：225；
- `source_menu_text`：617。

## 8. Public runtime 最终增量

Final run result：

- named public restaurants：**1,415**；
- recommended known：**253**；
- featured known：**423**；
- Chinese-normalized dish display：**485 / 1,415 = 34.3%**；
- unfilled dish rows：**930**；
- approximate recommendation：0；
- generic fallback：false。

相对 overlay 前稳定基线约 217 / 385 / 441：

- recommended：+36；
- featured：+38；
- Chinese dish display：+44；
- coverage：31.2% -> **34.3%**。

Recommendation gap：

**1,162**

Final queue：

- `official_crawl`：231；
- `retained_source_mining`：630；
- `independent_source_discovery`：301；
- `official_or_retained_featured`：71；
- total dish work：1,233。

## 9. SQLite 自动 canonical validation

Run `34184954944` 的 reusable `validate_database / validate`：**success**。

同步步骤明确 fetch 最新 main，并设置：

`DATABASE_CONTRACT_VALIDATED_SHA=4049daaa906b99a2e1756212d563ae6799b9797a`

所以验证对象是 collector 推送后的 bot data commit，不是旧 workflow event SHA。

最终 SQLite：

- phase2 dish evidence：**1,446 items**；
  - recommended evidence：437；
  - featured evidence：1,009；
- accepted recommendation evidence：**429**；
- accepted featured evidence：**987**；
- accepted semantic + Chinese canonical：**1,416**；
- accepted with source-original：**1,416 / 1,416**；
- identity conflict evidence：8；
- identity not publishable：22；
- canonical `recommended_dishes.zh`：**222 places / 392 items**；
- canonical `featured_dishes.zh`：**405 places / 849 items**；
- `dishSemanticReviewPlaces`：0；
- validator failures：0。

DB contract：

- repeat build idempotency：pass；
- backup/restore：pass；
- shadow export：pass；
- safe-added identity remains only the already-reviewed official recovery path；
- unsafeAddedRows：0。

Database smoke artifact：

- artifact ID：`10040250862`；
- SHA256：`40efcacb767898cd51c6c875804aac7ff6ab59ca6d19ede91e1c5cd18e0d4fd5`。

## 10. Independent candidate plan 同步

Overlay 修复后，旧 `data/independent_dish_source_candidates.json` 仍来自 347-gap 时代，因此会陈旧。

Follow-up commit：

`4a60fedad46ae36cc1feccefc96b37a45f4c446d`

把 `scripts/build_independent_dish_source_candidate_plan.mjs` 接入主 collector 的最终 rebuild 阶段：

```text
rebuild runtime
 -> rebuild queue
 -> rebuild 8-shard dish plan
 -> rebuild independent dish-source candidate plan
 -> assert candidate gap == rebuilt queue independent gap
 -> commit all generated plans together
```

Blocking contract：

- proposal-only；
- identityBindingChanges = 0；
- networkRequests = 0；
- paid Google data API = 0；
- proximity-only binding = false；
- dish promotion before identity review = false；
- `currentIndependentDishSourceGap` 必须等于当前 queue 的 `recommendationGapNeedingNewDishSource`。

因此以后 reviewed source overlay、queue 与 independent candidate plan 不会再次分裂。

## 11. 结论

本轮主要收益不是放松 extractor，也不是购买更多 Places API，而是修复同一仓库内部 SQLite 与 Pages/runtime 的来源状态分裂。

已验证：

- reviewed official source 193 / conflict deferred 1；
- 192 个 overlay 实际应用到现有 public rows；
- independent source gap 347 -> 301；
- 46 家错误的“需要重新找来源”任务被消除；
- source-backed evidence restaurants 434 -> 477；
- public Chinese dish display 约 441 -> 485；
- SQLite canonical recommended places 222；
- SQLite canonical featured places 405；
- frozen catalog 2,804 不变；
- public named runtime 1,415 不变；
- paid Google data API = 0；
- approximate recommendation = 0；
- generic fallback = false；
- identity conflict 不通过 overlay 发布；
- ID-only row 不通过 overlay 发布。

下一阶段应该继续优先处理剩余 **301** 家真正的 `independent_source_discovery`，以及 **630** 家 retained-source recommendation gap；不应重新搜索已被 SQLite reviewed 的 46 家，也不应通过扩大 sitemap 深度或放松 R 语义标准换覆盖率。
