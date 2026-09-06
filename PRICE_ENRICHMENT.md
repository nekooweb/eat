# Area1 Multi-source Price Enrichment

Updated: 2026-09-06

## Decision

Restaurant price completion must not depend on one provider.

Hot Pepper is the primary **structured batch source**, not the sole price truth. Price evidence is now resolved independently for lunch and dinner from multiple permitted sources.

## Current implementation state

The independent meal resolver is live in `scripts/price_resolver.mjs` and is covered by unit tests in `scripts/test_price_resolver.mjs`.

Current strict production coverage across **656** restaurants:

- lunch known: **155 (23.6%)**;
- dinner known: **253 (38.6%)**;
- both lunch and dinner known: **136 (20.7%)**;
- either meal known: **272 (41.5%)**;
- lunch missing: **501**;
- dinner missing: **403**.

Current explicit structured provider rows with at least one stored price claim:

- Tabelog: **173**;
- Hot Pepper: **84**;
- official: **18**.

Pages runs a strict provenance gate. Current unprovenanced stored meal-price fields: **0**.

## Source roles

### 1. Official restaurant / brand / menu pages

Use explicit statements such as:

- lunch average / dinner average;
- branch-specific budget ranges;
- explicit average-spend statements;
- sufficiently complete branch-specific menu data.

Official pages are especially important for lunch because Hot Pepper's `lunch` field indicates availability, not a lunch budget.

A menu-derived price band must be marked as derived evidence. One isolated item or one expensive course must not be treated as the restaurant budget.

### 2. Tabelog — strong explicit budget evidence

Existing exact-identity Tabelog rows may provide separate lunch and dinner budget ranges and can be used as source-backed factual evidence.

Do not copy reviews or review text into the database. High-volume automated extraction should not be assumed permitted merely because the project is non-commercial; use already-maintained exact bindings, normal review workflows, or explicit permission as appropriate.

Where Tabelog and an explicit current official branch budget disagree, prefer the explicit official branch claim and retain the conflict for audit.

### 3. Hot Pepper Gourmet Web Service — primary structured batch layer

Use for:

- explicit dinner budget band;
- budget average/memo as supporting evidence;
- lunch availability signal;
- identity/address/cuisine/hours that help validate the same shop.

Bound IDs can be refreshed in batches of up to 20 shop IDs per request.

Do not infer a lunch price from `lunch=あり`.

The current durable additive Hot Pepper shard contains **94** production source rows and **84** dinner-budget claims. It increased `anyKnown` budget coverage by **81** restaurants because three of those dinner additions complemented restaurants that already had lunch prices.

### 4. Google

#### Google Places API

Do not use it in repository maintenance.

The current repository policy prohibits billable place/search API execution. Historical Google Place IDs remain compatibility aliases only.

#### Ordinary Google web search

Google search may be used manually / interactively as a **discovery layer** to find the restaurant's official menu, booking page, branch locator, or another permitted source.

Do not treat a search-result snippet itself as canonical price evidence and do not build a bulk Google-search scraping pipeline. The durable claim should point to the underlying official/permitted page that actually states the price.

### 5. Other open / independent sources

OSM / Overture / Foursquare OS are useful mainly for identity, address, category and conflict resolution. They are not expected to be primary restaurant price sources.

## Resolver model

Lunch and dinner resolve **independently**.

Example:

```text
Tabelog: lunch = 1000-1999, dinner = missing
Hot Pepper: lunch availability only, dinner = 3001-4000
Official menu: representative lunch items = 1200-1800

Resolved:
  lunch -> Tabelog explicit range
  dinner -> Hot Pepper explicit range
```

If there is no explicit lunch range, a reviewed sufficiently complete official-menu-derived band may be used instead.

One provider no longer owns both meal periods.

## Evidence classes

Source refs may use `priceEvidenceClass`.

### A — `explicit_range`

Explicit branch-specific budget / average-spend evidence.

Examples:

- official branch page explicitly states lunch/dinner budget;
- authorized Hot Pepper structured dinner budget;
- exact Tabelog branch budget range.

Suitable for hard budget filtering.

Existing maintained `budget`, `lunchBudget`, and `dinnerBudget` refs without an explicit class default to this class for backward compatibility.

### B — `menu_derived`

Reviewed range derived from a sufficiently complete official menu.

Examples:

- multiple comparable lunch sets establish a representative observed range;
- multiple normal dinner mains establish a representative range.

Suitable for filtering only when no explicit A-class range exists. The derivation should be reproducible from the maintained official page.

### C — `sparse`

Weak/sparse evidence.

Examples:

- one menu item;
- one course price;
- one music/seat/cover charge;
- one promotional price;
- search snippet without a verified underlying page.

Review/display evidence only. It never becomes the hard canonical restaurant budget band.

## Selection order

Selection is performed **per meal period** and **evidence strength first**.

Within A-class explicit ranges:

1. exact current official branch budget;
2. exact Tabelog range;
3. authorized Hot Pepper range;
4. lower-priority maintained explicit sources.

Then B-class menu-derived ranges are considered.

C-class sparse evidence is excluded from canonical price filtering.

Within an equal evidence/provider level, the fresher maintained claim wins.

If two strong explicit sources disagree materially:

- keep both claims in the maintenance/audit layer where available;
- select using the precedence above;
- flag the disagreement for review rather than averaging the ranges.

## Provenance rule

A source-only row may contribute `lunch` or `dinner` only when a source ref explicitly claims one of:

- `budget`;
- `lunchBudget`;
- `dinnerBudget`.

`STRICT_PRICE_PROVENANCE=1` is enabled in Pages and the Hot Pepper promotion workflow. Any stored meal-price field without an explicit price claim fails the pipeline.

This rule intentionally removed the old `JAZZ HOUSE NARU` dinner range `[3000,4999]`: the maintained official sources supported a music charge and operating information, but no restaurant dinner-spend range. The old value therefore no longer participates in canonical filtering.

## Remaining gap strategy

The enrichment queue is now meal-aware.

Current gaps:

- lunch: **501**;
- dinner: **403**.

However, broad new searching is not the first step. Among restaurants that already have a usable maintained source, there are:

- **291** lunch gaps;
- **193** dinner gaps.

The current source-group queue includes **168** Tabelog-linked lunch gaps. The Hot Pepper-linked group has **83** lunch gaps but only **1** dinner gap, confirming that Hot Pepper solved a large part of the dinner problem while lunch remains the main deficit.

Recommended execution order:

1. extract/verify missing meal-period prices from already-maintained exact sources;
2. prioritize lunch because it is the largest remaining gap;
3. process official domains by brand/template where the page actually provides representative price evidence;
4. use existing exact Tabelog bindings through permitted/reviewed workflows;
5. use ordinary web/Google search selectively to discover underlying official/permitted sources for still-unresolved restaurants;
6. keep single-item/sparse prices as C-class review evidence rather than forcing them into a budget band.

## Metrics to track

Track separately:

- lunch price known / 656;
- dinner price known / 656;
- both lunch+dinner known / 656;
- A-class explicit claims by provider;
- B-class official-menu-derived bands;
- C-class sparse evidence retained for review;
- conflicting strong explicit claims;
- unprovenanced stored price fields — target **0**;
- unresolved lunch gaps;
- unresolved dinner gaps;
- trustworthy fields completed per fetch/review minute.

The objective is maximum trustworthy coverage, not maximum dependence on any single database.
