# Development Log — 2026-09-06

This log records the Area1 data/enrichment architecture completed on 2026-09-06. Numeric status is summarized in `DATA_ENRICHMENT_PROGRESS.md`; durable rules are in `DEVELOPMENT.md`, `PRICE_ENRICHMENT.md`, `HOTPEPPER_ENRICHMENT.md` and `DATA_SCHEMA.md`.

## 1. Frozen identity inventory and paid-API shutdown

- Preserved the completed Area1 historical snapshot at **2,804 exact Google Place IDs**.
- The successful paid Google full collection/retry remains a one-time historical matching seed; it must not be repeated.
- Google Place IDs remain compatibility/identity keys, not an active maintained data source.
- Active repository maintenance forbids billable Google place/search APIs.
- `scripts/audit_no_paid_apis.mjs` is enforced in CI.
- Runtime map embeds remain Leaflet/OpenStreetMap; ordinary external Google Maps navigation links remain normal web links.

## 2. Hot Pepper real benchmark

Implemented:

- `scripts/collect_hotpepper_area1.py`;
- `scripts/match_hotpepper_inventory.py`;
- `scripts/build_hotpepper_enrichment.py`;
- `.github/workflows/hotpepper-enrichment.yml`.

Actions run **`34030943605`** completed the first valid authorized benchmark:

- 2 km geographic superset: **2,743** shops;
- exact <=1.2 km crop: **870**;
- matching seeds: **2,801**;
- high: **499**;
- medium: **36**;
- review: **2,019**;
- collision review: **65**;
- low: **176**;
- none: **6**;
- high/medium detail-eligible: **535**;
- detail requests: **27** <=20-ID batches;
- returned: **535 / 535**;
- strict-safe current-production candidates: **128**.

Earlier implementation-test runs `34030289095` and `34030342882` exposed/fixed the old `tee`/pipefail false-success behavior and missing-secret preflight.

## 3. Canonical Hot Pepper additive landing

The 128 strict-safe candidates were compared with maintained official/Tabelog/current values before promotion.

Net-new candidate fields:

- address: **55**;
- cuisine: **22**;
- dinner budget: **84**;
- opening-hours raw evidence: **73**.

Strong existing price conflicts were protected rather than overwritten.

Actions run **`34032406916`** produced the durable additive shard:

- source rows: **94**;
- address claims: **55**;
- cuisine claims: **22**;
- dinner-budget claims: **84**;
- hours raw claims: **73**;
- closure claims: **73**;
- additive invariant violations: **0**.

Measured canonical gains against the no-Hot-Pepper baseline:

- any known meal budget: **+81 restaurants**;
- dinner price: **+84**;
- address: **+55**;
- cuisine: **+22**;
- normalized hours: **+72**;
- existing lunch values overwritten: **0**.

## 4. Independent lunch/dinner price resolver

Added:

- `scripts/price_resolver.mjs`;
- `scripts/test_price_resolver.mjs`;
- independent meal-period integration into `scripts/build_production_dataset.mjs`.

New invariant:

```text
lunch and dinner resolve independently
```

This allows combinations such as exact Tabelog lunch + authorized Hot Pepper dinner without deleting either meal period.

Resolver tests were expanded to **13** cases.

## 5. Strict price provenance and evidence classes

Added `scripts/audit_price_resolution.mjs`; Pages and relevant promotion workflows use `STRICT_PRICE_PROVENANCE=1`.

A source-only stored price requires explicit `budget`, `lunchBudget` or `dinnerBudget` provenance.

Evidence classes:

- **A / `explicit_range`** — explicit branch budget/average-spend range;
- **B / `menu_derived`** — reviewed representative range from a sufficiently complete official menu;
- **C / `sparse`** — one item/course/charge/promotion/search snippet; never enters hard canonical budget filtering.

Evidence class is evaluated before provider priority.

### NARU correction

`JAZZ HOUSE NARU` had an old `dinner:[3000,4999]` value without maintained budget provenance. Existing official material supported music-charge/visit information, not a restaurant dinner-spend range. The unsupported value was removed instead of inventing provenance.

Current unprovenanced stored meal-price count: **0**.

## 6. Meal-aware enrichment queue

`scripts/build_enrichment_queue.mjs` now tracks `lunchBudget` and `dinnerBudget` separately.

After Hot Pepper and before B-class official-menu additions:

- lunch: **155**;
- dinner: **253**;
- both: **136**;
- either: **272**.

Lunch remains the dominant price deficit and receives higher queue priority.

## 7. First B-class official-menu-derived price landing

Created `data/source_enrichment_zzzzpricepatches.js` with reproducible observed prices and derivation metadata.

### 神田たまごけん神保町店

- exact Place ID: `ChIJ81Ua8xCMGGARMrzeHYIaVbg`;
- reviewed current official core menu;
- observed core prices: **990 / 990 / 990 / 1,150 / 1,490 yen**;
- seasonal/limited items excluded;
- lunch: **[990,1490]**;
- dinner: **[990,1490]**;
- class: `menu_derived`.

### シリ バラジ

- exact Place ID: `ChIJe49KxxWMGGAR4qS4zBvOWr8`;
- reviewed official Suidobashi lunch menu;
- complete lunch sets: **800 / 900 / 1,400 yen**;
- lunch: **[800,1400]**;
- class: `menu_derived`.

Intermediate run `34032963339` exposed an isolated-shard audit compatibility problem; canonical build itself was valid but deploy was blocked. The shard was made compatible with cumulative builder load and isolated audit load. Run `34032998440` then passed build/audits/deploy.

Canonical price coverage after landing:

```text
lunch 155 -> 157
dinner 253 -> 254
both 136 -> 137
any 272 -> 274
```

## 8. Canonical state after price rollout

- production: **656**;
- usable maintained source indexed: **446 / 656**;
- source outcomes accounted: **484 / 656**;
- unresolved source queue: **172**;
- cuisine: **601**;
- address: **323**;
- normalized hours: **359**;
- lunch: **157**;
- dinner: **254**;
- both meal budgets: **137**;
- any meal budget: **274**;
- featured dishes: **129**;
- strict recommendations: **30**;
- 百名店: **22**;
- unprovenanced price fields: **0**;
- material strong-price conflicts: **0**.

Remaining price gaps:

- global lunch: **499**;
- global dinner: **402**;
- existing-source lunch: **289**;
- existing-source dinner: **192**;
- Tabelog-linked lunch: **167**;
- Hot Pepper-linked lunch: **83**;
- Hot Pepper-linked dinner: **1**.

## 9. Rich metadata architecture

To maximize field retention without weakening canonical filter rules, implemented a separate Hot Pepper runtime overlay:

- `scripts/collect_hotpepper_rich_details.py`;
- `scripts/build_hotpepper_rich_metadata.py`;
- `data/hotpepper_rich_metadata.js`;
- `.github/workflows/hotpepper-rich-refresh.yml`;
- `.github/workflows/promote-hotpepper-rich-metadata.yml`.

The collector does **not** rerun geographic discovery or identity matching; it fetches only reviewed current-production Hot Pepper IDs in <=20-ID batches.

## 10. Manual edge-binding review

There were 13 current-production Hot Pepper bindings outside the automatic rich gate. All were reviewed manually rather than promoted by coordinate proximity alone.

Seven were approved for **rich metadata only**:

1. 四川料理刀削麺 川府 神保町店;
2. YEBISU BAR 御茶ノ水店;
3. OTTIMO KITCHEN ワテラス店;
4. 細打うどん竹や;
5. アンテップ ケバブ;
6. お茶の水 鳥どり;
7. Bistro Liberté / リベルテ 神保町.

Six wrong-shop pairs were explicitly rejected, including neighboring businesses and a Starbucks versus another venue in the same hospital complex.

Allow/reject decisions are stored in `data/hotpepper_manual_rich_bindings.json`. Manual rich approval never creates a canonical identity or authorizes core-field overwrite.

## 11. First 135-row rich refresh

Run `34034504592` fetched the reviewed set:

- automatic strict rows: **128**;
- manual reviewed rows: **7**;
- total: **135**;
- requests: **7**;
- returned: **135 / 135**;
- missing: **0**.

It retained source name/kana, source address/coordinates, raw genre/budget, station/access, capacity, party capacity, budget memo, catch text, lunch availability, raw opening/closure text, URLs and broad service metadata.

## 12. Maximum non-image Hot Pepper refresh

The collector was extended to request the API's optional `credit_card + special` response blocks and retain remaining useful **non-image** source-native fields.

Final maximum refresh: Actions run **`34035124635`**.

Execution:

- selected reviewed bindings: **135**;
- strict auto: **128**;
- manual exact: **7**;
- requests: **7**;
- returned: **135 / 135**;
- missing: **0**;
- geographic discovery repeated: **no**;
- identity matching repeated: **no**;
- photos/logo persisted: **no**.

Maximum field coverage:

- source shop name: **135**;
- name kana: **135**;
- source address: **135**;
- source coordinates: **135**;
- five-level Hot Pepper area hierarchy: **135**;
- raw genre/sub-genre: **135**;
- raw budget object: **135**;
- nearest station: **135**;
- full access: **135**;
- mobile access: **135**;
- lunch availability: **135**;
- capacity: **135**;
- party capacity: **109**;
- budget memo: **66**;
- source catch: **114**;
- raw opening/closure text: **135**;
- Hot Pepper URL: **135**;
- coupon URL: **135**;
- raw service metadata: **135**;
- accepted credit-card brands: **119 restaurants / 593 records**;
- Hot Pepper special features: **40 restaurants / 160 records**;
- raw Wi-Fi text: **135**;
- unambiguous `wifiAvailable`: **107**;
- wedding text: **58**;
- course status: **123**;
- other-equipment memo: **48**;
- shop-detail memo: **52**.

Status text is retained for all 135 rows for all-you-can-drink/eat, private room, horigotatsu, tatami, card, smoking, charter, parking, barrier-free, live show, karaoke, band, TV/projector, English menu, pets, children and late-night operation.

## 13. Numeric-zero metadata correction

After the maximum refresh, a generic text normalizer bug was found: provider integer/enum `0` was treated as empty because the helper used `value or ''`.

Hot Pepper `ktai_coupon=0` is a legitimate value. The helper now checks only `None`, preserving numeric zero.

The overlay was rebuilt from the already-downloaded run `34035124635` artifact in **artifact-only promotion run `34035237312`**. No Hot Pepper API request was made during this rebuild.

Result:

- normalized mobile-coupon coverage: **97 -> 135**;
- raw coupon enum coverage: **97 -> 135**;
- network work for the final maximum refresh remains only **7 API requests**.

Current `data/hotpepper_rich_metadata.js` is schemaVersion **6**.

## 14. Public source provenance overlay

Implemented:

- `scripts/build_source_provenance.mjs`;
- `data/source_provenance.js`;
- `.github/workflows/promote-source-provenance.yml`.

Measured result:

- production rows with concrete public source evidence: **446 / 656**;
- public HTTPS source links: **606**;
- rows with claimed-field lists: **446**;
- rows with source check dates: **446**;
- provider reach: Tabelog **322**, Hot Pepper **94**, official **145**.

Each row can expose:

```text
sourceLinks[]
sourceClaimedFields
sourceLastCheckedAt
```

Google provider refs are excluded. Provenance generation uses only maintained repository sourceRefs and makes **zero external requests**.

## 15. Runtime overlay and repository audits

Added `scripts/audit_runtime_overlays.mjs` to validate canonical production + provenance + rich metadata together.

It fails on:

- unattached overlay rows;
- duplicate rich/provenance IDs;
- rich row count != 135;
- manual-reviewed count != 7;
- Google provider leakage into public provenance;
- runtime attachment mismatches.

A later Pages run exposed a separate old assumption in `scripts/audit_repository.mjs`: it required the public page to load only the old canonical/app/effects scripts. The audit was upgraded to enforce the new safe layered order rather than reject legitimate overlays.

Required public local runtime order is now:

```text
production_area1.js
-> source_provenance.js
-> hotpepper_rich_metadata.js
-> app.js
-> effects.js
```

Maintenance enrichment/resolution shards remain forbidden as direct public dependencies.

## 16. Workflow safety finalization

Temporary self-file push triggers were used only where the connected GitHub tool could not dispatch a workflow directly. They were removed immediately after the required one-time run.

Final state:

- `hotpepper-enrichment.yml` — manual-only;
- `promote-hotpepper-additive.yml` — manual-only;
- `hotpepper-rich-refresh.yml` — **manual-only**, calls authorized Hot Pepper API;
- `promote-hotpepper-rich-metadata.yml` — **manual-only**, rebuilds from run `34035124635` artifact, no API call;
- `promote-source-provenance.yml` — manual-only, no API call.

Ordinary pushes therefore do not consume Hot Pepper requests and do not execute paid Google data APIs.

## 17. Runtime architecture after maximum-field pass

Pages deploys:

```text
production_area1.js        canonical filter/recommendation truth
source_provenance.js       evidence URLs + field lineage
hotpepper_rich_metadata.js maximum reviewed non-image source metadata
app.js                     product logic
```

This separation allows aggressive data retention while keeping canonical price/hours/category filtering conservative.

## 18. Next implementation batch

1. Continue the **289 existing-source lunch gaps** before broad discovery.
2. Batch repeated official brand/domain menu extraction.
3. Extend structured rich metadata from already-bound official/Tabelog sources where stable fields exist.
4. Use B-class `menu_derived` only with multiple comparable current official menu prices and reproducible derivation evidence.
5. Keep one-item/charge/promotion evidence C-class and outside hard budget filters.
6. Continue the **172** unresolved source outcomes separately.
7. Keep medium/collision/inventory-only Hot Pepper matches review-only unless additional evidence supports production.
8. Do not rerun paid Google discovery.

## Files added/changed in the maximum-field pass

Rich metadata:

- `data/hotpepper_rich_metadata.js`
- `data/hotpepper_manual_rich_bindings.json`
- `scripts/collect_hotpepper_rich_details.py`
- `scripts/build_hotpepper_rich_metadata.py`

Provenance/audits:

- `data/source_provenance.js`
- `scripts/build_source_provenance.mjs`
- `scripts/audit_runtime_overlays.mjs`
- `scripts/audit_repository.mjs`

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
