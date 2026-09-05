# Eat Page Requirements

## 1. Product goal

Eat is a small static decision tool: apply a few optional constraints and receive three nearby restaurant candidates without turning the page into a ranking/review product.

The product should optimize for:
- low decision cost;
- understandable filtering;
- trustworthy business identity;
- useful spatial context;
- fast comparison between the three generated choices;
- maintainable static data rather than browser-side data engineering.

It is **not** intended to reproduce Google Maps, Tabelog, or a restaurant search portal.

## 2. Current implemented scope

Current public scope is only:
- profile: `TOKYO`;
- area: `地区1️⃣`;
- production boundary: strict straight-line distance <= 1,200 m from the private Area1 anchor.

The internal anchor must not be displayed in the public UI.

Future scopes remain planned but are not selectable until their production dataset exists:
- `TOKYO / 地区2️⃣`;
- `SHIZUOKA`.

Do not expose a control that only leads to a "TBD" error.

## 3. Production identity rule

A production restaurant must have a verified Google Place ID.

Google Places is used as the **business identity gate**, not as the permanent application database.

A row is production-eligible only when:
1. a Google Place ID has been found;
2. the verification result is `verified`;
3. transient Google QC confirms a usable food-related place;
4. transient Google coordinates confirm it is inside the Area1 boundary;
5. the place is not permanently closed;
6. the Place ID is unique in the final production dataset.

Google Place IDs may be persisted as identity keys. Other Google Places response fields used for QC should not become long-lived repository data unless a specific current Google Maps Platform policy permits that storage.

## 4. Long-lived restaurant metadata

Display/recommendation metadata should come from independently maintainable sources such as:
- OpenStreetMap for basic POI/coordinates and coverage audit;
- curated/manual records;
- Tabelog or official restaurant pages for factual enrichment where a reliable identity match exists.

Useful persistent fields:
- `id`;
- `profile`, `area`;
- `name`;
- `cuisine`, `tags`;
- `address`;
- `lat`, `lng`;
- `distanceMeters`;
- `lunch`, `dinner`;
- `dishes`;
- `openingHoursRaw`, `closedDays`, `closedNote`;
- `googlePlaceId`, `googleStatus`;
- `hyakumeiten`, `hyakumeitenYear`, `hyakumeitenCategory`;
- `randomWeight`;
- compact provenance (`sources`) when useful for audit.

Missing budget, dish, holiday or opening-hour data must remain unknown. Do not infer or fabricate it. Missing optional metadata should normally be omitted from a result card rather than displayed as repeated `unknown` placeholders.

## 5. Source roles

### Google Places
- authoritative identity/QC gate;
- Area1 coverage audit through Place IDs;
- Place ID is the durable cross-reference;
- Google names, formatted addresses, coordinates, status and types may be used transiently during verification/discovery.

### OpenStreetMap
- independent POI discovery and coordinates;
- source of display metadata where available;
- source of map coordinates used by Leaflet result views when present in canonical data;
- coverage comparison against Google identity inventory;
- does not by itself admit a restaurant into production.

### Tabelog / official restaurant information / curated records
- cuisine refinement;
- lunch/dinner budget;
- representative dishes;
- opening/regular holiday information;
- 百名店 metadata when verified for the correct branch.

External-source data must be attached to a Google identity conservatively. Ambiguous matches stay unresolved rather than being forced.

An explicit source exception records the outcome of research; it does not confirm a business is open or closed. When source evidence questions an existing production restaurant's status, recheck the existing Google identity and current status, following the Google-first admission rule. Record the dated QC outcome and resulting recommendation eligibility. The current exception ledger does not automatically filter production; the three pending status rechecks are tracked in `DEVELOPMENT.md`.

## 6. Canonical build model

The browser must not merge raw source datasets.

Maintenance/build flow:

```text
independent source data
       +
Google Place ID verification
       +
award/manual enrichment
       |
       v
build_production_dataset.mjs
       |
       v
production_area1.js
       |
       v
browser filtering + random selection + result visualization
```

The public application may load:
- Leaflet as a presentation dependency;
- the canonical production dataset;
- `app.js`.

Raw source files, verification caches and maintenance overlays are not public runtime dependencies.

Leaflet does not perform entity matching or data enrichment. It only visualizes coordinates already present in the canonical production records.

## 7. Filters

Current optional constraints:
- `今天不想吃什么`;
- `大概预算`;
- `期望距离`.

Do not add a second enable/disable state on top of these controls. Their neutral selections already represent no extra restriction:
- no cuisine selected = no cuisine exclusion;
- budget `不限` = no budget restriction;
- distance `1.2km` = no restriction beyond the absolute Area1 boundary.

### Food exclusion
The UI lists canonical primary cuisine labels. Selecting one excludes restaurants with that primary cuisine.

Do not exclude a restaurant merely because a broad secondary tag overlaps a rejected cuisine; the interaction should remain understandable.

### Budget
Choices, when enough persistent budget metadata exists to make the module useful:
- unrestricted;
- <= ¥999;
- ¥1,000-1,999;
- ¥2,000-3,999;
- >= ¥4,000.

Lunch and dinner are distinct source fields. Do not silently select one based on the visitor's current clock time.

For a budget-specific filter, a restaurant passes when at least one known lunch/dinner price interval matches the selected band. Restaurants with no known price fail a budget-specific filter but remain eligible when budget is unrestricted.

If fewer than three production entities have any known lunch/dinner budget, hide the budget module rather than expose a control that cannot produce a valid three-choice result.

### Distance
Choices:
- 300 m;
- 500 m;
- 800 m;
- 1.2 km.

The 1.2 km option is both the neutral distance choice and the absolute production boundary.

## 8. Recommendation logic

Hard behavior:
- if fewer than three restaurants satisfy the active filters, explain that the filters should be relaxed;
- if at least three restaurants satisfy the filters, return exactly three distinct Google Place IDs.

Preference behavior:
- maximize cuisine diversity among the three choices;
- do **not** fail generation merely because fewer than three cuisine families remain;
- use Web Crypto randomness;
- 百名店 may receive higher sampling weight (`2.2`) than ordinary restaurants (`1.0`);
- weighting is probabilistic and does not guarantee a 百名店 result;
- do not introduce rating/review-count popularity ranking unless explicitly requested later.

## 9. Results

Every successful three-choice result should provide four complementary layers:

### A. Three-store overview map
- Leaflet/OpenStreetMap map above the cards;
- show all generated stores that have canonical coordinates;
- markers numbered `1`, `2`, `3` to match the cards and comparison table;
- fit the map to the generated points rather than exposing the private Area1 anchor.

Purpose: answer **where are the three options relative to one another?**

### B. Three restaurant cards
Each card should show:
- restaurant name;
- cuisine;
- distance;
- known lunch/dinner budget when available;
- optional representative dishes when available;
- known opening/holiday note when available;
- 百名店 badge when verified;
- a small Leaflet/OpenStreetMap location map when canonical coordinates exist;
- direct Google Maps link using the Place ID.

Do not show a generic `identity verified` badge on every card. Verification is an admission rule, not useful differentiating result content.

Purpose of the small map: answer **where exactly is this restaurant and what does its immediate location look like spatially?**

### C. Three-store comparison table
A comparison table should appear after the cards and compare the same three numbered choices across useful dimensions, currently:
- cuisine;
- distance;
- budget;
- representative dishes;
- opening/holiday information;
- 百名店 status.

Unknown values should display compactly as `—` rather than invented data.

Purpose: answer **what is different among the three choices without rereading all cards?**

### D. Google Maps navigation
Each restaurant keeps a direct Google Maps link based on the verified Place ID for navigation/business lookup.

The overview and per-store Leaflet maps must use independently maintained canonical coordinates, not transient Google Places response coordinates. Google Places content must not be rendered onto the non-Google map layer.

## 10. Database statistics

Expose a compact progress summary, currently including:
- production entity count;
- cuisine completeness;
- budget completeness;
- 百名店 count.

Maintenance audits should additionally check:
- unique Place IDs;
- no production distance >1,200 m;
- verification status;
- source coverage/match rates;
- metadata completeness.

Progress reporting must distinguish:
- candidate count, processed QC records, pending records and candidates never checked;
- unique production identities and the separate Google discovery-ID inventory;
- usable source coverage and source-outcome accounting, including recorded exceptions;
- field-level source evidence, populated fields and reviewed-but-unavailable fields;
- the configured distance boundary and actual coverage within distance rings.

Always state the denominator for completeness percentages. `pending:0` and 100% source-outcome accounting must not imply full candidate verification, complete restaurant fields or confirmed current operation. Opening/holiday information remains display-only until the planned exclusion logic is implemented and verified.

## 11. Security / cost / policy requirements

- API keys live only in GitHub Actions Secrets.
- Never expose the Places API key in browser JavaScript.
- Keep Google field masks narrow.
- Avoid unnecessary repeat discovery/verification runs.
- Persist Google Place IDs rather than full Places responses for durable identity.
- Public Pages artifacts contain only deployable site assets, not the maintenance repository.
- Keep visible Google/OSM attribution and public privacy/terms pages as required by the services in use.
- Leaflet/OSM result maps are presentation-only and must not reintroduce browser-side source merging.

## 12. Still TBD

Not blockers for the current Area1 release:
- TOKYO 地区2️⃣ production data;
- SHIZUOKA production data;
- final open-now/holiday exclusion logic;
- local recommendation history/device identifier behavior;
- deeper cuisine-family taxonomy if primary labels become too fragmented;
- further result interaction refinements after the required overview/store-map/comparison structure is stable.
