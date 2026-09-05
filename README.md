# Eat

A lightweight static “今天吃什么？” restaurant decision page.

Live site: `https://nekooweb.github.io/eat/`

## Product goal

Help the user make a fast nearby-restaurant decision without turning the page into a ranking/review portal.

Current public scope:
- `TOKYO / 地区1️⃣` only;
- strict straight-line production boundary <=1.2 km from the internal Area1 anchor;
- optional cuisine exclusion;
- optional budget filter when metadata exists;
- 300 m / 500 m / 800 m / 1.2 km distance choices;
- exactly three randomized proposals whenever at least three entities satisfy the constraints;
- Leaflet/OpenStreetMap overview map, per-store maps and three-store comparison;
- direct Google Maps navigation by verified Place ID.

Future areas/profiles are not exposed until production data exists.

## Architecture in one sentence

**Independent restaurant metadata + Google Place ID verification -> reviewed Place-ID source bindings -> deploy-time canonical dataset -> static browser filtering/randomization/visualization.**

There is no runtime application server, runtime database or visitor-time Places API request.

## Runtime stack

- static HTML/CSS/vanilla JavaScript;
- Leaflet + OpenStreetMap tiles;
- one generated canonical restaurant dataset;
- direct Google Maps navigation links;
- GitHub Pages.

The browser does not perform source matching and does not load raw OSM/Tabelog/Google maintenance files.

## Data-source roles

### Google Places / Places Aggregate
Used for:
- durable Google Place ID identity;
- transient business/location/type/status QC;
- exact Area1 food-business identity counting and Place-ID inventory.

Google-returned display name, formatted address, coordinates, business status, type and Maps URI are not the permanent restaurant database.

### OpenStreetMap
Used as an independent candidate/geospatial source for name/category/coordinates and coverage leads.

### Tabelog / official restaurant sources
Used for durable branch-specific facts such as:
- exact/current name;
- cuisine;
- lunch/dinner budget;
- opening hours and regular holidays;
- representative dishes;
- current listing/closure evidence;
- 百名店 metadata.

## Exact Area1 identity inventory

The exact Google-derived count phase is complete as of 2026-09-05.

- strict radius: **1,200 m**;
- exact in-scope operational food-business count: **2,804**;
- enumerated unique Place IDs: **2,804 / 2,804**;
- inventory: `data/area1_google_ids.json`;
- method: `places_aggregate_geodesic_partition_boundary_qc_v3`;
- `complete:true`;
- `coverageVerified:true`;
- `independentCountVerified:true`.

The food-business scope includes restaurant/cafe/bakery/bar/takeaway and related configured food-service types. `2,804` is not a count of every retail shop or every Google Maps POI category.

The prior gridded Nearby Search inventory contained 1,613 IDs and was only a lead set. The exact inventory adds 1,215 IDs and excludes 24 old IDs under the current operational/type/radius criteria.

See `AREA1_COMPLETENESS.md` for the reproducible completeness logic and reconciliation accounting.

## Current production baseline

Latest passing 2026-09-05 build after full OSM verification and exact Area1 discovery:

- OSM source candidates: 990;
- Google QC-v4 cache: **990 / 990 processed**;
  - verified source rows: 526;
  - rejected source rows: 464;
  - pending: 0;
- canonical production entities: **517**;
- unique production Place IDs: 517;
- production entities represented in the exact Google inventory: 515;
- usable Tabelog/official source bindings: 237;
  - Tabelog: 221;
  - official: 16;
- explicit terminal source resolutions inherited from the previous source pass: 32;
- production source outcomes already accounted for: 269 / 517;
- newly unresolved production source queue: **248**.

Current field coverage:
- cuisine known: 425 / 517;
- budget known: 95 / 517;
- opening/holiday information known: 202 / 517;
- representative dishes known: 20 / 517;
- display address known: 95 / 517;
- 百名店: 22.

Distance pools:
- <=300 m: 116;
- <=500 m: 192;
- <=800 m: 295;
- <=1,200 m: 517.

The previously empty 800–1,200 m ring now contains **222 production entities**.

## Remaining exact-inventory reconciliation

The exact count and the production count intentionally differ.

Current exact-identity audit:
- exact inventory IDs: 2,804;
- unique verified IDs in the source-verification cache: 516;
- verified IDs covered by the exact inventory: 513;
- exact-inventory IDs without a verified independent-source identity: **2,291**;
- rejected source-match IDs still present in the exact inventory: 91;
- verified source IDs outside the exact inventory: 3.

`2,291` is a reconciliation queue, not a claim that 2,291 restaurants should be blindly admitted. Each identity still needs an independent-source relationship or an explicit reviewed outcome.

## Identity and data model

A production restaurant requires a verified Google Place ID and an independent <=1,200 m production distance.

Canonical identity is one row per Place ID. Durable fields are maintained independently where possible. Unknown optional metadata remains unknown and is never fabricated.

Production information can include:
- name/cuisine;
- independent address/coordinates/distance;
- optional lunch/dinner budget;
- optional representative dishes;
- optional opening/holiday notes;
- Google Place ID + verified state;
- optional 百名店 metadata;
- compact source provenance.

Source-resolution states for identities without a safe current Tabelog/official binding are:
- `ambiguous`;
- `listing_hold`;
- `no_current_usable_source`;
- `source_not_found`.

## User-facing behavior

### Filters
- Cuisine: no selections means unrestricted; selected primary cuisines are excluded.
- Budget: `不限` means unrestricted.
- Distance: 1.2 km is the neutral choice and absolute production boundary.

### Random selection
- Web Crypto randomness;
- prefer different cuisine groups;
- if fewer than three cuisine groups remain but >=3 restaurants remain, still return three;
- 百名店 sampling weight: 2.2 vs ordinary 1.0;
- no rating/review-count popularity ranking.

### Results
1. Three-store Leaflet/OpenStreetMap overview map.
2. Three restaurant cards with known metadata, small per-store maps and Google Maps navigation.
3. Three-store comparison table.
4. Place-ID-based Google Maps business/navigation link.

## Repository map

### Public frontend
- `index.html` — scope, filters, Leaflet dependency, result container and legal links;
- `styles.css` — mobile-first UI and result/map/comparison layout;
- `app.js` — filtering, weighted random selection, map rendering and comparison;
- `data/production_area1.js` — generated canonical runtime data.

### Maintenance data
- `data/restaurants.js` — early curated records;
- `data/area1_bulk.js`, `data/area1_more.js` — historical/curated enrichment;
- `data/area1_osm.js` — independent OSM Area1 candidates;
- `data/hyakumeiten.js` — award enrichment;
- `data/google_entities.js` — conservative manual Place-ID hints/corrections;
- `data/google_entities.generated.js` — source-ID keyed QC overlay;
- `data/google_places_cache.json` — compact Place-ID/QC state;
- `data/area1_google_ids.json` — exact 2,804-ID Area1 coverage inventory;
- `data/source_enrichment*.js` — reviewed Place-ID keyed Tabelog/official field enrichment;
- `data/source_resolution*.js` — explicit terminal source states.

Maintenance files are not directly published as runtime data.

### Maintenance/build scripts
- `scripts/build_area1_osm.py` — collect OSM candidates;
- `scripts/verify_google_places.py` — source -> Google Place ID QC v4;
- `scripts/verify_curated_google.py` — targeted curated-overlap verification;
- `scripts/discover_google_area1.py` — exact Place-ID-only Google coverage discovery;
- `scripts/audit_area1_identity_coverage.mjs` — independent exact-inventory gate and reconciliation counts;
- `scripts/build_production_dataset.mjs` — canonical one-Place-ID-per-entity build;
- `scripts/audit_repository.mjs` — blocking repository/runtime audit;
- `scripts/audit_source_bindings.mjs` — source-binding/resolution integrity audit;
- `scripts/source_queue.mjs` — source-resolution queue;
- `scripts/coverage_report.mjs` — coverage diagnostics.

### GitHub Actions
- `.github/workflows/pages.yml` — canonical build, audits, private data-audit artifact and Pages deployment;
- `.github/workflows/pr-review.yml` — read-only PR validation;
- `.github/workflows/refresh-area1.yml` — OSM candidate refresh;
- `.github/workflows/verify-google-places.yml` — staged/full Google verification;
- `.github/workflows/discover-google-area1.yml` — exact Area1 identity discovery.

## Validation invariants

CI/research gates protect:
- unique verified production Place IDs;
- <=1,200 m production boundary;
- independently counted exact Area1 inventory before it can be called complete;
- valid source bindings/resolution states;
- absence of forbidden long-lived Google Places response fields in browser data;
- no raw maintenance overlays in the public site;
- required overview map, per-store maps and comparison table;
- Google Maps/OpenStreetMap attribution.

## Documentation

- `REQUIREMENTS.md` — product/data requirements;
- `ARCHITECTURE.md` — frontend/build/verification architecture;
- `DEVELOPMENT.md` — development review and planning history;
- `DATA_PIPELINE.md` — source roles and record lifecycle;
- `AREA1_COMPLETENESS.md` — authoritative current 1.2 km completeness state;
- `DATA_RESEARCH.md` — historical/manual research notes;
- `CHANGELOG.md` — implementation and decision history.

When numerical progress statements conflict, use the newest audited result in `AREA1_COMPLETENESS.md` and current CI output.

## Next data work

The current phase is **full-information reconciliation after identity-count completion**.

Ordered queue:
1. resolve/enrich the **248 newly admitted OSM-backed production identities** first; they already have independent name/location and a verified Google identity;
2. process the **2,291 exact-inventory IDs without a verified independent-source identity**, using Google only transiently to locate an independent durable source;
3. reconcile the 91 rejected source matches that still point to an exact-inventory identity;
4. review the 3 verified-source IDs outside the exact inventory separately rather than weakening the radius gate;
5. continue field completion for budget, hours/holidays, cuisine, dishes, address and awards with branch-specific provenance.

Do not rerun broad Google discovery merely to fill Tabelog/official fields: the exact 2,804-ID identity universe is now established.
