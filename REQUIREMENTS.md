# Eat Page Requirements

## 1. Product goal

Eat is a small static decision tool: apply a few optional constraints and receive three nearby restaurant candidates without turning the page into a ranking/review product.

The product should optimize for:
- low decision cost;
- understandable filtering;
- trustworthy business identity;
- simple mobile-first presentation;
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

Missing budget, dish, holiday or opening-hour data must remain unknown. Do not infer or fabricate it.

## 5. Source roles

### Google Places
- authoritative identity/QC gate;
- Area1 coverage audit through Place IDs;
- Place ID is the durable cross-reference;
- Google names, formatted addresses, coordinates, status and types may be used transiently during verification/discovery.

### OpenStreetMap
- independent POI discovery and coordinates;
- source of display metadata where available;
- coverage comparison against Google identity inventory;
- does not by itself admit a restaurant into production.

### Tabelog / official restaurant information / curated records
- cuisine refinement;
- lunch/dinner budget;
- representative dishes;
- opening/regular holiday information;
- 百名店 metadata when verified for the correct branch.

External-source data must be attached to a Google identity conservatively. Ambiguous matches stay unresolved rather than being forced.

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
browser filtering + random selection + rendering
```

The public page should load only:
- the canonical production dataset;
- `app.js`.

Raw source files, verification caches and maintenance overlays are not public runtime dependencies.

## 7. Filters

Three optional modules:
- `今天不想吃什么`;
- `大概预算`;
- `期望距离`.

Each filter can be independently disabled. A disabled filter contributes no condition.

### Food exclusion
The UI lists canonical primary cuisine labels. Selecting one excludes restaurants with that primary cuisine.

Do not exclude a restaurant merely because a broad secondary tag overlaps a rejected cuisine; the interaction should remain understandable.

### Budget
Choices:
- unrestricted;
- <= ¥999;
- ¥1,000-1,999;
- ¥2,000-3,999;
- >= ¥4,000.

Lunch and dinner are distinct source fields. Do not silently select one based on the visitor's current clock time.

For a budget-specific filter, a restaurant passes when at least one known lunch/dinner price interval matches the selected band. Restaurants with no known price fail a budget-specific filter but remain eligible when budget is unrestricted/disabled.

### Distance
Choices:
- 300 m;
- 500 m;
- 800 m;
- 1.2 km.

Disabling the distance preference never disables the absolute 1.2 km production boundary.

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

The result layer should stay intentionally small:
- three restaurant cards;
- restaurant name;
- cuisine;
- distance;
- known lunch/dinner budget;
- optional representative dishes;
- known opening/holiday note;
- 百名店 badge when verified;
- direct Google Maps link using the Place ID.

Do not duplicate the same result information into an overview map, per-store embedded map and comparison table unless a future user need clearly justifies that complexity.

If Google Places content is displayed, follow current Google Maps Platform attribution/display rules. The current product does not render Places content over a non-Google map.

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

## 11. Security / cost / policy requirements

- API keys live only in GitHub Actions Secrets.
- Never expose the Places API key in browser JavaScript.
- Keep Google field masks narrow.
- Avoid unnecessary repeat discovery/verification runs.
- Persist Google Place IDs rather than full Places responses for durable identity.
- Public Pages artifacts contain only deployable site assets, not the maintenance repository.
- Keep visible Google/OSM attribution and public privacy/terms pages as required by the services in use.

## 12. Still TBD

Not blockers for the current Area1 release:
- TOKYO 地区2️⃣ production data;
- SHIZUOKA production data;
- final open-now/holiday exclusion logic;
- local recommendation history/device identifier behavior;
- deeper cuisine-family taxonomy if primary labels become too fragmented;
- optional richer result UI only if it solves a demonstrated user need.
