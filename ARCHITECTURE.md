# Eat Architecture

## 1. Architecture summary

Eat remains intentionally static: no runtime application server, no runtime database, and no browser-side Places API key.

```text
OpenStreetMap / curated / Tabelog metadata
                 |
                 +------------------+
                                    |
Google Places verification --------+
(Place ID + transient QC only)      |
                                    v
                       canonical build step
                  build_production_dataset.mjs
                                    |
                                    v
                       production_area1.js
                                    |
                                    v
                         GitHub Pages artifact
                          (site assets only)
                                    |
                                    v
                    filter -> weighted random -> 3 cards
```

The central design distinction is:
- Google Places answers **which real business identity this source record corresponds to**;
- independent/curated sources provide long-lived display and recommendation metadata;
- the browser consumes one precompiled production dataset and performs no source matching.

## 2. Runtime frontend

### `index.html`
Current public page contains:
- a read-only current scope (`TOKYO / 地区1️⃣ / 1.2 km`);
- three optional filters;
- one generate action;
- one result container;
- compact database statistics;
- service attribution and privacy/terms links.

It loads exactly two JavaScript assets:
1. `data/production_area1.js`;
2. `app.js`.

Future profiles/areas are not shown as interactive controls until data exists.

### `app.js`
Browser responsibilities are deliberately limited to:
- filter state;
- absolute 1.2 km safety check;
- weighted Web Crypto random selection;
- cuisine-diversity preference;
- rendering three result cards;
- direct Place-ID-based Google Maps links;
- compact production statistics.

The browser does **not**:
- read raw OSM/Tabelog/Google maintenance datasets;
- match businesses by name/address;
- merge enrichment sources;
- render a Leaflet/OSM map for Google Places content;
- embed one map per restaurant;
- build a duplicate comparison table.

### `styles.css`
CSS owns presentation only: mobile-first yellow/white visual system, filter controls, cards, badges, statistics, and legal pages.

## 3. Canonical production build

### `scripts/build_production_dataset.mjs`
This is the data boundary between maintenance and runtime.

Inputs currently include:
- curated historical restaurant data;
- bulk/more Area1 enrichment data;
- `area1_osm.js`;
- manual Google identity hints;
- generated Google verification overlay;
- 百名店 metadata.

Build rules:
1. only `TOKYO / 地区1️⃣` is considered;
2. a production identity requires `googleStatus === 'verified'` and a Google Place ID;
3. rows sharing a Place ID collapse to one canonical entity;
4. an external row without a Place ID may enrich an entity only when its normalized name resolves to exactly one verified identity;
5. independently sourced coordinates/distance are preferred for durable geospatial metadata;
6. every production distance must be <=1,200 m;
7. missing budget/dishes/opening data stays missing;
8. duplicate Place IDs fail the build.

Output:
- `data/production_area1.js` generated at build/deploy time.

The generated file is the only restaurant dataset published to the browser.

## 4. Google identity and verification

### `scripts/verify_google_places.py`
Maps independent source candidates to Google Place IDs.

Workflow:
```text
source candidate
 -> Text Search (Place ID only)
 -> transient Place Details QC
 -> source-ID keyed verification result
 -> persist only status + Place ID + compact reason/version
```

Transient QC checks:
- permanently closed;
- Google location inside Area1;
- source/Google geographic compatibility;
- current food-related Google type;
- name compatibility for non-close matches.

Japanese/English transliteration is handled conservatively: a very close geographic hit from name-based Text Search may pass despite low literal string similarity; wider matches require stronger name evidence.

Generated overlay matching is by exact source ID rather than normalized name, avoiding same-name chain/branch collisions.

### Persistent Google state
Durable repository state is limited to fields needed for identity/audit, principally:
- source ID;
- verification status;
- Google Place ID;
- compact reject/pending reason;
- QC version.

Google display names, formatted addresses, coordinates, Maps URIs and place types used for verification are transient and are not written into the long-lived verification cache.

## 5. Google coverage discovery

### `scripts/discover_google_area1.py`
Purpose: coverage audit of food-related Google business identities inside Area1.

The script:
- queries overlapping nearby-search cells;
- splits dense queries by current food-related place types to reduce the 20-result truncation risk;
- uses coordinates/business status only transiently to enforce the 1.2 km boundary and remove permanent closures;
- persists only the deduplicated Google Place ID inventory.

Output:
- `data/area1_google_ids.json`.

This inventory measures Google-side identity coverage. A Place ID in the inventory is not automatically browser-ready until independent long-lived metadata is attached to it.

### Legacy full Places cache migration
`scripts/migrate_google_inventory.py` extracts Place IDs from the historical full Google discovery dataset without making API calls.

`.github/workflows/migrate-google-storage.yml` then removes the legacy full Places JSON/JS after the ID inventory has been preserved.

## 6. Independent data sources

### OpenStreetMap
`scripts/build_area1_osm.py` collects independent food POI candidates and durable geospatial metadata inside the Area1 radius.

OSM candidates do not enter production until Google identity verification succeeds.

### Tabelog / official / curated enrichment
Useful for factual enrichment such as:
- cuisine taxonomy;
- lunch/dinner price bands;
- representative dishes;
- opening hours / regular holidays;
- 百名店 metadata.

Identity matching should prefer Place ID and branch-aware evidence. Ambiguous enrichment remains unresolved.

## 7. Recommendation algorithm

```text
canonical production rows
 -> absolute <=1.2 km check
 -> optional cuisine exclusion
 -> optional budget filter
 -> optional preferred distance
 -> group by primary cuisine
 -> weighted random picks across distinct cuisine groups
 -> if fewer than 3 cuisine groups remain, fill remaining slots from other eligible rows
 -> shuffle -> 3 cards
```

Hard rule: if at least three distinct production entities satisfy filters, return three.

Cuisine diversity is a preference, not a failure condition.

Weights:
- ordinary: `1.0`;
- verified 百名店: `2.2`.

No rating/review popularity ranking is used.

## 8. Budget behavior

Lunch and dinner remain separate fields.

The browser no longer chooses a budget field based on local clock time. A budget-specific filter passes when at least one known lunch/dinner interval overlaps the selected band. The card displays available lunch/dinner bands explicitly.

## 9. Result presentation

Current result UI is intentionally one layer:
- three cards;
- primary facts needed to decide;
- direct Google Maps link with `query_place_id`.

Removed as redundant for the current use case:
- Leaflet overview map;
- per-restaurant embedded maps;
- horizontal three-store comparison table.

## 10. Deployment and validation

### `.github/workflows/pages.yml`
Deployment flow:
1. checkout;
2. build canonical dataset;
3. syntax check + repository audit;
4. assemble `_site` containing only deployable assets;
5. deploy `_site` to Pages.

Raw maintenance files, scripts and verification caches are not copied into the public artifact.

### `scripts/audit_repository.mjs`
Blocking checks include:
- canonical production pool >=3;
- unique Google Place IDs;
- all production rows verified;
- all distances within 1.2 km;
- no Google Places response fields such as Maps URI/display name/business status/type in the canonical production records;
- public `index.html` does not load Leaflet, legacy Google payloads or maintenance overlays;
- public page loads only production data + `app.js`.

### `.github/workflows/pr-review.yml`
Read-only PR validation workflow. It does not deploy and does not receive the Google API secret.

## 11. Security and policy boundaries

- `GOOGLE_MAP_API` stays in GitHub Actions Secrets.
- Browser JavaScript never receives the Places API key.
- Google field masks are kept narrow.
- Place ID is the durable Google identity key.
- Google Places response content used for QC is transient unless current platform terms explicitly permit storage.
- The public UI includes Google Maps attribution and uses direct Google Maps navigation links.
- OSM-derived public metadata retains OpenStreetMap attribution.

## 12. Remaining work

Non-blocking architecture/product work:
1. expand Google verification coverage for the Area1 independent-source pool;
2. enrich budget/dishes/opening information for verified entities;
3. improve Place-ID-centric Tabelog/award matching;
4. audit Google coverage inventory vs verified independent-source coverage;
5. implement Area2/SHIZUOKA only when their data is ready;
6. design opening/holiday exclusion rules before enabling them;
7. add local interaction history only after persistence/privacy semantics are defined.
