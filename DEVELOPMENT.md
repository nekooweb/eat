# Eat Development Plan

Updated: 2026-09-06

## Authoritative current state

`TOKYO / 地区1️⃣` is in **production-field completion plus full 2,804-identity range accounting**.

Latest audited baseline after the official-hours, explicit-field and reviewed featured-template automation passes:

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
- public `featuredDishes`: **125 / 648**;
- source-backed legacy dish rows with reviewed Chinese featured output: **105 / 105**;
- 百名店: **22**.

The full-range ledger remains **645 production-in-inventory / 2,159 inventory-only / 3 production outside the exact snapshot**, with a first expansion queue of **56 identities / 64 OSM candidate links** and **2,103** untouched inventory-only identities after that queue.

`DATA_ENRICHMENT_PROGRESS.md` is the authoritative numeric report. Detailed implementation history lives under `logs/`.

## Development principle

The browser product remains a static GitHub Pages application. Data discovery, validation and enrichment happen during maintenance/CI, not at browser runtime.

Google Place ID is the production identity/admission key. Durable display and recommendation metadata comes from maintainable independent sources such as OSM, official pages, Tabelog and curated evidence. Missing or ambiguous fields remain empty rather than being guessed.

## Confidence-tiered enrichment architecture

Restaurant-by-restaurant research is no longer the default path.

1. **A — auto-promote:** exact Place ID + maintained identity/source agreement + deterministic field semantics.
2. **B — fast review:** pre-extracted evidence cards for address/hours/cuisine/menu/recommendation/price signals.
3. **C — no action:** insufficient or ambiguous evidence; field remains unknown.

Bulk run `33980591040` established this architecture across the persisted 187-record official index: 173 incomplete targets were processed, 14 complete rows skipped, 361 unique URLs fetched, 23 duplicate requests avoided, 172/173 main pages fetched, and 120 B-review evidence cards generated.

Original overlapping B signals were address 34, openingHours 51, cuisine 12, budget 66 and featuredDishes 79. Specialized parsers/templates now remove deterministic cases from that burden.

## Automated opening-hours layers

### Trusted locator templates

`build_locator_template_fields.mjs` + `filter_locator_resolution_conflicts.mjs` + manual workflow `promote-locator-templates.yml` refresh trusted branch/store locator schedules.

Run `33981430074` scanned 32 locator targets, matched 25 identities, produced 7 raw safe patches and retained 3 after blocking 4 source-resolution conflicts. It also fixed flattened weekly text that could otherwise attach several intervals to one weekday.

### Existing-source direct official sites

`build_single_site_hours_enrichment.mjs` + manual workflow `promote-single-site-hours.yml` fills schedules only for identities that already have independent source support.

Run `33982241187`: 40 targets, 40 fetches, 28 identity matches, 4 accepted schedules. `openingHours` increased **278 -> 282**. Temporary, dated, seasonal, irregular, conditional-calendar and overlapping-interval cases are rejected.

## Explicit address / budget layer

`build_explicit_budget_address_enrichment.mjs` + manual workflow `promote-explicit-budget-address.yml` tests only explicitly labelled fields on current direct official pages.

Run `33982592924`: 70 targets, 60 fetches, 39 identity matches, 2 accepted address patches and **0** budget patches.

Accepted addresses:

- ヒナタ屋 — `東京都千代田区神田小川町3-10`;
- 焼肉京城 — `東京都千代田区神田三崎町2-10-3`.

Address coverage became **259 -> 261**. Budget remains **192** because menu-item/course prices are not treated as restaurant spend ranges. Generic budget inference from menu prices is explicitly rejected as a development direction.

## Reviewed featured-dish template propagation

Implemented by:

- `scripts/featured_template_registry.mjs`;
- `scripts/audit_featured_template_gaps.mjs`;
- `scripts/build_featured_template_propagation.mjs`;
- `.github/workflows/promote-featured-templates.yml`;
- `data/source_enrichment_zzzzzfeaturedtemplates.js`.

The registry contains brand-menu semantics and bilingual labels that have already been reviewed in committed enrichment. A template is a **field-propagation rule, never an identity-admission rule**.

Eligibility requires:

- exact canonical production Place ID;
- current `featuredDishes` missing;
- existing independent source support (`sources` contains something other than OpenStreetMap);
- no `source_resolution` state;
- the generated official `dishes` sourceRef and featured-dish source URL remain consistent.

Authoritative run `33983081967`:

- reviewed template brands: **15**;
- matching production rows: **46**;
- surface rows missing featured dishes: **15**;
- source-backed missing rows: **1**;
- promoted: **1**;
- blocked: **14** — 13 by existing source-resolution status, 1 because it was not source-backed.

Promoted exact identity:

- `つじ田` — Place ID `ChIJJ8_bnU6NGGARsXyvg0mnXI0`;
- reviewed menu item `濃厚つけ麺` / `浓厚蘸面`;
- semantic kind `signature`;
- official menu source `https://tsukemen-tsujita.com/menu/noukoutsukemen/`.

Result: `featuredDishes` **124 -> 125**, source-backed featured gap **275 -> 274**, legacy/source-backed dish rows **111 -> 112**, while strict recommendations remain **27**.

The other 14 apparent same-brand gaps are generic/insufficiently sourced Starbucks, Doutor, Tully's, Royal Host, Café Veloce, Café de Crié or Tsujita identities and are intentionally not propagated.

## Stable refresh and source-safety rules

- Reviewed stable enrichment survives transient website failures.
- Freshness generators start from a clean baseline when stale self-generated output would hide targets.
- Generic-brand identity conflicts are not resolved by brand/menu similarity.
- Generic free-text addresses are not auto-promoted.
- Temporary/conditional schedules are not forced into the static weekly model.
- Menu-item prices do not define restaurant budget.
- `recommendedDishes` remains stricter than `featuredDishes`.
- Field-specific pages attach through `sourceRefs`; one official enrichment row per Place ID is preserved in the combined loader.

## Current production-field queue

Among the **397 source-backed** production restaurants, current overlapping gaps are:

- `featuredDishes`: **274**;
- normalized `openingHours`: **153**;
- budget: **205**;
- address: **170**;
- cuisine: **28**.

The brand-template audit shows that already-reviewed chain menus are now nearly saturated among source-backed same-brand identities. Future featured-dish gains should therefore come mainly from **new explicit official menu evidence**, grouped by repeated host/menu pattern and reviewed once before being added to the template registry.

## Full-range expansion architecture

`data/area1_inventory_ledger.json` tracks every exact inventory Place ID without persisting full Google display payloads. `data/area1_inventory_expansion_queue.json` holds the first 56 inventory-only identities that already have 64 OSM candidate links.

Public production admission still requires exact branch identity, <=1,200 m scope, independently maintainable source evidence and successful canonical/source audits.

## Google API cost guardrail

The locator, single-site hours, explicit address/budget and featured-template passes make **zero new Google Places requests**. Routine continuation should prefer persisted official URLs, OSM/curated candidates and reviewed templates. Paid Google recovery remains manual-only.

## CI and audit contract

Every material field/identity batch must preserve exact Place-ID/source provenance, rebuild canonical production, run repository/source-binding/normalized-field audits, run relevant coverage/dish reports, use `set -o pipefail` around piped reports, and update progress/development/log records when authoritative state changes.

## Runtime/product contract

Recommendation behavior and frontend remain unchanged: <=1,200 m scope, verified Place IDs, cuisine/budget/distance filters, three distinct results when possible, cuisine diversity preference, Web Crypto randomness, 百名店 weight 2.2, no rating/review popularity ranking, hybrid Maps/Leaflet views, and isolated voice/mascot feedback.

## Ordered next work

1. Extract **new** explicit representative/signature dishes from current official menu pages and group repeated host/menu patterns before review; current source-backed featured gap is **274**.
2. Continue deterministic host/template extraction for the remaining **153 opening-hours** gaps.
3. Keep budget at B-review/host-specific explicit-spend semantics; do not infer from menu prices.
4. Continue deterministic explicit-address extraction; current source-backed gap is **170**.
5. Resolve the remaining **207** current-production source outcomes.
6. Apply A/B/C review to the **56-ID** prioritized inventory expansion queue, then the remaining **2,103** inventory-only identities.
7. Enable schedule-aware runtime filtering only after a separate coverage/freshness review.
