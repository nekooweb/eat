# Eat Architecture

## 1. Architecture summary

Eat is intentionally a static application. There is no runtime application server and no runtime database.

```text
Google Places API (New)
    │
    ├─ discover_google_area1.py
    │      ↓
    │  Google-first Area1 merchant universe
    │  (Place ID canonical key)
    │
    ├───────────────┐
    │               │
    v               v
Tabelog/manual    OpenStreetMap
(enrichment)      (secondary audit/enrichment)
    │               │
    └──────┬────────┘
           v
   match onto Google entity
           │
           v
 canonical production dataset
           │
           v
GitHub Pages: index.html + styles.css + app.js + static data/*.js
           │
           v
Browser filters -> production pool -> weighted crypto random -> 3 results
```

Google is the production business authority. Tabelog and OSM are no longer allowed to veto a valid Google business merely because their source name/address/coordinates differ.

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

The current legacy load chain contains several historical datasets/overlays. The target load chain is:
1. canonical Google-first Area1 production dataset
2. Tabelog/百名店 enrichment layer if still separated
3. manual curated corrections last
4. `app.js`

Manual corrections must override generated data deliberately and should identify the same Google Place ID whenever possible.

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

Production eligibility must be based on the canonical Google-first production dataset. A valid Google-native entity does not need an OSM/Tabelog match to remain eligible.

## 3. Data layer

### Canonical production identity
Preferred key order:
1. Google Place ID — canonical production identity
2. internal stable record ID derived from Place ID if needed
3. external source IDs as enrichment references only

Normalized names are not production identity keys.

### Google-first production entity
A production Google entity must satisfy:
- valid Place ID
- usable Google coordinates
- strict Area1 distance <=1200m
- not permanently closed
- food-related Google place type
- no duplicate Place ID

### External-source records
Tabelog/OSM/manual records are enrichment/audit records.
They may contain better cuisine, price, dish, award or schedule information, but they do not define whether a Google business exists.

If external matching is ambiguous, leave enrichment unresolved. Do not remove the Google entity.

## 4. Data acquisition / maintenance scripts

### `scripts/discover_google_area1.py`
Primary production discovery script.

Purpose:
- query Google Places Nearby Search (New) across Area1 using overlapping spatial cells and multiple food-related types
- gather Google-native businesses directly
- deduplicate by Place ID
- reject permanent closures
- enforce exact straight-line <=1200m from Area1 anchor
- emit Google-first static data

Current outputs:
- `data/area1_google_places.json` — audit/raw generated Google-first dataset
- `data/area1_google.js` — browser-ready Google-first records

Because Nearby Search can truncate dense local results, the script splits the search spatially and by food-related type. The coverage strategy should be audited and improved if cells/types hit result caps.

### `.github/workflows/discover-google-area1.yml`
Runs Google-first discovery with GitHub Secret `GOOGLE_MAP_API`, commits generated outputs and rebases before push so concurrent documentation/code commits do not cause non-fast-forward failures.

### `scripts/build_area1_osm.py`
Secondary source discovery/audit script.

Purpose:
- collect OSM food-business candidates
- enforce <=1200m source collection radius
- provide auxiliary candidate/location metadata

OSM output must not be treated as the canonical production merchant universe.

### `scripts/verify_google_places.py`
Legacy/source-matching verifier.

Purpose now:
- map historical OSM/source candidates to Google Place IDs
- diagnose source-only records
- support enrichment matching and migration
- preserve audit history

Its source-name/source-coordinate QC must not be interpreted as permission to delete/reject a Google-native production entity.

### Google verification cache
`data/google_places_cache.json` remains useful for legacy/source-to-Google matching and avoiding repeated API calls. It is not the canonical Google-first production dataset.

## 5. Google API security

GitHub Actions secret:
- repository secret name: `GOOGLE_MAP_API`
- workflows expose it to Python only as `GOOGLE_MAPS_API_KEY`

Rules:
- never commit the key
- never expose it in client-side JS
- never paste the key into docs/logs
- restrict the key to required Google Maps Platform APIs where practical

## 6. Tabelog enrichment

Tabelog is used after Google identity exists.

Target enrichment fields:
- cuisine/category refinement
- lunch budget
- dinner budget
- representative dishes
- opening hours
- regular closed days
- 百名店 status/year/category

Matching priority:
1. exact mapped Google Place ID
2. branch-aware name + address + nearby coordinates
3. strong name/address compatibility

Ambiguous matches stay unresolved rather than changing/removing the Google record.

## 7. Maps

### Overview map
Leaflet + OpenStreetMap tiles are used for the 3-result overview because this is lightweight and requires no client-side Google key.

### Restaurant navigation
Google Maps is authoritative for the business entity.
Preferred direct link:
1. Place-ID-based business URL/query
2. exact Google Maps URI returned by Places API
3. name + address fallback

Coordinate-only Google Maps searches must not be used as proof of business identity.

## 8. Random recommendation algorithm

High-level target flow:
```text
Google-first production entities
 -> profile/area
 -> absolute area boundary safety check
 -> optional food exclusion
 -> optional budget filter
 -> optional preferred-distance filter
 -> group by primary cuisine
 -> weighted random cuisine/restaurant selection
 -> enforce different cuisine families when possible
 -> shuffle final 3
```

Randomness uses browser crypto rather than `Math.random()` for selection.

Current weights:
- ordinary = 1.0
- verified 百名店 = 2.2

No previous-history or popularity bias is currently allowed.

## 9. Opening/holiday behavior

Opening-hours data is descriptive only at this stage.
Do not exclude a restaurant because it appears closed until the final schedule/holiday decision rules are supplied.

## 10. Deployment

GitHub Pages deploys the repository as a static site.
Maintenance Actions may update generated data and push commits to `main`, which then triggers a Pages deployment.

## 11. Known architectural debt

1. Frontend still loads legacy candidate/overlay files instead of a single Google-first canonical production dataset.
2. `data/area1_google.js` is newly generated but not yet the sole production input.
3. Google Nearby Search coverage needs cap/coverage auditing in this dense area.
4. Tabelog enrichment matching is not yet Place-ID-centric for all records.
5. 百名店 matching still contains historical name-based logic and must migrate to business identity.
6. Legacy OSM verification statuses can be confused with production coverage and should be separated in UI/statistics.
7. Area2 and SHIZUOKA are not implemented.
8. Final opening/holiday exclusion logic is pending.
9. Local recommendation history/device ID is pending.
