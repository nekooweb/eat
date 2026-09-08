# 2026-09-08 — Retained promotional + official sitemap 菜品批量补齐

## 目标

继续补齐 `recommendedDishes` / `featuredDishes`，但不通过放松语义标准、品牌猜测或付费 Google API 获得覆盖率。

本轮重点不是继续增加普通官网抓取并发，而是优先消化**仓库已经保存但尚未用于菜品解析的来源文本**，然后增加一个受限的官网 sitemap 菜单发现通道，并把批量 collector 与 SQLite canonical validation 做成自动闭环。

固定边界：

- frozen Google Place-ID catalog = **2,804**；
- public named runtime = **1,415**；
- unpublished Place-ID-only = **1,389**；
- paid Google data API calls = **0**；
- Google Maps 仅外部导航；地图仍为 Leaflet + OpenStreetMap；
- 普通菜单/宣传文案中的真实具体菜名只能进入 F / `featuredDishes`；
- 只有同一来源局部文本存在 `おすすめ / 名物 / 看板 / 自慢 / 一押し / 人気No.1` 等明确推荐语义时才能进入 R / `recommendedDishes`；
- cuisine / restaurant name / brand 常识不允许生成公共菜品；
- source-native 原文、provider、URL、checkedAt、evidence class 必须保留；
- worker 只产生 evidence，central merge / resolver 写 canonical truth；
- identity recovery 与 dish enrichment 继续分离。

## 1. 发现 Hot Pepper retained 文本未被完整利用

现有 `data/hotpepper_catalog_facts.json` 已经保存 **535** 条 retained Hot Pepper 行。主 collector 原本已经读取 `facts.catch`，但是没有读取：

- `facts.genre.catch`

同时 `data/hotpepper_rich_metadata.js` 中 **135** 条 reviewed rich rows 还包含：

- `specialFeatures[].title`

这些字段都属于 provider-authored promotional text，而且已经和 frozen Place ID 建立了现有 retained/reviewed 绑定，不需要再做网络搜索或 identity 猜测。

明确排除：

- basic `facts.catch`：主 collector 已经消费，避免重复；
- rich `sourceCatch`：与 basic catch 为同一来源字段，避免重复；
- genre name / cuisine name；
- restaurant name；
- brand template；
- 服务、预算、地址等非菜品字段。

## 2. 新增 retained Hot Pepper promotional miner

新增：

`scripts/build_retained_hotpepper_promotional_dish_evidence.mjs`

第一版 commit：

`9d88accce3c70a8ddd5f14f30ce63c83a798ee21`

随后将范围从 rich-only 扩到完整 retained catalog：

`96f66e375f1d2a7ba108ed8ab9f5e82a947eb626`

脚本特性：

- **0 network requests**；
- paid Google data API = 0；
- catalog `facts.genre.catch` 使用与现有 retained basic Hot Pepper catch collector 相同的绑定信任边界；
- rich `specialFeatures[].title` 只接受 `strict_auto` / `manual_exact` reviewed rows；
- 先用共享 deterministic dish dictionary 确认具体菜名；
- 同一文本存在明确 recommendation marker 时进入 `source_recommendation_text` / R；
- 否则真实具体菜名进入 `provider_promotional_dish_text` / F；
- 保留原始日文/原文、URL、checkedAt 和 snippet；
- 不使用 restaurant name / cuisine / brand inference。

例如，来源文案为：

`熟練シェフが作るビリヤニが自慢`

其中 `ビリヤニ` 是真实菜名，`自慢` 是明确 specialty / recommendation 语义，因此可以进入 R。

如果来源只写 `ビリヤニ` 而没有推荐语义，则只能进入 F。

## 3. rich-only 验证

Workflow run：`34183190405`

仅用 135 条 rich metadata 验证时：

- promotional texts：276；
- `genre.catch`：135；
- `specialFeatures[].title`：160；
- recommendation-text hits：10；
- featured-text hits：58；
- evidence restaurants：57；
- R restaurants：8；
- F restaurants：49；
- R items：8；
- F items：59。

Monotonic merge 后：

- recommendation evidence restaurants：176 -> **181**；
- featured evidence restaurants：268 -> **293**；
- evidence restaurants：324 -> **351**；
- R items：325 -> **332**；
- F items：644 -> **689**。

Public runtime：

- recommended：202 -> **206**；
- featured：282 -> **304**；
- Chinese-normalized dish display：337 -> **361**；
- coverage：23.8% -> **25.5%**。

这一步证明 retained promotional text 是有效的大批量入口。

## 4. 扩到 535 条 Hot Pepper catalog facts

Workflow run：`34183253522`

完整 catalog-scale pass：

- Hot Pepper catalog rows：535；
- eligible catalog rows：506；
- reviewed rich rows：135；
- catalog `genre.catch` texts：506；
- rich special-feature titles：160；
- promotional texts scanned：647；
- duplicate texts skipped：19；
- recommendation-text hits：20；
- featured-text hits：155；
- evidence restaurants：**164**；
- recommendation restaurants：**18**；
- featured restaurants：**146**；
- recommendation items：20；
- featured items：174。

Provider-text item counts：

- catalog genre catch：181；
- rich special-feature title：22。

Merge 后：

- R evidence restaurants：181 -> **191**；
- F evidence restaurants：293 -> **365**；
- evidence restaurants：351 -> **423**；
- R items：332 -> **344**；
- F items：689 -> **783**。

Public runtime：

- recommended：206 -> **216**；
- featured：304 -> **376**；
- Chinese dish display：361 -> **433 / 1,415 = 30.6%**；
- unfilled：982。

这说明优先消费仓库已有 retained source 比单纯增加外网抓取并发更高效。

## 5. 新增 bounded official sitemap 菜单发现

现有官网 collector 已经可以从首页跟随少量 same-origin menu/food links，但部分日本官网菜单页没有从入口页直接链接，却存在于 sitemap。

新增：

`scripts/collect_official_sitemap_dish_evidence.mjs`

Commit：

`eb9a9daa35c8bad27e7b41d5fc0a0adcf383d840`

并接入主 dish collector workflow：

`8c1f81b36fbf55bd01b22677bf3aafca4f4fcdc7`

严格限制：

- 只从已经绑定的 independent official/source website root 出发；
- 仅尝试 same-origin `/sitemap.xml` / `/wp-sitemap.xml`；
- child sitemap 最多 3；
- 每个餐厅最多 3 个菜单页；
- discovered URL 必须命中 menu / food / dish / 料理等受控 marker；
- news / blog / company / recruit / privacy / contact / reservation 等路径排除；
- multi-segment root URL 限制在该目录 prefix 内，避免同集团其他店铺页面串入；
- cross-origin URL 禁止；
- 普通菜单项只进 F；
- R 仍要求明确 recommendation marker；
- raw HTML 不持久化；
- paid Google data API = 0。

## 6. sitemap 实际收益

首次主要 run：`34183374706`

- queue eligible：276；
- targets：257；
- unique origins：236；
- sitemap files fetched：306；
- menu URLs discovered：82；
- menu pages fetched：69；
- error targets：10；
- evidence restaurants：24；
- R restaurants：4；
- F restaurants：21；
- R items：9；
- F items：91。

真正净增量：

- evidence restaurants：423 -> **430**；
- featured evidence restaurants：365 -> **373**；
- recommendation evidence restaurants：191 -> **192**。

也就是说，约 69 个 sitemap-discovered menu pages 带来 7 家净新增 evidence。

结论：

- sitemap 是有效补充；
- 但边际收益明显低于 retained promotional mining；
- 当前 `3 child sitemap / 3 menu pages per restaurant` 应保持 bounded；
- 不为了数字继续无限扩大 sitemap 深度。

后续幂等 run 只新增了少量新的 URL-level `source_menu_text`，最终 restaurant coverage 没继续膨胀，说明 monotonic dedupe 正常工作。

## 7. 最终 public / evidence 状态

最终稳定 public runtime：

- named restaurants：**1,415**；
- `recommendedDishes` known：**217**；
- `featuredDishes` known：**384**；
- 至少有一个中文规范化菜品字段：**440 / 1,415 = 31.1%**；
- unfilled dish rows：**975**；
- approximate recommendations：**0**；
- generic fallback：**false**。

与本轮开始相比：

- recommended：202 -> **217**，+15；
- featured：282 -> **384**，+102；
- Chinese dish display：337 -> **440**，+103；
- coverage：23.8% -> **31.1%**；
- recommendation gap：1,213 -> **1,198**。

最终 source-backed detail evidence：

- evidence restaurants：**430**；
- recommendation evidence restaurants：**192**；
- featured evidence restaurants：**373**；
- recommendation items：**349**；
- featured items：**829**。

Evidence class：

- `source_recommendation_text`：349；
- `retained_source_menu_item`：167；
- `provider_promotional_dish_text`：219；
- `source_menu_text`：443。

Provider item counts：

- sourceWebsite：738；
- Hot Pepper：273；
- official：89；
- Tabelog：78。

## 8. 当前 recommendation-first bulk queue

当前 recommendation gap：**1,198**。

工作 lane：

- `official_crawl`：218；
- `retained_source_mining`：633；
- `independent_source_discovery`：347；
- `official_or_retained_featured`：56。

总 dish work rows：**1,254**。

8-shard totals：

- shard 0：156；
- shard 1：175；
- shard 2：179；
- shard 3：155；
- shard 4：159；
- shard 5：152；
- shard 6：126；
- shard 7：152。

稳定 FNV-1a Place-ID sharding 继续适合作为后续大批量 worker 基础。

## 9. SQLite canonical validation

最终自动 handoff run：

`34183891175`

Collector 最终生成 bot data commit：

`cac628cb695faf6042c20c439ea04b8ad38dcad2`

Reusable database contract 明确执行：

`Sync latest main for reusable handoff`

并将：

`DATABASE_CONTRACT_VALIDATED_SHA=cac628cb695faf6042c20c439ea04b8ad38dcad2`

写入验证环境，因此本次 DB contract 确实验证了 collector 推送后的最新 evidence，而不是调用 workflow 的旧事件 SHA。

最终 SQLite dish metrics：

- phase2 dish evidence：**1,178 items**；
  - recommended：349；
  - featured：829；
- accepted recommendation evidence：**341**；
- accepted featured evidence：**807**；
- accepted semantic + Chinese canonicalization：**1,148**；
- accepted with source-original：**1,148 / 1,148**；
- identity-conflict evidence：8；
- identity-not-publishable evidence：22；
- canonical `recommended_dishes.zh`：**186 places / 318 items**；
- canonical `featured_dishes.zh`：**364 places / 719 items**；
- `dishSemanticReviewPlaces`：**0**；
- validator failures：**0**。

相比本轮前 SQLite 基线：

- recommended canonical places：170 -> **186**，+16；
- featured canonical places：261 -> **364**，+103。

Database repeat-build idempotency：pass。

Backup/restore：pass。

Shadow export：pass。

Database smoke artifact：

- artifact ID：`10039868621`；
- zip SHA256：`85aba99a9fc186f57a8be519653ecbf24d3109716b95aa92b989158340a71046`。

Legacy `docs/database/validate_schema.py` 的 audited-snapshot assertion 仍是 warning-only / `continue-on-error` 的历史 prototype 检查，不代表 persistent SQLite contract 失败；正式 DB job 最终为 success。

## 10. 修复 collector -> SQLite 自动验证闭环

### 问题

Dish collector 使用 workflow `GITHUB_TOKEN` 将 generated evidence commit 推回 main。GitHub 会抑制这类 token push 递归触发其他 workflows，因此不能假设 bot data commit 自动触发 `database-contract.yml`。

### 第一版 reusable handoff

将 `.github/workflows/database-contract.yml` 增加：

`workflow_call`

并从 `.github/workflows/collect-google-inventory-details.yml` 增加：

`validate_database -> uses: ./.github/workflows/database-contract.yml`

对应 commits：

- `9d1a7310da9f99aff96ef00257b8cd8056d50e13` — reusable database contract；
- `3b5ef344140bde0aad60c9c222f9f06d89f31f9c` — collector -> database validation handoff。

### 第一版条件 bug

最初同步条件写成：

```yaml
if: ${{ github.event_name == 'workflow_call' && inputs.sync_main == true }}
```

实际 reusable workflow 中 `github.event_name` 会继承 caller 的 `push`，因此同步步骤被跳过。

这个问题在测试 run `34183687936` 中被发现，没有忽略。

### 修复

条件改成只检查显式 input：

```yaml
if: ${{ inputs.sync_main == true }}
```

Commit：

`3f9ee6eb04251da40fb3c3de075ead26310abca6`

随后用 collector commit：

`271b7b9b078fba0faf4640fec1485065ac011623`

重新实际跑完整链。

### 最终机械验证

Run `34183891175`：

- `collect`：success；
- `validate_database / validate`：success；
- `Sync latest main for reusable handoff`：**success**；
- validated SHA：**cac628cb695faf6042c20c439ea04b8ad38dcad2**。

因此现在 bulk dish pipeline 已形成：

```text
retained source mining
        +
bound official crawl
        +
bounded official sitemap discovery
        ↓
R/F semantic evidence
        ↓
monotonic central merge
        ↓
public runtime + queue + 8-shard plan
        ↓
bot generated-data commit
        ↓
reusable database contract
        ↓
fetch latest main
        ↓
SQLite canonical zh resolution
        ↓
idempotency + backup/restore + shadow export validation
```

这条链已经不是设计稿，而是实际 workflow success 验证过的自动闭环。

## 11. 后续开发方向

按收益/风险排序：

1. **继续 retained-source mining**：633 家仍是最大已知来源队列，应优先寻找仓库中尚未消费的真实 provider 文本字段；
2. **official crawl 218 家**：继续用当前 bounded HTML/menu extractor，不扩大 R 上下文窗口；
3. **independent source discovery 347 家**：这是下一阶段真正需要增加免费来源发现策略的部分，但 identity binding 必须独立审查，不能仅凭名称/距离；
4. sitemap 保持当前深度，不继续扩大 crawler breadth 只为提高数字；
5. Tabelog GitHub-hosted runner 自动抓取继续保持 manual-only；
6. translation-pending 两条继续保持未强制翻译状态；
7. 所有后续 bulk collector 已可自动接力 SQLite validation，不再依赖额外人工文档 commit。

## 12. 安全与回归结论

本轮最终确认：

- paid Google data API：**0**；
- approximate recommendation：**0**；
- generic dish fallback：**false**；
- recommendation semantic boundary 未放松；
- ordinary menu/promotional mention 不冒充推荐菜；
- source-original 全量保留；
- identity pipeline 未被 dish pipeline 改写；
- frozen 2,804 Place-ID catalog 未改变；
- Pages runtime 保持 1,415 named rows；
- bulk collector 与 SQLite validation 已自动闭环。
