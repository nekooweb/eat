# Hot Pepper Area1 Enrichment

Updated: 2026-09-06

## Status

Hot Pepper Gourmet Web Service is a **first-class structured enrichment source**, but not the sole source of truth.

The successful real benchmark is GitHub Actions run `34030943605`.

Measured benchmark result:

- 2 km geographic superset: **2,743** shops;
- exact Area1 <=1.2 km crop: **870**;
- frozen historical inventory: **2,804** identities;
- usable matching seeds: **2,801**;
- high matches: **499**;
- medium matches: **36**;
- review matches: **2,019**;
- collision-review identities: **65**;
- low: **176**;
- none: **6**;
- high/medium detail-eligible bindings: **535**;
- Hot Pepper ID collisions: **30**;
- detail requests: **27** batches;
- detail rows returned: **535 / 535**;
- current production identities with a Hot Pepper binding: **141**;
- inventory-only bindings: **394**;
- strict-safe current-production candidates: **128**.

The 128 strict-safe candidates were reconciled against stronger/existing fields before durable canonical promotion. They were never treated as a blanket overwrite set.

A separate rich-metadata review retained **135** current-production Hot Pepper bindings: 128 automatic strict-safe + 7 manual exact pairs.

## Authorization and secrets

Project-owner guidance states that the project is non-commercial and the intended Hot Pepper API use is separately authorized/confirmed.

The API key remains in GitHub Actions secrets and is never committed or injected into Pages.

All workflows that actually call Hot Pepper are **manual-only**.

## Request architecture

### Geographic discovery

`scripts/collect_hotpepper_area1.py discover` requests a 2 km superset around Area1 with `range=4`, `count=100` pagination, then deduplicates IDs and performs the exact <=1.2 km Haversine crop locally.

The benchmark required **28** geographic pages.

### Local record linkage

`scripts/match_hotpepper_inventory.py` uses the already-paid historical matching seed plus current production and Hot Pepper rows. No new Google request occurs.

Matching uses:

- spatial blocking and exact distance;
- normalized Japanese/Latin names;
- Japanese -> Hepburn romanization;
- address/postal evidence;
- best-vs-second candidate margin;
- one-Hot-Pepper-ID collision protection.

### Detail batching

Bound IDs are fetched in batches of at most **20**. The real benchmark retrieved **535 IDs in 27 requests**.

Do not replace this with one request per restaurant.

### Automatic-use gate

`scripts/build_hotpepper_enrichment.py` applies a second strict gate.

Rules:

- medium matches remain review-only;
- collisions remain review-only;
- inventory-only matches remain binding-ledger/review data;
- only strict-safe high matches attached to existing production can generate automatic canonical field claims;
- one Hot Pepper match alone never creates a new production identity.

## Canonical net-new reconciliation

The 128 strict-safe candidate rows produced these net-new opportunities:

- address: **55**;
- cuisine: **22**;
- dinner budget: **84**;
- hours raw evidence: **73**.

Existing dinner values were compared first. Partial/disjoint conflicts backed by stronger official/Tabelog evidence were not overwritten.

## Current durable canonical additive shard

`data/source_enrichment_hotpepper.js` is regenerated idempotently against a true no-Hot-Pepper baseline.

Current durable rows: **94**.

Field claims:

- address: **55**;
- cuisine: **22**;
- dinner budget: **84**;
- hours raw: **73**;
- closure: **73**.

Measured canonical Hot Pepper gains:

- any meal budget: **+81 restaurants**;
- dinner budget: **+84**;
- address: **+55**;
- cuisine: **+22**;
- normalized hours: **+72**;
- existing lunch overwritten: **0**;
- protected stronger fields overwritten: **0**.

Promotion invariant violations: **0**.

## Maximum non-image rich metadata layer

The canonical additive shard is intentionally conservative and drops many useful provider-native fields. `data/hotpepper_rich_metadata.js` preserves those fields separately without changing canonical filter/recommendation facts.

### Focused reviewed refresh

`scripts/collect_hotpepper_rich_details.py` does not rediscover restaurants or rerun matching. It selects only reviewed current-production bindings and fetches source-native Hot Pepper IDs in <=20-ID batches.

The final maximum non-image refresh is Actions run **`34035124635`**:

- automatic strict-safe bindings: **128**;
- manual reviewed exact bindings: **7**;
- total selected: **135**;
- detail requests: **7**;
- returned: **135 / 135**;
- missing: **0**;
- optional response blocks requested: `credit_card + special`;
- geographic discovery repeated: **no**;
- identity matching repeated: **no**;
- photos/logo persisted: **no**.

This is much cheaper than rerunning the 28-page geographic discovery plus the 27-detail-request full benchmark.

### Manual edge review

There were 13 current-production bindings outside the automatic rich gate. Each was reviewed individually.

Seven exact shops were approved for **rich metadata only** and recorded in `data/hotpepper_manual_rich_bindings.json`:

- 四川料理刀削麺 川府 神保町店;
- YEBISU BAR 御茶ノ水店;
- OTTIMO KITCHEN ワテラス店;
- 細打うどん竹や;
- アンテップ ケバブ;
- お茶の水 鳥どり;
- Bistro Liberté / リベルテ 神保町.

Six near-coordinate but wrong-shop pairs were explicitly rejected. Examples include a Starbucks versus another venue in the same hospital complex and neighboring unrelated restaurants. This prevents proximity alone from contaminating rich data.

Manual approval does not authorize canonical identity creation or overwrite of core fields.

### Maximum retained fields

For all 135 reviewed rows, where supplied, the overlay retains:

- Hot Pepper ID and review mode (`strict_auto` / `manual_exact`);
- source shop name and name kana;
- source address and coordinates;
- Hot Pepper area hierarchy (`large_service_area`, `service_area`, `large_area`, `middle_area`, `small_area`);
- raw genre and sub-genre;
- raw provider budget object;
- nearest station;
- access text and mobile access text;
- lunch-availability signal;
- capacity/seats and party capacity;
- budget memo and source catch copy;
- raw opening-hours and closure text;
- Hot Pepper shop URL and coupon URL;
- mobile-coupon availability plus original enum value;
- accepted credit-card brands;
- Hot Pepper `special` feature/category entries;
- normalized service/amenity flags;
- raw provider service text for audit/detail display.

Measured final rich coverage:

- source name / kana / address / coordinates: **135 / 135**;
- Hot Pepper area hierarchy: **135 / 135**;
- raw genre / budget: **135 / 135**;
- station / access / mobile access: **135 / 135**;
- lunch availability / capacity: **135 / 135**;
- party capacity: **109 / 135**;
- budget memo: **66 / 135**;
- catch text: **114 / 135**;
- raw opening / closure: **135 / 135**;
- shop URL / coupon URL: **135 / 135**;
- mobile-coupon status: **135 / 135**;
- accepted credit cards: **119 restaurants**, **593 brand records**;
- Hot Pepper special features: **40 restaurants**, **160 feature records**;
- raw Wi-Fi text: **135 / 135**;
- unambiguous `wifiAvailable`: **107 / 135**;
- wedding text: **58 / 135**;
- course status: **123 / 135**;
- other-equipment memo: **48 / 135**;
- shop-detail memo: **52 / 135**.

The provider also returned status text for all 135 rows for all-you-can-drink/eat, private room, horigotatsu, tatami, card, smoking, charter, parking, barrier-free, live show, karaoke, band, TV/projector, English menu, pet, child and late-night operation.

Normalized Wi-Fi remains deliberately **107 / 135** because ambiguous provider strings stay unknown. Raw Wi-Fi text is preserved for all 135.

### Numeric-zero normalization correction

The first build after run `34035124635` exposed a generic normalizer bug: Hot Pepper `ktai_coupon=0` is valid data, but the old text helper treated numeric `0` as empty.

The common conversion now preserves numeric/enum zero. The rich overlay was then regenerated from the already-downloaded successful run artifact via **artifact-only promotion run `34035237312`**. That run made no Hot Pepper API request.

Result:

- `mobileCouponAvailable`: **97 -> 135**;
- raw `ktai_coupon`: **97 -> 135**;
- network work for the final maximum refresh remains **7 API requests total**.

### Rich-layer safety

`data/hotpepper_rich_metadata.js`:

- creates no production identity;
- overwrites no canonical name/address/cuisine/budget/hours;
- stores no Hot Pepper photos or logo URLs;
- preserves source-native/raw data separately;
- attaches only to exact reviewed current-production IDs at runtime.

`scripts/audit_runtime_overlays.mjs` validates attachment counts, duplicate IDs, the 128+7 review split and source-provenance isolation.

## Independent meal resolver

`scripts/price_resolver.mjs` resolves lunch and dinner independently. This safely permits:

```text
Tabelog lunch + Hot Pepper dinner
```

without either provider deleting the other meal period.

Hot Pepper contributes **84 A-class explicit dinner-budget claims**.

Current global price coverage after the subsequent official-menu-derived rollout is:

- lunch: **157 / 656**;
- dinner: **254 / 656**;
- both: **137 / 656**;
- either: **274 / 656**.

The difference from the earlier 155/253/136/272 state comes from reviewed official B-class menu-derived evidence, not additional Hot Pepper calls.

## Canonical field rules

### Name / address / identity

Hot Pepper ID is retained as a source-native alias. Safe exact-production bindings may contribute name/address evidence through the canonical additive shard.

### Cuisine

Use the most specific available Hot Pepper sub-genre/genre and map it into Eat's Chinese cuisine taxonomy while retaining the raw source classification in the rich layer.

### Dinner budget

Provider-defined finite intervals are promoted conservatively:

- `2001～3000円` -> `[2001,3000]`;
- `～2000円` -> `[0,2000]` when it is a provider-defined upper-cap range;
- lower-bound-only ranges are not forced into a finite `[min,max]` value.

Hot Pepper dinner budget is A-class `explicit_range` evidence.

`lunch=あり` proves only lunch availability and is never converted into a lunch price.

### Hours / closure

Hot Pepper `open`/`close` strings remain source evidence. Canonical weekly hours are emitted only when the conservative normalizer can safely parse them. The rich overlay may retain the raw text even when canonical normalization is impossible.

### Attribution

The public page includes:

`Powered by ホットペッパーグルメ Webサービス`

Hot Pepper images/logo URLs are intentionally not ingested.

## Multi-source price interaction

See `PRICE_ENRICHMENT.md`.

Price evidence classes:

- A `explicit_range` — explicit official/Tabelog/Hot Pepper budget;
- B `menu_derived` — reviewed representative official-menu range;
- C `sparse` — one item/course/charge/search snippet, review only.

Evidence class outranks provider. Therefore an A-class Tabelog/Hot Pepper range beats a B-class official menu derivation even though official is otherwise the higher-priority provider.

Google Places price fields remain prohibited because repository maintenance forbids billable Google Places calls.

## Current gap interpretation

Hot Pepper has largely solved a portion of the **dinner** problem, not lunch.

Current global gaps:

- lunch missing: **499**;
- dinner missing: **402**.

Among canonical Hot Pepper-linked production rows:

- lunch gaps: **83**;
- dinner gaps: **1**.

Across all production rows already carrying a usable maintained source:

- lunch gaps: **289**;
- dinner gaps: **192**.

The next canonical enrichment phase therefore prioritizes existing official/Tabelog lunch evidence rather than additional Hot Pepper geographic collection.

## Workflow safety

All Hot Pepper API workflows are manual-only. Temporary self-file push triggers used only to execute one-time connector-limited runs have been removed.

- `.github/workflows/hotpepper-enrichment.yml` — manual benchmark;
- `.github/workflows/promote-hotpepper-additive.yml` — manual additive rebuild/promotion;
- `.github/workflows/hotpepper-rich-refresh.yml` — manual focused rich API refresh;
- `.github/workflows/promote-hotpepper-rich-metadata.yml` — manual artifact-only rich rebuild.

The rich promotion workflow is pinned to successful maximum refresh artifact run `34035124635` plus the explicit manual allowlist. It makes **no Hot Pepper API request** itself.

Normal repository pushes therefore do not consume Hot Pepper requests.

## Historical runs

- `34030289095` — exposed the earlier `tee`/pipefail masking issue and empty secret;
- `34030342882` — correctly failed API-key preflight after fail-fast fixes;
- `34030943605` — first fully successful real benchmark;
- `34032406916` — successful idempotent meal-aware promotion, producing the durable 94-row / 84-dinner-claim shard;
- `34034176471` — first focused 128-row rich detail refresh, 7 requests / 128 returned;
- `34034504592` — expanded reviewed rich refresh, 7 requests / 135 returned;
- `34035124635` — final **maximum non-image** rich refresh with `credit_card + special`, **7 requests / 135 returned / 0 missing**;
- `34035237312` — artifact-only rebuild after numeric-zero fix; no API request.

All active pipelines validate required outputs and make no paid Google data API calls.
