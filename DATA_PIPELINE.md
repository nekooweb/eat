# Eat Data Pipeline

## Purpose
This document defines how a restaurant moves from a public-source candidate to a production recommendation entity.

The key design rule is:

> **Discovery source != production identity. Google Maps/Places verification is the current production gate.**

## 1. Source roles

### Google Maps / Places API (New)
Authoritative for production business identity and current Google entity data.

Used fields include:
- Place ID
- Google display name
- formatted address
- coordinates
- business status
- Google Maps URI
- primary/type information

A coordinate-only Google Maps URL is not identity verification.

### OpenStreetMap
Role: broad candidate discovery and geospatial base information.

Current Area1 builder:
- searches only the Area1 collection radius
- emits compact candidate records
- calculates straight-line distance
- sets Google verification state to `pending`

OSM is not allowed to directly promote a candidate to production.

### Tabelog
Role: discovery and metadata enrichment.

Useful fields:
- cuisine/category
- lunch/dinner budget
- representative dishes
- opening hours / regular closed days
- 百名店 status/year/category

A Tabelog-only business that cannot be reliably associated with a Google Maps business can be rejected/ignored.

### Official restaurant/public pages
May support manual corrections/enrichment when they clearly identify the business. They do not replace the Google production identity rule.

## 2. Record lifecycle

```text
source record
   ↓
candidate
   ↓
Google Place search
   ├─ no valid entity -> rejected
   ├─ temporary/API failure -> pending
   └─ Place ID found
          ↓
Google detail enrichment
          ↓
QC checks
   ├─ fail -> rejected
   └─ pass -> verified
          ↓
Tabelog/manual enrichment
          ↓
canonical production record
          ↓
static browser dataset
```

## 3. Candidate schema
The OSM builder currently emits a compact candidate shape containing useful product/matching fields such as:

- `id`
- `profile`
- `area`
- `name`
- `cuisine`
- `tags`
- `distance`
- `distanceMeters`
- `lunch`
- `dinner`
- `dishes`
- `openingHoursRaw`
- `closedDays`
- `address`
- `lat`
- `lng`
- `googlePlaceId`
- `googleStatus`
- `source`
- `sourceId`
- `hyakumeiten`
- `randomWeight`

Do not reintroduce unrelated OSM metadata unless it has a clear product, matching, audit or enrichment use.

## 4. Google verification

Script: `scripts/verify_google_places.py`

Environment:
- `GOOGLE_MAPS_API_KEY` — supplied by GitHub Actions from repository Secret `GOOGLE_MAP_API`
- `GOOGLE_VERIFY_LIMIT`
  - positive integer = first N candidates
  - `0` = all candidates
  - `-1` = half of current candidate pool
- `GOOGLE_VERIFY_ENRICH=1` — fetch Google detail fields required for QC

### Stage 1: Place ID search
The verifier performs Places Text Search with candidate name/address and a location bias near the candidate coordinates.

The first-stage field mask is intentionally small and requests the Place ID only.

### Stage 2: Google details
For a resolved Place ID, selected details are requested for QC and production metadata:
- display name
- formatted address
- location
- business status
- Google Maps URI
- primary type/types

## 5. QC v2
A candidate is `verified` only after all required checks pass.

### Permanent closure
`CLOSED_PERMANENTLY` -> `rejected`.

### Google location
Google coordinates are required.

### Absolute Area1 boundary
Google canonical coordinates must remain within the Area1 straight-line 1.2km boundary. A small numerical tolerance may exist in the verifier, but the frontend independently enforces the production 1200m rule.

### Candidate/entity coordinate agreement
Google coordinates must remain close to the source candidate coordinate. Current verifier mismatch threshold is approximately 300m.

This protects against Text Search selecting a similarly named branch elsewhere.

### Name similarity
Candidate and Google display names are normalized before comparison. Strong containment is accepted; otherwise a similarity threshold is applied.

### Food type
Google primary/types must indicate a food/restaurant/cafe/bakery-related business.

### QC version
Terminal cache records carry a QC version. When QC rules change, old verified/rejected results can be reprocessed rather than trusted indefinitely.

## 6. Verification states

### `pending`
- never verified
- enrichment disabled when QC needs it
- temporary API/network error
- other non-terminal state

`pending` records must not be recommended.

### `verified`
- Google entity resolved
- QC passed
- eligible for later product filtering/random selection

### `rejected`
Examples:
- no Google place
- permanently closed
- outside 1.2km
- location mismatch
- name mismatch
- non-food Google type

Rejected records remain useful for audit but must not enter production recommendations.

## 7. Cache and generated overlay

### `data/google_places_cache.json`
Purpose:
- preserve API results/QC state
- avoid unnecessary repeated requests
- allow QC-version revalidation

This is maintenance state, not a user-facing database.

### `data/google_entities.generated.js`
Browser-consumable overlay generated from cache results.

It currently applies Google status and corrected entity metadata to loaded restaurant records before `app.js` creates the production pool.

### `data/google_entities.js`
Manual curated overlay for exact corrections/verified entities. Long term, manual and generated records should be reconciled into a Place-ID-based canonical dataset rather than relying on normalized names.

## 8. Frontend admission
The frontend is the final safety layer.

A production Area1 recommendation must satisfy at least:
- correct profile/area
- within absolute 1200m boundary
- `googleStatus == verified`
- any enabled food/budget/distance filters

Opening/holiday status is intentionally not an admission filter yet.

## 9. 百名店 enrichment
百名店 is not a separate candidate universe. It is metadata attached to the correct verified restaurant entity.

Current random weight:
- ordinary: `1.0`
- 百名店: `2.2`

Long-term award matching must use Place ID/address/branch identity rather than normalized name alone.

## 10. Target canonical dataset
Current data is distributed across legacy/manual/OSM/overlay files. After Google coverage stabilizes, migrate to a canonical output such as:

`data/area1_verified.js`

Recommended canonical identity:
- Google Place ID as primary business key
- one production record per Place ID
- canonical Google coordinates/address
- exact distance recomputed from canonical coordinates
- source-backed Tabelog/manual enrichment
- compact product fields only

Candidate/cache/audit files can remain separate from browser production data.

## 11. Coverage strategy
OSM-first verification alone cannot prove practical completeness because a Google Maps restaurant may not exist in OSM.

Required coverage expansion:
1. Google Places Nearby Search discovery inside the Area1 radius.
2. Food-related type/category searches as needed for coverage.
3. Deduplicate all Google discoveries by Place ID.
4. Exact haversine <=1200m validation.
5. Union with OSM and Tabelog candidate identities.
6. Audit Google-only, OSM-only and Tabelog-only records.

Operational completion means **audited Google-verified cross-source coverage**, not a literal claim that every real-world business has been captured.

## 12. Metadata completeness audit
Track at minimum:
- total Google verified
- rejected
- pending
- unique Place IDs
- cuisine completeness
- lunch budget completeness
- dinner budget completeness
- opening-hours completeness
- regular-closed-day completeness
- representative-dish completeness
- 百名店 count/coverage
- duplicate Place IDs
- records outside boundary (must be zero in production)

## 13. Security and cost rules
- Never commit API keys.
- Never put the Places key in browser JavaScript.
- Reuse cache.
- Stage verification after QC changes before large batches.
- Prefer narrow field masks.
- Do not repeatedly query terminal results unless QC/data identity changed.
- Do not scrape sources aggressively; use source-compliant/manual enrichment where required.
