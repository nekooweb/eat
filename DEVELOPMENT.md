# Eat Development Plan

## Current milestone
Build a reliable `地区1️⃣` recommendation database inside the strict 1.2km boundary, with Google Maps business verification as the production gate and Tabelog/OSM used for discovery and enrichment.

## Development principles
1. Correct identity before high record count.
2. Keep runtime static and fast.
3. Never put private API credentials in frontend code.
4. Do not fabricate restaurant metadata.
5. Preserve anonymous public area labels.
6. Treat candidate discovery and production eligibility separately.
7. Every widening/narrowing of geographic scope must be explicit.
8. A data-source record is not automatically a restaurant recommendation.

## Phase A — Area1 verification foundation [in progress]

Completed / implemented:
- static responsive single-page UI
- TOKYO / SHIZUOKA profile shell
- Area1 / Area2 anonymous labels
- Area1 1.2km hard boundary
- three independently switchable filters
- concrete budget ranges
- distance preferences
- 3-result random recommendation
- distinct cuisine preference
- 百名店 metadata/2.2 weighting foundation
- Leaflet overview map
- Google Maps individual links/embeds
- OSM candidate builder
- Google Places API workflow
- GitHub Secret integration
- Google Place ID/details cache
- strict Google verification QC v2
- generated Google overlay loaded by frontend

In progress:
- verify approximately half of current Area1 OSM pool under QC v2
- inspect rejection reasons for false positives/false negatives
- complete remaining candidate verification after QC review

## Phase B — Production dataset normalization

Required:
- create a single canonical verified Area1 dataset
- deduplicate by Google Place ID first
- migrate legacy name-only overlays to ID-based matching
- remove rejected/pending entities from production dataset while preserving audit/cache state
- merge official Google coordinates into production records
- calculate exact Area1 distance from canonical coordinates
- retain compact useful fields only

Target output:
- `data/area1_verified.js` or equivalent canonical file

Do not delete legacy files until output parity has been checked.

## Phase C — Coverage expansion

Problem:
The current verifier starts from OSM candidates. Restaurants present on Google Maps but absent from OSM can therefore be missed.

Plan:
- add Google Places Nearby Search discovery for food-related types inside Area1
- deduplicate Google discovery by Place ID
- enforce exact haversine <=1200m
- union Google-discovered entities with OSM/Tabelog candidate sets
- audit source-only records

Coverage categories:
- Google + OSM
- Google + Tabelog
- Google only
- OSM candidate rejected/not found on Google
- Tabelog candidate rejected/not found on Google

Operational completion means audited Google-verified cross-source coverage, not a claim of universal real-world completeness.

## Phase D — Metadata enrichment

For each verified entity, enrich where supported:
- primary cuisine
- secondary tags
- lunch budget
- dinner budget
- 1–2 representative dishes
- opening hours
- regular closed days
- 百名店 year/category

Priority:
1. identity/address/coordinates
2. cuisine
3. budget
4. 百名店
5. opening/closed days
6. representative dishes

Unknown values remain null/empty.

## Phase E — UI/data quality

Planned:
- database coverage dashboard/statistics
- clear verified-data count
- 百名店 count
- metadata completeness metrics
- improve card/comparison layout after product feedback
- ensure every recommended record can appear on overview map
- branch-safe Google Maps navigation

## Phase F — User-specified future logic

Do not implement until requirements are supplied:
- holiday/open-now exclusion logic
- recommendation history behavior
- persistent local installation/device ID
- history reset/privacy behavior
- whether history changes future random probability

## Area2 / SHIZUOKA
Area2 and SHIZUOKA are intentionally secondary until Area1 data/verification architecture is stable.
Reuse the same candidate -> Google verification -> canonical dataset pipeline rather than creating a second ad-hoc implementation.

## Routine maintenance workflow

### Candidate refresh
1. Run/update candidate collection.
2. Confirm radius and anonymous area mapping.
3. Review candidate count.

### Google verification
1. Use a small batch after code/QC changes.
2. Review rejection reasons.
3. Run half/all only after QC looks sane.
4. Commit cache + generated overlay.
5. Check Pages deployment.

### Enrichment
1. Work only from verified entities.
2. Record source-backed values.
3. Update 百名店 identity carefully.
4. Never infer unknown values.

### Release check
- page loads on mobile and desktop
- no API key in page source/repository
- production pool is verified-only
- no Area1 result exceeds 1.2km
- Google links point to business entities rather than bare coordinates
- three-result cuisine diversity works when sufficient categories exist
- filter toggles actually bypass their corresponding conditions
- no personal names appear in public repository content

## Cost control
Google Places calls are maintenance-time only. Use cache reuse and staged verification. Prefer ID-only search before detail enrichment. Do not repeatedly re-query already terminal results unless QC version/data identity changed.

## Definition of done for Area1 v1
- canonical Google-verified dataset exists
- practical Google/OSM/Tabelog coverage audit completed
- strict <=1.2km boundary validated from canonical coordinates
- production frontend uses only verified records
- no known duplicate Place IDs
- cuisine coverage sufficient for 3-way recommendations
- budget metadata reasonably populated without fabrication
- 百名店 identity/weighting audited
- documentation and changelog reflect final state
