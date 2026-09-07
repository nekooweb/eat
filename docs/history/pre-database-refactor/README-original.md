# Eat

A lightweight static “今天吃什么？” restaurant decision page.

Live site: `https://nekooweb.github.io/eat/`

## Current Area1 status

`TOKYO / 地区1️⃣` uses a strict straight-line production boundary of **1.2 km**.

The exact identity-count phase is complete for the repository's configured food-business scope:

- exact in-scope operational food businesses: **2,804**;
- exact unique Google Place IDs: **2,804 / 2,804**;
- identity inventory: `data/area1_google_ids.json`;
- method: `places_aggregate_geodesic_partition_boundary_qc_v3`;
- complete / coverage verified / independent count verified.

This is the complete count of the project's configured food-service universe (restaurants, cafes, bakeries, bars/pubs, takeaway and related types), **not every retail shop or every Google Maps POI category**.

Current independently sourced / production state:

- OSM food-business candidates: **1,273**;
- Google QC-v4: **658 verified / 615 rejected / 0 pending**;
- canonical production: **648** unique Place IDs;
- production identities present in exact Google inventory: 645;
- exact-inventory IDs with verified independent-source coverage: **643**;
- exact-inventory identity-reconciliation queue: **2,161**;
- usable Tabelog/official bindings: **275**;
- explicit source resolutions: **34**;
- source outcomes accounted for: **309 / 648**;
- unresolved live-production source queue: **339**.

Latest field coverage:

- cuisine/non-generic category: 562 / 648;
- address: 140 / 648;
- budget: 126 / 648;
- opening/holiday information: 239 / 648;
- representative dishes: 31 / 648;
- 百名店: 22 / 648.

Distance pools:

- <=300 m: 137;
- <=500 m: 220;
- <=800 m: 359;
- <=1,200 m: 648.

See `AREA1_COMPLETENESS.md` for the authoritative completeness state and `AREA1_COMPLETION_LOG.md` for batch history.

## Product behavior

- Area1 only;
- optional cuisine exclusion;
- optional budget filter when metadata exists;
- 300 m / 500 m / 800 m / 1.2 km choices;
- exactly three randomized proposals when at least three entities match;
- Leaflet/OpenStreetMap overview map;
- per-store maps;
- three-store comparison table;
- Google Maps navigation by verified Place ID;
- no rating/review-count popularity ranking.

## Architecture

**Independent restaurant metadata + Google Place ID verification -> reviewed Place-ID source bindings -> deploy-time canonical dataset -> static browser filtering/randomization/visualization.**

There is no runtime application server, runtime database or visitor-time Places API request.

### Google Places / Places Aggregate

Used for:

- Google Place ID identity/navigation;
- transient name/location/type/status QC;
- exact 1.2 km identity count and Place-ID inventory.

Full Google Places response objects are not the durable restaurant database.

### OpenStreetMap

Used for independent candidate discovery, geospatial identity, name/category and coordinates. The OSM query now covers restaurants, fast food, cafes, food courts, bars, pubs, biergartens, ice cream and selected food shops such as bakeries/pastry/confectionery/deli/coffee/tea.

### Tabelog / official pages

Used for durable exact-branch facts such as:

- current display/branch name;
- cuisine;
- address;
- lunch/dinner budget;
- opening hours and regular holidays;
- representative dishes;
- closure/current-listing evidence;
- 百名店 metadata.

Unknown fields remain unknown until a supporting source is found.

## Important correctness changes

### Exact count instead of capped Nearby-search union

The old discovery inventory had 1,613 Place IDs and could not prove completeness. Exact Aggregate count + recursively split geodesic sector enumeration now gives **2,804 / 2,804**.

### OSM source-scope expansion

The previous independent-source query omitted bar/pub/biergarten/ice-cream features even though those categories were in the Google food-business scope.

After correcting it:

- OSM candidates: 990 -> 1,273;
- verified source rows: 526 -> 658;
- canonical production: 517 -> **648**.

### Canonical identity name anchoring

`scripts/build_production_dataset.mjs` now treats the business name as an identity field:

1. exact Place-ID enrichment explicitly claiming `name`;
2. otherwise exact verified OSM identity name;
3. historical rich metadata cannot rename a different verified business merely because it has more fields.

This prevents source/branch information from being attached to the wrong business after large source-pool expansions.

## Current source-enrichment progress

Four new enrichment batches were completed in this pass:

- Batch 1: 8 safe bindings + 2 explicit conflicts;
- Batch 2: 10 safe bindings;
- Batch 3: 10 safe bindings;
- Batch 4: 10 safe bindings.

The latest Batch 4 added exact branch sources for 馬さん餃子酒場 神保町店, 神保町 加賀廣, CRAFT BEER MARKET 神保町店, 大金星 神保町店, Bar Plat 本店, Bar 37℃, 鳥貴族 神保町店, おかん, 大衆酒場 けいちゃん 神保町店 and あつ盛.

The current nearest unresolved production queue starts with `やまじょう`, `レピック神保町`, `森のブッチャーズ`, `座楽`, `Beer Pub 8taps` and `餃子八`.

## Repository map

### Public runtime

- `index.html`
- `styles.css`
- `app.js`
- `data/production_area1.js` — generated canonical data.

### Maintenance data

- `data/area1_osm.js` — independent OSM candidates;
- `data/google_entities.generated.js` — source-ID keyed compact Google QC overlay;
- `data/google_places_cache.json` — compact verification state;
- `data/area1_google_ids.json` — exact 2,804-ID inventory;
- `data/source_enrichment*.js` — reviewed Place-ID keyed source/field enrichment;
- `data/source_resolution*.js` — explicit terminal/ambiguous source outcomes;
- historical curated/award files used by the canonical build.

Maintenance data is not directly published as the browser runtime dataset.

### Key scripts

- `scripts/build_area1_osm.py` — independent candidate collection;
- `scripts/verify_google_places.py` — independent source -> Google identity QC;
- `scripts/discover_google_area1.py` — exact identity count/enumeration;
- `scripts/build_production_dataset.mjs` — one-Place-ID-per-entity canonical build;
- `scripts/audit_area1_identity_coverage.mjs` — exact-count/reconciliation audit;
- `scripts/audit_repository.mjs` — runtime/repository audit;
- `scripts/audit_source_bindings.mjs` — source-binding audit;
- `scripts/source_queue.mjs` — unresolved production queue;
- `scripts/coverage_report.mjs` — coverage metrics.

## CI invariants

Every Pages build now checks:

- canonical build succeeds;
- unique production Place IDs;
- strict <=1.2 km production boundary;
- repository/runtime rules;
- source-binding integrity;
- source and field coverage reports;
- **exact 2,804-ID Area1 coverage gate**;
- minimal public deployment payload.

Latest Batch 4 build passed all of these checks.

## Next data work

1. Finish the remaining **339 live-production source outcomes** first.
2. Reconcile the **2,161 exact-inventory IDs** without a verified independent-source identity.
3. Review the 106 rejected-source matches that nevertheless point to an exact-inventory Place ID.
4. Review the 4 verified-source IDs outside the exact inventory separately rather than weakening the radius gate.
5. Continue branch-specific address, budget, hours/holiday and representative-dish completion.

Identity-count completeness and full-information completeness are intentionally tracked as two separate milestones.
