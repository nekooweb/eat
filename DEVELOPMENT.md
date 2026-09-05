# Eat Development Plan

Updated: 2026-09-06

## Authoritative current state

`TOKYO / 地区1️⃣` is in **production-field completion plus full 2,804-identity range accounting**.

The public runtime, canonical builder, Google Place-ID identity gate, independent-source binding, hybrid maps, random-selection logic, voice/mascot feedback and CI/audit pipeline are operational. Current work is data quality, field completeness and controlled identity-range expansion.

Latest validated state after Pass 3:

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
- public `featuredDishes`: **124 / 648**;
- maintained source-backed dish rows with reviewed Chinese featured output: **104 / 104**;
- 百名店: **22**.

The full-range ledger accounts for all 2,804 exact inventory identities:

- `production`: **645** inventory IDs;
- `inventory_only`: **2,159**;
- production outside this exact inventory snapshot: **3**;
- first prioritized expansion queue: **56 identities / 64 OSM candidate links**;
- untouched inventory-only identities after that queue: **2,103**.

`DATA_ENRICHMENT_PROGRESS.md` is the authoritative numeric/source progress report. Older numerical sections in `CHANGELOG.md` are historical when they differ from this file.

## Approved development order

1. Continue filling useful durable fields for the current 648 production restaurants.
2. Close current-production source outcomes conservatively.
3. Review the 56 existing-candidate inventory expansion identities.
4. Expand through the remaining 2,103 untouched inventory-only identities in bounded independent-source batches.
5. Apply the same normalized data contracts to every newly promoted identity.
6. Enable opening-hours runtime filtering only after a separate coverage/freshness review.

“Full range” means every identity in the 2,804-ID inventory receives an auditable maintenance outcome. It does **not** mean forcing all 2,804 IDs into public production.

## Canonical opening-hours contract

Production uses only filter-ready weekly structure:

```js
openingHours: {
  timezone: 'Asia/Tokyo',
  days: {
    mon: [['11:30', '14:00'], ['17:00', '23:00']],
    wed: []
  }
}
```

Semantics:

- missing day key = unknown;
- `[]` = explicitly closed;
- time-pair arrays = known opening periods;
- missing `openingHours` = no reliable weekly schedule;
- timezone = `Asia/Tokyo`.

Raw `openingHoursRaw`, `closedDays` and `closedNote` remain maintenance/source-only. Public `hoursReference` is derived from normalized `openingHours`.

The normalizer rejects irregular closure, reservation-only prose, calendar/SNS-only schedules, stale temporary notices and ambiguous day-less ranges. Unknown data must never be converted into a false open/closed claim.

Current filter-ready coverage: **278 / 648**.

### Trusted official locator hours

`scripts/build_locator_hours_enrichment.mjs` and `data/source_enrichment_zlocatorhours.js` promote current hours only from selected official branch/store locators when:

- the page is already tied to the exact production Place ID;
- the page matches the maintained business identity;
- temporary/dated/special-hours wording is absent;
- the result normalizes and validates under the weekly schedule contract.

Pass 2 added five schedules through this path. Further hours enrichment should follow the same rule rather than importing mixed prose.

## Featured dishes vs strict recommendations

Two concepts remain separate:

- `recommendedDishes`: explicit recommendation/popularity/specialty evidence only;
- `featuredDishes`: broader source-backed `representative`, `signature` or `recommended` items used by the public UI.

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

A representative item is never silently relabeled as recommended. Optional prices are used only when directly supported by a current source.

Progress:

- initial normalized featured coverage after PR #6: **84 / 648**;
- Pass 2 chain/official menu batch: **120 / 648**;
- Pass 3 current official-menu continuation: **124 / 648**;
- strict recommendations remain **27 / 648**.

Pass 3 adds current official-menu evidence for two Café Veloce identities, Domino's Pizza 淡路町 and YEBISU BAR 御茶ノ水店. Seasonal-only menu items are avoided for durable representative coverage.

Every featured row is exact-Place-ID keyed and must have maintained `dishes` source provenance. The build/audits enforce that relationship.

## Field-specific official provenance

One restaurant may use multiple official pages for different facts:

- branch/store page -> address and opening hours;
- brand menu page -> representative dishes;
- product/campaign page -> explicit recommended/signature evidence.

The maintenance model keeps one `official` enrichment row per Place ID in the combined canonical loader. Later `z`/`zz` shards augment that row with field-specific `sourceRefs` instead of creating duplicate provider/Place-ID rows.

Source shards must also be **standalone-auditable** because coverage/report scripts may evaluate each shard in isolation. A patch shard may therefore create a minimal fallback row only in that standalone context, while the canonical combined loader takes the augmentation path.

## Stable source refresh rule

A website timeout is not evidence that previously reviewed data disappeared.

Therefore:

- successful current fetches may add/replace supported fields;
- transient fetch failures retain earlier reviewed claims;
- facts are removed only after explicit contradictory/current evidence or manual review;
- a bulk refetch must not recreate a smaller source shard merely because remote sites were temporarily unavailable.

This rule was established after an early Pass 2 attempt would have reduced the stable automatic-official set from 74 to 65 because of transient website failures; that result was rejected and never merged.

## Immediate production-field queue

Among the **397 source-backed production restaurants**, current overlapping gaps after Pass 3 are:

- `featuredDishes`: **275**;
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
- compact independent-candidate QC counts/reasons where relevant.

It does **not** persist Google display names, Google addresses, Google coordinates or full Place Details payloads.

Current partition:

- inventory total: **2,804**;
- production in inventory: **645**;
- inventory-only: **2,159**;
- production outside inventory snapshot: **3**.

Candidate-level rejection is contextual evidence only and does not invalidate the exact Google identity.

### First expansion queue

`scripts/build_inventory_expansion_queue.mjs` generates `data/area1_inventory_expansion_queue.json`.

Current queue:

- **56** inventory identities;
- **64** OSM candidate links;
- 27 identities include `name_mismatch` evidence;
- 31 include `location_mismatch` evidence;
- some identities have multiple candidates/reasons;
- candidate row loss = 0.

These are cheaper to review than the 2,103 identities with no independent-source lead. The queue is review evidence only and does not assert that a rejected OSM candidate and Google identity are the same business.

### Full-range outcome requirement

Each exact inventory Place ID should eventually have an auditable state such as:

1. production;
2. recoverable/needs-review independent-source candidate;
3. no-independent-source-yet;
4. explicit terminal exclusion where justified.

Promotion into public production still requires exact branch identity, <=1,200 m scope, independent maintainable source evidence and successful canonical/source audits.

## Google API cost guardrail

The previous cost-sensitive recovery pass reached the stated conservative cap of **100 Enterprise `websiteUri` requests**, worst-case USD 2.00 if fully billable.

Pass 2, Pass 3, the 2,804-ID ledger and the 56-ID expansion queue make **zero new Google Places requests**.

Routine continuation should prefer persisted official URLs, official menu/store templates, OSM/curated independent candidates and bounded review queues. Paid recovery remains manual-only.

## CI and audit contract

Every material field or identity-expansion batch must:

1. preserve exact Place-ID/source provenance;
2. rebuild canonical production;
3. run opening-hours parser tests when schedules change;
4. run repository audit;
5. run source-binding audit;
6. run normalized-field audit;
7. generate coverage/source/enrichment/dish/identity reports;
8. update progress/development/log records when the authoritative baseline changes.

### Coverage pipeline hardening — Pass 3

PR #8 exposed a CI false-positive path: `node report.mjs | tee output.json` can return pipeline status 0 when `node` fails unless shell `pipefail` is enabled.

`.github/workflows/pages.yml` now runs the Coverage report step with:

```bash
set -o pipefail
```

This makes any failing report generator fail the Pages build instead of being masked by `tee`.

The Pass 3 source shard was also made standalone-auditable so canonical build, coverage reporting and source audits all agree on the same data.

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

## Ordered next work

### Phase A — current production fields

Reduce the remaining **157 opening-hours** and **275 featured-dish** gaps first; then budget/address/cuisine where reliable current sources exist.

### Phase B — current-production source outcomes

Resolve the remaining **207** identities conservatively.

### Phase C — first full-range identity review

Process the **56-ID** existing-candidate expansion queue, starting with name mismatch / branch-renaming cases, then location mismatch cases.

### Phase D — untouched inventory expansion

Work through the remaining **2,103** inventory-only identities in bounded independent-source discovery batches. Do not persist full Google display payloads merely to increase production count.

### Phase E — fields for new production

Every newly promoted restaurant enters the same normalized hours / featured dishes / budget / address / cuisine pipeline.

### Phase F — opening-hours filtering

Implement schedule-aware filtering only after coverage and freshness review. Unknown schedule data remains unknown, not closed.

### Later scopes

After Area1 range accounting/data quality stabilizes:

- TOKYO / 地区2️⃣;
- SHIZUOKA;
- optional local recommendation history after persistence/privacy semantics are defined.
