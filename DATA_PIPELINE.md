# Eat Data Pipeline

## Purpose

This document defines how Area1 restaurant candidates are discovered, assigned a trustworthy business identity, enriched, admitted into production and audited.

The current rule is:

> **A production entity needs a verified Google Place ID, while durable display/recommendation metadata is maintained independently of Google Places response content.**

Google is the identity/QC gate. OSM, curated records, Tabelog and official sources provide independently maintainable metadata and coverage leads.

## 1. Source roles

### Google Places API (New)
Used for:
- durable Google Place ID identity;
- transient verification of location, business status and food-related type;
- Google-side Area1 identity coverage discovery.

Persistent Google-derived state should be restricted to what the current platform terms allow for durable storage, principally Place IDs for this project. Display name, formatted address, coordinates, Maps URI, status and type returned by Places are treated as transient QC data in the maintenance workflow.

### OpenStreetMap
Independent Area1 POI source.

Useful persistent fields:
- source ID;
- local name/category;
- coordinates;
- opening-hours tags where available;
- independent coverage candidates.

An OSM row does not become production-ready until it receives a verified Google Place ID.

### Curated / official / Tabelog data
Used as factual enrichment for an already identified business/branch:
- cuisine refinement;
- lunch/dinner budget;
- representative dishes;
- opening hours / regular holidays;
- 百名店 status/year/category.

Ambiguous identity matches remain unresolved. Missing values are not fabricated.

## 2. Production lifecycle

```text
OSM / curated / Tabelog / official source candidate
                         |
                         v
                  Google identity match
                         |
             +-----------+-----------+
             |                       |
             v                       v
        verified Place ID      unresolved/rejected
             |                       |
             v                       v
      independent metadata       audit only
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

A separate Google Nearby Search coverage inventory is used to detect Google identities that are not yet represented by a verified independent-source entity.

## 3. Source candidate discovery

### OpenStreetMap
Script: `scripts/build_area1_osm.py`

Output:
- `data/area1_osm.js`.

This currently provides the broad independent candidate pool for Area1 and enforces the source collection radius.

### Other enrichment sources
Historical/curated Area1 files remain maintenance inputs. They are not loaded by the browser.

They should gradually migrate toward Place-ID/branch-aware enrichment records rather than name-only patches.

## 4. Google source-to-identity verification

Script: `scripts/verify_google_places.py`

Workflow: `.github/workflows/verify-google-places.yml`

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

Script: `scripts/discover_google_area1.py`

Workflow: `.github/workflows/discover-google-area1.yml`

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

Historical files `data/area1_google_places.json` and `data/area1_google.js` stored more Google response content than the new architecture needs.

One-time migration:
1. `scripts/migrate_google_inventory.py` extracts unique Place IDs from the existing historical dataset without any API call;
2. `data/area1_google_ids.json` preserves the identity inventory;
3. `.github/workflows/migrate-google-storage.yml` removes the old full Google JSON/JS from the current branch.

The migration keeps previously paid-for discovery identity results while eliminating them from the active long-lived data model.

## 8. Canonical build

Script: `scripts/build_production_dataset.mjs`

Inputs:
- independent/curated restaurant records;
- OSM candidates;
- manual Place-ID hints;
- generated Google verification state;
- 百名店 metadata.

Admission rules:
- `profile === TOKYO`;
- `area === 地区1️⃣`;
- Google verification status is `verified`;
- Google Place ID exists;
- durable independent distance exists and is <=1,200 m.

Canonical identity:
- one production row per unique Google Place ID.

Enrichment:
- same-Place-ID records merge directly;
- a no-ID historical row may enrich only when its normalized name maps uniquely to one verified identity;
- ambiguous name matches do not merge.

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

Audit provenance:
- `sources`.

The canonical browser dataset intentionally excludes Places-response fields such as:
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

Award matching should migrate toward Place-ID/branch-aware identity. Historical name matching is acceptable only when unambiguous.

## 11. Production and coverage audits

Blocking production checks:
- production row count >=3;
- one row per unique Place ID;
- every production row `verified`;
- every production distance <=1,200 m;
- required identity/display fields present;
- forbidden persistent Google Places response fields absent.

Coverage/completeness metrics:
- independent source candidate count;
- verified source count;
- Google coverage-inventory Place ID count;
- overlap between Google inventory and verified source entities;
- cuisine completeness;
- lunch/dinner budget completeness;
- representative-dish completeness;
- opening/holiday completeness;
- 百名店 count;
- Tabelog/curated match rate.

A small production pool is a **coverage problem**, even when all blocking integrity checks pass.

## 12. Frontend behavior

The browser receives only `production_area1.js`.

At recommendation time it performs:
- absolute 1.2 km safety check;
- optional cuisine exclusion;
- optional budget filter;
- optional preferred-distance filter;
- weighted random selection of three distinct Place IDs;
- maximum feasible cuisine diversity.

Opening/holiday information remains descriptive and is not yet an exclusion criterion.

## 13. Security / cost / service rules

- Never commit an API key.
- Never put the Places key in browser JavaScript.
- Keep Google field masks narrow.
- Use staged/batched verification instead of unnecessary full reruns.
- Reuse Place IDs and compact verification state to avoid repeat searches.
- Do not fabricate missing source enrichment.
- Public Pages deployment publishes only the assembled `_site` artifact.
- Maintain Google Maps and OpenStreetMap attribution appropriate to the content/services shown.
