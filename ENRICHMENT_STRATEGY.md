# Area1 Bulk Content Enrichment Strategy

Updated: 2026-09-06

## Decision

**Area1 candidate discovery is no longer the primary problem.**

The historical 2,804-identity capture succeeded. The full-collection and retry artifacts from 2026-09-06 provide a one-time transient matching seed for the identities that were not already in production. No new paid Google request is required to reconstruct the matching inputs used in this enrichment phase.

The primary engineering objective is now:

> For the already-known Area1 restaurant list, bind each identity to maintainable independent sources and fill the highest-value restaurant fields in large batches at near-zero marginal cost.

Do not spend the next development cycle optimizing candidate-universe discovery unless a measured coverage audit later shows a real recall problem.

## 1. What should be optimized

### P0 — identity and recommendation usefulness

These fields have the highest value and should be completed first:

- current restaurant/business existence evidence;
- durable name and aliases;
- independent coordinates and address;
- cuisine / restaurant type;
- independent source identifiers and provenance;
- official website / locator when available.

### P1 — filtering value

- lunch price evidence;
- dinner price evidence;
- a filterable price band with an explicit evidence class.

### P2 — useful display context

- normalized weekly opening hours;
- regular closing days;
- phone;
- menu URL(s).

### P3 — optional enrichment

- featured/signature dishes;
- strict recommendation evidence;
- descriptive/decorative fields.

Progress should be measured primarily by P0/P1 coverage, not by forcing every optional field non-null.

## 2. Use the successful Google sweep only as a transient bridge

The prior paid sweep already exists and must not be repeated.

Use the still-available Actions artifacts only inside a short-lived matching job to obtain transient matching features such as:

- historical Place ID;
- name returned in that completed sweep;
- address;
- coordinates;
- operational/type signals.

Those Google display fields are **not** copied into the durable repository database.

Instead, use them to establish durable independent bindings such as:

```text
legacy Place ID
  -> Foursquare OS place ID
  -> Overture GERS/place ID
  -> OSM element ID
  -> official/brand locator URL
  -> AllThePlaces/official chain ref
```

After a binding is established, durable fields come from the independent source, not from the transient Google payload.

This converts the value of the already-paid sweep into a zero-paid-API maintenance graph before the private artifacts expire.

## 3. Source roles for enrichment

No single source should be treated as the truth for every field.

### Foursquare Open Source Places

Good bulk source for:

- name;
- coordinates;
- address;
- category;
- phone;
- website;
- `date_refreshed` / `date_closed`;
- source-native FSQ identity.

Use the open dataset, not the paid Places API.

This source is especially useful for P0 identity/currentness coverage. Direct FSQ OS should be benchmarked rather than assuming that the smaller FSQ contribution visible through another aggregate dataset is equivalent to the full open corpus.

### Overture Maps Places

Good permissively licensed bulk source for:

- multilingual names;
- taxonomy / basic category;
- address;
- coordinates;
- website / phone / brand;
- existence confidence;
- operating status where available;
- source lineage;
- GERS/place identity across releases.

Use it as an enrichment source, not as the definition of the Area1 universe.

Important: Overture is itself a conflated multi-provider dataset. Agreement between Overture and one of its own upstream providers is not automatically two independent votes. Preserve provider/source lineage during confidence scoring.

### OpenStreetMap

Useful for:

- independent coordinates;
- cuisine/type tags;
- `opening_hours`;
- address;
- website/contact tags;
- OSM identity.

For large refreshes use a local/cached extract rather than systematic public geocoding/query traffic.

### AllThePlaces + official chain locators

This should become a first-class enrichment route rather than an afterthought.

AllThePlaces already maintains spiders for many Japanese brands and emits CC0 data. For supported restaurant groups, this can provide official-locator-derived:

- branch ref;
- brand and branch name;
- coordinates;
- address;
- phone;
- opening hours;
- cuisine/category;
- official detail URL.

The Zensho Japan spider alone covers multiple restaurant brands (for example Sukiya, Nakau, Hama-sushi, Cocos, Jolly Pasta, yakiniku and ramen brands). Reuse mature store-locator logic instead of reimplementing every chain crawler from scratch.

When a relevant AllThePlaces spider does not exist, implement a small repository adapter around the restaurant group's official locator and keep the extraction logic host-specific.

### Official restaurant pages

Authoritative source for P1-P3 fields when an exact branch page is established.

Prefer:

1. branch locator/detail page;
2. branch-specific menu page;
3. brand menu page when the menu is demonstrably shared by that branch;
4. restaurant-owned site.

Extract all useful fields in one visit.

### Hot Pepper / Yahoo local / other listing APIs

These can be useful as comparison or review aids, but they must not automatically become the persistent enrichment database.

In particular, Recruit's API terms require rapid cache refresh and prohibit copying API data into a third-party database. Therefore Hot Pepper API data should not be committed as long-lived canonical fields merely because the API is free.

Existing individually reviewed source bindings may remain subject to their existing provenance rules, but do not build a new bulk persistent ingestion pipeline around provider data whose terms do not permit that use.

## 4. Matching strategy: evidence fusion, not name-only matching

The completed sweep has a practical complication: many Japanese restaurants were returned with romanized/English display names. Exact Japanese-string matching will therefore miss a large fraction of useful source bindings.

Use blocked candidate matching with multiple signals:

- distance;
- normalized Japanese/Latin names and aliases;
- address tokens / postal code / building;
- phone;
- official website domain;
- brand + branch;
- category compatibility;
- source-native IDs already linked through prior reviewed data.

### Proposed confidence model

Use a probabilistic or calibrated weighted record-linkage model rather than one fixed threshold for every restaurant type.

Example evidence strength:

- exact phone match: very strong;
- exact official domain + compatible name/address: very strong;
- <=20 m + strong name/alias match: strong;
- same building + generic name: weak;
- category-only agreement: weak;
- one aggregate source repeating an upstream provider: not independent evidence.

For the current data size, a DuckDB/Splink-style probabilistic linkage pass is practical and easier to calibrate than global O(N²) matching.

Enforce one-to-one/source-uniqueness constraints after scoring so two historical identities do not silently claim the same independent branch record.

## 5. Enrichment should be host-first, not restaurant-first

The old mental model was:

```text
restaurant 1 -> search/fetch
restaurant 2 -> search/fetch
restaurant 3 -> search/fetch
...
```

The scalable model is:

```text
known identities
 -> bind open-data/official URLs
 -> group by brand/domain/template
 -> fetch each unique URL once
 -> parse each host family once
 -> apply exact branch-level evidence to many identities
```

Build queues such as:

- `zensho.co.jp`: N identities;
- `c-united.co.jp`: N identities;
- `doutor.co.jp`: N identities;
- `owst.jp`: N identities;
- independent WordPress sites: generic structured-data parser;
- no official URL: open-data-only P0 completion queue.

A host adapter should return structured candidate claims, never write directly into canonical production.

## 6. One fetch should extract every useful field

For each verified official page, extract in one pass:

### Structured markup

- JSON-LD `Restaurant`, `LocalBusiness`, `FoodEstablishment`;
- `openingHours` / `openingHoursSpecification`;
- `PostalAddress`;
- `servesCuisine`;
- `priceRange`;
- menu URL;
- telephone;
- canonical URL.

### Page structure

- branch name and address;
- hours / closed days;
- lunch and dinner sections;
- menu links;
- explicit price/budget statements;
- `おすすめ`, `人気`, `名物`, `看板`, `自慢` signals;
- same-origin sitemap/locator links.

### Menu documents

Follow a bounded number of likely menu links and PDFs. Prefer text extraction from HTML or text-based PDF. Image-only menu OCR is a lower-priority fallback because it is expensive and error-prone.

Store raw extraction in short-lived audit artifacts. Commit only resolved claims with provenance.

## 7. Rethink price coverage instead of leaving most rows unknown

The existing model accepts only explicit restaurant spend ranges. That is high precision but produces poor coverage.

Do not silently weaken that field. Instead separate **explicit budget** from **derived official menu price evidence**.

Suggested schema:

```json
{
  "priceProfile": {
    "lunch": {
      "band": [1000, 1999],
      "method": "official_menu_observed",
      "confidence": "B"
    },
    "dinner": {
      "band": [2000, 3999],
      "method": "explicit_average",
      "confidence": "A"
    }
  }
}
```

Evidence classes:

- **A** — explicit average/budget/spend range from an allowed exact source;
- **B** — official lunch/dinner menu with enough comparable main/set items to derive a transparent observed band;
- **C** — sparse item/course evidence; display/review only, do not use for hard filtering.

This lets the product improve budget filtering without pretending that a single menu item equals restaurant spend.

## 8. Opening-hours normalization

Keep both:

- raw source text;
- normalized weekly schedule;
- parser confidence;
- source URL + checked date.

Parsing stages:

1. Schema.org structured hours;
2. known host adapter;
3. OSM `opening_hours` syntax;
4. conservative Japanese free-text parser;
5. manual review if conflicting/irregular.

Do not force temporary/holiday notes into a weekly schedule.

## 9. Cuisine normalization

Use an evidence hierarchy:

1. exact official cuisine/brand/menu evidence;
2. consistent FSQ/Overture/OSM categories;
3. menu-content classification;
4. conservative name-based inference only as low-confidence staging evidence.

Map source categories into the existing Chinese display taxonomy through a versioned mapping table. Keep the original source category alongside the mapped value in maintenance evidence so mappings can be changed later without re-fetching sources.

## 10. Recommended/featured dishes

Keep the distinction, but automate candidate extraction more intelligently.

### Strict recommendation

Require DOM/text proximity between a concrete dish and explicit terms such as:

- おすすめ;
- 人気;
- 名物;
- 看板;
- 自慢.

### Featured dish

Can use:

- official menu heading prominence;
- brand signature menu sections;
- branch/brand `こだわり` sections;
- explicit specialty descriptions.

The automatic parser produces candidates. Promotion remains evidence-based.

## 11. Data model: field claims before canonical values

For bulk work, treat each source extraction as a set of field-level claims:

```text
entity / alias
field
value
source provider
source-native record ID or URL
checked_at
extraction method
confidence
lineage
```

The resolver then chooses the canonical value for production.

This is safer and more scalable than letting every scraper directly mutate restaurant rows. It also makes conflicting hours, names or prices auditable.

The current `source_enrichment_*.js` format can remain as the generated compatibility layer while a compact claim ledger is introduced behind it.

## 12. Immediate execution order

### Phase A — consume the already-paid transient seed now

1. download the successful full-collection + retry private artifacts;
2. merge retry rows into the original full sweep in memory;
3. combine with current production identities to cover the frozen 2,804 list;
4. match the transient seed against open-source snapshots;
5. commit only independent source bindings and independent fields;
6. discard the transient Google display payload after the bridge pass.

### Phase B — maximize P0 coverage

1. Foursquare OS Places benchmark/match;
2. Overture Places match;
3. local OSM match;
4. source-lineage-aware reconciliation;
5. build durable website/phone/category/address bindings.

### Phase C — process chains and repeated hosts

1. detect brand/domain clusters;
2. reuse relevant AllThePlaces spiders/official locator logic;
3. implement high-yield host adapters;
4. extract hours/menu/address/cuisine in one pass.

### Phase D — independent restaurants

1. generic JSON-LD/microdata parser;
2. same-origin menu/sitemap discovery;
3. bounded HTML/PDF menu extraction;
4. P1/P2/P3 field candidate generation.

### Phase E — human review only where it buys information

Manual review should target:

- high-value unresolved identities;
- source conflicts;
- ambiguous same-building matches;
- B-confidence price/hours promotion;
- strict dish recommendation evidence.

Do not manually inspect thousands of straightforward high-confidence source bindings.

## 13. New progress metrics

Stop using candidate discovery count as the headline metric.

Report:

- total known Area1 identities;
- identities with >=1 durable independent source binding;
- identities with >=2 genuinely independent evidence sources;
- P0-complete identities;
- cuisine coverage;
- official-site/locator coverage;
- explicit price A coverage;
- derived menu-price B coverage;
- normalized-hours coverage;
- featured/recommended dish coverage;
- unresolved identity/source conflicts;
- unique hosts/templates remaining;
- network fetches per newly completed field.

The useful optimization target is **fields completed per network fetch / per review minute**, not raw request count or raw POI count.
