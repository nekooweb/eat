# Eat Development Plan

## Current milestone

Ship a maintainable `TOKYO / 地区1️⃣` v1 inside the strict 1.2 km boundary with:
- Google Place ID as the required business identity;
- independently maintainable display/recommendation metadata;
- one build-time canonical dataset;
- a minimal static browser runtime;
- enough verified coverage that random recommendations remain useful under common filters.

The September 5 architecture review supersedes the earlier plan to keep full Google Places business records as the long-lived browser production dataset.

## Development principles

1. A production restaurant requires a verified Google Place ID.
2. Google Places response fields used for QC are transient; Place ID is the durable Google identity key.
3. OSM/curated/Tabelog/official data provides durable display and recommendation metadata.
4. Source matching happens during maintenance/build, never in the browser.
5. Missing metadata remains missing; do not fabricate it.
6. The absolute Area1 boundary is always <=1,200 m.
7. If filters leave at least three entities, the UI must return three; cuisine diversity is a preference, not a hard condition.
8. Keep the result UI focused on decision-making, not map/review-portal duplication.
9. Never expose the Places API secret in browser JavaScript.
10. CI must block duplicate Place IDs, out-of-bound production rows and accidental reintroduction of stored Places response fields into the canonical browser dataset.

## Phase A — Runtime simplification [completed in review PR]

Completed:
- browser multi-source merge removed;
- Leaflet/OSM overview map removed;
- per-store embedded map removed;
- duplicate comparison table removed;
- fake/selectable TBD area/profile controls removed;
- result layer reduced to three cards + Google Maps navigation;
- runtime dependencies reduced to `production_area1.js` + `app.js`;
- budget behavior made explicit for lunch/dinner instead of switching on visitor clock time;
- cuisine-diversity selection fixed so a valid >=3-store pool cannot fail merely because fewer than three cuisine groups remain.

## Phase B — Canonical production build [completed in review PR]

Implemented:
- `scripts/build_production_dataset.mjs`;
- one canonical entity per Google Place ID;
- conservative unique-name bridge for legacy enrichment rows without IDs;
- OSM/independent geospatial metadata preferred for durable coordinates/distance;
- strict <=1,200 m assertion;
- duplicate Place ID assertion;
- production statistics generated with the dataset.

Current CI baseline before expanded verification:
- independent Area1 source rows: 1,045;
- verified source rows: 20;
- production entities: 20;
- unique Place IDs: 20;
- cuisine known: 19;
- budget known: 2;
- representative dishes known: 2;
- 百名店: 2.

Integrity passes, but this baseline is **not enough coverage for Area1 v1**.

## Phase C — Google identity verification coverage [active priority]

The earlier half-pool attempt processed 492/983 source candidates and found 75 verified, 407 rejected and 10 pending, but its final push failed during concurrent main-branch changes. The current repository therefore retained only the earlier small cache.

The new verifier fixes the major failure modes before rerunning the intended half batch:
- source-ID keyed overlay instead of normalized-name identity;
- strict Google-side Area1 boundary;
- current food-related Google types;
- permanent-closure rejection;
- 300 m maximum source/Google match distance;
- strong name evidence for wider matches;
- <=45 m transliteration-tolerant path for Japanese vs English/romanized Google display names;
- Google response content used only transiently;
- persistent cache limited to source ID/status/Place ID/reason/QC version.

Next action after the architecture PR merges:
1. trigger the already-planned half-pool verification using `.github/run-half-google`;
2. inspect verified/rejected/pending reasons;
3. rebuild canonical production data;
4. compare production count and common-filter survivability against the 20-entity baseline;
5. only then decide whether a second half/full verification is justified.

Do not rerun expensive full Google discovery merely to expand source verification.

## Phase D — Google coverage inventory migration [active]

Historical Google-first discovery found:
- 37 grid points;
- 740 Nearby Search calls;
- 0 API errors;
- 1,613 unique food-related Place IDs after strict <=1.2 km filtering.

That result remains valuable as an identity coverage reference, but the historical files stored more Places response content than the new architecture needs.

Migration plan:
- `scripts/migrate_google_inventory.py` extracts the existing Place IDs without API calls;
- store them in `data/area1_google_ids.json`;
- remove legacy `data/area1_google_places.json` and `data/area1_google.js` from the active branch;
- use the ID inventory for coverage comparison, not as a browser dataset.

Coverage audit target:
```text
Google Area1 Place ID inventory
            vs
verified independent-source Place IDs
```

This identifies Google-only IDs that still need independently maintainable metadata if they are to become production recommendations.

## Phase E — Metadata enrichment [next]

Once the verified identity pool is large enough, improve decision usefulness in this order:
1. primary cuisine normalization;
2. lunch/dinner budget;
3. representative dishes;
4. opening hours / regular holidays;
5. 百名店 identity/year/category.

Why this order:
- cuisine and budget directly affect existing filters;
- dishes improve card usefulness but do not affect eligibility;
- opening/holiday information remains descriptive until exclusion rules are designed;
- 百名店 already has weighting logic but should be identity-audited before expansion.

Tabelog/official matching priority:
1. exact Place ID mapping when available;
2. branch-aware name + address + close coordinates;
3. strong unique name/location evidence;
4. otherwise unresolved/manual review.

## Phase F — Coverage acceptance criteria for Area1 v1

A code-integrity PASS is necessary but not sufficient.

### Blocking integrity checks
- canonical build succeeds;
- production count >=3;
- unique Place IDs;
- every production identity verified;
- no production distance >1,200 m;
- no forbidden stored Google Places response fields in canonical output;
- public runtime loads only canonical data + `app.js`;
- PR and Pages build workflows pass.

### Coverage/usability checks
Before calling Area1 v1 complete, review:
- production entity count after verification expansion;
- number of distinct cuisine labels;
- budget coverage;
- how many restaurants survive each distance filter;
- how many survive common budget + cuisine exclusion combinations;
- Google inventory overlap rate;
- rejection reason distribution from the verifier.

Do not set an arbitrary universal-completeness target. The practical criterion is that common filter combinations still provide useful three-choice pools and that coverage gaps are measured rather than hidden.

## Phase G — Future product scope

After Area1 v1 quality is stable:
- Place-ID-centric Tabelog/百名店 enrichment cleanup;
- opening/holiday exclusion semantics;
- optional local recommendation history after privacy/persistence rules are defined;
- TOKYO 地区2️⃣ only after its production data exists;
- SHIZUOKA only after its production data exists.

Do not reintroduce inactive selector UI before those datasets are ready.

## Validation infrastructure

### `scripts/audit_repository.mjs`
Checks canonical production integrity and public-runtime dependencies.

### `.github/workflows/pr-review.yml`
Read-only PR validation. No deployment and no Google API secret.

### `.github/workflows/pages.yml`
Builds canonical data, runs syntax/repository audit, assembles only deployable assets, then deploys Pages on `main`.

### Service/API workflows
- `refresh-area1.yml`: refresh independent OSM candidate data;
- `verify-google-places.yml`: batch source -> Google Place ID verification;
- `discover-google-area1.yml`: Google Place ID coverage inventory discovery;
- `migrate-google-storage.yml`: one-time legacy full Places cache -> Place-ID-only migration.
