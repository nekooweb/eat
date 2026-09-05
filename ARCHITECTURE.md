# Eat Architecture

Updated: 2026-09-06

## 1. Architecture summary

Eat remains a static GitHub Pages application. There is no runtime application server and no runtime database.

The maintenance architecture is now split into four explicit layers:

```text
identity inventory / source candidates
        |
        v
Google Place-ID identity + QC
        |
        v
source discovery / extraction staging
        |
        v
reviewed durable source facts
        |
        v
canonical production build
        |
        v
static browser runtime
```

Core rule:

> Google establishes or assists business identity/discovery; durable recommendation/display facts come from reviewed independent/official pages; the browser consumes one canonical dataset and never performs restaurant-source matching.

## 2. Runtime frontend

### Public data

The browser loads exactly one generated restaurant dataset:

- `data/production_area1.js`.

Raw OSM, source-enrichment, source-resolution, Places verification and extraction staging data are not deployed.

### Filters and recommendation

`app.js` performs only:

- cuisine exclusion;
- budget filtering;
- distance filtering;
- absolute <=1,200 m safety check;
- weighted Web Crypto random choice;
- cuisine-diversity preference;
- result rendering.

If at least three production entities satisfy the filters, exactly three distinct Google Place IDs are returned.

Weights:

- ordinary restaurant: `1.0`;
- reviewed 百名店: `2.2`.

No rating/review-count popularity ranking is used.

### Common result fields

Every canonical row exposes the same optional-field shape. Important display fields include:

- `name`;
- `cuisine`;
- `address`;
- `lat`, `lng`, `distanceMeters`;
- `lunch`, `dinner`;
- `recommendedDishes` — array, 0-2 Chinese dish names;
- `hoursReference` — string or `null`;
- `googlePlaceId`;
- award/weight fields.

Missing optional information remains empty/null instead of being fabricated.

## 3. Recommendation-dish semantics

Legacy `dishes` records are retained temporarily as representative/menu maintenance data, but they are not automatically displayed as recommendations.

Public `recommendedDishes` comes only from `data/recommended_dishes.js`, keyed by an existing production Google Place ID. Each maintenance record requires:

- exact `googlePlaceId`;
- 1-2 reviewed Chinese dish names;
- HTTPS source URL;
- ISO review date.

A dish is promoted only when the source explicitly identifies it as recommended, popular, signature, specialty, 名物, 看板, 自慢 or an equivalent concrete claim.

The canonical builder rejects recommendation rows that are duplicated, malformed or detached from a production identity.

## 4. Hours semantics

`hoursReference` is the unified public schedule field. It is built from maintained opening-hours and regular-closure notes.

It is descriptive only. The current eligible-pool logic does not claim a restaurant is open now and does not filter based on schedule.

## 5. Maps

The product deliberately uses a hybrid map design.

### Three-store overview

Leaflet + OpenStreetMap remains the overview implementation because it can show all three choices in one fitted view with numbered markers.

### Per-store maps

Each restaurant card prefers Google Maps Embed API `place` mode using the already verified Google Place ID.

If no usable Embed key is present, the card falls back to the previous Leaflet/OSM store map.

The direct Google Maps navigation/business link also uses `query_place_id`.

### Key injection

Per project decision, `.github/workflows/pages.yml` reuses the existing `GOOGLE_MAP_API` Actions secret for Maps Embed and replaces the build placeholder in the deployed `_site/index.html`.

Consequences:

- the deployed browser can inspect this API key, as with any client-side Maps Embed key;
- the same key is also used by server-side maintenance Places calls;
- therefore restrictions and quotas must be compatible with both uses;
- the repository never writes the literal key into tracked source files.

## 6. Canonical production build

`scripts/build_production_dataset.mjs` is the hard boundary between maintenance data and runtime data.

Inputs include:

- curated historical rows;
- `area1_osm.js`;
- Google identity hints and generated verification state;
- 百名店 metadata;
- all `source_enrichment*.js` shards;
- reviewed `recommended_dishes.js`.

Admission rules:

1. scope is `TOKYO / 地区1️⃣`;
2. identity must have `googleStatus === 'verified'` and a Place ID;
3. one canonical row per unique Place ID;
4. durable independent distance must exist and be <=1,200 m;
5. source-only enrichment cannot create a production identity;
6. historical no-ID enrichment may attach only when normalized name maps uniquely to one verified identity;
7. missing fields remain missing;
8. malformed/duplicate identity or normalized-field records fail the build.

Field preference for non-geospatial facts remains roughly:

1. exact reviewed official source;
2. exact reviewed Tabelog source;
3. curated historical data;
4. generic OSM category data.

Geospatial display data prefers independent OSM coordinates/distance.

## 7. Google identity/QC

`scripts/verify_google_places.py` verifies independent source candidates against Google Places.

Persistent Google-derived maintenance state is intentionally compact:

- source ID;
- verification state;
- Google Place ID;
- compact reason;
- QC version.

Display names, formatted addresses, coordinates, business status/type and Maps URIs used during verification remain transient maintenance inputs rather than the durable restaurant database.

`data/area1_google_ids.json` separately stores the exact in-scope Place-ID inventory for coverage accounting.

## 8. Bulk source acquisition

The field-acquisition bottleneck is no longer handled solely by a next-restaurant manual queue.

### Existing official source batch extraction

`scripts/extract_official_fields.mjs`:

1. loads all current official source URLs already attached to production identities;
2. fetches them concurrently;
3. extracts JSON-LD/Schema.org facts;
4. detects menu links;
5. records snippets near recommendation/signature keywords;
6. records price signals;
7. writes a short-lived review artifact.

It does not directly edit production data.

### Google-assisted official-site discovery

`scripts/discover_google_official_sites.mjs` handles production identities that have no official source binding.

For each existing Place ID:

```text
Place Details (websiteUri only, transient)
 -> fetch returned website immediately
 -> follow website redirect
 -> inspect final website content
 -> keep final fetched website URL + independently extracted page facts in review artifact
```

The Google-returned `websiteUri` itself is not retained as a long-lived Places content field.

The discovery layer classifies obvious aggregation/social hosts separately and checks whether the fetched page text/title contains the canonical restaurant name.

### Priority filter

`scripts/filter_official_site_candidates.mjs` creates the first review queue only when all of the following hold:

- website fetch succeeded;
- host is a candidate official/non-platform host;
- canonical restaurant name matched page content;
- final fetched URL is HTTPS.

Within those rows it preserves structured facts, recommendation snippets, price snippets and menu links for review.

This is a candidate queue, not an automatic truth-import path.

## 9. Source-maintenance records

`source_enrichment*.js` records reviewed branch/source facts with field-level provenance.

Each enrichment row:

- is keyed by an existing verified Place ID;
- is `sourceOnly:true`;
- names a supported provider (`official` or `Tabelog`);
- contains one or more `sourceRefs` with HTTPS URL, check date and supported field names.

`source_resolution*.js` records reviewed terminal outcomes when a usable exact source cannot be attached safely.

A Place ID cannot simultaneously have a usable source binding from the same accounting path and an explicit terminal resolution.

## 10. Batch review strategy

The preferred processing unit is now **website host/template**, not restaurant distance.

For example, repeated chain hosts can be reviewed once for their stable page structure, then the same parser/field rules can be applied to all matching branches.

This is especially useful for:

- store locators with repeated JSON-LD;
- chain menu systems;
- standardized opening-hours blocks;
- repeated official branch templates.

Independent restaurants without reusable templates remain reviewable one-by-one, but only after automatic discovery/extraction has already narrowed the page and candidate fields.

## 11. Deployment / CI

### Pages workflow

`.github/workflows/pages.yml`:

1. checks out the repository;
2. builds canonical production;
3. runs syntax and data audits;
4. emits coverage/source/field-gap reports;
5. assembles only deployable files in `_site`;
6. injects `GOOGLE_MAP_API` into the Maps Embed placeholder for the deploy artifact;
7. deploys main or uploads a PR review artifact.

### Bulk extraction workflow

`.github/workflows/extract-official-fields.yml` is manual (`workflow_dispatch`) to prevent ordinary commits from repeating hundreds of Places calls.

It can scan all eligible production identities or a limited number through the `google_limit` input.

Outputs are short-lived artifacts for review; raw extraction responses are not copied into the public Pages artifact.

## 12. Blocking audits

Repository/canonical audits enforce at least:

- production pool >=3;
- unique verified Place IDs;
- <=1.2 km production boundary;
- no forbidden long-lived Google Places response-content fields in canonical rows;
- source-enrichment provenance and no self-verification;
- normalized `recommendedDishes` / `hoursReference` shapes;
- overview map + store-map + comparison hooks;
- Google store-map iframe limited to the intended Maps Embed endpoint;
- Leaflet fallback remains present.

The audits check structure and consistency. They do not prove a remote restaurant is currently open or that an automatically discovered source candidate has been human-reviewed.

## 13. Current scale and next boundary

Current production is 648 entities while the exact Google identity inventory is 2,804. The immediate goal is to improve and automate the 648-row field layer before expanding production toward the remaining exact-inventory identities.

The current bulk discovery result and ordered work are maintained in `DEVELOPMENT.md`.
