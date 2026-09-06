# Eat Development Plan

Updated: 2026-09-06

## Current state

`TOKYO / 地区1️⃣` keeps the confirmed **2,804-ID** Area1 snapshot as a frozen historical identity benchmark while production enrichment continues from durable independent sources.

Current audited baseline:

- exact frozen inventory: **2,804 / 2,804** historical Google Place IDs;
- canonical production: **656**;
- production inside the frozen inventory: **653**;
- inventory-only legacy IDs: **2,151**;
- OSM independent-source candidates: **1,273**;
- verified historical QC rows: **666**;
- source-backed production: **404 / 656**;
- source outcomes accounted for: **448 / 656**;
- unresolved current-production source queue: **208**;
- official-site index: **194** identities;
- cuisine known: **579**;
- address known: **268**;
- normalized opening hours: **287**;
- budget known: **192**;
- featured dishes: **129**;
- strict recommendations: **30**;
- 百名店: **22**.

`DATA_ENRICHMENT_PROGRESS.md` is the authoritative numeric report. Detailed run history belongs under `logs/`.

## Paid data API prohibition

Effective 2026-09-06, repository maintenance must not execute billable place/search/map data APIs.

This is a hard engineering constraint, not a budget preference:

- do not call Google Places, Places Aggregate/Area Insights, Text Search, Place Details, `websiteUri`, or equivalent billable discovery/QC endpoints;
- do not read Google Maps/Places API secrets in maintenance workflows;
- do not inject the former shared Google API key into the public Pages build;
- legacy Google Place IDs and the existing identity/QC cache are frozen read-only historical inputs;
- do not refresh opaque legacy IDs by issuing new paid requests;
- retired paid-call scripts remain as fail-closed stubs so accidental local or Actions execution cannot incur charges;
- CI runs `scripts/audit_no_paid_apis.mjs` to block reintroduction of known paid endpoint/secret patterns.

Ordinary HTTPS fetches of official restaurant pages, open data files and public static catalogs remain allowed. They must still respect provider terms, rate limits and caching requirements.

## Development direction

The previous plan tried to make every one of the 2,804 Google IDs a live maintenance target. That is no longer appropriate because many inventory-only IDs intentionally retain no durable Google name/address/location payload. Without paid lookups, those opaque IDs cannot be refreshed safely.

The new design separates two concerns:

1. **Frozen legacy identity reconciliation** — preserve the 2,804-ID snapshot and use only already-committed QC metrics/candidate links to reconcile identities.
2. **Open independent-source coverage** — discover and analyze current food businesses from Overture Maps, OSM extracts, official sites and trusted locators without depending on live Google calls.

The 656 current production rows remain keyed by their already-committed Place IDs for runtime compatibility. New open-data candidates do not receive invented Google IDs. Future expansion beyond the frozen identity universe should add a source-native canonical identity key before admission.

## Zero-paid-API batch pipeline

### Stage 1 — open candidate ingestion

Use Overture Maps Places as the primary large-batch discovery layer:

- query the public GeoParquet release by Area1 bounding box;
- use the current `basic_category` / `taxonomy` fields rather than removed legacy categories;
- keep only food/drink candidates and apply the exact <=1,200 m geodesic boundary after bbox pruning;
- preserve Overture `sources`, websites, phones, addresses, brands and confidence fields for provenance/review.

Use OSM as the independent geospatial layer. The committed `area1_osm.js` remains usable now. For future large refreshes, prefer a local/cached Geofabrik Kanto PBF extract over systematic public Nominatim or high-volume public Overpass queries.

### Stage 2 — cross-source blocking and triangulation

Do not compare every source row with every other row.

Block candidates by spatial cells plus normalized name/address signals, then score only nearby pairs. `scripts/build_open_identity_reconciliation.py` combines:

- the persisted historical Google→OSM match class, distance and name-similarity metrics already stored in `area1_full_collection_queue.json`;
- current OSM candidate facts;
- a new independent Overture candidate near the same source entity.

This creates an A/B/C/D review queue. It does **not** auto-promote identities. Historical collision/terminal QC remains authoritative until explicitly reviewed.

### Stage 3 — official source discovery without search APIs

Discover official sources from reusable deterministic evidence:

- Overture website/brand fields;
- existing `official_candidate_index.json`;
- official brand store locators and sitemaps;
- previously reviewed official/Tabelog bindings;
- source URLs already attached to durable records.

Fetch unique URLs once per run, group by host/template, cache content hashes/ETag/Last-Modified when practical, and avoid repeatedly refetching saturated pages.

### Stage 4 — grouped field extraction

During each source pass collect all safely supported fields together:

- exact branch identity;
- cuisine;
- address;
- normalized weekly opening hours;
- explicit lunch/dinner spend range when available;
- representative/signature dishes;
- strict recommendation evidence when explicitly stated.

JSON-LD/Schema.org, stable branch locator markup and menu pages should be parsed in batches. Missing or ambiguous values remain unknown.

### Stage 5 — incremental refresh

Prefer release deltas and source changes over full rescans:

- pin an Overture release for reproducibility, then compare a later release by Overture ID/source fields;
- refresh OSM from a local extract periodically rather than per-entity API calls;
- refetch official pages only when stale or changed;
- rebuild canonical production and ledgers only after material identity/source changes.

## Admission rules

- Existing production Place IDs are retained only as frozen historical keys.
- No new Place ID may be obtained through a live paid API.
- Independent source facts must match an exact branch conservatively.
- Existing terminal QC conflicts and already-bound source entities must not be overwritten automatically.
- Overture/OSM agreement strengthens review priority but does not by itself erase a historical Google↔OSM mismatch.
- Ambiguous, stale, closed or unsupported cases receive an explicit unresolved/terminal outcome rather than guessed data.
- A future source-native `identityKey` is required before expanding production beyond identities that can be reconciled to the frozen current model.

## Field rules

### Opening hours

`openingHours` is a normalized weekly schedule. Temporary, holiday-only or irregular schedules are not forced into the static weekly model.

### Budget

Menu-item/course prices do not automatically define restaurant lunch/dinner budget. Only explicit spend-range evidence is accepted.

### Dishes

- `recommendedDishes`: strict explicit recommendation/popularity/signature evidence;
- `featuredDishes`: broader source-backed representative/signature items.

Brand/template propagation may fill fields only after branch identity is already independently established.

## Ordered next work

1. Run the no-paid-API policy audit on every data/workflow change.
2. Produce an Overture Area1 staging snapshot with `zero-cost-area1-candidates.yml`.
3. Build the Overture↔OSM↔historical-QC reconciliation queue and review A/B tiers first, especially the existing **3 medium + 49 review** legacy OSM matches.
4. Continue the **208** unresolved production source outcomes using only existing/open official discovery paths.
5. Expand independent-source coverage for the current Area1 independently of the opaque legacy ID count; do not force a live result for IDs that cannot be resolved without paid data.
6. Continue grouped field completion from newly established official sources.
7. Design a source-native identity key before any new production scope (Area2/SHIZUOKA) is admitted.

## Runtime contract

The public product remains a static GitHub Pages application. Recommendation behavior is unchanged: <=1,200 m scope, current canonical production identities, cuisine/budget/distance filters, three distinct results when possible, cuisine diversity preference, Web Crypto randomness, 百名店 weight 2.2, and no rating/review popularity ranking.

The deployed site no longer receives a Google API key. Three-store and per-store embedded maps use the existing Leaflet/OpenStreetMap path; ordinary external Google Maps navigation links may remain because they are normal web links, not API execution.
