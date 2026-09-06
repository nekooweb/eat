# Eat Development Plan

Updated: 2026-09-06

## Current state

`TOKYO / 地区1️⃣` has completed the expensive candidate/identity capture stage. The confirmed historical Area1 snapshot contains **2,804** identities.

Current audited production baseline:

- frozen historical inventory: **2,804** Place IDs;
- canonical production: **656**;
- production inside frozen inventory: **653**;
- current inventory-only legacy IDs: **2,151**;
- source-backed production: **404 / 656**;
- source outcomes accounted for: **448 / 656**;
- unresolved current-production source queue: **208**;
- official-site index: **194** identities;
- cuisine known: **579**;
- address known: **268**;
- normalized opening hours: **287**;
- budget known: **192**;
- featured dishes: **129**;
- strict recommendations: **30**;
- 百名店: **22**.

The successful 2026-09-06 full-collection Actions artifact plus its retry artifact contain the transient matching inputs for the identities that were inventory-only during the sweep. The retry resolved all transient fetch failures. **Do not repeat that paid collection.**

`DATA_ENRICHMENT_PROGRESS.md` remains the numeric progress report. `ENRICHMENT_STRATEGY.md` defines the general enrichment architecture. `HOTPEPPER_ENRICHMENT.md` defines the primary structured enrichment path under the project's stated non-commercial/authorized Hot Pepper use.

## Primary goal: enrich the known list

Candidate discovery is no longer the main bottleneck.

The next development cycle should optimize this question:

> For the already-known Area1 restaurant list, how many useful, maintainable fields can be completed per network fetch and per review minute without paid data APIs?

Priority order:

### P0 — complete first

- durable independent identity/source binding;
- current existence evidence;
- name/aliases;
- coordinates/address;
- cuisine/type;
- official website/locator when available.

### P1 — improve filtering

- lunch/dinner price evidence;
- explicit or transparently derived price band with evidence class.

### P2 — useful display context

- normalized opening hours;
- regular closed days;
- phone;
- menu URLs.

### P3 — optional enrichment

- featured dishes;
- strict recommendation evidence;
- descriptive fields.

Do not spend substantial crawling/review effort on P3 while P0/P1 coverage is still weak.

## Paid data API prohibition

Repository maintenance must not execute billable place/search/map data APIs.

This is a hard engineering constraint:

- no live Google Places / Area Insights / Text Search / Place Details / `websiteUri` calls;
- no paid place/search API as a fallback;
- no Google Maps/Places secret in maintenance workflows;
- no API key injected into the Pages artifact;
- existing Google Place IDs and historical QC state are frozen compatibility/alias inputs;
- retired paid scripts remain fail-closed;
- CI runs `scripts/audit_no_paid_apis.mjs`.

Free/authorized APIs are allowed when their use is consistent with the project's authorization and provider requirements. API keys must remain in secrets and must never be committed.

## Immediate high-value opportunity: consume the existing transient sweep

The already-paid private Actions artifacts expire quickly and should be used once as a **transient bridge**, not as the durable database.

Bridge workflow:

1. download the successful full-collection and retry artifacts;
2. merge retry rows into the original sweep in memory;
3. combine them with existing production identities so the complete 2,804 historical list can participate in matching;
4. use transient name/address/coordinate/type signals only to match independent/authorized sources;
5. persist permitted independent/authorized IDs, URLs and field-level evidence;
6. do not commit the transient Google display payload.

This extracts maximum value from the collection that has already been paid for without making another paid request.

## Primary structured enrichment: Hot Pepper

Under project-owner guidance, the Area1 project is non-commercial and the intended Hot Pepper API use is treated as separately authorized/confirmed.

Hot Pepper therefore becomes the first structured enrichment layer for the known list.

### Do not call once per restaurant

Use a two-stage batch model:

1. **initial Hot Pepper binding** — query the Area1 neighborhood geographically with `type=lite`, `count=100`, paginate, crop locally to 1.2 km, then match to the already-known identity seed;
2. **detail/refresh** — once Hot Pepper IDs are bound, request full data with up to **20 shop IDs per API request**.

This should reduce a potential thousands-of-request process to a small geographic pagination pass plus tens of batched detail requests.

### High-value Hot Pepper fields

Use the authorized API for candidate claims covering:

- Japanese name and kana;
- address and coordinates;
- genre/sub-genre and genre catch;
- dinner budget code/range/average;
- budget memo;
- opening-hours text;
- regular closed days;
- lunch availability;
- Hot Pepper shop URL/source identity.

`lunch=あり` proves lunch availability but does not provide a lunch budget. Lunch price remains an official-menu/source enrichment task.

Hot Pepper-derived public information should carry the required `Powered by ホットペッパーグルメ Webサービス` credit. Do not ingest Hot Pepper images in the current phase.

The public general Recruit terms contain stricter default cache/database rules; the repository should not claim that non-commercial use alone creates an exemption. The project's separate authorization assumption controls this design, and the persistence/refresh policy should be revisited if the actual authorization scope differs.

## Secondary enrichment sources

Do not designate one replacement POI database as universal truth.

Use the best source for each remaining gap/conflict.

### Open bulk POI sources

Use primarily for unmatched identities and cross-checks:

- **Foursquare Open Source Places** for currentness, FSQ identity, category, website, phone, address and coordinates;
- **Overture Maps Places** for multilingual names, taxonomy, websites/phones/brand, addresses, confidence, source lineage and GERS identity;
- **OpenStreetMap** for independent geospatial data, cuisine, `opening_hours`, address and website/contact tags.

Overture is itself a conflated multi-provider dataset. Source lineage must be considered before treating two agreeing records as genuinely independent evidence.

### Official/brand sources

Promote official locators to a first-class completion route after the Hot Pepper structured pass.

- reuse relevant **AllThePlaces** Japanese spiders where they already encode official locator logic;
- add small host adapters for high-yield restaurant groups not covered there;
- process identities by brand/domain/template rather than one restaurant at a time.

Official/menu sources are especially important for:

- lunch budget;
- menu/signature dishes;
- strict recommendations;
- exact branch conflicts;
- restaurants not covered by Hot Pepper.

## Matching model

The completed sweep is not suitable for exact-name matching only. A large portion of Japanese identities were returned with romanized/English display names.

Use blocked multi-signal record linkage:

- spatial distance;
- Japanese/Latin aliases;
- address/postal/building tokens;
- phone;
- official domain;
- brand + branch;
- category compatibility;
- historical reviewed bindings.

Move from a universal hand-tuned threshold toward a calibrated probabilistic linkage model for ambiguous cases, while enforcing one-to-one/source-uniqueness constraints.

For Area1 scale, a DuckDB/Splink-style workflow is practical.

## Host-first batch extraction

After the Hot Pepper structured pass, the preferred website-processing unit is a **host/template**, not a restaurant.

```text
known identities
 -> Hot Pepper/open-data/source bindings
 -> official URLs
 -> group by host/brand/template
 -> fetch each URL once
 -> extract all useful fields in one pass
 -> emit field claims
 -> resolve/promote canonical values
```

High-yield repeated hosts and chain locators should be processed before difficult independent exceptions.

## Extract all useful fields in one official-source pass

From each official page/locator, collect candidate evidence for:

- exact branch identity;
- name/address/phone;
- cuisine;
- weekly opening hours and closed days;
- explicit budget/average-spend statements;
- lunch/dinner menu prices;
- menu URLs;
- featured/signature dishes;
- strict recommendation signals.

Parse structured data first:

- JSON-LD / Schema.org;
- stable locator JSON/API payloads exposed by the official site;
- embedded application state;
- HTML semantic sections.

Then follow only a bounded set of likely menu/detail links. Avoid repeatedly refetching already-saturated pages.

## Price model should be expanded, not silently weakened

The old `budget` rule accepts only explicit spend ranges. That preserves precision but leaves most rows unknown.

Hot Pepper can now provide a large structured dinner-budget layer. Keep lunch and other derived evidence explicit through a `priceProfile` concept:

- **A** — explicit average/budget/spend range from an authorized exact structured source or official source;
- **B** — official lunch/dinner menu with enough comparable main/set items to derive an observed band;
- **C** — sparse item/course prices; review/display evidence only, not hard filtering.

Do not pretend a single menu item equals restaurant budget. The new model should improve filter coverage while exposing how the band was obtained.

## Field-claim architecture

Bulk collectors should not directly mutate canonical restaurant rows.

Each extraction should produce field-level claims containing:

- entity/alias key;
- field;
- value;
- source provider;
- source-native record ID or URL;
- checked date;
- extraction method;
- confidence;
- lineage.

A resolver chooses canonical values afterward. Existing `source_enrichment_*.js` shards can remain as generated compatibility output while a compact claim ledger is introduced behind them.

## Development order

1. **Consume the already-paid transient full-list artifacts before expiry**; do not rerun Google.
2. Run Hot Pepper geographic bulk discovery for Area1 and build Hot Pepper-ID bindings to the known list.
3. Fetch matched Hot Pepper details in 20-ID batches and generate field claims for address, cuisine, dinner budget, hours/close, aliases and source URL.
4. Rebuild an enrichment coverage matrix for all known identities.
5. Use FSQ OS + Overture + local OSM primarily for unmatched identities and conflict resolution.
6. Detect repeated brands/domains and run AllThePlaces/official-locator adapters for remaining gaps.
7. Upgrade generic official-page extraction to emit all field claims in one pass, prioritizing lunch prices and menu/dish information.
8. Add evidence-classed `priceProfile` generation.
9. Normalize opening hours through structured Hot Pepper/official text -> host adapter -> OSM syntax -> conservative Japanese text parser.
10. Use manual review only for high-value ambiguity/conflicts, not straightforward bulk matches.
11. Rebuild/audit production after material batches.
12. Add Hot Pepper service credit before publishing Hot Pepper-derived data publicly.

## New progress metrics

Headline metrics should be enrichment-oriented:

- known identities with a Hot Pepper binding;
- identities with >=1 durable independent/authorized source binding;
- identities with >=2 genuinely independent source signals;
- P0-complete identities;
- cuisine coverage;
- Hot Pepper dinner-budget coverage;
- official lunch-price coverage;
- normalized-hours coverage;
- official website/locator coverage;
- featured/recommended dish coverage;
- unresolved high-value conflicts;
- remaining unique hosts/templates;
- **fields completed per network fetch / per review minute**.

The 2,804 count remains the known historical list size, not a reason to keep rediscovering restaurants.

## Runtime contract

The public product remains a static GitHub Pages application. Recommendation behavior remains: <=1,200 m scope, current canonical production identities, cuisine/budget/distance filters, three distinct results when possible, cuisine-diversity preference, Web Crypto randomness, 百名店 weight 2.2, and no rating/review popularity ranking.

Embedded maps use Leaflet/OpenStreetMap. Ordinary external Google Maps navigation links may remain because they are normal web links rather than API execution.
