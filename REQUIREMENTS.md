# Eat Page Requirements

## Product scope
- Single-page static web app hosted on GitHub Pages.
- No runtime backend and no server-side database.
- Fast loading on mobile and desktop.
- Public profiles: `TOKYO` / `SHIZUOKA`.
- Personal names must never appear in repository code, data, docs, comments or UI.
- Visual direction: warm yellow/white, rounded, playful, energetic; inspired by a light Usagi-like feeling without copying official artwork.

## Areas
- TOKYO public areas: `地区1️⃣` / `地区2️⃣` only.
- Internal anchors must not be exposed in public UI:
  - 地区1️⃣ = 神保町駅.
  - 地区2️⃣ = 板橋本町駅.
- 地区1️⃣ production boundary is a strict straight-line radius of 1.2 km from its internal anchor.
- Records outside 1.2 km must never participate in 地区1️⃣ recommendations.
- SHIZUOKA remains TBD.

## Current database priority
- Current priority is 地区1️⃣ only.
- Aim for exhaustive practical coverage of publicly discoverable food businesses within 1.2 km using multiple sources.
- Never claim literal 100% real-world completeness without evidence.
- Google Maps business identity is the production acceptance standard.
- A Tabelog or OSM record alone is only a candidate until Google Maps matching is verified.
- If a Tabelog candidate has no reliable Google Maps business entity, it may be ignored/rejected.
- Missing information must remain null/unknown; do not fabricate budget, dishes, opening hours or holidays.

## Sources and roles
- Google Maps / Places API (New): production identity, Place ID, official Google business name, formatted address, coordinates, business status, Google Maps URI, Google place type.
- Tabelog: discovery, 百名店 metadata, cuisine taxonomy, lunch/dinner budget, regular holidays/opening hours, representative dishes and additional manual enrichment.
- OpenStreetMap: broad geospatial candidate discovery and public opening-hours/base POI metadata.

## Production data model
Keep only fields useful to product behavior, matching, provenance or future enrichment.

Core identity and scope:
- `id`
- `profile`
- `area`
- `name`
- `cuisine`
- `tags`
- `address`
- `lat`, `lng`
- `distanceMeters` and/or display `distance`

Recommendation data:
- `lunch`
- `dinner`
- `dishes`
- `openingHoursRaw`
- `closedDays`
- `holidayNote` when needed

Google verification:
- `googlePlaceId`
- `googleMapsUrl`
- `googleStatus`: `pending | verified | rejected`
- `googleBusinessStatus` when available
- `googlePrimaryType`
- QC fields such as `googleQcVersion`, `nameScore`, `matchDistanceMeters`, `googleDistanceMeters` may be retained in generated/cache data.

Award and weighting:
- `hyakumeiten`
- `hyakumeitenYear`
- `hyakumeitenCategory`
- `randomWeight`

Provenance:
- `source`
- `sourceId`

Do not keep unrelated metadata merely because a source provides it.

## Google verification QC
A candidate may enter the production random pool only after Google verification.

Current QC checks include:
1. Google Place ID can be resolved.
2. Google business is not permanently closed.
3. Google coordinates remain within the absolute 1.2 km area boundary.
4. Google coordinates are geographically close to the original candidate coordinates.
5. Candidate name and Google business name pass a normalized similarity check.
6. Google place type is food/restaurant/cafe/bakery-related.

Failed candidates become `rejected`; temporary/API errors remain `pending`.

## Filters
Three optional filter modules:
- `今天不想吃什么`
- `大概预算`
- `期望距离`

Each module has an independent enable/disable switch. Disabled modules contribute no filtering condition.

Distance choices currently include:
- 300m
- 500m
- 800m
- 1.2km

The database boundary remains 1.2km even when the distance filter is disabled.

## Recommendation logic
- Generate 3 restaurants when possible.
- Prefer 3 distinct primary cuisine families.
- Browser-side random selection uses Web Crypto randomness rather than deterministic/static ordering.
- 百名店 restaurants receive higher sampling weight than ordinary restaurants.
- Current configured weight: 百名店 `2.2`, ordinary restaurant `1.0`.
- Weighting occurs inside random selection; 百名店 are not forcibly inserted.
- No rating/review-count popularity ranking unless explicitly requested later.

## 百名店
- Store explicit award status, award year and award category when verified.
- Match award metadata to the correct business entity, not only a loose name match when ambiguity exists.
- 百名店 weighting and UI display are separate from the underlying award metadata.

## Result layout
Current intended result order after generation:
1. Three-store overview map.
2. Individual restaurant cards/names.
3. Three-store horizontal comparison.

Individual restaurant names can expand a Google Maps preview and provide direct Google Maps access.
The overview map uses coordinates to show the relative positions of all three restaurants.

## Holiday/opening data
- Collect publicly available regular opening-hours and holiday/closed-day information.
- Preserve raw source-backed schedule expressions where available.
- Do not infer a closed day merely because data is missing.
- Final recommendation-time closure/exclusion logic is intentionally TBD and will be supplied later.

## Budget and dishes
- Store concrete yen ranges with lunch/dinner separated when available.
- Unknown budget remains unknown.
- Store 1-2 source-supported representative dishes when available.
- Unknown dishes remain incomplete rather than invented.

## Database statistics
The page should expose useful database progress statistics at the bottom, including verified/rejected/pending counts and 百名店 coverage as appropriate.

## Future interaction history
Future version should record recommendation interactions locally with:
- browser/system timestamp
- persistent locally generated installation/device identifier

Exact persistence, reset and privacy semantics remain TBD.
Do not use invasive browser fingerprinting.

## Technical direction
- Runtime: static HTML + CSS + vanilla JavaScript.
- Map UI: Leaflet for three-store overview; Google Maps links/business entities for restaurant navigation.
- Data/build: Python maintenance scripts + GitHub Actions generate static JS/cache files.
- API keys must live in GitHub Actions Secrets and never in repository files.

## Still TBD
- SHIZUOKA data.
- Final food-category grouping.
- Final holiday/open/closed decision logic.
- Interaction-history/device-ID behavior.
- Final result-card visual/layout changes to be specified later.
