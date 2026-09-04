# Eat Data Pipeline

## Purpose
This document defines how restaurant data is discovered, admitted into production, enriched and audited.

The authoritative design rule is:

> **Google Places defines the production merchant universe. Tabelog and OSM enrich or audit Google entities; they do not decide whether a Google business exists.**

## 1. Source roles

### Google Maps / Places API (New)
Primary discovery and authoritative production identity source.

Used fields include:
- Place ID
- Google display name
- formatted address
- coordinates
- business status
- Google Maps URI
- primary/type information

A coordinate-only Google Maps URL is not identity verification.

### Tabelog
Secondary enrichment and coverage-audit source.

Useful fields:
- cuisine/category refinement
- lunch/dinner budget
- representative dishes
- opening hours / regular closed days
- 百名店 status/year/category

A Tabelog record is matched onto a Google entity. A failed or ambiguous Tabelog match must not delete or reject an otherwise valid Google entity.

### OpenStreetMap
Secondary geospatial discovery/audit source.

Useful for:
- detecting possible source-only businesses
- auxiliary coordinates/POI metadata
- comparing Google coverage against another map dataset

OSM is not allowed to directly promote or reject a production business.

### Official restaurant/public pages
May support manual corrections/enrichment when they clearly identify the same Google business/branch.

## 2. Primary production lifecycle

```text
Google Places Nearby Search
   ↓
Google-native candidate
   ↓
Place ID deduplication
   ↓
Google-native admission QC
   ├─ permanently closed -> exclude
   ├─ outside 1.2km -> exclude
   ├─ non-food type -> exclude
   └─ pass -> production Google entity
                      ↓
               Tabelog / OSM / manual
                      ↓
                enrichment matching
                      ↓
                canonical production record
                      ↓
                 static browser dataset
```

## 3. Google-first discovery

Script: `scripts/discover_google_area1.py`

Workflow: `.github/workflows/discover-google-area1.yml`

The script performs Google Places Nearby Search across overlapping Area1 cells and multiple food-related search types because dense local search responses can truncate at result limits.

Current generated outputs:
- `data/area1_google_places.json`
- `data/area1_google.js`

Each entity is deduplicated by Google Place ID.

## 4. Google-native admission QC
A Google-discovered business is production-eligible when:
1. Place ID exists.
2. Google coordinates exist.
3. Exact straight-line distance from the Area1 anchor is <=1200m.
4. Business is not `CLOSED_PERMANENTLY`.
5. Google type indicates a relevant food/restaurant/cafe/bakery/dessert/takeaway business.
6. Duplicate Place IDs are collapsed.

For this Google-native path:
- OSM/Tabelog names are not admission criteria.
- source-coordinate agreement is not an admission criterion.
- lack of a Tabelog page is not an admission failure.

## 5. External-source matching lifecycle

```text
Tabelog / OSM / manual source record
   ↓
try to match existing Google Place ID/entity
   ├─ strong unique match -> attach enrichment/provenance
   ├─ ambiguous -> pending/manual review
   └─ no Google entity -> source-only audit record
```

Preferred matching evidence:
1. exact known Place ID
2. exact/compatible branch name + address + nearby coordinates
3. strong normalized name + compatible address/coordinates

A source mismatch only means the enrichment match failed. It does not prove the Google entity is invalid.

## 6. Legacy OSM-to-Google verifier

Script: `scripts/verify_google_places.py`

This remains useful for:
- mapping old OSM candidates to Google Place IDs
- identifying source-only candidates
- diagnosing historical candidate quality
- preserving audit/cache results

Its statuses are now **legacy/source-matching statuses**, not the production universe definition.

In particular:
- `name_mismatch`
- `location_mismatch`
- `no_google_place`

must not be interpreted as a reason to remove a Google-native business discovered independently through Google Places.

## 7. Legacy verification states

### `pending`
Source candidate match unresolved or API failure.

### `verified`
Source candidate successfully mapped to a Google entity under the legacy verifier.

### `rejected`
Source candidate failed source-to-Google matching/QC.

These labels apply to the source-candidate audit process, not the Google-first production merchant set.

## 8. Canonical production schema

Identity/scope:
- `id`
- `profile`
- `area`
- `name`
- `address`
- `lat`, `lng`
- `distanceMeters`
- `googlePlaceId`
- `googleMapsUrl`
- `googleBusinessStatus`
- `googlePrimaryType`

Recommendation metadata:
- `cuisine`
- `tags`
- `lunch`
- `dinner`
- `dishes`
- `openingHoursRaw`
- `closedDays`

Award/weighting:
- `hyakumeiten`
- `hyakumeitenYear`
- `hyakumeitenCategory`
- `randomWeight`

Provenance:
- Google as primary identity source
- Tabelog/OSM/manual references retained only when they support enrichment/audit

## 9. 百名店 enrichment
百名店 is metadata attached to the correct Google business entity.

Current random weight:
- ordinary: `1.0`
- 百名店: `2.2`

Award matching should use Google Place ID/branch-aware identity whenever possible.

## 10. Coverage audit
Operational Area1 completeness should be evaluated against multiple source views:
- Google production entities
- Google + Tabelog matched
- Google + OSM matched
- Google-only entities
- Tabelog-only source records without Google match
- OSM-only source records without Google match

The production database is still Google-first. External-only records are audit leads, not automatic production additions.

## 11. Metadata completeness audit
Track at minimum:
- total Google production entities
- unique Place IDs
- duplicate Place IDs
- records outside 1200m (must be zero)
- cuisine completeness
- lunch budget completeness
- dinner budget completeness
- opening-hours completeness
- regular-closed-day completeness
- representative-dish completeness
- 百名店 count/coverage
- Tabelog match rate
- OSM match rate

## 12. Frontend admission
The frontend should eventually load the canonical Google-first dataset directly.

A production Area1 recommendation must satisfy:
- correct profile/area
- absolute <=1200m safety check
- Google production entity status
- any enabled food/budget/distance filters

Opening/holiday status is intentionally not a recommendation exclusion criterion yet.

## 13. Security and cost rules
- Never commit API keys.
- Never put the Places key in browser JavaScript.
- Reuse generated/cache data where appropriate.
- Use staged queries when changing discovery/QC logic.
- Keep field masks narrow.
- Avoid unnecessary repeat discovery runs.
- Do not fabricate source enrichment.
