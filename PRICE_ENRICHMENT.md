# Area1 Multi-source Price Enrichment

Updated: 2026-09-06

## Decision

Restaurant price completion must not depend on one provider.

Hot Pepper is the primary **structured batch source**, not the sole price truth. Price evidence should be resolved independently for lunch and dinner from multiple permitted sources.

## Source roles

### 1. Official restaurant / brand / menu pages — highest priority

Use explicit statements such as:

- lunch average / dinner average;
- menu set prices;
- branch-specific menus;
- official booking/menu price bands.

Official pages are also the preferred source for lunch prices because Hot Pepper's `lunch` field indicates availability, not a lunch budget.

A menu-derived price band must be marked as derived evidence. One isolated item or one expensive course must not be treated as the restaurant budget.

### 2. Tabelog — strong secondary budget evidence

Existing exact-identity Tabelog rows may provide separate lunch and dinner budget ranges and can be used as source-backed factual evidence.

Do not copy reviews or review text into the database. High-volume automated extraction should not be assumed permitted merely because the project is non-commercial; use already-maintained exact bindings, normal review workflows, or explicit permission as appropriate.

Where Tabelog and an official page disagree, prefer the current branch-specific official source and retain the conflict for audit.

### 3. Hot Pepper Gourmet Web Service — primary structured batch layer

Use for:

- explicit dinner budget band;
- budget average/memo as supporting evidence;
- lunch availability signal;
- identity/address/cuisine/hours that help validate the same shop.

Hot Pepper is especially useful because bound IDs can be refreshed in batches of up to 20 shop IDs per request.

Do not infer a lunch price from `lunch=あり`.

### 4. Google

#### Google Places API

Do not use it in repository maintenance.

The current repository policy prohibits billable place/search API execution. Google Places `priceLevel` and `priceRange` are Enterprise-tier Place fields, so using them would reintroduce the exact billing risk this transition is designed to remove.

Historical Google Place IDs remain compatibility aliases only.

#### Ordinary Google web search

Google search may be used manually / interactively as a **discovery layer** to find the restaurant's official menu, booking page, branch locator, or another permitted source.

Do not treat a search-result snippet itself as canonical price evidence and do not build a bulk Google-search scraping pipeline. The durable claim should point to the underlying official/permitted page that actually states the price.

### 5. Other open / independent sources

OSM / Overture / Foursquare OS are useful mainly for identity, address, category and conflict resolution. They are not expected to be primary restaurant price sources.

## Resolver model

Lunch and dinner must be resolved **independently**.

Example:

```text
Tabelog: lunch = 1000-1999, dinner = missing
Hot Pepper: lunch availability only, dinner = 3001-4000
Official menu: lunch set menu 1200-1800, dinner missing

Resolved:
  lunch -> official menu derived band (with evidence class)
  dinner -> Hot Pepper explicit structured band
```

Do not choose one provider for the whole restaurant and discard useful evidence from the other provider.

## Evidence classes

### A — explicit branch-specific budget / average-spend range

Examples:

- official branch page states lunch/dinner range;
- authorized structured Hot Pepper dinner budget;
- exact Tabelog branch budget range.

Suitable for hard budget filtering.

### B — derived from a sufficiently complete official menu

Examples:

- multiple comparable lunch sets / main dishes establish an observed range;
- multiple normal dinner mains establish a useful observed range.

Suitable for filtering if the derivation is recorded and the menu is representative.

### C — sparse price evidence

Examples:

- one menu item;
- one course price;
- one promotional price;
- search snippet without a verified underlying page.

Display/review evidence only. Do not use as the hard restaurant budget band.

## Conflict rules

For each meal period independently:

1. current exact official branch evidence;
2. explicit exact-source structured range (Tabelog / Hot Pepper) according to freshness and branch confidence;
3. official-menu-derived band;
4. weaker/sparse evidence for review only.

If two strong sources disagree materially:

- keep both claims;
- prefer the current official branch source when available;
- otherwise flag a price conflict rather than silently averaging the ranges.

## Direct-search completion strategy

Direct web search should be used selectively for rows still missing price after structured batch enrichment.

Recommended order:

1. run Hot Pepper batch enrichment;
2. measure remaining lunch and dinner gaps separately;
3. reuse existing exact Tabelog bindings/claims;
4. group remaining restaurants by official host/brand;
5. search/discover the official menu or locator once per host/template;
6. fetch each official page once and extract all useful fields, not just price;
7. reserve manual search for unresolved independent restaurants.

This prevents thousands of redundant searches while still using the web to fill gaps that structured sources cannot cover.

## Metrics

Track separately:

- lunch price known / 656;
- dinner price known / 656;
- both lunch+dinner known / 656;
- official price claims;
- Tabelog price claims;
- Hot Pepper price claims;
- derived official-menu bands;
- conflicting strong price claims;
- unresolved lunch gaps;
- unresolved dinner gaps.

The objective is maximum trustworthy price coverage per fetch/review minute, not maximum dependence on any single database.
