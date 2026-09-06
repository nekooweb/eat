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

## Expected production effect

The prior 662-row canonical pool contained 656 legacy Google-verified identities plus six catalog-only reviewed identities. Under this stricter rule, expected production size is approximately 656 before final CI verification.
