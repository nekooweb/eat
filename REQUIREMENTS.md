# Eat Page Requirements

Updated: 2026-09-06

## 1. Product goal

Eat is a small static decision tool: apply a few optional constraints and receive three nearby restaurant candidates without turning the page into a ranking/review portal.

The product should optimize for low decision cost, trustworthy business identity, useful spatial context and maintainable data.

## 2. Current public scope

Only the following scope is currently selectable:

- profile: `TOKYO`;
- area: `地区1️⃣`;
- strict straight-line production boundary: <=1,200 m from the private Area1 anchor.

Do not display the private anchor. Do not expose Area2/SHIZUOKA selectors before their production datasets exist.

## 3. Production identity

The current Area1 production set remains keyed by **already-committed historical Google Place IDs** for compatibility. Those IDs are frozen identifiers; Google is no longer an active identity/QC provider.

For an existing production restaurant:

1. its historical Place ID must already be committed;
2. durable independent source evidence must support the exact branch;
3. durable geospatial evidence must place it inside the Area1 boundary;
4. no current reviewed closure/identity conflict may block it;
5. the canonical identity must remain unique.

No new Place ID may be obtained through a live paid API. New Overture/OSM candidates stay in staging unless they can be conservatively reconciled to an already-committed legacy identity. Future production expansion beyond that model requires a source-native canonical identity key.

## 4. Canonical public fields

Every canonical restaurant must expose a consistent field shape. Important fields are:

- `id`;
- `profile`, `area`;
- `name`;
- `cuisine`, `tags`;
- `address`;
- `lat`, `lng`, `distanceMeters`;
- `lunch`, `dinner`;
- `recommendedDishes`;
- `hoursReference`;
- legacy `googlePlaceId`, `googleStatus` compatibility fields where already present;
- `hyakumeiten`, year/category;
- `randomWeight`;
- compact source-provider labels.

`recommendedDishes` is always an array with 0-2 Chinese dish names.

`hoursReference` is always a string or `null`.

Missing optional information stays empty/null. Do not fabricate values.

## 5. Recommended-dish rule

A public recommendation may be populated only when a reviewed source explicitly identifies a concrete dish as recommended/popular/specialty/signature/house specialty or equivalent.

Requirements:

- 1-2 Chinese display names maximum;
- exact canonical production-identity binding;
- source URL and review date maintained outside the public row;
- no inferred recommendation from cuisine type;
- no automatic promotion of a generic menu/representative dish.

If evidence is absent or vague, `recommendedDishes` must be `[]`.

## 6. Hours rule

Opening/holiday information is normalized into `hoursReference` for display.

It is a reference only. The current recommendation pool does not implement open-now filtering. A stale or incomplete schedule must not be treated as proof of current operation.

## 7. Durable source roles

### Overture Maps Places

- primary new bulk candidate discovery source;
- names/categories/taxonomy/geometry/confidence;
- website/phone/brand/address/source provenance when present;
- staging input, not automatic production truth.

### OpenStreetMap

- independent candidate discovery;
- durable geospatial coordinates/distance where available;
- coverage comparison and cross-source identity evidence;
- not sufficient by itself for automatic production admission.

### Official restaurant/organization pages

Preferred durable source for exact branch facts such as name/address, cuisine, schedule, menu/signature dishes and supported spend ranges.

### Tabelog / reviewed curated evidence

Reviewed factual enrichment/fallback where exact branch identity is supported.

External facts must be attached conservatively. Ambiguous branch matches remain unresolved.

## 8. Bulk source acquisition

The maintenance process must not require paid place/search APIs or manual restaurant-by-restaurant searching from scratch.

Preferred flow:

```text
Overture Area1 bulk candidates + OSM candidate facts
 -> spatial/name/address blocking
 -> combine with persisted historical QC metrics
 -> A/B/C/D identity review queue
 -> discover official URLs from open source fields / persisted index / brand locators
 -> URL-deduplicated batch fetch
 -> JSON-LD/menu/hours/address/price/recommendation extraction
 -> conservative reviewed source binding and field promotion
```

Paid `websiteUri`, Place Details, Text Search and Area Insights discovery are not fallback options.

Prefer repeated hosts/templates together instead of restaurants one-by-one. Cache/staleness logic should avoid repeatedly fetching already saturated pages.

## 9. Filters

Current optional filters:

- cuisine exclusion;
- budget;
- distance.

Neutral states mean no extra restriction.

### Budget

Current bands:

- unrestricted;
- <=¥999;
- ¥1,000-1,999;
- ¥2,000-3,999;
- >=¥4,000.

Lunch and dinner remain separate. A restaurant passes a specific budget filter if at least one known meal interval overlaps the chosen band. Unknown budget is eligible only when budget is unrestricted.

### Distance

- 300 m;
- 500 m;
- 800 m;
- 1.2 km.

1.2 km is both the neutral choice and hard Area1 boundary.

## 10. Recommendation algorithm

Hard behavior:

- fewer than 3 eligible restaurants -> ask user to relax filters;
- at least 3 eligible restaurants -> return exactly 3 distinct current canonical identities.

Preferences:

- prefer cuisine diversity;
- Web Crypto randomness;
- 百名店 weight `2.2` vs ordinary `1.0`;
- no rating/review-count ranking.

## 11. Result presentation

Each successful result contains the same three restaurants across all views.

### A. Three-store overview

- Leaflet + OpenStreetMap;
- markers numbered 1-3;
- fit to the three generated points;
- do not show the private anchor.

### B. Restaurant cards

Each card may show name, cuisine, distance, known budget, supported dishes, hours, 百名店 badge, an embedded Leaflet/OSM store map and an ordinary external map-navigation link.

Missing optional fields are omitted rather than fabricated.

### C. Per-store map

Use the existing Leaflet/OpenStreetMap implementation. The Pages artifact must not require or receive a Google Maps API key.

A normal outbound `https://www.google.com/maps/...` navigation URL may remain because it is a user-opened website link, not an API request made by Eat.

### D. Comparison table

Compare cuisine, distance, budget, recommended dishes, hours reference and 百名店 status. Unknown values display as `—`.

## 12. API / secret behavior

Repository policy is **no paid data API execution**.

- GitHub Actions maintenance jobs must not read the former Google Maps/Places secret.
- Paid Places/Area Insights/Text Search/Place Details/website discovery is disabled.
- Pages must not inject the former shared key into HTML.
- Retired paid-call scripts fail closed.
- CI blocks known paid endpoint/secret patterns in active maintenance code/workflows.

The secret may still exist in repository settings until manually deleted, but active code must not reference it.

## 13. Validation

Blocking checks should cover:

- strict <=1,200 m boundary;
- unique current canonical identities;
- normalized fields;
- recommendation rows max 2 items and exact identity binding;
- source provenance;
- no reintroduction of paid data API endpoint/secret patterns;
- required Leaflet overview/store-map/comparison hooks;
- public artifact excludes raw maintenance datasets and API keys.

## 14. Progress accounting

Always distinguish:

- frozen historical ID inventory;
- actionable historical reconciliation rows;
- independent open-source candidates;
- canonical production entities;
- usable source coverage;
- terminal source outcomes;
- field completeness;
- staging extraction candidates.

A successful website fetch or high-confidence cross-source candidate is not automatically a reviewed production fact.

## 15. Still TBD

Not blockers for the current Area1 release:

- source-native canonical identity key;
- TOKYO Area2;
- SHIZUOKA;
- open-now/holiday exclusion;
- local recommendation history/device behavior;
- deeper cuisine-family taxonomy;
- further interaction refinements after the current data acquisition pass.
