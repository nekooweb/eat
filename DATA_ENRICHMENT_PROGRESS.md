# Area1 Data Enrichment Progress

Updated: 2026-09-06

## Current audited baseline

`TOKYO / 地区1️⃣` keeps the confirmed **2,804-ID** Area1 snapshot as a frozen historical benchmark.

Canonical filtering/recommendation state remains:

- frozen exact inventory: **2,804 / 2,804**;
- canonical production: **656**;
- production inside inventory: **653**;
- legacy inventory-only IDs: **2,151**;
- current usable source indexed: **446 / 656 (68.0%)**;
- current explicit source resolutions: **38**;
- superseded historical resolutions: **6**;
- source outcomes currently accounted for: **484 / 656 (73.8%)**;
- unresolved production source queue: **172**;
- cuisine known: **601**;
- address known: **323**;
- normalized opening hours: **359**;
- any meal budget known: **274**;
- lunch budget known: **157**;
- dinner budget known: **254**;
- both meal budgets known: **137**;
- featured dishes: **129**;
- strict recommendations: **30**;
- 百名店: **22**;
- unprovenanced stored meal-price fields: **0**.

The runtime evidence/rich layers increase **field breadth** without changing these canonical selection counts.

## Hot Pepper benchmark and canonical landing

Real Area1 benchmark run: `34030943605`.

- 2 km Hot Pepper superset: **2,743** shops;
- exact <=1.2 km crop: **870**;
- high: **499**;
- medium: **36**;
- review: **2,019**;
- collision review: **65**;
- low: **176**;
- none: **6**;
- high/medium detail-eligible: **535**;
- detail retrieval: **535 / 535** in **27** <=20-ID requests;
- strict-safe existing-production candidates: **128**.

The durable additive shard has **94** source rows with:

- address claims: **55**;
- cuisine claims: **22**;
- dinner-budget claims: **84**;
- hours raw claims: **73**;
- closure claims: **73**.

Measured canonical Hot Pepper gains:

- restaurants with any known budget: **+81**;
- dinner prices: **+84**;
- address: **+55**;
- cuisine: **+22**;
- normalized opening hours: **+72**;
- existing lunch prices overwritten: **0**;
- protected stronger values overwritten: **0**;
- additive invariant violations: **0**.

## Maximum non-image Hot Pepper metadata

Final focused maximum refresh: Actions run **`34035124635`**.

- strict automatic bindings: **128**;
- manually reviewed exact exceptions: **7**;
- total reviewed rich rows: **135**;
- API requests: **7**;
- returned: **135 / 135**;
- missing: **0**;
- geographic discovery repeated: **no**;
- identity matching repeated: **no**;
- optional response blocks: `credit_card + special`;
- photos/logo persisted: **no**.

The manual review inspected all 13 current-production bindings outside the automatic rich gate. Seven exact shops were approved for rich metadata only; six neighboring/different businesses were explicitly rejected. The ledger is `data/hotpepper_manual_rich_bindings.json`.

### Rich field coverage

For the 135 reviewed rows:

- source name / kana / address / coordinates: **135 / 135**;
- Hot Pepper area hierarchy: **135 / 135**;
- raw genre/sub-genre and raw budget: **135 / 135**;
- nearest station / access / mobile access: **135 / 135**;
- lunch availability / capacity: **135 / 135**;
- party capacity: **109 / 135**;
- budget memo: **66 / 135**;
- source catch: **114 / 135**;
- raw opening/closure: **135 / 135**;
- shop URL / coupon URL: **135 / 135**;
- mobile coupon status: **135 / 135**;
- accepted credit-card brands: **119 restaurants / 593 entries**;
- Hot Pepper special features: **40 restaurants / 160 entries**;
- raw service metadata: **135 / 135**;
- raw Wi-Fi: **135 / 135**;
- unambiguous `wifiAvailable`: **107 / 135**;
- wedding text: **58 / 135**;
- course status: **123 / 135**;
- other-equipment memo: **48 / 135**;
- shop-detail memo: **52 / 135**.

Status text is retained for all 135 rows for all-you-can-drink/eat, private room, horigotatsu, tatami, card, smoking, charter, parking, barrier-free, live show, karaoke, band, TV/projector, English menu, pets, children and late-night operation.

A post-refresh normalizer bug treating numeric `ktai_coupon=0` as empty was fixed. Artifact-only rebuild run **`34035237312`** reused the successful refresh artifact, made **no Hot Pepper API request**, and increased mobile-coupon/raw-enum coverage **97 -> 135**.

## Public source provenance overlay

`data/source_provenance.js` materializes maintained evidence links and field lineage.

- production rows with concrete public source links: **446 / 656**;
- total public HTTPS source links: **606**;
- rows with explicit claimed-field lists: **446**;
- rows with source check dates: **446**;
- provider reach: Tabelog **322**, Hot Pepper **94**, official **145**.

Provider reach overlaps. Google refs are excluded. Generation requires **zero external requests**.

Runtime fields:

- `sourceLinks`;
- `sourceClaimedFields`;
- `sourceLastCheckedAt`.

## Provider-level source facts overlay

To prevent canonical merging from discarding useful provider-specific facts, `scripts/build_source_facts.mjs` now materializes `data/source_facts.js`.

Initial zero-network promotion: Actions run **`34035605238`**.

Coverage:

- production identities with source facts: **446 / 656**;
- provider fact records: **537**;
- provider records: Tabelog **303**, official **140**, Hot Pepper **94**;
- unattached maintained source rows: **0**.

Provider-level retained field counts:

- source names: **537**;
- cuisine: **274**;
- tags: **267**;
- lunch ranges: **157**;
- dinner ranges: **254**;
- dishes: **111**;
- raw opening-hours text: **293**;
- regular closed-day arrays: **202**;
- closure notes: **156**;
- source addresses: **235**;
- 百名店 flag/year/category: **17 / 17 / 17**;
- reviewed price derivations: **2**;
- Hot Pepper native ID/match confidence/match score: **94 / 94 / 94**.

Every fact remains provider-specific in `sourceFacts[]`; it does not overwrite the canonical restaurant field. Each fact also retains its maintained `claimedFields` and `checkedAt`.

This layer uses only existing repository source shards, excludes review text and Google response-content fields, and makes **zero network/API requests**.

## Independent lunch / dinner resolver

`scripts/price_resolver.mjs` resolves `lunch` and `dinner` independently.

Price claims require explicit `budget`, `lunchBudget` or `dinnerBudget` provenance.

Evidence classes:

- A / `explicit_range` — explicit branch-specific budget/average-spend range;
- B / `menu_derived` — reviewed representative range from a sufficiently complete official menu;
- C / `sparse` — one item/course/charge/promotion/search snippet; excluded from hard filtering.

Evidence strength is evaluated before source priority.

## First B-class official-menu rollout

Two official-menu-derived records are live in `data/source_enrichment_zzzzpricepatches.js`:

- **神田たまごけん神保町店**: lunch/dinner **[990,1490]** from reviewed official core-menu prices;
- **シリ バラジ**: lunch **[800,1400]** from complete official lunch sets at 800/900/1,400 yen.

Measured canonical change:

```text
lunch 155 -> 157
dinner 253 -> 254
both 136 -> 137
any 272 -> 274
```

Strict provenance remains **0** and material strong-source conflicts remain **0**.

## Current remaining gaps

Global:

- lunch: **499**;
- dinner: **402**.

Among identities already carrying a usable maintained source:

- lunch: **289**;
- dinner: **192**.

High-yield existing-source groups:

- Tabelog-linked lunch: **167**;
- Hot Pepper-linked lunch: **83**;
- Hot Pepper-linked dinner: **1**;
- repeated official brand/domain groups such as Doutor, Tully's, Starbucks, C-United and Ginza Renoir.

## Next execution order

1. Use `sourceFacts[]` to exhaust already-maintained alternative/provider facts before fetching anything new.
2. Continue the **289 existing-source lunch gaps**, prioritizing exact official/Tabelog evidence.
3. Batch repeated official domains/brand menus.
4. Expand structured rich fields from already-bound official/Tabelog sources where stable fields exist.
5. Use B-class `menu_derived` only with multiple comparable official menu prices and reproducible derivation inputs.
6. Keep single-item/charge/promotion evidence C-class and out of hard filters.
7. Use ordinary web/search only after existing-source evidence is exhausted.
8. Continue OSM / Overture/open-source work mainly for identity/address/category/currentness.
9. Continue the **172** unresolved source outcomes.
10. Keep medium/collision/inventory-only Hot Pepper matches review-only unless additional evidence supports production.

## Data rules

- Historical Google Place IDs are compatibility keys, not an active paid provider.
- No paid Google place/search data API is executed by maintenance workflows.
- Missing or ambiguous fields remain unknown.
- Numeric/enum provider value `0` is preserved as data.
- Provider facts remain source-specific and never silently overwrite canonical fields.
- Strong-source conflicts are retained; ranges are not averaged.
- A source-only price requires explicit field provenance.
- B-class values must be reproducible from maintained evidence.
- C-class sparse prices never enter hard budget filters.
- Rich/raw fields may be preserved without being promoted into conservative canonical filters.
- Automatic cross-source matching creates candidates; one weak source never admits a new production identity.
