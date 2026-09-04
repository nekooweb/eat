# Eat Page Requirements

## Scope
- Single-page static web app hosted at `https://nekooweb.github.io/eat/`.
- No backend. Runtime behavior/data are static repository assets.
- Fast loading and usable on mobile and desktop.
- Public profiles: `TOKYO` / `SHIZUOKA`.
- Personal names must never appear in repository code, data, docs, comments or UI.

## Profile and area
- TOKYO public areas: `地区1️⃣` / `地区2️⃣` only.
- Internal anchors: 地区1️⃣ = 神保町駅; 地区2️⃣ = 板橋本町駅. Never expose this mapping in public UI.
- 地区1️⃣ production candidate boundary is a strict straight-line radius of 1.2 km from its internal anchor.
- Records beyond 1.2 km must not participate in 地区1️⃣ recommendations.
- SHIZUOKA remains TBD.

## Database completeness target
- Current priority is 地区1️⃣ only.
- Aim for exhaustive practical coverage of publicly discoverable food businesses inside the 1.2 km boundary using multiple public sources; never claim literal 100% real-world completeness without evidence.
- Merge and deduplicate source records by business identity, normalized name, address and coordinates.
- Preserve source identifiers and provenance instead of inventing missing information.
- Maintain data maturity/quality metadata so incomplete records can be enriched systematically.
- Prefer a missing/null value over fabricated budget, dish, holiday or opening information.

## Restaurant data collection
- Cross-check using Tabelog and Google Maps during repository maintenance, with OpenStreetMap as an additional public geospatial/base-metadata source.
- Tabelog: discovery, 百名店 taxonomy/awards, cuisine, lunch/dinner budget, menu/recommended dishes, regular hours/holidays.
- Google Maps: business identity, address/location cross-check, coordinates, Maps access and current-place context.
- OpenStreetMap: base POI coverage, coordinates and available public tags such as opening hours, phone, website, brand, operator, takeaway/delivery/accessibility metadata.
- Production data remains static; no restaurant discovery at page load.

## Data fields
A restaurant record should support where publicly available: stable id, Japanese name, alternative/English name, profile, anonymous area, primary cuisine, raw cuisine/source taxonomy, secondary tags, lunch/dinner budget, exact straight-line distance, display distance, 1-2 supported representative dishes, raw public opening-hours expression, regular closed days, holiday/uncertainty note, phone, website, brand/operator, takeaway/delivery, accessibility, smoking/payment metadata, full address/postcode, latitude/longitude, Google Maps query/URL/Place ID, source/source ID/source URL, verification/source date, data maturity and data-quality score.

## Holiday/opening data
- Collect and preserve publicly available opening-hours and regular-holiday information now.
- Do not invent a holiday from absence of opening data.
- The final recommendation-time closure/exclusion logic is intentionally TBD and will be supplied later by the user.
- Until that logic is finalized, the database should retain raw/source-backed schedule information without making unsupported live-status claims.

## Filters
- Three optional filter modules: `今天不想吃什么`, `大概预算`, `期望距离`.
- Each module has an independent enable/disable switch.
- A disabled module contributes no filtering condition.
- Distance choices currently include 300m / 500m / 800m / 1.2km; the database boundary remains 1.2km regardless of the filter switch.

## Recommendation
- Generate 3 distinct restaurants from 3 distinct primary cuisine families when possible.
- Use browser-side cryptographic randomness.
- 百名店 restaurants have a higher configured random weight than ordinary restaurants (currently 2.2 vs 1.0), while cuisine diversity remains enforced.
- No ratings/review-count popularity ranking unless explicitly requested later.

## 百名店
- Store explicit 百名店 boolean, award year and award category when verified.
- Match award metadata to a business identity, not merely a loose name match when ambiguity exists.
- Display/weight behavior can evolve separately from the underlying award metadata.

## Google Maps and overview map
- Individual restaurant expansion provides Google Maps location preview/direct access.
- Three-result overview uses coordinates and displays the three selected locations together.
- Store exact coordinates and Place ID when obtainable.

## Budget and dishes
- Store concrete yen ranges, lunch/dinner separately where available.
- Never replace unknown budget with an invented range.
- Store 1-2 source-supported representative dishes when available; unknown dishes remain explicitly incomplete.

## Interaction history (future)
- Future version should record recommendation interactions locally with browser/system timestamp and a persistent locally generated installation/device identifier.
- Exact persistence/privacy/reset semantics remain TBD.
- Do not use invasive fingerprinting.

## Technical direction
- Static HTML/CSS/vanilla JS at runtime.
- Maintenance/build scripts and GitHub Actions may generate static data files.
- Keep source provenance and quality metrics in generated records.

## Visual direction
- Warm yellow/white, rounded and playful; Usagi-like energetic feeling without copying official character artwork.

## Still TBD
- SHIZUOKA data.
- Final food-category grouping.
- Final holiday/open/closed decision logic.
- Interaction-history/device-ID behavior.
