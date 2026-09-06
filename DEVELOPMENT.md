# Eat Development Plan

Updated: 2026-09-06

## Current state

`TOKYO / 地区1️⃣` has completed the expensive restaurant-list/identity capture stage. The frozen historical Area1 snapshot remains **2,804** exact Google Place IDs and must not be recollected with paid Google APIs.

Current audited canonical state:

- frozen historical inventory: **2,804**;
- canonical production: **656**;
- production inside frozen inventory: **653**;
- inventory-only legacy IDs: **2,151**;
- usable maintained source indexed: **446 / 656 (68.0%)**;
- current source outcomes accounted for: **484 / 656 (73.8%)**;
- unresolved current source queue: **172**;
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

Three non-canonical runtime overlays now preserve useful information without weakening the compact filtering schema:

- public source provenance: **446 production identities / 606 concrete source URLs**;
- provider-level source facts: **446 production identities / 537 provider fact records**;
- reviewed Hot Pepper maximum non-image rich metadata: **135 production identities**.

`DATA_ENRICHMENT_PROGRESS.md` is the numeric progress report. `PRICE_ENRICHMENT.md` defines meal-price evidence and resolver policy. `HOTPEPPER_ENRICHMENT.md` documents the authorized Hot Pepper path. `DATA_SCHEMA.md` is the runtime-field contract.

## Primary objective

Restaurant discovery is no longer the main problem.

Optimize:

> trustworthy useful fields completed per authorized/free request, source fetch and review minute for the already-known Area1 identities.

Current priority:

1. **P0** — identity/source binding, currentness, name, address/coordinates, cuisine;
2. **P1** — lunch and dinner price evidence resolved independently;
3. **P2** — normalized hours, regular closure, source URLs and practical branch metadata;
4. **P3** — access/station, capacity, service/amenity fields, payment methods, source classifications, provider-level raw facts, representative dishes and strict recommendations.

Do not return to large-scale paid restaurant discovery unless a later measured recall audit demonstrates a material gap in the frozen 2,804-ID universe.

## Billable API prohibition

Repository maintenance must not execute billable Google place/search/map data APIs.

- no live Google Places / Area Insights / Text Search / Place Details;
- no paid place/search fallback;
- no Google API key injected into Pages;
- historical Place IDs/QC are frozen compatibility inputs only;
- retired paid scripts remain fail-closed;
- CI runs `scripts/audit_no_paid_apis.mjs` and currently reports zero hits.

Ordinary external Google Maps links may remain as navigation links. Ordinary web/search can be used selectively to discover an underlying official/permitted page, but search snippets are not durable factual evidence.

## Hot Pepper structured enrichment

The project owner states that this project is non-commercial and the intended Hot Pepper API usage has separate authorization/confirmation. The repository uses that project-specific authorization assumption.

The real benchmark completed successfully in Actions run `34030943605`:

- 2 km geographic superset: **2,743** Hot Pepper shops;
- exact <=1.2 km crop: **870**;
- high matches: **499**;
- medium matches: **36**;
- high/medium detail-eligible bindings: **535**;
- detail retrieval: **535 / 535** in **27** <=20-ID requests;
- strict-safe existing-production candidates: **128**.

After conflict/net-new reconciliation, the durable additive shard contains **94** source rows with:

- address claims: **55**;
- cuisine claims: **22**;
- dinner-budget claims: **84**;
- hours raw claims: **73**;
- closure claims: **73**.

Measured Hot Pepper canonical gains against the no-Hot-Pepper baseline:

- any meal budget: **+81 restaurants**;
- dinner budget: **+84**;
- address: **+55**;
- cuisine: **+22**;
- normalized hours: **+72**;
- existing lunch values overwritten: **0**;
- protected stronger values overwritten: **0**.

The core promotion workflow is manual-only and idempotent. Ordinary pushes do not consume Hot Pepper requests.

## Maximum non-image rich metadata layer

Canonical filtering fields are deliberately conservative, but Hot Pepper contains many useful source-native facts that should not be discarded. `data/hotpepper_rich_metadata.js` is therefore a non-core overlay loaded after the generic evidence overlays.

The focused collector `scripts/collect_hotpepper_rich_details.py` **does not repeat geographic discovery or identity matching**. It fetches only reviewed current-production Hot Pepper IDs in batches of <=20.

The final maximum non-image refresh is Actions run `34035124635`:

- automatic strict-safe bindings: **128**;
- manually reviewed exact rich-only bindings: **7**;
- total selected: **135**;
- detail requests: **7**;
- returned: **135 / 135**;
- missing: **0**;
- geographic discovery repeated: **no**;
- identity matching repeated: **no**;
- optional response blocks: `credit_card` + `special`;
- photos/logo persisted: **no**.

The seven manual exceptions are stored in `data/hotpepper_manual_rich_bindings.json` and are explicitly **rich-metadata-only**. Six other near-coordinate but wrong-shop pairs were reviewed and rejected, preventing neighboring businesses from contaminating data.

For all 135 reviewed rows the overlay preserves, where supplied:

- Hot Pepper source-native ID, source shop name and kana;
- source address and coordinates;
- five-level Hot Pepper service/area hierarchy;
- raw genre/sub-genre and raw budget object;
- nearest station;
- full and mobile access text;
- lunch-availability signal;
- seats/capacity and party capacity;
- source catch copy and budget memo;
- raw opening/closure text;
- Hot Pepper shop URL and coupon URL;
- mobile-coupon availability and raw provider value;
- accepted credit-card brands;
- Hot Pepper `special` feature/category labels;
- normalized amenity flags plus original provider text.

Measured maximum-field coverage:

- source name / kana / address / coordinates: **135 / 135**;
- raw genre / raw budget / Hot Pepper area hierarchy: **135 / 135**;
- nearest station / access / mobile access: **135 / 135**;
- lunch availability / capacity: **135 / 135**;
- party capacity: **109 / 135**;
- budget memo: **66 / 135**;
- source catch: **114 / 135**;
- raw opening / closure: **135 / 135**;
- shop URL / coupon URL: **135 / 135**;
- mobile coupon status: **135 / 135**;
- credit-card brand list: **119 / 135**, **593 card-brand records**;
- special feature list: **40 / 135**, **160 feature records**;
- raw Wi-Fi text: **135 / 135**;
- unambiguous `wifiAvailable`: **107 / 135**;
- wedding text: **58 / 135**;
- course status: **123 / 135**;
- other-equipment memo: **48 / 135**;
- shop-detail memo: **52 / 135**.

High-coverage service fields include all-you-can-drink/eat, private room, card, smoking policy, charter, parking, barrier-free, English menu, children, pets, late-night, karaoke, TV/projector, live show, band performance, tatami and horigotatsu. Raw source text is preserved even when a safe boolean cannot be inferred.

A zero-value handling bug found after the maximum refresh was fixed without another API call: Hot Pepper `ktai_coupon=0` is a valid value, so the common text normalizer now preserves numeric zero. The overlay was rebuilt from run `34035124635` in artifact-only run `34035237312`, raising normalized mobile-coupon coverage from **97 -> 135** while keeping the original 7 API requests as the only network work for this final refresh.

The rich overlay **never creates a production identity and never overwrites canonical name/address/cuisine/budget/hours**.

`.github/workflows/hotpepper-rich-refresh.yml` is manual-only because it calls the authorized Hot Pepper API. `.github/workflows/promote-hotpepper-rich-metadata.yml` is also manual-only and rebuilds from retained run `34035124635` without Hot Pepper requests.

## Public source provenance layer

`scripts/build_source_provenance.mjs` converts maintained `sourceRefs` into `data/source_provenance.js`.

Current result:

- production rows with public source links: **446 / 656**;
- concrete public HTTPS source links: **606**;
- rows with explicit claimed fields: **446**;
- rows with a source check date: **446**;
- provider reach: Tabelog **322**, Hot Pepper **94**, official **145** (overlapping sets).

Each attached restaurant can retain:

```text
sourceLinks[]        -> provider + URL + claimed fields + checkedAt
sourceClaimedFields  -> union of fields supported by maintained refs
sourceLastCheckedAt  -> latest maintained evidence date
```

Google-source references are excluded. The provenance overlay is generated from maintained repository evidence and makes **zero external API calls**.

## Provider-level source facts layer

Canonical selection intentionally keeps one final value per field. That is correct for filtering but loses useful source-specific alternatives/conflicts. `scripts/build_source_facts.mjs` now preserves those maintained provider facts in `data/source_facts.js` without changing the canonical row.

The one-time promotion run `34035605238` built the overlay with **zero external/API requests**.

Current coverage:

- production identities with source facts: **446 / 656**;
- provider fact records: **537**;
- provider records: Tabelog **303**, official **140**, Hot Pepper **94**;
- unattached maintained source rows: **0**.

Retained provider-level field counts:

- source names: **537**;
- cuisine: **274**;
- tags: **267**;
- lunch ranges: **157**;
- dinner ranges: **254**;
- dishes: **111**;
- raw opening-hours text: **293**;
- regular closed-day arrays: **202**;
- closure notes: **156**;
- addresses: **235**;
- 百名店 facts/year/category: **17** each;
- reviewed price derivations: **2**;
- Hot Pepper source-native ID + match confidence + match score: **94** each.

Each production restaurant may now carry `sourceFacts[]`, one record per maintained provider. A provider fact retains its own `claimedFields` and `checkedAt`, plus only already-maintained source-specific values. Review text and Google response-content fields are excluded.

This layer allows later logic/UI/audits to compare provider evidence directly without re-reading maintenance shards and without silently averaging conflicts.

`.github/workflows/promote-source-facts.yml` is manual-only after the initial zero-network promotion.

## Independent meal-price architecture

`scripts/price_resolver.mjs` resolves `lunch` and `dinner` independently. One provider no longer owns both meal periods.

Valid example:

```text
Tabelog lunch + Hot Pepper dinner
```

Price claims require explicit provenance through `budget`, `lunchBudget` or `dinnerBudget`.

Pages and Hot Pepper promotion enforce `STRICT_PRICE_PROVENANCE=1`.

### Evidence classes

- **A / `explicit_range`** — explicit branch budget / average-spend range; hard-filter eligible;
- **B / `menu_derived`** — reviewed representative range derived from a sufficiently complete official menu; used only when no A-class range exists;
- **C / `sparse`** — one item/course/charge/promotion/search snippet; review/display only and never a hard restaurant budget.

Within equal A-class evidence, provider order is current official branch > Tabelog > authorized Hot Pepper > lower-priority maintained sources. Freshness breaks ties. Strong-source conflicts are not averaged silently.

## Official-menu-derived price rollout

`data/source_enrichment_zzzzpricepatches.js` is the reviewed B-class patch layer.

Landed records:

1. **神田たまごけん神保町店** — representative `[990,1490]` for lunch and dinner from reviewed current core-menu prices.
2. **シリ バラジ** — lunch `[800,1400]` from complete official lunch sets at 800 / 900 / 1400 yen.

Coverage moved:

```text
lunch 155 -> 157
dinner 253 -> 254
both 136 -> 137
any 272 -> 274
```

Strict provenance remains **0** and material strong-price conflicts remain **0**.

## Current enrichment queue

Global remaining gaps:

- lunch: **499**;
- dinner: **402**.

Among restaurants already carrying a usable maintained source:

- lunch gaps: **289**;
- dinner gaps: **192**.

High-value groups:

- Tabelog-linked lunch gaps: **167**;
- Hot Pepper-linked lunch gaps: **83**;
- Hot Pepper-linked dinner gaps: **1**;
- repeated official domains/brands such as Doutor, Tully's, Starbucks, C-United, Ginza Renoir and others.

The next phase must exhaust **existing-source extraction before broad new source discovery**.

## Execution order from here

1. Process existing exact official/Tabelog lunch gaps first.
2. Batch repeated official domains/brand menu templates.
3. Use the new `sourceFacts[]` layer to identify already-maintained alternative values and gaps before fetching anything new.
4. Expand structured rich metadata from already-bound official/Tabelog sources where stable fields exist.
5. Promote B-class menu-derived budgets only when multiple comparable current prices support a representative range and retain derivation inputs.
6. Keep single-item/cover-charge/promotion evidence C-class and out of hard filters.
7. Use ordinary web/search only after existing-source evidence is exhausted.
8. Keep OSM / Overture / Foursquare OS focused mainly on identity/address/category/currentness checks.
9. Continue the **172** unresolved source outcomes separately.
10. Keep medium/collision/inventory-only Hot Pepper matches review-only unless additional evidence supports production.
11. Add a source-native canonical identity key before scope expansion.

## Data integrity rules

- Missing or ambiguous data remains unknown.
- A weak source never overwrites a stronger maintained exact claim.
- Provider-level facts remain source-specific and are not silently merged into canonical fields.
- A price array without explicit field provenance is ignored and fails strict audit when stored in a source shard.
- B-class values must be reproducible from maintained evidence.
- C-class sparse prices never become restaurant budget bands.
- Raw schedule prose is not exposed as normalized hours unless safely parsed.
- Provider integer/enum value `0` is preserved as data, not treated as missing.
- Review text and paid Google response content are excluded from public fact overlays.
- Cross-source automatic matching generates candidates; one weak match never admits a new production identity.

## Runtime contract

The public product remains a static GitHub Pages application. Runtime data is loaded in layers:

```text
production_area1.js          canonical filter/recommendation facts
source_provenance.js         public evidence URLs and field lineage
source_facts.js              provider-level maintained facts
hotpepper_rich_metadata.js   maximum reviewed non-image Hot Pepper metadata
app.js                       product logic
```

Recommendation behavior remains: <=1,200m, current canonical production identities, cuisine/budget/distance filters, three distinct results when possible, cuisine-diversity preference, Web Crypto randomness, 百名店 weight 2.2 and no rating/review popularity ranking.

Embedded maps use Leaflet/OpenStreetMap. Hot Pepper photos/logo URLs are not ingested. The required Hot Pepper service credit remains on the public page.
