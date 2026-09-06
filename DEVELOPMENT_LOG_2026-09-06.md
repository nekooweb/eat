# Development Log — 2026-09-06

This log records the Area1 enrichment/data-architecture work completed on 2026-09-06. Numeric state should be read together with `DATA_ENRICHMENT_PROGRESS.md`; design rules are in `DEVELOPMENT.md`, `PRICE_ENRICHMENT.md`, `HOTPEPPER_ENRICHMENT.md` and `DATA_SCHEMA.md`.

## 1. Frozen identity inventory / paid-API shutdown

- Preserved the completed Area1 historical identity snapshot at **2,804 exact Google Place IDs**.
- Treated the successful full Google collection/retry as a one-time historical seed; no repeat paid collection is allowed.
- Kept Google Place IDs only as compatibility/identity keys.
- Enforced no billable Google place/search data APIs in active repository maintenance.
- Pages/CI runs `scripts/audit_no_paid_apis.mjs`; current audit reports zero active paid-data-API hits.
- Embedded runtime map path remains Leaflet/OpenStreetMap; ordinary external Google Maps navigation links are not API execution.

## 2. Hot Pepper architecture and real benchmark

Hot Pepper was promoted from an experimental possibility to the primary authorized structured enrichment layer under the project-owner authorization/non-commercial assumption.

Implemented:

- `scripts/collect_hotpepper_area1.py` — 2 km geographic collection, local <=1.2 km crop and <=20-ID detail batching;
- `scripts/match_hotpepper_inventory.py` — local matching against the frozen identity set using distance, normalized names, romanization, address/postal evidence and collision protection;
- `scripts/build_hotpepper_enrichment.py` — strict automatic-use gate and production candidate generation;
- `.github/workflows/hotpepper-enrichment.yml` — manual benchmark workflow;
- `HOTPEPPER_ENRICHMENT.md` — source/field/matching rules.

### Benchmark execution

Actions run `34030943605` completed the first valid real benchmark:

- 2 km geographic superset: **2,743** shops;
- exact <=1.2 km crop: **870**;
- matching seeds: **2,801**;
- high: **499**;
- medium: **36**;
- review: **2,019**;
- collision review: **65**;
- low: **176**;
- none: **6**;
- detail-eligible high/medium bindings: **535**;
- detail requests: **27** batches;
- detail rows returned: **535 / 535**.

The second strict gate retained **128** current-production candidates.

## 3. Hot Pepper additive reconciliation and production landing

The 128 strict-safe candidates were compared against existing production/official/Tabelog fields rather than blindly promoted.

Net-new candidates:

- address: **55**;
- cuisine: **22**;
- dinner budget: **84**;
- opening-hours raw evidence: **73**.

Price conflicts were compared; stronger existing official/Tabelog evidence was protected.

The promotion workflow was redesigned to be idempotent:

1. temporarily remove the previous Hot Pepper shard;
2. build a true no-Hot-Pepper baseline;
3. regenerate the complete additive shard from benchmark evidence;
4. rebuild production;
5. audit additive invariants;
6. commit only changed durable data.

It is now `workflow_dispatch` only, so ordinary pushes never consume Hot Pepper requests.

Actions run `34032406916` successfully produced the durable Hot Pepper shard:

- source rows: **94**;
- dinner-budget claims: **84**;
- address claims: **55**;
- cuisine claims: **22**;
- hours claims: **73**;
- closure claims: **73**;
- additive invariant violations: **0**.

Measured gains against the strict no-Hot-Pepper baseline:

- any price known: **+81 restaurants**;
- dinner price known: **+84**;
- address: **+55**;
- cuisine: **+22**;
- normalized opening hours: **+72**;
- existing lunch overwritten: **0**.

## 4. Lunch/dinner resolver split

The old builder effectively selected one budget source row for both meal periods. This prevented complementary evidence from being combined safely.

Added:

- `scripts/price_resolver.mjs`;
- `scripts/test_price_resolver.mjs`;
- integration into `scripts/build_production_dataset.mjs`.

New invariant:

```text
lunch and dinner are independent claims
```

A restaurant can therefore retain exact Tabelog lunch evidence while receiving an authorized Hot Pepper dinner range.

The three Hot Pepper dinner records initially deferred because lunch was already present were safely added after the split. This increased both-meal coverage without deleting lunch data.

## 5. Strict price provenance

Added `scripts/audit_price_resolution.mjs` and enabled `STRICT_PRICE_PROVENANCE=1` in Pages and Hot Pepper promotion.

A source-only stored `lunch`/`dinner` value must have a source ref claiming:

- `budget`;
- `lunchBudget`; or
- `dinnerBudget`.

### NARU correction

The migration exposed one unsupported legacy value:

- `JAZZ HOUSE NARU` stored `dinner:[3000,4999]`;
- its maintained official refs did not claim budget;
- current maintained official material supported music-charge/visit information, not a restaurant dinner-spend range.

The unsupported dinner value was removed rather than inventing provenance.

Result: strict unprovenanced stored meal-price count returned to **0**.

## 6. Price evidence classes

The resolver was extended to rank evidence strength before provider priority.

Implemented classes:

- **A / `explicit_range`** — explicit branch budget/average-spend range;
- **B / `menu_derived`** — reviewed representative range from a sufficiently complete official menu;
- **C / `sparse`** — one item/course/charge/promotion/search snippet; never enters canonical hard budget filtering.

Selection rule:

```text
A explicit evidence
  > B reviewed menu-derived evidence
  > C excluded from hard filtering
```

Within equal A-class evidence, provider priority is current official branch > Tabelog > authorized Hot Pepper > lower-priority maintained explicit sources.

Unit-test coverage was expanded to **13** resolver cases.

## 7. Meal-aware enrichment queue

`scripts/build_enrichment_queue.mjs` was changed from one generic `budget` gap to separate:

- `lunchBudget`;
- `dinnerBudget`.

Lunch is weighted highest because it is the dominant remaining deficit.

After Hot Pepper and before the first official-menu-derived rollout, strict coverage was:

- lunch **155**;
- dinner **253**;
- both **136**;
- either **272**.

## 8. First real official-menu-derived price landing

Created `data/source_enrichment_zzzzpricepatches.js` as the reviewed B-class price patch layer. The shard stores observed prices and derivation method so every B-class range is reproducible.

### 神田たまごけん神保町店

- Place ID: `ChIJ81Ua8xCMGGARMrzeHYIaVbg`;
- official current branch menu reviewed;
- representative core-menu observed prices: **990 / 990 / 990 / 1,150 / 1,490 yen**;
- seasonal/limited items excluded;
- landed lunch: **[990,1490]**;
- landed dinner: **[990,1490]**;
- evidence class: `menu_derived`.

### シリ バラジ

- Place ID: `ChIJe49KxxWMGGAR4qS4zBvOWr8`;
- official Suidobashi lunch menu reviewed;
- complete lunch sets: **800 / 900 / 1,400 yen**;
- landed lunch: **[800,1400]**;
- evidence class: `menu_derived`.

### CI compatibility correction

Intermediate Actions run `34032963339` failed in `coverage_report` because the first patch implementation assumed all audit tools loaded enrichment shards cumulatively. The canonical builder itself had already rebuilt successfully; the failure prevented deployment.

The shard was corrected to support both cumulative builder load and isolated audit load.

Fix commit: `5e52ee073d53089f4a090114682361ab7f96aed9`.

Actions run `34032998440` then passed build, all audits and Pages deployment.

## 9. Canonical state after price landing

- production: **656**;
- usable source indexed: **446 / 656**;
- source outcomes accounted for: **484 / 656**;
- unresolved source queue: **172**;
- cuisine known: **601**;
- address known: **323**;
- normalized opening hours: **359**;
- lunch known: **157**;
- dinner known: **254**;
- both meals known: **137**;
- either meal known: **274**;
- featured dishes: **129**;
- strict recommendations: **30**;
- 百名店: **22**;
- unprovenanced stored meal-price fields: **0**;
- material strong-price conflicts: **0**.

Price delta from the immediately previous strict baseline:

```text
lunch 155 -> 157 (+2)
dinner 253 -> 254 (+1)
both 136 -> 137 (+1)
any 272 -> 274 (+2)
```

Remaining price gaps:

- global lunch: **499**;
- global dinner: **402**;
- existing-source lunch: **289**;
- existing-source dinner: **192**;
- Tabelog-linked lunch: **167**;
- Hot Pepper-linked lunch: **83**;
- Hot Pepper-linked dinner: **1**.

## 10. Maximum-field Hot Pepper rich metadata layer

The next pass deliberately separated **field breadth** from canonical filtering safety. Many Hot Pepper fields are useful but should not be coerced into canonical price/hours/category fields.

Implemented:

- `scripts/collect_hotpepper_rich_details.py`;
- `scripts/build_hotpepper_rich_metadata.py`;
- `data/hotpepper_rich_metadata.js`;
- `.github/workflows/hotpepper-rich-refresh.yml`;
- `.github/workflows/promote-hotpepper-rich-metadata.yml`.

### First focused refresh

Actions run `34034176471` reused the already-reviewed strict bindings and fetched **128** current-production Hot Pepper shops in only **7** <=20-ID requests:

- 128 selected;
- 128 returned;
- 0 missing;
- no geographic discovery;
- no identity rematching;
- no Google paid API.

### Edge-binding manual review

There were 13 current-production Hot Pepper bindings outside the automatic rich gate. All 13 were reviewed rather than promoting by distance alone.

Seven were confirmed exact enough for rich metadata only:

1. 四川料理刀削麺 川府 神保町店;
2. YEBISU BAR 御茶ノ水店;
3. OTTIMO KITCHEN ワテラス店;
4. 細打うどん竹や;
5. アンテップ ケバブ;
6. お茶の水 鳥どり;
7. Bistro Liberté / リベルテ 神保町.

Six were explicitly rejected as different neighboring venues, including:

- 神田 たまには、 ↔ 神田 竹苑;
- 喫茶室ルノアール 水道橋西口店 ↔ ニュー神田屋;
- Starbucks 順天堂医院店 ↔ レストランヒルトップ;
- サラファン ↔ カレー屋 ばんび;
- ロイヤルホスト 神田神保町店 ↔ 錦和 神保町本店.

The allow/reject decision ledger is `data/hotpepper_manual_rich_bindings.json`. Manual approval cannot create an identity or overwrite canonical core fields.

### Final expanded rich refresh

Actions run `34034504592` refreshed the final reviewed set:

- automatic strict rows: **128**;
- manual reviewed rows: **7**;
- total: **135**;
- detail requests: **7**;
- returned: **135 / 135**;
- missing: **0**.

Measured field yield:

- name kana: **135**;
- station: **135**;
- access: **135**;
- mobile access: **135**;
- source address/coordinates: **135**;
- raw genre/sub-genre: **135**;
- raw budget object: **135**;
- capacity: **135**;
- party capacity: **109**;
- budget memo: **66**;
- source catch: **114**;
- lunch availability: **135**;
- raw opening/closure text: **135**;
- Hot Pepper shop URL: **135**;
- coupon URL: **135**;
- raw Wi-Fi/service text: **135**;
- wedding text: **58**;
- course status: **123**;
- other equipment memo: **48**;
- shop-detail memo: **52**.

Status text was also retained across all 135 for all-you-can-drink/eat, private room, horigotatsu, tatami, card, smoking, charter, parking, barrier-free, live show, karaoke, band, TV/projector, English menu, pet, child and late-night operation.

Normalized Wi-Fi is **107 / 135**, while raw Wi-Fi text remains **135 / 135**; ambiguous values are intentionally not guessed.

The runtime rich overlay is loaded after canonical production and does not overwrite canonical `name`, `address`, `cuisine`, `lunch`, `dinner` or normalized `openingHours`.

## 11. Public source provenance overlay

To make maintained evidence inspectable in runtime, added:

- `scripts/build_source_provenance.mjs`;
- `data/source_provenance.js`;
- `.github/workflows/promote-source-provenance.yml`;
- runtime loading before the rich metadata layer.

Measured output:

- production rows with concrete public source evidence: **446 / 656**;
- public HTTPS source links: **606**;
- rows with claimed-field lists: **446**;
- rows with source check dates: **446**;
- provider reach: Tabelog **322**, Hot Pepper **94**, official **145**.

The counts overlap across providers.

Each row now can expose:

```text
sourceLinks[]
sourceClaimedFields
sourceLastCheckedAt
```

Source links retain provider, concrete URL, claimed fields, check date, and price evidence/derivation metadata where present.

Google source refs are explicitly excluded from this public layer. It is generated from already-maintained repository evidence with **zero external API calls**.

Initial provenance generation itself succeeded immediately; a Pages attempt failed only because an inline YAML heredoc validator was indented incorrectly. That shell-only validation was replaced by `scripts/audit_runtime_overlays.mjs`.

## 12. Runtime overlay audit

Added `scripts/audit_runtime_overlays.mjs` to validate `production_area1.js`, `source_provenance.js` and `hotpepper_rich_metadata.js` together.

It fails on:

- unattached overlay rows;
- duplicate rich/provenance identity rows;
- rich row count different from 135;
- manual reviewed rich count different from 7;
- Google provider leakage into public provenance;
- runtime attachment count mismatches.

This keeps maximum field retention separate from canonical filtering safety.

## 13. Workflow safety finalization

Temporary self-push triggers used only to execute the initial one-time promotion steps were removed.

Final state:

- `.github/workflows/hotpepper-rich-refresh.yml` — **manual-only**, calls authorized Hot Pepper API;
- `.github/workflows/promote-hotpepper-rich-metadata.yml` — **manual-only**, rebuilds from successful rich artifact and explicit allowlist, no API call;
- `.github/workflows/promote-source-provenance.yml` — **manual-only**, rebuilds from repository source refs, no API call;
- existing core Hot Pepper benchmark/additive workflows remain manual-only.

Ordinary pushes therefore do not consume Hot Pepper requests or any paid Google data API.

## 14. Runtime data order

Pages now builds/deploys:

```text
production_area1.js
  -> source_provenance.js
  -> hotpepper_rich_metadata.js
  -> app.js
```

This preserves a strict separation:

- canonical layer = filter/recommendation truth;
- provenance layer = evidence and lineage;
- rich layer = useful provider-native facts.

## 15. Next implementation batch

1. Continue existing-source lunch extraction before broad discovery: **289** usable-source lunch gaps remain.
2. Batch repeated official domains/brand menus.
3. Extend rich structured metadata from already-bound official/Tabelog sources where stable fields exist.
4. Use B-class only with multiple comparable current official menu prices and store derivation evidence.
5. Keep single-item/charge/promotion evidence C-class and outside hard filters.
6. Continue the **172** unresolved source outcomes independently.
7. Keep medium/collision/inventory-only Hot Pepper matches review-only unless additional evidence supports production.
8. Do not re-run paid Google discovery.

## Files changed in the maximum-field pass

Rich data / matching review:

- `data/hotpepper_rich_metadata.js`
- `data/hotpepper_manual_rich_bindings.json`
- `scripts/collect_hotpepper_rich_details.py`
- `scripts/build_hotpepper_rich_metadata.py`

Provenance:

- `data/source_provenance.js`
- `scripts/build_source_provenance.mjs`
- `scripts/audit_runtime_overlays.mjs`

Workflows/runtime:

- `.github/workflows/hotpepper-rich-refresh.yml`
- `.github/workflows/promote-hotpepper-rich-metadata.yml`
- `.github/workflows/promote-source-provenance.yml`
- `.github/workflows/pages.yml`
- `index.html`

Documentation:

- `DEVELOPMENT.md`
- `DATA_ENRICHMENT_PROGRESS.md`
- `HOTPEPPER_ENRICHMENT.md`
- `DATA_SCHEMA.md`
- `DEVELOPMENT_LOG_2026-09-06.md`
