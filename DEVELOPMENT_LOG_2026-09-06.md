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
- detail-eligible high/medium: **535**;
- detail requests: **27** batches;
- returned: **535 / 535**;
- strict-safe current-production candidates: **128**.

Earlier test runs `34030289095` and `34030342882` exposed/fixed the old `tee`/pipefail false-success behavior and missing-secret preflight.

## 3. Canonical Hot Pepper additive landing

The 128 strict-safe candidates were compared with maintained official/Tabelog/current values before promotion.

Net-new candidate fields:

- address: **55**;
- cuisine: **22**;
- dinner budget: **84**;
- opening-hours raw evidence: **73**.

Actions run **`34032406916`** produced the durable additive shard:

- source rows: **94**;
- address claims: **55**;
- cuisine claims: **22**;
- dinner-budget claims: **84**;
- hours raw claims: **73**;
- closure claims: **73**;
- additive invariant violations: **0**.

Measured canonical gains:

- any meal budget: **+81 restaurants**;
- dinner price: **+84**;
- address: **+55**;
- cuisine: **+22**;
- normalized hours: **+72**;
- existing lunch overwritten: **0**.

## 4. Independent lunch/dinner price resolver

Added `scripts/price_resolver.mjs` and `scripts/test_price_resolver.mjs` and integrated per-meal resolution into the canonical builder.

New invariant:

```text
lunch and dinner resolve independently
```

This allows exact Tabelog lunch + authorized Hot Pepper dinner without deleting either meal period. Resolver tests were expanded to **13** cases.

## 5. Strict price provenance and evidence classes

Added `scripts/audit_price_resolution.mjs`; Pages and relevant promotion workflows use `STRICT_PRICE_PROVENANCE=1`.

A source-only price requires explicit `budget`, `lunchBudget` or `dinnerBudget` provenance.

Evidence classes:

- **A / `explicit_range`** — explicit branch budget/average-spend range;
- **B / `menu_derived`** — reviewed representative range from a sufficiently complete official menu;
- **C / `sparse`** — one item/course/charge/promotion/search snippet; never enters hard canonical budget filtering.

### NARU correction

`JAZZ HOUSE NARU` had an old `dinner:[3000,4999]` without maintained budget provenance. Existing official material supported music-charge/visit information rather than a restaurant dinner-spend range. The unsupported value was removed instead of inventing provenance.

Current unprovenanced stored meal-price count: **0**.

## 6. Meal-aware enrichment queue

`scripts/build_enrichment_queue.mjs` now tracks `lunchBudget` and `dinnerBudget` separately.

After Hot Pepper and before B-class official-menu additions:

- lunch **155**;
- dinner **253**;
- both **136**;
- either **272**.

Lunch remains the dominant price deficit.

## 7. First B-class official-menu-derived price landing

Created `data/source_enrichment_zzzzpricepatches.js` with reproducible observed prices and derivation metadata.

### 神田たまごけん神保町店

- Place ID `ChIJ81Ua8xCMGGARMrzeHYIaVbg`;
- reviewed official core-menu prices: **990 / 990 / 990 / 1,150 / 1,490 yen**;
- lunch **[990,1490]**;
- dinner **[990,1490]**;
- class `menu_derived`.

### シリ バラジ

- Place ID `ChIJe49KxxWMGGAR4qS4zBvOWr8`;
- official complete lunch sets: **800 / 900 / 1,400 yen**;
- lunch **[800,1400]**;
- class `menu_derived`.

Intermediate run `34032963339` exposed isolated-shard audit compatibility; canonical build itself was valid. The patch loader was made compatible with cumulative builder and isolated audit modes. Run `34032998440` then passed build/audits/deploy.

Coverage moved:

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
- both: **137**;
- any meal budget: **274**;
- featured dishes: **129**;
- strict recommendations: **30**;
- 百名店: **22**;
- unprovenanced price fields: **0**;
- material strong-price conflicts: **0**.

Remaining price gaps:

- global lunch **499**;
- global dinner **402**;
- existing-source lunch **289**;
- existing-source dinner **192**;
- Tabelog-linked lunch **167**;
- Hot Pepper-linked lunch **83**;
- Hot Pepper-linked dinner **1**.

## 9. Rich metadata architecture

To maximize field retention without weakening canonical filters, implemented:

- `scripts/collect_hotpepper_rich_details.py`;
- `scripts/build_hotpepper_rich_metadata.py`;
- `data/hotpepper_rich_metadata.js`;
- `.github/workflows/hotpepper-rich-refresh.yml`;
- `.github/workflows/promote-hotpepper-rich-metadata.yml`.

The collector never reruns geographic discovery or identity matching; it fetches only reviewed production Hot Pepper IDs in <=20-ID batches.

## 10. Manual edge-binding review

There were 13 current-production bindings outside the automatic rich gate.

Seven were approved for **rich metadata only**:

1. 四川料理刀削麺 川府 神保町店;
2. YEBISU BAR 御茶ノ水店;
3. OTTIMO KITCHEN ワテラス店;
4. 細打うどん竹や;
5. アンテップ ケバブ;
6. お茶の水 鳥どり;
7. Bistro Liberté / リベルテ 神保町.

Six wrong-shop pairs were explicitly rejected, including neighboring businesses and a Starbucks versus another venue in the same hospital complex.

Allow/reject decisions are stored in `data/hotpepper_manual_rich_bindings.json`. Manual approval cannot create identities or overwrite canonical fields.

## 11. First 135-row rich refresh

Run `34034504592` fetched the reviewed set in **7** requests:

- strict auto **128**;
- manual exact **7**;
- total **135**;
- returned **135 / 135**;
- missing **0**.

It retained source name/kana, address/coordinates, genre/budget, station/access, capacity, party capacity, budget memo, catch text, lunch availability, raw opening/closure text, URLs and broad service metadata.

## 12. Maximum non-image Hot Pepper refresh

The collector was extended to request `credit_card + special` and retain the remaining useful non-image source-native fields.

Final refresh: **`34035124635`**.

- reviewed rows **135**;
- requests **7**;
- returned **135 / 135**;
- missing **0**;
- geographic discovery repeated **no**;
- identity matching repeated **no**;
- photos/logo persisted **no**.

Maximum field coverage:

- source name/kana/address/coordinates **135**;
- five-level Hot Pepper area hierarchy **135**;
- raw genre/sub-genre **135**;
- raw budget **135**;
- nearest station/access/mobile access **135**;
- lunch availability/capacity **135**;
- party capacity **109**;
- budget memo **66**;
- source catch **114**;
- raw opening/closure **135**;
- shop URL/coupon URL **135**;
- accepted credit-card brands **119 restaurants / 593 records**;
- special features **40 restaurants / 160 records**;
- raw Wi-Fi **135**;
- unambiguous `wifiAvailable` **107**;
- wedding text **58**;
- course status **123**;
- other-equipment memo **48**;
- shop-detail memo **52**.

## 13. Numeric-zero metadata correction

The final refresh exposed a generic text-normalizer bug: provider enum/integer `0` was treated as empty. Hot Pepper `ktai_coupon=0` is valid data.

The helper was changed to treat only `None` as absent. Artifact-only run **`34035237312`** rebuilt from run `34035124635` without another API request.

Result:

- normalized mobile coupon **97 -> 135**;
- raw coupon enum **97 -> 135**;
- final maximum refresh network cost remains **7 API requests**.

## 14. Public source provenance overlay

Implemented:

- `scripts/build_source_provenance.mjs`;
- `data/source_provenance.js`;
- `.github/workflows/promote-source-provenance.yml`.

Measured result:

- rows with concrete public source evidence: **446 / 656**;
- public HTTPS links: **606**;
- rows with claimed fields/check dates: **446**;
- provider reach: Tabelog **322**, Hot Pepper **94**, official **145**.

Runtime fields:

```text
sourceLinks[]
sourceClaimedFields
sourceLastCheckedAt
```

Google refs are excluded. Generation makes **zero external requests**.

## 15. Provider-level source facts preservation

Canonical merging intentionally chooses one final value, so useful provider-specific alternatives/conflicts were still being lost at runtime. Added:

- `scripts/build_source_facts.mjs`;
- `data/source_facts.js`;
- `.github/workflows/promote-source-facts.yml`.

One-time promotion run **`34035605238`** used only repository maintenance shards and made **zero external/API requests**.

Result:

- production identities with source facts: **446 / 656**;
- provider fact records: **537**;
- Tabelog records: **303**;
- official records: **140**;
- Hot Pepper records: **94**;
- unattached maintenance rows: **0**.

Retained provider-level fields:

- source names **537**;
- cuisine **274**;
- tags **267**;
- lunch **157**;
- dinner **254**;
- dishes **111**;
- raw opening-hours text **293**;
- closed-day arrays **202**;
- closure notes **156**;
- addresses **235**;
- 百名店 flag/year/category **17 / 17 / 17**;
- reviewed price derivations **2**;
- Hot Pepper native ID/match confidence/match score **94 / 94 / 94**.

Every record remains isolated by provider in `sourceFacts[]` and keeps its own `claimedFields` and `checkedAt`. Review text and Google response-content fields are excluded. The layer never changes canonical values.

## 16. Runtime overlay and repository audits

`scripts/audit_runtime_overlays.mjs` now validates canonical production plus provenance, provider facts and Hot Pepper rich metadata.

It fails on:

- unattached overlay rows;
- duplicate identity rows;
- rich count != 135 or manual count != 7;
- Google provider leakage into provenance;
- Google response-content leakage into source facts;
- summary/attachment count mismatches.

`scripts/audit_repository.mjs` enforces the public runtime order:

```text
production_area1.js
-> source_provenance.js
-> source_facts.js
-> hotpepper_rich_metadata.js
-> app.js
-> effects.js
```

Maintenance source shards remain forbidden as direct public dependencies.

## 17. Workflow safety finalization

Temporary self-file push triggers were used only where the connected GitHub tool could not dispatch workflows directly and were removed immediately after the required run.

Final state:

- `hotpepper-enrichment.yml` — manual-only;
- `promote-hotpepper-additive.yml` — manual-only;
- `hotpepper-rich-refresh.yml` — manual-only, authorized Hot Pepper API;
- `promote-hotpepper-rich-metadata.yml` — manual-only, artifact rebuild, no API;
- `promote-source-provenance.yml` — manual-only, no API;
- `promote-source-facts.yml` — manual-only, no API.

Ordinary pushes do not consume Hot Pepper requests and do not execute paid Google data APIs.

## 18. Runtime architecture after maximum-field pass

```text
production_area1.js          canonical filter/recommendation truth
source_provenance.js         evidence URLs + field lineage
source_facts.js              provider-level maintained facts
hotpepper_rich_metadata.js   maximum reviewed non-image Hot Pepper metadata
app.js                       product logic
```

This architecture preserves the maximum trustworthy field set while keeping canonical price/hours/category filtering conservative.

## 19. Next implementation batch

1. Use `sourceFacts[]` to exhaust existing source evidence before fetching anything new.
2. Continue the **289 existing-source lunch gaps**.
3. Batch repeated official brand/domain menu extraction.
4. Extend structured rich metadata from already-bound official/Tabelog sources where stable fields exist.
5. Use B-class only with multiple comparable official menu prices and reproducible derivation evidence.
6. Keep one-item/charge/promotion evidence C-class and outside hard filters.
7. Continue the **172** unresolved source outcomes separately.
8. Keep medium/collision/inventory-only Hot Pepper matches review-only without additional evidence.
9. Do not rerun paid Google discovery.

## Files added/changed in the maximum-field pass

Rich metadata:

- `data/hotpepper_rich_metadata.js`
- `data/hotpepper_manual_rich_bindings.json`
- `scripts/collect_hotpepper_rich_details.py`
- `scripts/build_hotpepper_rich_metadata.py`

Evidence/facts/audits:

- `data/source_provenance.js`
- `data/source_facts.js`
- `scripts/build_source_provenance.mjs`
- `scripts/build_source_facts.mjs`
- `scripts/audit_runtime_overlays.mjs`
- `scripts/audit_repository.mjs`

Workflows/runtime:

- `.github/workflows/hotpepper-rich-refresh.yml`
- `.github/workflows/promote-hotpepper-rich-metadata.yml`
- `.github/workflows/promote-source-provenance.yml`
- `.github/workflows/promote-source-facts.yml`
- `.github/workflows/pages.yml`
- `index.html`

Documentation:

- `DEVELOPMENT.md`
- `DATA_ENRICHMENT_PROGRESS.md`
- `HOTPEPPER_ENRICHMENT.md`
- `DATA_SCHEMA.md`
- `DEVELOPMENT_LOG_2026-09-06.md`
