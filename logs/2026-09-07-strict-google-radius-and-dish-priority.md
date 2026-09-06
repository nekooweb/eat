# 2026-09-07 — Strict Google binding, 1.2 km radius, dish-first priority

## User requirement

- Public site must contain only restaurants within 1.2 km.
- Every public restaurant must be strongly bound to a Google Maps Place ID.
- Entries without a verified Google binding must be excluded.
- Recommended/featured dishes are the highest-priority enrichment target.
- Open-expansion/reference-dish runtime concepts should be removed.

## Implementation

- Removed the Overture/OSM/Hot-Pepper public expansion runtime layer.
- Production admission now requires `googleStatus=verified` and exact matched geospatial evidence.
- The six catalog-only admissions are no longer allowed into production.
- Production rejects missing coordinates, missing Place IDs, negative/invalid distances, and distances above 1200 m.
- Frontend no longer merges `PUBLIC_OPEN_RESTAURANTS` and no longer displays generic `参考菜品`.
- Frontend shows strict `推荐菜` first, then source-backed `特色菜`.
- Enrichment queue priority changed from price-first to dish-first.
- Pages no longer builds or ships `public_pool_area1.js`.
- Open-data identity sources remain internal only where they are useful for independent geospatial/QC evidence; they do not create public restaurant identities.

## Final verified production result

Strict CI rebuild completed with **654 production restaurants**. Every production row has:

- a non-empty Google Place ID;
- `googleStatus=verified`;
- finite matched latitude/longitude;
- finite `distanceMeters` between 0 and 1200 m;
- no open-catalog/public-expansion admission path.

The previous 662-row canonical pool lost eight rows under the stricter rule: six catalog-only admissions and two legacy identities that did not have an exact independently verified geospatial row tied to the same Google Place ID.

Current dish coverage after strict filtering:

- strict recommended dishes: **29 / 654**;
- source-backed featured dishes: **128 / 654**;
- missing strict recommendations: **625**;
- missing featured dishes: **526**.

The enrichment queue now places `extract_strict_recommended_menu_item` ahead of every price, hours, address, and cuisine task. The first ten queue entries in CI all resolve to that action.

Nine historical enrichment records no longer attach to strict production. They are retained only as internal maintenance provenance and cannot enter the public runtime.
