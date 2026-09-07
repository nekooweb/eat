# Eat Data Pipeline

Updated: 2026-09-06

## 1. Purpose

This document defines the Area1 maintenance path after the 2026-09-06 transition to a **no paid data API** architecture.

Core rules:

1. billable place/search/map data APIs are prohibited in repository maintenance;
2. the existing 2,804 Google Place IDs are a frozen historical inventory, not a live upstream dataset;
3. durable restaurant fields come from independent/reviewed sources;
4. open-data/source extraction may be automated, but candidate facts do not become production facts without conservative identity binding/review;
5. unknown values remain unknown;
6. large recurring jobs must use bulk files/cached sources rather than systematic public geocoding/search endpoints.

## 2. Current scale

Current baseline:

- frozen Area1 identity snapshot: **2,804** unique historical Place IDs;
- canonical production: **656**;
- production inside frozen inventory: **653**;
- legacy inventory-only IDs: **2,151**;
- OSM independent candidates: **1,273**;
- verified historical QC rows: **666**;
- source-backed production: **404 / 656**;
- source outcomes accounted for: **448 / 656**;
- unresolved production source outcomes: **208**;
- official-site index: **194**;
- non-generic cuisine: **579**;
- address: **268**;
- normalized weekly opening hours: **287**;
- budget: **192**;
- featured dishes: **129**;
- strict recommendations: **30**.

## 3. Source roles

### Frozen legacy Google identity state

Allowed use:

- retain already-committed Place IDs as compatibility keys;
- retain historical verification/rejection state;
- retain previously persisted Google→OSM candidate class, distance and name-similarity metrics;
- generate ordinary external Google Maps navigation URLs from an existing ID.

Forbidden use:

- live Place Details;
- Text Search;
- Places Aggregate / Area Insights;
- `websiteUri` discovery;
- any other billable lookup to refresh or expand identity state.

Historical Google display payload was intentionally not persisted. Therefore some legacy IDs are opaque and must remain frozen/unresolved when durable independent evidence is insufficient.

### Overture Maps Places

Primary new bulk discovery source.

Use the public GeoParquet release to obtain current candidate facts such as:

- Overture ID;
- names;
- `basic_category` and `taxonomy`;
- geometry;
- confidence;
- addresses;
- websites/phones;
- brand;
- record-level sources/provenance.

BBox filtering is only a coarse pruning step. Apply the exact <=1,200 m Area1 geodesic boundary after retrieval.

### OpenStreetMap

Independent geospatial/source layer.

Use for:

- candidate discovery;
- durable coordinates/distance where available;
- cuisine/opening-hours/address evidence when tagged;
- cross-source identity comparison.

For routine large refreshes prefer a local/cached Geofabrik Kanto PBF extract. Public Nominatim is not a bulk POI acquisition service and should not be used to enumerate the Area1 universe.

### Official pages / trusted locators

Preferred branch-level source for:

- exact name/address;
- cuisine;
- weekly opening schedule;
- menu/signature dishes;
- explicitly supported spend ranges;
- current branch existence.

### Tabelog / reviewed curated evidence

Fallback or parallel factual source where exact branch identity is supported. Existing reviewed bindings remain usable; ambiguous matches remain unresolved.

## 4. Identity lifecycle

```text
frozen legacy ID + persisted historical QC metrics
                     |
                     v
            persisted OSM candidate
                     |
                     +----------------------+
                                            |
Overture Area1 bulk candidates -------------+
                                            |
                                            v
                              cross-source blocking + scoring
                                            |
                          +-----------------+-----------------+
                          |                 |                 |
                          v                 v                 v
                    priority review     normal review      unresolved
                          |                 |
                          +--------+--------+
                                   |
                                   v
                     official/source verification
                                   |
                                   v
                   conservative field/source promotion
                                   |
                                   v
                    build_production_dataset.mjs
```

There is no live Google call in this lifecycle.

## 5. Overture batch acquisition

`scripts/build_overture_area1.py` performs a reproducible public-data staging pass:

1. use a pinned Overture release, overridable through `OVERTURE_RELEASE`;
2. query the public Places GeoParquet directly with DuckDB/httpfs/spatial;
3. bbox-prune around Area1;
4. retain food/drink taxonomy candidates;
5. apply exact geodesic <=1,200 m filtering in Python;
6. preserve source/provenance arrays and contact/website fields;
7. emit an audit/staging JSON file, not production rows.

The default pinned release for this transition is `2026-08-19.0`. Future updates should change the pin deliberately and compare deltas rather than silently floating every run.

## 6. Cross-source reconciliation

`scripts/build_open_identity_reconciliation.py` uses the new Overture staging set together with `data/area1_full_collection_queue.json`.

Important property: the historical queue already contains, for each prior Google→OSM candidate relationship, durable QC metrics such as match class, distance and name similarity without storing raw Google display payload. Those metrics can be reused without another Google request.

The reconciliation algorithm:

- spatially blocks Overture candidates around the persisted OSM candidate;
- normalizes names conservatively;
- compares geodesic distance, name similarity and address similarity;
- assigns a cross-source confidence class;
- combines that class with the historical Google→OSM class into A/B/C/D review priority.

Rules:

- no O(N²) global pairwise scan;
- no automatic production promotion;
- historical terminal/collision blockers remain blockers;
- prior low-confidence Google→OSM relationships cannot become automatic admissions merely because Overture agrees with the OSM entity;
- A/B are review priorities, not truth labels.

## 7. Official-source acquisition without paid discovery

Preferred discovery order:

1. persisted `official_candidate_index.json`;
2. Overture website/brand/contact fields;
3. reviewed OSM website/contact tags when present in future extracts;
4. official brand locator/sitemap patterns;
5. existing Tabelog and curated exact-branch bindings.

Do not use paid search/place APIs as a fallback.

### Fetch strategy

- deduplicate exact URLs and hosts before fetching;
- use bounded per-host concurrency;
- group repeated locator/templates;
- cache content hash and HTTP validators when practical;
- avoid refetching already saturated pages unless stale/change evidence exists;
- retry transient failures conservatively;
- treat fetch failure as unknown/retry, not evidence that a restaurant/source disappeared.

## 8. Grouped field extraction

Existing safe scripts remain the preferred field path, including:

- `extract_official_index_fields.mjs`;
- `build_auto_official_enrichment.mjs`;
- `build_locator_template_fields.mjs`;
- `build_single_site_hours_enrichment.mjs`;
- `build_explicit_budget_address_enrichment.mjs`;
- reviewed featured-dish template propagation.

During a source fetch, extract all supported fields together rather than revisiting a restaurant field-by-field.

Field promotion remains conservative:

- opening hours must describe a stable weekly schedule;
- menu-item prices are not restaurant spend ranges;
- `recommendedDishes` needs explicit recommendation/popularity/signature evidence;
- `featuredDishes` can use broader source-backed representative items;
- source claims remain field-specific.

## 9. Large-scale OSM strategy

The old `build_area1_osm.py` public-Overpass job is retained only as historical/small manual tooling. It is not the preferred recurring bulk refresh path.

For full refreshes:

1. download/cache the Geofabrik Kanto PBF;
2. filter local `amenity`/`shop` food POIs with osmium/pyosmium or another local parser;
3. calculate precise Area1 distance locally;
4. preserve OSM element IDs and tags;
5. compare the resulting snapshot against the prior OSM snapshot.

This avoids turning shared public geocoding/query services into a batch backend.

## 10. Cost guard

`scripts/audit_no_paid_apis.mjs` scans active workflow and maintenance-script text for forbidden known endpoint/secret patterns.

`.github/workflows/data-api-policy.yml` runs the guard on relevant pushes and pull requests. The Pages build also runs it before deployment.

Legacy paid-call scripts are fail-closed stubs. Legacy paid workflows are manual no-op stubs or have had the paid stage removed. The deployment workflow does not inject the former Google API secret into the public artifact.

## 11. Canonical build

`scripts/build_production_dataset.mjs` remains authoritative for current production compatibility.

For the current frozen model it:

- builds from already-established identities;
- attaches exact source-only records afterward;
- prefers durable independent geospatial/source data;
- applies field-level source claims/suppression;
- emits one canonical row per existing production identity;
- rejects duplicate identities, out-of-radius rows and malformed normalized data.

Do not broaden production to new open-data-only entities until a source-native canonical identity key is designed and audited.

## 12. Progress accounting

Always distinguish:

- frozen historical identity inventory;
- actionable historical reconciliation rows;
- current independent-source candidates;
- canonical production entities;
- usable source coverage;
- source outcomes;
- field completeness;
- staging extraction/reconciliation candidates.

The historical `2,804 / 2,804` count remains valuable as a snapshot benchmark, but it is no longer a requirement to perform live paid refreshes for every opaque ID.

## 13. Current execution order

1. enforce no-paid-API CI policy;
2. generate Overture Area1 staging candidates;
3. build cross-source reconciliation and review A/B tiers;
4. resolve the existing 3 medium + 49 review OSM relationships without new Google calls;
5. continue the 208 unresolved production source outcomes from open/known official sources;
6. batch-complete fields from newly reviewed sources;
7. add source-native identity support before expanding production scope.
