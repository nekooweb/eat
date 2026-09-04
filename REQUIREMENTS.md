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
- Aim for exhaustive practical coverage of publicly discoverable food businesses within 1.2 km.
- Never claim literal 100% real-world completeness without evidence.
- **Google Maps / Google Places is the authoritative production business universe and identity source.**
- Google-first discovery should create the primary Area1 merchant set directly from Google Places, deduplicated by Place ID.
- Tabelog and OSM are secondary discovery/enrichment/audit sources and must not veto a valid Google business merely because their name, address or coordinates differ.
- A Tabelog-only or OSM-only record must not enter the production pool until a corresponding Google business identity is found.
- A valid Google business may remain production-eligible even when no Tabelog/OSM match exists; missing enrichment stays unknown.
- Missing information must remain null/unknown; do not fabricate budget, dishes, opening hours or holidays.

## Sources and roles
- **Google Maps / Places API (New): authoritative production identity and primary discovery source.** Use Place ID, Google business name, formatted address, coordinates, business status, Google Maps URI and place types.
- **Tabelog: enrichment and secondary coverage audit.** Use for 百名店 metadata, cuisine taxonomy, lunch/dinner budget, regular holidays/opening hours and representative dishes when reliably matched to a Google entity.
- **OpenStreetMap: secondary geospatial discovery/audit and auxiliary metadata.** It is not a production identity authority.
- Official restaurant/public pages may support manual enrichment/corrections but do not replace Google identity.

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

Google identity:
- `googlePlaceId`
- `googleMapsUrl`
- `googleStatus`
- `googleBusinessStatus`
- `googlePrimaryType`

Award and weighting:
- `hyakumeiten`
- `hyakumeitenYear`
- `hyakumeitenCategory`
- `randomWeight`

Provenance/enrichment:
- `source`
- `sourceId`
- source-specific references only when they support audit/enrichment.

Do not keep unrelated metadata merely because a source provides it.

## Google-first production admission QC
A Google-discovered business may enter the production merchant set when:
1. A Google Place ID exists.
2. Google provides usable coordinates.
3. Google coordinates are within the strict 1.2 km Area1 boundary.
4. Google business status is not permanently closed.
5. Google place type indicates a relevant food/restaurant/cafe/bakery/dessert/takeaway business.
6. Duplicate Place IDs are collapsed to one canonical entity.

For **Google-native discovery**, Tabelog/OSM name similarity or source-coordinate agreement is not a production rejection criterion.

## External-source matching QC
Tabelog/OSM/manual records are matched *onto* an existing Google entity for enrichment/audit.

Preferred evidence order:
1. exact known Google Place ID
2. branch-aware address + name + nearby coordinates
3. strong normalized name + compatible address/coordinates

If external-source matching is ambiguous:
- leave the Google record unenriched or mark the external match pending/manual-review;
- do **not** reject/remove the valid Google production entity.

If a Tabelog/OSM candidate has no Google entity:
- it remains source-only/audit data;
- it must not enter the production recommendation pool.

## Legacy candidate verifier
`scripts/verify_google_places.py` remains useful for:
- auditing historical OSM candidates
- finding Google Place IDs for source-only records
- migration diagnostics

Its source-name/source-coordinate mismatch results must not be interpreted as proof that the corresponding Google business does not exist. The Google-first discovery dataset is authoritative for production coverage.

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
- Match award metadata to the correct Google business/branch identity, not merely a loose name match when ambiguity exists.
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
The page should expose useful database progress statistics at the bottom, including Google production entity count and metadata completeness/百名店 coverage as appropriate.

Legacy OSM verification `verified/rejected/pending` counts may be shown only as audit/maintenance statistics; they must not be confused with Google-first production coverage.

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
- Google-first discovery script: `scripts/discover_google_area1.py`.
- Google-first workflow: `.github/workflows/discover-google-area1.yml`.
- API keys must live in GitHub Actions Secrets and never in repository files.

## Still TBD
- SHIZUOKA data.
- Final food-category grouping.
- Final holiday/open/closed decision logic.
- Interaction-history/device-ID behavior.
- Final result-card visual/layout changes to be specified later.
