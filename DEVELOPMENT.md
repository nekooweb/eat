# Eat Development Plan

Updated: 2026-09-06

## Authoritative current state

`TOKYO / 地区1️⃣` is in **production-field completion plus full 2,804-identity range accounting**.

Current audited baseline after the official-hours and explicit-field automation passes:

- exact Area1 identity inventory: **2,804 / 2,804**;
- canonical production: **648** unique Google Place IDs;
- production IDs inside exact inventory: **645**;
- usable Tabelog/official source-backed production: **397 / 648**;
- source outcomes accounted for: **441 / 648 = 68.1%**;
- unresolved current-production source queue: **207**;
- non-generic cuisine: **571 / 648**;
- budget known: **192 / 648**;
- address known: **261 / 648**;
- filter-ready normalized `openingHours`: **282 / 648**;
- strict `recommendedDishes`: **27 / 648**;
- public `featuredDishes`: **124 / 648**;
- 百名店: **22**.

The earlier acceleration audit reduced address coverage from 261 to 259 by removing two false/low-quality historical address claims. The explicit-address pass later restored coverage to **261 with two different, current official addresses** for ヒナタ屋 and 焼肉京城. This is a net quality improvement, not a reversal of the earlier cleanup.

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

### Trusted chain/store locator layer

Implemented by:

- `scripts/build_locator_template_fields.mjs`;
- `scripts/filter_locator_resolution_conflicts.mjs`;
- `.github/workflows/promote-locator-templates.yml`;
- `data/source_enrichment_zzlocatorauto.js`.

Run `33981430074` scanned 32 trusted locator targets and safely refreshed three existing schedules. It also fixed flattened weekly text that could otherwise attach several intervals to one weekday.

Existing `source_resolution` identities remain locked rather than being silently reopened from a website URL alone.

### Existing-source single-site official layer

Implemented by:

- `scripts/build_single_site_hours_enrichment.mjs`;
- `.github/workflows/promote-single-site-hours.yml`;
- `data/source_enrichment_zzzsinglehours.js`.

This pass is field completion only. It requires existing independent source support and rejects third-party hosts, temporary/dated/seasonal wording, irregular closures, conditional calendars and overlapping intervals.

Authoritative run `33982241187`:

- direct official targets: **40**;
- fetched successfully: **40 / 40**;
- identity matched: **28**;
- auto-promoted schedules: **4**;
- normalized hours: **278 -> 282**.

Accepted schedules: ヒナタ屋, 眞踏珈琲店, まぐろ市場 and 麺屋武蔵 巌虎.

Both specialized hours workflows are manual `workflow_dispatch` only after validation, so ordinary repository pushes do not refetch external websites.

## Explicit official address / budget layer

Implemented by:

- `scripts/build_explicit_budget_address_enrichment.mjs`;
- `.github/workflows/promote-explicit-budget-address.yml`;
- `data/source_enrichment_zzzzexplicitfields.js`.

This layer tests whether current direct official pages can safely fill remaining address and budget fields without semantic inference.

Automatic address requires:

- existing source-backed identity;
- no source-resolution state;
- current direct official page fetch;
- page title/business-name agreement;
- explicit `住所` or `所在地` label;
- plausible Area1 address in 千代田区 or 文京区.

Automatic budget is intentionally stricter:

- lunch/dinner context must be explicit;
- the page must label `予算` or `平均`;
- a numeric range or upper bound must be present;
- individual menu, product, course and beverage prices are never converted into `lunch` / `dinner` budget ranges.

Authoritative run `33982592924`:

- targets: **70**;
- fetched successfully: **60 / 70**;
- identity matched: **39**;
- accepted address patches: **2**;
- accepted budget patches: **0**.

Accepted official addresses:

- ヒナタ屋 — `東京都千代田区神田小川町3-10`;
- 焼肉京城 — `東京都千代田区神田三崎町2-10-3`.

Result:

- address: **259 -> 261**;
- source-backed address gap: **172 -> 170**;
- budget remains **192**;
- source-backed budget gap remains **205**.

The zero-budget result is an important design conclusion: generic menu-price extraction must **not** be promoted to A-tier budget inference. Budget remains B-review or host-specific only when an official source has explicit spend/average-budget semantics.

## Stable refresh and source-safety rules

- Stable incremental official enrichment retains reviewed claims across transient website failures.
- Freshness generators remove their own previous generated shard before target selection when stale self-influence would hide targets.
- Generic free-text addresses are not auto-promoted.
- Generic-brand identity conflicts are not auto-resolved by a website URL alone.
- Temporary, dated, conditional and irregular schedules are rejected from the static weekly model.
- Menu-item prices do not define restaurant budget.
- Source-specific pages attach through field-level `sourceRefs` while the combined loader preserves one `official` row per Place ID.

## Canonical opening-hours contract

Production exposes only filter-ready weekly structure:

```js
openingHours: {
  timezone: 'Asia/Tokyo',
  days: {
    mon: [['11:30', '14:00'], ['17:00', '23:00']],
    wed: []
  }
}
```

Missing day key means unknown; `[]` means explicitly closed; missing `openingHours` means no reliable weekly schedule. Unknown schedule data is never converted into a false open/closed claim. Runtime open-now filtering remains disabled until a separate coverage/freshness review.

## Featured dishes vs strict recommendations

- `recommendedDishes`: explicit recommendation/popularity/specialty evidence only;
- `featuredDishes`: broader source-backed representative/signature/recommended items used by the public UI.

A representative item is never silently relabeled as recommended. Prices are used only when directly supported by current source evidence.

Current coverage:

- featured dishes: **124 / 648**;
- strict recommendations: **27 / 648**.

## Immediate production-field queue

Among the **397 source-backed production restaurants**, current overlapping gaps are:

- `featuredDishes`: **275**;
- normalized `openingHours`: **153**;
- budget: **205**;
- address: **170**;
- cuisine: **28**.

Preferred processing order:

1. repeated-host/template automatic extraction where semantics are deterministic;
2. prepared B-review evidence batches and deduplication by host/menu item;
3. manual restaurant-level investigation only for ambiguous residual cases.

The generic budget experiment is complete: do not spend further effort trying to infer budgets from arbitrary menu prices.

## Full 2,804-ID expansion architecture

`data/area1_inventory_ledger.json` tracks every exact inventory Place ID with compact internal status. It does not persist full Google display names, addresses, coordinates or Places payloads.

`data/area1_inventory_expansion_queue.json` contains the first **56** inventory-only identities with **64** existing OSM candidate links. Candidate rejection is review context, not a terminal invalidation of the Google identity.

After current production fields, the same A/B/C approach should be applied to this 56-ID queue before processing the remaining 2,103 untouched inventory-only identities.

Public production admission still requires exact branch identity, <=1,200 m scope, independently maintainable source evidence and successful canonical/source audits.

## Google API cost guardrail

The locator, single-site hours and explicit budget/address passes make **zero new Google Places requests**. Routine enrichment should prefer persisted official URLs, OSM/curated candidates and independent sources. Paid Google recovery remains manual-only.

## CI and audit contract

Every material field/identity batch must preserve exact Place-ID/source provenance, rebuild canonical production, run repository/source-binding/normalized-field audits, generate relevant coverage reports, use `set -o pipefail` around piped reports, and update progress/development/log records when authoritative state changes.

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

Result views remain Leaflet/OSM overview, per-store Google Maps Embed with Leaflet fallback, restaurant cards, comparison table and direct Google Maps link. Voice/mascot feedback remains isolated from restaurant selection.

## Ordered next work

1. Compress/automate repeated official-menu `featuredDishes` review, keeping strict recommendation semantics separate.
2. Continue repeated-host/template automation for the remaining **153 opening-hours** gaps.
3. Treat budget as B-review or host-specific explicit-spend data; do not infer it from menu items.
4. Continue explicit-address extraction where deterministic; current source-backed gap is **170**.
5. Resolve the remaining **207** current-production source outcomes.
6. Apply A/B/C review to the **56-ID** prioritized inventory expansion queue, then the remaining **2,103** inventory-only identities.
7. Enable schedule-aware runtime filtering only after coverage/freshness review.
