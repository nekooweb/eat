# Eat Data Pipeline

## Purpose

This document defines how Area1 restaurant candidates are discovered, assigned a trustworthy business identity, enriched, admitted into production and audited.

The current rule is:

> **A production entity needs a verified Google Place ID, while durable display/recommendation metadata is maintained independently of Google Places response content.**

Google is the identity/QC gate. OSM, Tabelog, official restaurant sources and legacy curated records provide independently maintainable metadata and coverage leads.

## 1. Source roles

### Google Places API (New)
Used for:
- durable Google Place ID identity;
- transient verification of location, business status and food-related type;
- Google-side Area1 identity coverage discovery.

Persistent Google-derived state is restricted to the durable identity/QC state needed by this project. Display name, formatted address, coordinates, Maps URI, business status and type returned by Places remain transient maintenance inputs rather than the long-lived restaurant database.

### OpenStreetMap
Independent Area1 POI/geospatial source.

Useful persistent fields:
- source ID;
- local name/category;
- independent coordinates;
- opening-hours tags where available;
- independent coverage candidates.

An OSM row does not become production-ready until it receives a verified Google Place ID.

`build_area1_osm.py` intentionally keeps OSM rows whose names overlap legacy curated records and marks them `curatedOverlap:true`. Those rows are valuable identity bridges: after Google verification, historical metadata can attach to a verified Place ID rather than remain isolated by name.

### Tabelog / official restaurant sources
These are the preferred durable enrichment sources for an already identified business/branch.

Authoritative maintenance file:
- `data/source_enrichment.js`.

Records are keyed by the verified Google Place ID cross-reference and must include field-level `sourceRefs` provenance.

Typical factual fields:
- cuisine refinement;
- lunch/dinner budget;
- representative dishes;
- opening hours / regular holidays;
- 百名店 status/year/category when the correct branch is confirmed.

A source-enrichment row is always `sourceOnly:true`. It **cannot declare itself Google-verified and cannot create a production identity by itself**. It is attached only when that Place ID already exists in the verified Google identity groups.

Current field preference for non-geospatial restaurant metadata:
1. official restaurant source;
2. Tabelog source-backed record;
3. legacy curated record;
4. generic OSM category metadata.

Coordinates remain independent of Google Places and prefer OSM.

### Legacy curated records
Historical files such as `restaurants.js`, `area1_bulk.js` and `area1_more.js` remain useful bridge inputs. They are not the preferred destination for new factual enrichment.

New researched Tabelog/official facts should go into `data/source_enrichment.js` with a Place ID and field-level source reference instead of being added as opaque name-only patches.

Missing values are never fabricated.

## 2. Production lifecycle

```text
OSM / legacy curated candidate
             |
             v
      Google identity QC
             |
       verified Place ID
             |
      +------+--------------------+
      |                           |
      v                           v
OSM/legacy metadata      Place-ID keyed source_enrichment.js
      |                  (Tabelog / official / award facts)
      +-------------+-------------+
                    |
                    v
        build_production_dataset.mjs
                    |
                    v
          canonical Place-ID entity
                    |
                    v
            production_area1.js
                    |
                    v
                  browser
```

A separate Google Nearby Search coverage inventory detects Google identities that are not yet represented by a verified independent-source entity.

## 3. Source candidate discovery

### OpenStreetMap
Script:
- `scripts/build_area1_osm.py`.

Output:
- `data/area1_osm.js`.

This provides the broad independent candidate pool for Area1 and enforces the source collection radius.

Curated-name overlap is no longer excluded. It is explicitly retained and marked so those historical records can acquire verified identity links.

### Source-backed enrichment
File:
- `data/source_enrichment.js`.

Each record should contain:
- `profile`, `area`;
- exact branch/store `name`;
- verified-identity cross-reference `googlePlaceId`;
- `sourceOnly:true`;
- provider label (`Tabelog` or `official`);
- only factual fields supported by the source;
- one or more `sourceRefs` entries with provider, URL, check date and supported field names.

Example provenance shape:

```js
sourceRefs: [{
  provider: 'Tabelog',
  url: 'https://tabelog.com/.../',
  checkedAt: 'YYYY-MM-DD',
  fields: ['cuisine', 'budget', 'hours']
}]
```

Do not store copied review prose, ratings/review counts, or unsupported inferred values as production metadata.

## 4. Google source-to-identity verification

Primary script:
- `scripts/verify_google_places.py`.

Primary workflow:
- `.github/workflows/verify-google-places.yml`.

For each selected independent source candidate:
1. Text Search requests only the candidate Google Place ID.
2. Place Details fields needed for QC are fetched transiently.
3. Reject permanently closed places.
4. Reject Google coordinates outside the Area1 1.2 km boundary.
5. Reject implausible source/Google coordinate matches.
6. Require a current food-related Google place type.
7. For geographically loose matches, require strong name compatibility.
8. Persist only source ID, status, Place ID, compact reason and QC version.

The verifier is keyed by source ID in the generated overlay. Normalized restaurant name is not the identity key.

### Curated-overlap recovery
Targeted script:
- `scripts/verify_curated_google.py`.

Workflow:
- `.github/workflows/verify-curated-google.yml`.

It selects only OSM rows marked `curatedOverlap:true`, reuses the normal QCv4 verifier and skips existing terminal QCv4 cache entries. This recovers useful historical metadata without re-running the unresolved half of the entire Area1 pool.

### Name/transliteration rule
Google may return an English/romanized display name for a Japanese source name. Therefore:
- a very close geographic result from a name-based Text Search can pass despite low literal similarity;
- a wider 45-300 m match needs stronger name evidence;
- >300 m source/Google separation is rejected.

This avoids both transliteration false negatives and nearby dense-area false positives.

## 5. Verification states

### `verified`
Source record maps to a Google Place ID and passes current QC.

### `rejected`
The source-to-Google match failed a defined QC rule, for example:
- `closed_permanently`;
- `outside_1_2km`;
- `location_mismatch`;
- `name_mismatch`;
- `non_food_google_type`;
- `no_google_place`.

### `pending`
API/network failure or other unresolved state; retry is allowed in a later batch.

A rejected source candidate means **that source match is not trustworthy**. It does not prove that no Google business exists at all.

## 6. Google-side coverage discovery

Script:
- `scripts/discover_google_area1.py`.

Workflow:
- `.github/workflows/discover-google-area1.yml`.

Purpose:
- query overlapping Area1 cells;
- split dense Nearby Search queries by current food-related types;
- mitigate the 20-result-per-query limit;
- use Google coordinates/business status transiently for strict Area1/permanent-closure QC;
- deduplicate and persist only Place IDs.

Output:
- `data/area1_google_ids.json`.

This is a **coverage inventory**, not a browser dataset.

Coverage comparison should answer:
- how many Google Place IDs exist in the Area1 discovery inventory;
- how many are already represented by verified independent-source entities;
- which Google IDs lack independent persistent metadata;
- which independent candidates still lack a verified Google identity.

## 7. Legacy Google discovery migration

Historical files `data/area1_google_places.json` and `data/area1_google.js` stored more Google response content than the current architecture needs.

One-time migration:
1. `scripts/migrate_google_inventory.py` extracts unique Place IDs from the existing historical dataset without any API call;
2. `data/area1_google_ids.json` preserves the identity inventory;
3. `.github/workflows/migrate-google-storage.yml` removes the old full Google JSON/JS from the current branch.

The migration keeps previously obtained identity results while eliminating the old full response payloads from the active long-lived data model.

## 8. Canonical build

Script:
- `scripts/build_production_dataset.mjs`.

Inputs:
- legacy curated restaurant records;
- OSM candidates;
- manual Place-ID hints;
- generated Google verification state;
- historical 百名店 metadata;
- `data/source_enrichment.js` field-level Tabelog/official enrichment.

Admission rules:
- `profile === TOKYO`;
- `area === 地区1️⃣`;
- Google verification status is `verified`;
- Google Place ID exists;
- durable independent distance exists and is <=1,200 m.

Canonical identity:
- one production row per unique Google Place ID.

Enrichment:
- verified identity groups are created first;
- a `sourceOnly` Place-ID keyed record attaches only to an already verified identity;
- a no-ID historical row may enrich only when its normalized name maps uniquely to one verified identity;
- ambiguous name matches do not merge;
- source-backed Tabelog/official facts outrank legacy curated/OSM metadata for non-geospatial fields;
- OSM remains preferred for map coordinates/distance.

Output:
- `data/production_area1.js` generated during CI/deployment.

## 9. Canonical production schema

Identity/scope:
- `id`;
- `profile`, `area`;
- `googlePlaceId`;
- `googleStatus`.

Independent display/geospatial metadata:
- `name`;
- `address`;
- `lat`, `lng`;
- `distanceMeters`;
- `cuisine`, `tags`.

Recommendation metadata:
- `lunch`, `dinner`;
- `dishes`;
- `openingHoursRaw`;
- `closedDays`;
- `closedNote`.

Award/weighting:
- `hyakumeiten`;
- `hyakumeitenYear`;
- `hyakumeitenCategory`;
- `randomWeight`.

Compact public provenance:
- `sources` provider labels only.

Detailed `sourceRefs` remain a maintenance-layer field and are intentionally omitted from the public canonical dataset.

The canonical browser dataset excludes Places-response fields such as:
- `googleMapsUrl`;
- `googleDisplayName`;
- `googleBusinessStatus`;
- `googlePrimaryType`;
- Google-returned coordinates/address/name.

## 10. 百名店 enrichment

百名店 is metadata, not an admission source.

Current sampling weights:
- ordinary: `1.0`;
- verified 百名店: `2.2`.

New/updated award facts should be branch-aware and preferably Place-ID keyed in `source_enrichment.js`. Historical name-matched `hyakumeiten.js` remains a compatibility input while migration continues.

## 11. Production and coverage audits

Blocking production checks:
- production row count >=3;
- one row per unique Place ID;
- every production row `verified`;
- every production distance <=1,200 m;
- forbidden persistent Google Places response fields absent;
- every source-backed enrichment row is `sourceOnly` and cannot self-verify;
- every enrichment row has a Place ID and field-level source reference;
- maintenance `sourceRefs` do not leak into public canonical data.

Coverage/completeness metrics now report:
- independent OSM candidate count;
- curated-overlap candidate count and verification state;
- Google coverage-inventory Place ID count;
- verification status/rejection reasons;
- source-backed enrichment record/provider/field counts;
- production records carrying Tabelog/official source labels;
- cuisine and generic-`餐厅` counts;
- address completeness;
- lunch/dinner budget completeness;
- representative-dish completeness;
- opening/holiday completeness;
- 百名店 count;
- distance pools.

A structurally valid production pool may still have incomplete metadata. Coverage and enrichment are measured separately from identity integrity.

## 12. Frontend behavior

The browser receives only `production_area1.js`.

At recommendation time it performs:
- absolute 1.2 km safety check;
- optional cuisine exclusion;
- optional budget filter;
- optional preferred-distance filter;
- weighted random selection of three distinct Place IDs;
- maximum feasible cuisine diversity;
- overview/per-store maps and three-store comparison from canonical data only.

Opening/holiday information remains descriptive and is not yet an exclusion criterion.

## 13. Security / cost / service rules

- Never commit an API key.
- Never put the Places key in browser JavaScript.
- Keep Google field masks narrow.
- Use staged/targeted verification instead of unnecessary full reruns.
- Reuse Place IDs and compact verification state to avoid repeat searches.
- Do not fabricate missing source enrichment.
- New Tabelog/official enrichment must carry field-level provenance.
- Public Pages deployment publishes only the assembled `_site` artifact, not source-enrichment maintenance files.
- Maintain Google Maps and OpenStreetMap attribution appropriate to the content/services shown.
