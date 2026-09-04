# Eat Architecture

## 1. Architecture summary

Eat is intentionally a static application. There is no runtime application server and no runtime database.

```text
Public / maintenance sources
  ├─ OpenStreetMap ──> build_area1_osm.py ──> candidate JS
  ├─ Tabelog/manual research ───────────────> enrichment / 百名店 metadata
  └─ Google Places API (New)
            │
            v
     verify_google_places.py
            │
            ├─ google_places_cache.json
            └─ google_entities.generated.js
                         │
                         v
GitHub Pages: index.html + styles.css + app.js + static data/*.js
                         │
                         v
Browser filters -> verified-only pool -> weighted crypto random -> 3 results
```

The only API-dependent work happens during maintenance/build workflows. Normal page visitors do not call Google Places API and never receive the API key.

## 2. Runtime frontend

### `index.html`
Owns page structure and asset loading order:
- profile selector (`TOKYO`, `SHIZUOKA`)
- anonymous area selector
- three independently toggleable filter modules
- generate button
- result container
- database statistics/footer
- Leaflet dependency
- static restaurant datasets and overlays

Data scripts must load before `app.js`.

Current conceptual load order:
1. base/manual restaurant data
2. bulk/area candidate data
3. OSM candidate data
4. 百名店 enrichment
5. manually curated Google entity corrections
6. generated Google verification overlay
7. application logic

Manual corrections and generated verification must be handled deliberately; do not silently allow stale candidate metadata to override a trusted Google entity.

### `styles.css`
Owns responsive visual presentation:
- yellow/white visual system
- rounded cards/chips/buttons
- mobile/desktop layout
- filter enabled/disabled states
- result/map/comparison presentation
- unified Japanese/Chinese-capable system font stack

No functional filtering/business rules should be implemented in CSS.

### `app.js`
Owns browser behavior:
- selected profile and area
- filter enable/disable state
- food exclusions
- budget selection
- distance preference
- absolute Area1 1.2km safety boundary
- production eligibility
- cuisine grouping
- weighted cryptographic random selection
- 3-distinct-cuisine selection when possible
- result rendering
- overview Leaflet map
- individual Google Maps URL/embed generation
- database statistics

Production eligibility must be conservative: Google `verified` is required for the production recommendation pool.

## 3. Data layer

### Candidate vs production concept
Candidate records and production records are different concepts even when they currently share browser-loaded files.

Candidate:
- discovered from OSM/Tabelog/manual sources
- may be incomplete
- may be `pending`
- must not be recommended until Google identity is verified

Production-eligible:
- Google business entity verified
- within absolute area boundary
- food-related
- not permanently closed
- identity/location QC passed

Long-term preferred organization:
```text
data/candidates_*.js
        ↓ verification/enrichment
data/area1_verified.js
        ↓ browser
recommendation pool
```

This separation should replace progressively accumulated legacy/bulk files once migration is safe.

### Google verification states
- `pending`: not yet conclusively verified, or temporary API failure.
- `verified`: passed current QC version.
- `rejected`: no valid entity, permanent closure, geographic/name/type mismatch, or other terminal QC failure.

A QC version is stored so old terminal results can be rechecked after verification rules change.

### Identity priority
Preferred identity key order:
1. Google Place ID
2. source stable ID + exact business/address/location evidence
3. normalized name only as a fallback for legacy overlays

Name-only matching is not sufficient for long-term branch-safe deduplication.

## 4. Data acquisition / maintenance scripts

### `scripts/build_area1_osm.py`
Purpose:
- collect broad food-business candidates around Area1
- enforce collection radius <= 1200m
- calculate distance
- emit compact candidate records

OSM is discovery/geospatial evidence, not final business identity authority.

### `scripts/verify_google_places.py`
Purpose:
- read candidate records
- resolve Google Place ID through Places API (New)
- fetch selected Google place details
- apply QC
- cache results
- generate browser overlay

Current QC:
- permanent closure rejection
- official Google coordinate availability
- absolute <=1.2km Area1 check
- candidate-to-Google coordinate mismatch check
- normalized name similarity
- food-related Google type

The script supports:
- positive integer limit = first N candidates
- `0` = all candidates
- `-1` = half of current candidate pool
- cache reuse
- QC-version revalidation

### Google cache
`data/google_places_cache.json` is maintenance state, not the authoritative source by itself. It prevents unnecessary API work and records QC outcomes.

`data/google_entities.generated.js` is the browser-consumable generated overlay.

## 5. Google API security

GitHub Actions secret:
- repository secret name: `GOOGLE_MAP_API`
- workflow exposes it to Python only as `GOOGLE_MAPS_API_KEY`

Rules:
- never commit the key
- never expose it in client-side JS
- never paste the key into docs/logs
- restrict the key to required Google Maps Platform APIs where practical

## 6. Maps

### Overview map
Leaflet + OpenStreetMap tiles are used for the 3-result overview because this is lightweight and requires no client-side Google key.

### Restaurant navigation
Google Maps is authoritative for the business entity.
Preferred direct link:
- restaurant name/address + `query_place_id` when Place ID exists
- exact Google Maps URI when supplied by Places API
- name + address fallback

Coordinate-only Google Maps search URLs must not be used as proof of business identity.

## 7. Random recommendation algorithm

High-level flow:
```text
all loaded records
 -> profile/area
 -> absolute area boundary
 -> googleStatus == verified
 -> optional food exclusion
 -> optional budget filter
 -> optional preferred-distance filter
 -> group by primary cuisine
 -> weighted random cuisine
 -> weighted random restaurant within cuisine
 -> remove chosen cuisine
 -> repeat until 3 or pool exhausted
 -> shuffle result order
```

Randomness uses browser crypto rather than `Math.random()` for selection.

Current weights:
- ordinary = 1.0
- verified 百名店 = 2.2

No previous-history or popularity bias is currently allowed.

## 8. Opening/holiday behavior

Opening-hours data is descriptive only at this stage.
Do not exclude a restaurant because it appears closed until the product owner supplies the final schedule/holiday decision rules.

## 9. Deployment

GitHub Pages deploys the repository as a static site.
Maintenance Actions may update generated data and push commits to `main`, which then triggers a Pages deployment.

## 10. Known architectural debt

1. Legacy data is split across several JS files instead of one normalized verified dataset.
2. Some overlay matching still uses normalized restaurant names; migrate to candidate ID / Place ID.
3. Google-first discovery is not yet implemented, so OSM-only verification cannot prove exhaustive Google Maps coverage.
4. Tabelog enrichment is incomplete and should remain source-backed/manual or use a compliant collection method.
5. Area2 and SHIZUOKA are not implemented.
6. Final opening/holiday exclusion logic is pending.
7. Local recommendation history/device ID is pending.
