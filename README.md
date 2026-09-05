# Eat

A lightweight static “今天吃什么？” restaurant decision page.

Live site: `https://nekooweb.github.io/eat/`

## Product goal

Help the user make a fast nearby-restaurant decision without turning the page into a ranking/review portal.

Current public scope:
- `TOKYO / 地区1️⃣` only;
- strict straight-line production boundary <=1.2 km from a private internal anchor;
- optional cuisine exclusion;
- optional budget filter only when enough budget metadata exists;
- 300 m / 500 m / 800 m / 1.2 km distance choices;
- exactly three randomized proposals whenever at least three entities satisfy the current constraints;
- spatial overview, per-store map context and direct three-store comparison for each result set.

Future areas/profiles are not exposed as clickable UI until their production datasets exist.

## Architecture in one sentence

**Independent restaurant metadata + Google Place ID verification -> reviewed Place-ID source bindings -> deploy-time canonical dataset -> static browser filtering/randomization/visualization.**

There is no runtime application server, runtime database or visitor-time Places API request.

## Runtime stack

- static HTML;
- CSS;
- vanilla JavaScript;
- Leaflet + OpenStreetMap tiles for result maps;
- one generated canonical restaurant dataset;
- direct Google Maps navigation links;
- GitHub Pages hosting.

The browser does not perform source matching and does not load raw OSM/Tabelog/Google maintenance files. Leaflet only visualizes independently maintained coordinates that are already present in the canonical dataset.

## Maintenance/data stack

- Python/Node maintenance scripts under `scripts/`;
- OpenStreetMap candidate collection and independent geospatial metadata;
- Google Places API (New) for business identity/QC;
- Place-ID keyed Tabelog/official source-resolution and field enrichment;
- curated source-backed metadata and 百名店 enrichment;
- GitHub Actions for verification, canonical build, source-binding audit, coverage reporting and deployment.

Google credentials are maintenance-only GitHub Secrets and are never shipped to the browser.

## Identity and data model

A production restaurant requires a verified Google Place ID.

Google Places is the **business identity/QC gate**, not the permanent application database. Google display name/address/location/status/type fields used during verification are transient QC inputs. Durable display/recommendation metadata is maintained independently where possible.

Every production identity must also have a source-resolution terminal state. It is either:
- attached to a current usable Tabelog or restaurant/organization official source; or
- explicitly recorded as `ambiguous`, `listing_hold`, `no_current_usable_source`, or `source_not_found` with reviewed evidence.

This prevents unknown source state from being confused with genuinely missing metadata and prevents same-name/chain branch pages from being attached speculatively.

Persistent production information includes:
- name/cuisine;
- independent address/coordinates/distance;
- optional lunch/dinner budget;
- optional representative dishes;
- optional opening/holiday notes;
- Google Place ID + verified state;
- optional 百名店 metadata;
- compact source provenance.

Unknown optional metadata remains unknown and is not fabricated.

## Current production baseline

Latest passing 2026-09-05 source-resolution build:
- OSM candidates: 990;
- Google verification cache: 274 verified / 225 rejected / 0 pending;
- processed OSM candidates: 499 / 990; candidates with no cache entry: 491;
- canonical production entities: 269;
- unique Google Place IDs: 269;
- current usable Tabelog/official source bindings: 237 / 269 (88.1%);
  - Tabelog-backed: 221;
  - official-source-backed: 16;
- explicit source-resolution terminal records: 32;
  - `ambiguous`: 27;
  - `listing_hold`: 2;
  - `no_current_usable_source`: 1;
  - `source_not_found`: 2;
- **source-resolution coverage: 269 / 269 = 100%; unresolved: 0**;
- distinct cuisine labels: 33;
- generic `餐厅` cuisine rows: 22;
- budget known: 95;
- schedule/holiday known: 154;
- representative dishes known: 20;
- display address known: 61;
- 百名店: 19.

The 100% source-resolution figure counts 237 usable sources plus 32 documented exceptions. It measures whether a source outcome was recorded, not field completeness or current business status. Of the usable-source records, 114 currently declare only name evidence. `pending:0` applies to processed cache entries; 491 candidates have not been checked.

Distance pools:
- <=300 m: 116;
- <=500 m: 192;
- <=800 m: 269;
- <=1,200 m: 269.

The farthest production record is approximately 741 m away. The 800–1,200 m ring currently contains no production restaurants, so the 800 m and 1.2 km choices have identical pools.

The original half-pool was concentrated in nearer source rows; future half-mode verification now uses distance-balanced sampling so the same bias is not repeated.

Historical Google-first discovery produced 1,613 unique Area1 Place IDs. That result is stored as a Place-ID-only coverage inventory rather than a full Google Places browser dataset.

## User-facing behavior

### Filters
- Cuisine: no selections means unrestricted; selected primary cuisines are excluded.
- Budget: `不限` means unrestricted. The module is available now that substantially more production entities carry source-backed budget metadata.
- Distance: 1.2 km is the neutral choice and absolute production boundary.

Separate enable/disable switches are intentionally not used because they duplicate those neutral states.

### Random selection
- Web Crypto randomness;
- prefer different cuisine groups;
- if fewer than three cuisine groups remain but >=3 restaurants remain, still return three;
- 百名店 sampling weight: 2.2 vs ordinary 1.0;
- no rating/review-count popularity ranking.

### Results
A successful result intentionally has complementary views rather than a card-only layout:

1. **Three-store overview map** — Leaflet/OpenStreetMap, numbered 1–3, showing where the three generated choices sit relative to one another.
2. **Three restaurant cards** — name, cuisine, distance, known metadata, 百名店 badge, a small per-store Leaflet map and direct Google Maps navigation.
3. **Three-store comparison table** — cuisine, distance, budget, dishes, schedule/holiday data and 百名店 status in one horizontal comparison.
4. **Google Maps business link** — verified Place-ID-based navigation/business lookup remains separate from the OSM visualization layer.

The Leaflet maps use canonical independent coordinates, not transient Google Places response coordinates.

## Repository map

### Public frontend
- `index.html` — current Area1 scope, filters, Leaflet dependency, result container, attribution/legal links.
- `styles.css` — mobile-first yellow/white UI, cards, maps and comparison layout.
- `app.js` — filtering, weighted random selection, map rendering and result comparison.

Public application runtime includes:
1. Leaflet as the map presentation library;
2. `data/production_area1.js` — generated during build;
3. `app.js`.

Only the latter two are local application JavaScript/data dependencies.

### Maintenance data
- `data/restaurants.js` — early curated records;
- `data/area1_bulk.js` / `data/area1_more.js` — historical/curated enrichment records;
- `data/area1_osm.js` — independent OSM Area1 candidates;
- `data/hyakumeiten.js` — award enrichment;
- `data/google_entities.js` — conservative manual Place-ID hints/corrections;
- `data/google_entities.generated.js` — source-ID keyed verification overlay;
- `data/google_places_cache.json` — compact Place-ID/QC state;
- `data/area1_google_ids.json` — 1,613-ID Google Area1 coverage inventory;
- `data/source_enrichment*.js` — reviewed Place-ID keyed Tabelog/official source bindings and field-level enrichment shards;
- `data/source_resolution*.js` — terminal records for production identities that cannot safely attach to a current usable Tabelog/official page.

These maintenance files are not directly published as runtime data.

### Maintenance/build scripts
- `scripts/build_area1_osm.py` — collect independent OSM candidates inside Area1;
- `scripts/verify_google_places.py` — source -> Google Place ID verification, QC v4;
- `scripts/verify_curated_google.py` — targeted verification for curated/OSM overlap candidates;
- `scripts/discover_google_area1.py` — Place-ID-only Google coverage discovery;
- `scripts/migrate_google_inventory.py` — one-time legacy full Places -> ID-only migration;
- `scripts/build_production_dataset.mjs` — canonical one-Place-ID-per-entity build;
- `scripts/audit_repository.mjs` — blocking integrity/runtime contract checks;
- `scripts/audit_source_bindings.mjs` — blocking source-binding/resolution identity audit;
- `scripts/source_queue.mjs` — source-resolution completeness and unresolved queue report;
- `scripts/coverage_report.mjs` — coverage/completeness diagnostics.

### GitHub Actions
- `.github/workflows/pages.yml` — canonical build, source/repository audit, coverage reports, private data-audit artifact and minimal Pages deployment;
- `.github/workflows/pr-review.yml` — read-only PR validation;
- `.github/workflows/refresh-area1.yml` — OSM candidate refresh;
- `.github/workflows/verify-google-places.yml` — staged Google verification;
- `.github/workflows/discover-google-area1.yml` — Place-ID-only coverage discovery;
- `.github/workflows/migrate-google-storage.yml` — legacy storage migration.

Pages publishes an assembled `_site` containing only deployable assets, not the maintenance repository. Data/source audit reports are uploaded as short-lived private workflow artifacts instead of public site files.

## Validation invariants

CI blocks release when:
- canonical production contains fewer than three entities;
- a production Place ID is missing/duplicated;
- a production entity is not verified;
- a production distance is outside 1.2 km;
- a source-enrichment row does not attach to a current production Place ID;
- a source-resolution record does not attach to a current production Place ID, duplicates a usable source binding, lacks a supported terminal status, or lacks evidence;
- forbidden persisted Google Places response fields reappear in canonical browser data;
- raw maintenance overlays are loaded by the public page;
- the Leaflet overview map, per-store maps or three-store comparison table disappears;
- an iframe-map implementation is introduced;
- redundant filter toggle state or the generic verification badge reappears;
- required Google Maps/OpenStreetMap attribution disappears.

## Documentation

- `REQUIREMENTS.md` — authoritative current product/data requirements;
- `ARCHITECTURE.md` — current frontend/build/verification architecture;
- `DEVELOPMENT.md` — review status and next data priorities;
- `DATA_PIPELINE.md` — source roles and record lifecycle;
- `DATA_RESEARCH.md` — historical/manual research notes;
- `CHANGELOG.md` — implementation and decision history.

Priority when information conflicts:
1. latest explicit product-owner requirement;
2. `REQUIREMENTS.md`;
3. current verified implementation behavior;
4. `ARCHITECTURE.md` / `DEVELOPMENT.md` / `DATA_PIPELINE.md`;
5. historical research/log entries.

## Next work

The current phase is **operating-status recheck followed by field enrichment**. The following work is planned; the latest documentation review did not add restaurant data:

1. Recheck current Google status for キッチン グラン, 明神丸 and カフェ ド クルーセ. Their source records flag operating-status questions, but all three remain in production.
2. Enrich the 237 existing usable-source restaurants: budget, opening/regular holidays, cuisine, representative dishes and address. In this subset, 142 lack budget, 102 lack schedule information, 22 retain generic cuisine, 217 lack dishes and 191 lack an address.
3. Resolve the 27 branch-ambiguous source records and revisit the two source-not-found cases; then target verification in the empty 800–1,200 m production ring. Keep the 7 curated-overlap candidates as a separate expansion queue.
4. Implement opening/holiday exclusion after schedule coverage and semantics are ready. It is currently display-only. Area2/SHIZUOKA follow the Area1 data work.

Keep the current 19 百名店 records, all of which already have year/category fields, and check new award additions against the correct branch. Record per-batch additions, remaining gaps, provenance and validation results in `DEVELOPMENT.md` and `CHANGELOG.md`.

Do not rerun the full Google coverage discovery merely to improve source verification; the 1,613-ID identity inventory is already preserved.
