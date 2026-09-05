# Eat Development Plan

Updated: 2026-09-06

## Authoritative current state

`TOKYO / 地区1️⃣` is now in **production-field completion plus full 2,804-identity range accounting**.

The browser product, canonical builder, Google Place-ID identity gate, independent-source binding, hybrid maps, random-selection logic, voice/mascot feedback and CI/audit pipeline are already operational. Current development is data quality, field completeness and controlled identity-range expansion.

Latest validated maintenance state:

- exact Area1 Google identity inventory: **2,804 / 2,804**;
- canonical production: **648** unique Place IDs;
- production IDs inside exact inventory: **645**;
- usable Tabelog/official source-backed production: **397 / 648**;
- explicit terminal source resolutions: **44**;
- source outcomes accounted for: **441 / 648 = 68.1%**;
- unresolved current-production source queue: **207**;
- non-generic cuisine: **571 / 648**;
- budget known: **192 / 648**;
- address known: **261 / 648**;
- filter-ready normalized `openingHours`: **278 / 648**;
- strict `recommendedDishes`: **27 / 648**;
- public `featuredDishes`: **120 / 648**;
- 百名店: **22**.

The full-range maintenance ledger now accounts for all 2,804 exact inventory identities:

- `production`: **645** inventory IDs;
- `inventory_only`: **2,159**;
- production outside this exact inventory snapshot: **3**;
- first prioritized inventory expansion queue: **56 identities / 64 OSM candidate links**;
- untouched inventory-only identities after that first queue: **2,103**.

`DATA_ENRICHMENT_PROGRESS.md` is the detailed numeric/source progress report. Numbers in older historical log sections are not authoritative when they differ from this section.

## Approved development order

1. Continue filling useful durable fields for the current 648 production restaurants.
2. Finish source outcomes for remaining current-production identities.
3. Review the 56 existing-candidate full-range expansion identities.
4. Expand through the remaining 2,103 untouched inventory-only identities in bounded independent-source batches.
5. Apply the same normalized field contracts to every newly promoted identity.
6. Enable opening-hours runtime filtering only after a separate coverage/freshness review.

“Full range” means every identity in the 2,804-ID inventory receives an auditable maintenance outcome. It does **not** mean forcing all 2,804 IDs into public production.

## Canonical data contracts

The browser consumes `data/production_area1.js`. Source matching and normalization happen at build time in `scripts/build_production_dataset.mjs`.

### Opening hours

Canonical production uses only filter-ready weekly structure:

```js
openingHours: {
  timezone: 'Asia/Tokyo',
  days: {
    mon: [['11:30', '14:00'], ['17:00', '23:00']],
    tue: [['11:30', '14:00'], ['17:00', '23:00']],
    wed: []
  }
}
```

Semantics are fixed:

- missing day key = unknown;
- `[]` = explicitly closed;
- time-pair arrays = known opening periods;
- missing `openingHours` = no reliable filter-ready weekly schedule;
- timezone = `Asia/Tokyo`;
- close times may use after-midnight notation where the maintained source supports it.

Raw `openingHoursRaw`, `closedDays` and `closedNote` remain maintenance/source-only. `hoursReference` is derived from normalized `openingHours` for display.

The normalizer rejects irregular closure, reservation-only prose, calendar/SNS-only schedules, stale temporary notices and ambiguous day-less ranges. Unknown data must never be converted into a false closed/open claim.

Current filter-ready coverage: **278 / 648**.

### Trusted official locator hours

Pass 2 added `scripts/build_locator_hours_enrichment.mjs` and generated `data/source_enrichment_zlocatorhours.js`.

Only selected official branch/store locators may promote current visible hours, and only when:

- the page is already tied to the exact production Place ID through the maintained official index;
- the page name matches the canonical business;
- temporary/dated/special-hours wording is absent;
- the result normalizes and validates under the weekly opening-hours contract.

Pass 2 added **5** new filter-ready schedules through this path.

### Featured dishes vs strict recommendations

Two concepts remain separate:

- `recommendedDishes`: explicit recommendation/popularity/signature evidence only;
- `featuredDishes`: broader source-backed `representative`, `signature` or `recommended` items for public display.

Example:

```js
{
  nameJa: 'マトンビリヤニ',
  nameZh: '羊肉比尔亚尼',
  kind: 'representative',
  priceYen: 3000,
  priceText: '¥3,000'
}
```

Pass 2 added **36** additional featured-dish restaurants from current official brand/menu pages. Current coverage is **120 / 648**; strict recommendation coverage remains **27 / 648**.

A representative item is not silently relabeled as recommended. Optional prices are used only when directly supported by the menu source.

### Field-specific official provenance

One restaurant may use multiple official pages for different facts:

- store page -> hours/address;
- brand menu -> representative dish;
- product/campaign page -> explicit recommended/signature evidence.

The source model still keeps one `official` enrichment row per Place ID. Later z-shards augment the same row with field-specific `sourceRefs` rather than creating duplicate provider/Place-ID rows.

### Stable source refresh

A website timeout is not evidence that previously reviewed data disappeared.

Therefore:

- successful new fetches may add/replace supported fields;
- transient fetch failures retain the previous reviewed claim;
- facts are removed only after explicit contradictory/current evidence or manual review;
- a bulk refresh must not recreate a smaller source shard merely because remote websites were temporarily unavailable.

This rule was added after an early Pass 2 attempt would have reduced the 74-row stable automatic-official set to 65 due network failures; that result was rejected and not merged.

## Immediate production-field queue

Among the **397 source-backed production restaurants**, current overlapping gaps are:

- `featuredDishes`: **279**;
- normalized `openingHours`: **157**;
- budget: **205**;
- address: **170**;
- cuisine: **28**.

Preferred acquisition order:

1. structured branch-specific official data;
2. official store/locator pages;
3. official brand/menu pages;
4. already-reviewed independent sources;
5. conservative manual review for ambiguous cases.

Repeated hosts/chains should be processed by parser/template rather than one restaurant at a time.

## Full 2,804-ID maintenance architecture

### Inventory ledger

`scripts/build_inventory_ledger.mjs` generates `data/area1_inventory_ledger.json`.

The ledger persists only:

- Google Place ID;
- internal processing status;
- compact candidate-QC counts/reasons where relevant.

It does **not** persist Google display names, Google addresses, Google coordinates or full Place Details payloads.

Current ledger partition:

- inventory total: **2,804**;
- production in inventory: **645**;
- inventory-only: **2,159**;
- production outside inventory snapshot: **3**.

Candidate-level rejection is contextual evidence only and does not invalidate the exact Google identity.

### First expansion queue

`scripts/build_inventory_expansion_queue.mjs` generates `data/area1_inventory_expansion_queue.json`.

It extracts inventory-only identities that already have rejected OSM candidate links, because these are cheaper to review than starting with identities that have no independent-source lead at all.

Current first queue:

- **56** inventory identities;
- **64** OSM candidate links;
- 27 identities include `name_mismatch` evidence;
- 31 include `location_mismatch` evidence;
- some identities have multiple candidates/reasons;
- candidate row loss = 0.

Review order starts with name/branch evolution cases, then location corrections. The queue does not assert that the OSM candidate and Google identity are the same business.

### Full-range outcome requirement

Each exact inventory Place ID should eventually have an auditable state such as:

1. production;
2. recoverable/needs-review independent-source candidate;
3. no-independent-source-yet;
4. explicit terminal exclusion where justified.

Promotion into public production still requires exact branch identity, <=1,200 m scope, independent maintainable source evidence and successful canonical/source audits.

## Google API cost guardrail

The previous cost-sensitive recovery pass reached the stated conservative cap of **100 Enterprise `websiteUri` requests**, worst-case USD 2.00 if fully billable.

Pass 2, the 2,804-ID ledger and the 56-ID expansion queue make **zero new Google Places requests**.

Routine continuation should prefer persisted official URLs, official menu/store templates, OSM/curated independent candidates and bounded review queues. Paid recovery remains manual-only.

## Runtime/product contract

The public site remains static GitHub Pages.

Recommendation behavior:

- strict Area1 distance <=1,200 m;
- verified Google Place ID required for production identity;
- cuisine exclusion, budget and distance filters;
- exactly three distinct results whenever >=3 eligible restaurants exist;
- cuisine diversity preferred, not mandatory;
- Web Crypto randomness;
- 百名店 weight 2.2 vs ordinary 1.0;
- no rating/review-count popularity ranking.

Result views:

1. Leaflet + OpenStreetMap three-store overview;
2. per-store Google Maps Embed place map with Leaflet fallback;
3. restaurant cards;
4. three-store comparison table;
5. direct Google Maps business/navigation link.

Public cards use `特色菜`; strict recommendations remain separate in the data model.

## Random-button voice and mascot layer

Restaurant selection stays owned by `app.js`; media feedback remains isolated in `effects.js` / `effects.css`.

Current contract:

- five MP3 random voice files;
- volume 0.45;
- maximum playback 2,000 ms;
- repeated click stops/rewinds the previous voice;
- three WebP mascots;
- randomized nearby placement without immediate mascot/position repetition;
- mascot display about 1.9 s;
- media failure never blocks restaurant generation;
- CI audits committed MP3/WebP files against runtime arrays.

## Maintenance and CI rules

Every material field or identity-expansion batch must:

1. preserve exact Place-ID/source provenance;
2. rebuild canonical production;
3. run opening-hours parser tests where schedules change;
4. run repository audit;
5. run source-binding audit;
6. run normalized-field audit;
7. update coverage/queue reports;
8. update `DEVELOPMENT.md`, `DATA_ENRICHMENT_PROGRESS.md` and `CHANGELOG.md` when the authoritative baseline changes.

Relevant current workflows:

- `bulk-enrichment-pass2.yml` — zero-Google official/menu/locator Pass 2;
- `build-inventory-ledger.yml` — rebuilds exact 2,804-ID ledger and prioritized expansion queue;
- Pages/PR workflows — canonical build and deployment validation.

## Ordered next work

### Phase A — continue current production fields

Reduce the remaining **157 opening-hours** and **279 featured-dish** gaps first; then budget/address/cuisine where current reliable sources exist.

### Phase B — close current-production source outcomes

Resolve the remaining **207** current-production identities conservatively.

### Phase C — first full-range identity review

Process the **56-ID** existing-candidate expansion queue, starting with name mismatch / branch renaming cases, then location mismatch cases.

### Phase D — untouched inventory expansion

Work through the remaining **2,103** inventory-only identities in bounded independent-source discovery batches. Do not persist full Google display payloads merely to increase production count.

### Phase E — field completion for new production

Every newly promoted restaurant enters the same normalized hours / featured dishes / budget / address / cuisine pipeline.

### Phase F — opening-hours filtering

Implement schedule-aware filtering only after coverage and freshness review. Unknown schedule data must remain unknown, not treated as closed.

### Later scopes

After Area1 range accounting/data quality stabilizes:

- TOKYO / 地区2️⃣;
- SHIZUOKA;
- optional local recommendation history after persistence/privacy semantics are defined.
