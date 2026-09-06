# Area1 Multi-source Price Enrichment

Updated: 2026-09-06

## Decision

Restaurant price completion must not depend on one provider. Lunch and dinner are resolved independently from the strongest maintainable evidence.

Hot Pepper is the primary structured batch source for dinner enrichment, not the sole price truth. Official pages and maintained exact Tabelog bindings remain essential, especially for lunch.

## Current production coverage

Latest successful Pages audit after run `34032998440`, across **656** canonical restaurants:

- lunch known: **157 (23.9%)**;
- dinner known: **254 (38.7%)**;
- both lunch and dinner known: **137 (20.9%)**;
- either meal known: **274 (41.8%)**;
- lunch missing: **499**;
- dinner missing: **402**.

Current maintained provider rows with explicit/usable price evidence:

- Tabelog: **173**;
- Hot Pepper: **84**;
- official: **20**.

Strict provenance gate: **0** unprovenanced stored meal-price fields.

## Resolver model

`scripts/price_resolver.mjs` resolves each meal independently.

Example:

```text
Tabelog lunch = 1000-1999
Hot Pepper dinner = 3001-4000
=> canonical lunch keeps Tabelog
=> canonical dinner uses Hot Pepper
```

A provider winning dinner does not delete lunch evidence from another provider.

## Required field provenance

A source-only row may contribute a canonical meal price only when a source ref explicitly claims one of:

- `budget`;
- `lunchBudget`;
- `dinnerBudget`.

`STRICT_PRICE_PROVENANCE=1` is enabled in Pages and the Hot Pepper promotion workflow.

A stored meal-price array without one of these claims is invalid maintenance data. The NARU correction demonstrated this: an old unsupported dinner range was removed instead of retroactively inventing budget provenance.

## Evidence classes

### A — `explicit_range`

Explicit branch-specific budget / average-spend evidence.

Examples:

- current official branch page explicitly states lunch/dinner budget;
- exact maintained Tabelog branch budget range;
- authorized Hot Pepper structured dinner budget.

A-class evidence is preferred for hard filtering.

### B — `menu_derived`

A reviewed representative range derived from a sufficiently complete official menu.

Requirements:

- exact branch/brand relevance is established;
- multiple comparable current menu prices are available;
- seasonal/limited/outlier items are not allowed to define the normal range without justification;
- observed prices and derivation method are retained for audit;
- B-class is used only when no A-class explicit range is available for that meal.

B-class is hard-filter eligible because the derivation is reviewed and reproducible, but it remains below explicit evidence.

### C — `sparse`

Weak price evidence such as:

- one menu item;
- one course;
- one cover/music/seat charge;
- one promotion;
- a search-result snippet without verified underlying content.

C-class is review/display evidence only and never becomes the canonical restaurant budget band.

## Selection order

Selection happens per meal period and **evidence strength first**.

1. A-class `explicit_range`;
2. B-class `menu_derived`;
3. C-class excluded from canonical hard filtering.

Within equal A-class evidence:

1. exact current official branch claim;
2. exact maintained Tabelog claim;
3. authorized Hot Pepper claim;
4. lower-priority maintained explicit sources.

Freshness breaks ties at equal evidence/provider level.

Strong explicit conflicts are retained for review and never averaged silently.

## Hot Pepper role

The durable Hot Pepper shard currently contains:

- **94** production source rows;
- **84** dinner-budget claims.

It contributed **+84** dinner prices and **+81** restaurants with any known meal budget because three dinner additions complemented restaurants whose lunch was already known.

Hot Pepper `lunch=あり` is only a lunch-availability signal. It is never converted into a lunch budget.

Hot Pepper workflows are manual-only and do not run on ordinary pushes.

## First official-menu-derived landing

`data/source_enrichment_zzzzpricepatches.js` is the reviewed B-class patch layer.

### 神田たまごけん神保町店

Official current core menu observed prices used for the representative range:

```text
990, 990, 990, 1150, 1490 yen
```

Seasonal/limited items were excluded.

Resolved B-class values:

- lunch `[990,1490]`;
- dinner `[990,1490]`.

### シリ バラジ

Official Suidobashi lunch menu complete sets:

```text
800, 900, 1400 yen
```

Resolved B-class value:

- lunch `[800,1400]`.

### Measured effect

The two reviewed records changed strict coverage from:

```text
lunch 155 -> 157
dinner 253 -> 254
both 136 -> 137
any 272 -> 274
```

After landing, strict provenance remains **0** and the current material strong-price conflict count is **0**.

## Source roles

### Official restaurant / brand / menu pages

Best for:

- explicit branch budget/average-spend statements;
- official lunch menus;
- branch/menu-derived B-class ranges when enough comparable prices exist.

Do not infer restaurant budget from one item price.

### Tabelog

Existing exact maintained bindings remain a high-value explicit price source. Do not copy review text. Use normal permitted/reviewed workflows rather than assuming non-commercial status authorizes high-volume extraction.

### Hot Pepper

Use the authorized structured API for explicit dinner budget and supporting restaurant metadata. Bound IDs are batched; do not issue one request per restaurant.

### Google / web search

Google Places data APIs remain prohibited for maintenance.

Ordinary web/search can be used selectively to find an underlying official/permitted source. A search snippet itself is not canonical price evidence.

### OSM / Overture / Foursquare OS

Useful mainly for identity/address/category/currentness, not primary restaurant budget evidence.

## Remaining gap strategy

Global gaps:

- lunch: **499**;
- dinner: **402**.

Already-maintained-source gaps:

- lunch: **289**;
- dinner: **192**.

Current high-yield groups:

- Tabelog-linked lunch gaps: **167**;
- Hot Pepper-linked lunch gaps: **83**;
- Hot Pepper-linked dinner gaps: **1**;
- recurring official menu/locator domains such as Doutor, Tully's, Starbucks, C-United, Ginza Renoir and others.

Execution order:

1. exhaust existing exact source bindings before broad discovery;
2. prioritize lunch;
3. batch official brand/domain templates where current menus are demonstrably applicable;
4. store B-class observed prices and derivation metadata;
5. keep sparse price evidence outside hard filters;
6. use selective web discovery only for unresolved identities after existing-source extraction.

## Metrics

Track separately:

- lunch known / 656;
- dinner known / 656;
- both known / 656;
- A-class claims by provider;
- B-class reviewed official-menu-derived claims;
- C-class review-only evidence;
- strong-source conflicts;
- unprovenanced stored price fields — target **0**;
- unresolved lunch gaps;
- unresolved dinner gaps;
- trustworthy fields completed per fetch/review minute.

The objective is maximum trustworthy coverage, not maximum dependence on a single database.
