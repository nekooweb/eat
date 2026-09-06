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

Two additional runtime overlays now preserve information that should not be forced into the compact canonical filtering schema:

- reviewed Hot Pepper rich metadata: **135 production identities**;
- public source provenance: **446 production identities / 606 concrete source URLs**.

`DATA_ENRICHMENT_PROGRESS.md` is the numeric progress report. `PRICE_ENRICHMENT.md` defines meal-price evidence and resolver policy. `HOTPEPPER_ENRICHMENT.md` documents the authorized Hot Pepper path. `DATA_SCHEMA.md` is the runtime-field contract.

## Primary objective

Restaurant discovery is no longer the main problem.

Optimize:

> trustworthy useful fields completed per authorized/free request, source fetch and review minute for the already-known Area1 identities.

Current priority:

1. **P0** — identity/source binding, currentness, name, address/coordinates, cuisine;
2. **P1** — lunch and dinner price evidence resolved independently;
3. **P2** — normalized hours, regular closure, source URLs and practical branch metadata;
4. **P3** — access/station, capacity, service/amenity fields, representative dishes and strict recommendations.

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

## Rich metadata layer

Canonical filtering fields are deliberately conservative, but the source contains many useful facts that should not be discarded. The repository therefore adds `data/hotpepper_rich_metadata.js` as a non-core overlay loaded after `production_area1.js`.

The focused refresh uses `scripts/collect_hotpepper_rich_details.py` and **does not repeat geographic discovery or identity matching**. It fetches reviewed source-native IDs in batches of <=20.

Actions run `34034504592` refreshed the final reviewed set in only **7 requests**:

- automatic strict-safe bindings: **128**;
- manually reviewed exact bindings: **7**;
- total rich rows: **135**;
- returned Hot Pepper rows: **135 / 135**;
- missing rows: **0**.

The seven manual exceptions are stored in `data/hotpepper_manual_rich_bindings.json` and are explicitly **rich-metadata-only**. Six other near-coordinate but wrong-shop pairs were reviewed and rejected, preventing neighboring businesses from contaminating data.

For all 135 reviewed rows the overlay preserves, where supplied:

- Hot Pepper source-native ID and source shop name;
- name kana;
- source address and source coordinates;
- raw genre/sub-genre and raw budget object;
- nearest station;
- full and mobile access text;
- lunch-availability signal;
- seats/capacity and party capacity;
- source catch copy and budget memo;
- raw opening/closure text;
- Hot Pepper shop URL and coupon URL;
- normalized amenity flags plus original provider text.

High-coverage service fields include all-you-can-drink/eat, private room, card, smoking policy, charter, parking, barrier-free, English menu, children, pets, late-night, karaoke, TV/projector, tatami and horigotatsu. Raw source text is preserved even when a safe boolean cannot be inferred; e.g. Wi-Fi raw text exists for all 135 while `wifiAvailable` is only set for **107** unambiguous rows.

The rich overlay **never creates a production identity and never overwrites canonical name/address/cuisine/budget/hours**. It is attached only after the canonical build.

`.github/workflows/hotpepper-rich-refresh.yml` is manual-only because it calls the authorized Hot Pepper API. `.github/workflows/promote-hotpepper-rich-metadata.yml` is also manual-only and can rebuild the overlay from the retained successful refresh artifact without API calls.

## Public source provenance layer

`scripts/build_source_provenance.mjs` converts maintained `sourceRefs` into a compact public runtime evidence overlay: `data/source_provenance.js`.

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

Google-source references are intentionally excluded from this public overlay. Historical Google IDs remain compatibility keys, not maintained evidence.

The provenance overlay is generated from already-maintained repository evidence and makes **zero external API calls**. `scripts/audit_runtime_overlays.mjs` proves that all rich/provenance rows attach to exact current production identities, contain no duplicate identity rows, and do not leak Google source refs.

## Independent meal-price architecture

`scripts/price_resolver.mjs` resolves `lunch` and `dinner` independently. One provider no longer owns both meal periods.

Valid example:

```text
Tabelog lunch + Hot Pepper dinner
```

Price claims require explicit provenance through one of:

- `budget`;
- `lunchBudget`;
- `dinnerBudget`.

Pages and the Hot Pepper promotion workflow enforce `STRICT_PRICE_PROVENANCE=1`.

### Evidence classes

Price evidence is ranked before provider priority:

- **A / `explicit_range`** — explicit branch budget / average-spend range; hard-filter eligible;
- **B / `menu_derived`** — reviewed representative range derived from a sufficiently complete official menu; used only when no A-class range exists;
- **C / `sparse`** — one item/course/charge/promotion/search snippet; review/display evidence only and never a hard restaurant budget.

Within equal A-class evidence, provider order is current official branch > Tabelog > authorized Hot Pepper > lower-priority maintained sources. Freshness breaks ties.

Strong-source conflicts are not averaged silently.

## Official-menu-derived price rollout

`data/source_enrichment_zzzzpricepatches.js` is the reviewed B-class patch layer. It augments an existing exact official binding during the canonical build and stores the derivation method/observed prices for auditability.

First landed records:

1. **神田たまごけん神保町店** — official current core-menu prices produce representative `[990,1490]` for lunch and dinner; seasonal/limited items are excluded.
2. **シリ バラジ** — official Suidobashi lunch menu lists complete lunch sets at 800 / 900 / 1400 yen, producing lunch `[800,1400]`.

These two reviewed additions moved strict coverage from:

```text
lunch 155 -> 157
dinner 253 -> 254
both 136 -> 137
any 272 -> 274
```

The strict provenance audit remains **0** and material strong-price conflicts remain **0** after this rollout.

## Current enrichment queue

The queue is meal-aware and generated by `scripts/build_enrichment_queue.mjs`.

Global remaining gaps:

- lunch: **499**;
- dinner: **402**.

Among restaurants that already have a usable maintained source:

- lunch gaps: **289**;
- dinner gaps: **192**.

High-value groups currently include:

- Tabelog-linked lunch gaps: **167**;
- Hot Pepper-linked lunch gaps: **83**;
- Hot Pepper-linked dinner gaps: **1**;
- repeated official domains/brands such as Doutor, Tully's, Starbucks, C-United, Ginza Renoir and others.

This means the next phase must exhaust **existing-source extraction before broad new source discovery**.

## Execution order from here

1. Process existing exact official/Tabelog lunch gaps first; lunch is the largest hard-filter deficit.
2. Batch repeated official domains/brand menu templates instead of fetching restaurants one by one.
3. Expand rich metadata from already-bound official/Tabelog sources where stable structured fields exist, without weakening canonical rules.
4. Promote an official menu-derived budget only when multiple comparable current prices support a representative range; mark it `menu_derived` and retain observed prices/derivation notes.
5. Keep single-item/cover-charge/promotion-only evidence as C-class and out of hard budget filters.
6. Review exact Tabelog bindings through permitted/reviewed workflows; do not copy review text.
7. Use ordinary web/search only for identities still lacking a usable underlying source after the existing-source queue is exhausted.
8. Keep OSM / Overture / Foursquare OS focused mainly on identity, address, category and currentness/conflict checks rather than restaurant prices.
9. Continue the **172** unresolved source outcomes independently of price completion.
10. Keep medium/collision/inventory-only Hot Pepper matches review-only unless additional evidence justifies a production decision.
11. Add a source-native canonical identity key before expanding beyond the current compatibility-ID architecture.

## Data integrity rules

- Missing or ambiguous data remains unknown.
- A weak source never overwrites a stronger maintained exact claim.
- A price array without explicit field provenance is ignored and fails strict audit when stored in a source shard.
- B-class menu-derived values must be reproducible from a maintained official page.
- C-class sparse prices never become restaurant budget bands.
- Raw schedule prose is not exposed as normalized hours unless the conservative normalizer can safely parse it.
- Rich source metadata is preserved separately instead of being coerced into canonical core fields.
- `recommendedDishes` requires explicit recommendation/popularity/signature evidence.
- `featuredDishes` may use broader reviewed source-backed representative items.
- Cross-source automatic matching generates candidates; one weak match never admits a new production identity.

## Runtime contract

The public product remains a static GitHub Pages application. Runtime data is loaded in layers:

```text
production_area1.js      canonical filter/recommendation facts
source_provenance.js     public evidence links and field lineage
hotpepper_rich_metadata.js practical rich source metadata
```

Recommendation behavior remains: <=1,200m, current canonical production identities, cuisine/budget/distance filters, three distinct results when possible, cuisine-diversity preference, Web Crypto randomness, 百名店 weight 2.2 and no rating/review popularity ranking.

Embedded maps use Leaflet/OpenStreetMap. Hot Pepper images are not ingested. The required Hot Pepper service credit remains on the public page.
