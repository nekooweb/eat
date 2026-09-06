# Zero-paid-data-API transition — 2026-09-06

## Why this change was necessary

The full Area1 collection milestone successfully created a 2,804-ID historical snapshot, but several executable maintenance paths still allowed billable Google requests:

- exact Area1 discovery through Places Aggregate/Area Insights;
- bulk Place Details identity/QC over inventory-only IDs;
- Text Search + Place Details source verification;
- retry workflows for failed details;
- `websiteUri` official-site discovery/recovery;
- Pages injection of the same Google secret into client-side Maps Embed.

The previous policy was “zero cost when possible; manual/budget-gated Google otherwise”. This commit replaces it with a hard prohibition.

## Repository changes

- Paid discovery/QC/recovery scripts are fail-closed stubs.
- Paid workflows are manual no-op stubs.
- Known-official extraction remains active but the paid website-discovery stage is removed.
- Pages no longer reads/injects the Google secret; Leaflet/OSM is the embedded-map path.
- `scripts/audit_no_paid_apis.mjs` blocks known paid endpoint and secret patterns in maintenance scripts/workflows.
- `data-api-policy.yml` and the Pages workflow run the guard.

No paid API was called to perform this migration.

## New bulk research path

### Overture Places

Use public Overture Places GeoParquet as the primary current candidate universe. The first implementation is `scripts/build_overture_area1.py`, pinned by default to release `2026-08-19.0` and designed to:

- bbox-prune server-side in DuckDB;
- apply the exact Area1 radius locally;
- filter food/drink candidates using current taxonomy/basic-category fields;
- preserve website/phone/address/brand/source provenance for later review;
- emit staging data only.

### OSM

The current committed OSM pool remains an independent source. For future recurring bulk refreshes the preferred source is a local/cached Geofabrik Kanto PBF rather than systematic Nominatim or repeated public Overpass enumeration.

### Cross-source triangulation

A key limitation is that many frozen inventory-only Google IDs intentionally have no persisted Google name/address/location. They cannot be freshly interpreted without another lookup.

However, the prior full-collection queue persisted useful non-display QC state: Google→OSM match class, match distance and name-similarity score, plus the OSM candidate facts. `scripts/build_open_identity_reconciliation.py` reuses that historical evidence and asks whether a current Overture entity independently agrees with the persisted OSM entity.

This creates A/B/C/D review priorities without issuing a new Google request. It does not automatically override historical conflicts or promote low-confidence relationships.

## Completion semantics change

The old target “give all 2,804 Google IDs a live auditable outcome” implied eventual new lookups for opaque IDs. Under the hard no-paid-API policy, that target is replaced by:

- preserve the 2,804 snapshot as a frozen historical benchmark;
- maintain every current production identity from durable independent sources;
- reconcile actionable legacy relationships using already-persisted QC metrics plus open independent data;
- keep truly opaque legacy IDs frozen/unresolved rather than paying to refresh them;
- build future scope around a source-native identity key.

## Next execution

Run `Build open Area1 candidate review` manually. Review A/B reconciliation tiers first, then feed confirmed independent sources into the existing grouped official-field enrichment pipeline. The first priority remains the 3 medium + 49 review historical OSM candidates and the 208 unresolved current-production source outcomes.
