# Eat Development Plan

Updated: 2026-09-06

## Authoritative current state

`TOKYO / 地区1️⃣` is in **production-field completion plus full 2,804-identity range accounting**.

Current audited baseline after the locator and single-site official-hours automation passes:

- exact Area1 identity inventory: **2,804 / 2,804**;
- canonical production: **648** unique Google Place IDs;
- production IDs inside exact inventory: **645**;
- usable Tabelog/official source-backed production: **397 / 648**;
- source outcomes accounted for: **441 / 648 = 68.1%**;
- unresolved current-production source queue: **207**;
- non-generic cuisine: **571 / 648**;
- budget known: **192 / 648**;
- address known: **259 / 648**;
- filter-ready normalized `openingHours`: **282 / 648**;
- strict `recommendedDishes`: **27 / 648**;
- public `featuredDishes`: **124 / 648**;
- 百名店: **22**.

The address count changed from 261 to 259 because the accelerated official-source audit removed two historical low-quality/false address claims. This is an intentional quality correction.

The full-range ledger accounts for all 2,804 exact inventory identities:

- `production`: **645** inventory IDs;
- `inventory_only`: **2,159**;
- production outside this exact inventory snapshot: **3**;
- first prioritized expansion queue: **56 identities / 64 OSM candidate links**;
- untouched inventory-only identities after that queue: **2,103**.

`DATA_ENRICHMENT_PROGRESS.md` is the authoritative numeric progress report. Detailed implementation history lives under `logs/`.

## Development principle

The browser product remains a static GitHub Pages application. Data discovery, validation and enrichment happen during maintenance/CI, not at browser runtime.

Google Place ID is the durable production identity/admission key. Full Google Places display payloads are not stored as the long-lived restaurant database. Durable display and recommendation metadata comes from maintainable independent sources such as OSM, official pages, Tabelog and curated evidence.

Missing or ambiguous fields are omitted rather than guessed.

## Confidence-tiered enrichment architecture

Restaurant-by-restaurant web research is no longer the default path.

Official-source maintenance uses three confidence tiers:

1. **A — auto-promote**: exact Place ID + maintained identity/source agreement + deterministic field evidence. Only fields whose semantics can be represented safely are written automatically.
2. **B — fast review**: the pipeline extracts address/hours/cuisine text, menu/Product/MenuItem names, recommendation snippets, price snippets and menu URLs into evidence cards. Review is evidence verification, not fresh web searching.
3. **C — no action**: insufficient or ambiguous signal; the field stays empty.

Bulk official-index run `33980591040` established this architecture:

- persisted official index: **187** production identities;
- incomplete targets fetched: **173**;
- already-complete rows skipped: **14**;
- unique URLs fetched: **361**;
- duplicate downloads avoided: **23**;
- main pages fetched successfully: **172 / 173**;
- B-review evidence cards: **120**.

Original overlapping B-review signals were address 34, opening hours 51, cuisine 12, budget 66 and featured dishes 79. Specialized parsers now remove deterministic cases from that manual burden.

## Automated opening-hours layers

Opening-hours enrichment now has two specialized maintenance layers in addition to the canonical parser.

### 1. Trusted chain/store locator layer

Implemented by:

- `scripts/build_locator_template_fields.mjs`;
- `scripts/filter_locator_resolution_conflicts.mjs`;
- `.github/workflows/promote-locator-templates.yml`;
- `data/source_enrichment_zzlocatorauto.js`.

Rules:

- exact production Place ID;
- trusted official locator host and branch-specific URL;
- current fetch + page-title/business identity agreement;
- line-preserving weekday parsing before normalization;
- reject temporary, dated, irregular and special-hour wording;
- never reduce known-day completeness;
- existing `source_resolution` identities stay locked rather than being silently reopened.

Run `33981430074` validated 32 trusted locator targets and safely refreshed three existing schedules. This layer fixed a prior flattened Tully's weekly string that could otherwise be interpreted as one day with multiple intervals.

### 2. Existing-source single-site official layer

Implemented by:

- `scripts/build_single_site_hours_enrichment.mjs`;
- `.github/workflows/promote-single-site-hours.yml`;
- `data/source_enrichment_zzzsinglehours.js`.

This pass is **field completion only**. A restaurant must already have independently maintained source support; it cannot become newly source-backed merely because a Google-discovered website later resolves to an official page.

Each refresh starts from a clean baseline by deleting the previous generated single-site-hours shard before target selection. The shard is rebuilt from current websites every run.

Automatic schedules require:

- existing independent source support;
- no terminal/source-resolution state;
- direct official page, not a third-party/aggregator page;
- current fetch success and title/name identity match;
- explicit hours section;
- at least five known day states after normalization;
- no temporary, dated, seasonal, irregular or conditional-calendar wording;
- no overlapping intervals caused by flattening/group parsing.

The parser supports day-group inheritance, bracketed groups such as `[平日]`, compact closure notes such as `※土曜定休`, and `定休日 無`.

Authoritative run `33982241187`:

- direct official targets: **40**;
- fetched successfully: **40 / 40**;
- identity matched: **28**;
- auto-promoted schedules: **4**;
- normalized hours: **278 -> 282**.

Accepted current schedules:

- ヒナタ屋;
- 眞踏珈琲店;
- まぐろ市場;
- 麺屋武蔵 巌虎.

Ambiguous holiday-eve, substitute-holiday, seasonal-closure and “hours may change” cases remain review-only.

Both specialized workflows are **manual `workflow_dispatch` only** after development validation, so normal repository pushes do not refetch external websites.

## Stable refresh and source-safety rules

A website timeout is not evidence that previously reviewed durable data disappeared.

Therefore:

- stable incremental official enrichment retains reviewed claims across transient failures;
- generated current-site schedule shards are recomputed from clean baselines when freshness is the point of the generator;
- generic free-text addresses are not auto-promoted;
- generic-brand identity conflicts are not auto-resolved by a website URL alone;
- temporary, dated, conditional and irregular schedules are rejected from the static weekly model;
- source-specific pages attach through field-level `sourceRefs` while the combined loader preserves one `official` row per Place ID.

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

Unknown schedule data is never converted into a false open/closed claim. Runtime open-now filtering remains disabled until a separate coverage/freshness review.

## Featured dishes vs strict recommendations

- `recommendedDishes`: explicit recommendation/popularity/specialty evidence only;
- `featuredDishes`: broader source-backed `representative`, `signature` or `recommended` items used by the public UI.

A representative item is never silently relabeled as recommended. Prices are used only when directly supported by current source evidence.

Current coverage:

- featured dishes: **124 / 648**;
- strict recommendations: **27 / 648**.

Dish/budget interpretation remains B-review by default unless a deterministic official host/template rule is strong enough.

## Immediate production-field queue

Among the **397 source-backed production restaurants**, current overlapping gaps are:

- `featuredDishes`: **275**;
- normalized `openingHours`: **153**;
- budget: **205**;
- address: **172**;
- cuisine: **28**.

Preferred processing order:

1. repeated-host/template automatic extraction where semantics are deterministic;
2. prepared B-review evidence batches;
3. manual restaurant-level investigation only for ambiguous residual cases.

## Full 2,804-ID expansion architecture

`data/area1_inventory_ledger.json` tracks every exact inventory Place ID with compact internal status. It does not persist full Google display names, addresses, coordinates or Places payloads.

`data/area1_inventory_expansion_queue.json` contains the first **56** inventory-only identities with **64** existing OSM candidate links. Candidate rejection is review context, not a terminal invalidation of the Google identity.

After current production fields, the same A/B/C approach should be applied to this 56-ID queue before processing the remaining 2,103 untouched inventory-only identities.

Public production admission still requires exact branch identity, <=1,200 m scope, independently maintainable source evidence and successful canonical/source audits.

## Google API cost guardrail

Routine enrichment should prefer persisted official URLs, OSM/curated candidates and independent sources.

The locator and single-site hours passes make **zero new Google Places requests**. Paid Google recovery remains manual-only and should not be triggered merely to inflate coverage.

## CI and audit contract

Every material field/identity batch must:

1. preserve exact Place-ID/source provenance;
2. rebuild canonical production;
3. run opening-hours parser tests when schedules change;
4. run repository audit;
5. run source-binding audit;
6. run normalized-field audit;
7. generate coverage/source/enrichment/dish/identity reports as applicable;
8. use `set -o pipefail` for report pipelines so `tee` cannot hide failures;
9. update progress/development/log records when authoritative state changes.

## Runtime/product contract

Recommendation behavior remains unchanged:

- strict Area1 distance <=1,200 m;
- verified Google Place ID required;
- cuisine exclusion, budget and distance filters;
- exactly three distinct results whenever >=3 eligible restaurants exist;
- cuisine diversity preferred, not mandatory;
- Web Crypto randomness;
- 百名店 weight 2.2 vs ordinary 1.0;
- no rating/review-count ranking.

Result views remain:

1. Leaflet + OpenStreetMap three-store overview;
2. per-store Google Maps Embed place map with Leaflet fallback;
3. restaurant cards;
4. three-store comparison table;
5. direct Google Maps link.

Voice/mascot feedback remains isolated from restaurant selection and does not block result generation.

## Ordered next work

1. Continue converting repeated opening-hours B-review patterns into deterministic host/template parsers; current source-backed gap is **153**.
2. Build deterministic budget/price extraction for repeated official chain hosts where price semantics are stable.
3. Expand official-menu featured-dish processing while keeping strict recommendation semantics separate.
4. Resolve the remaining **207** current-production source outcomes.
5. Apply A/B/C review to the **56-ID** prioritized inventory expansion queue.
6. Process the remaining **2,103** inventory-only identities in bounded independent-source batches.
7. Enable schedule-aware runtime filtering only after coverage/freshness review.
