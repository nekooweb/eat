# Eat Development Plan

## Current status — 2026-09-05 reviewed baseline

The `TOKYO / 地区1️⃣` data/runtime architecture remains reviewed and stable, with one product correction after the first review pass: **the Leaflet three-store overview, per-store maps and three-store comparison table are required result views and have been restored.**

Current implementation:
- static GitHub Pages site;
- strict internal Area1 boundary <=1,200 m;
- Google Place ID required for production identity;
- Google Places response fields used only transiently for QC;
- independently maintainable OSM/curated/Tabelog/official metadata;
- one deploy-time canonical dataset;
- browser handles filtering, random selection, cards, Leaflet visualization and comparison only;
- browser does not perform source matching/enrichment;
- Pages publishes only deployable assets, not maintenance data/scripts.

The September 5 architecture review still supersedes the earlier plan to keep full Google Places business records as the long-lived browser production dataset. Restoring result maps does **not** restore that old data architecture.

## Verification baseline

The requested half-pool verification processed 492 of 983 OSM candidates with QC v4.

First pass:
- 262 verified;
- 223 rejected;
- 7 pending due temporary Google 500/503 errors;
- 948 API calls.

Pending-only retry:
- 14 API calls;
- 267 verified;
- 225 rejected;
- 0 pending.

The retry did not reprocess already-final QC v4 entries.

## Canonical production baseline

Latest reviewed build:
- source rows considered: 1,045;
- verified source rows: 269;
- production entities: 262;
- unique Google Place IDs: 262;
- cuisine known: 222;
- distinct cuisine labels: 25;
- budget known: 2;
- representative dishes known: 2;
- 百名店: 8.

Distance pools:
- <=300 m: 114;
- <=500 m: 187;
- <=800 m: 262;
- <=1,200 m: 262.

The completed half-pool run was concentrated in nearer source rows because of the old source ordering. Future `half` mode now uses deterministic distance-balanced systematic sampling, so this bias is not repeated.

## Verification rejection reasons

Final half-pool rejections:
- `outside_1_2km`: 114;
- `location_mismatch`: 42;
- `closed_permanently`: 35;
- `name_mismatch`: 27;
- `non_food_google_type`: 5;
- `no_google_place`: 2.

These are source-to-Google match failures, not claims that no restaurant exists at those locations.

## Google coverage inventory

Historical Google-first discovery was migrated without new API calls:
- 1,613 unique Google Place IDs preserved in `data/area1_google_ids.json`;
- legacy full `area1_google_places.json` removed;
- legacy `area1_google.js` removed.

Current canonical overlap with the 1,613-ID inventory:
- 184 production IDs;
- 11.4% of the Google identity inventory.

The inventory is a coverage reference, not a target requiring every Google ID to become a production recommendation.

## Runtime architecture

### Kept intentionally simple

Removed and still removed:
- browser-side multi-source entity matching;
- selectable TBD areas/profiles;
- redundant per-filter enable/disable toggles;
- generic `identity verified` badge on every card;
- repeated `unknown` budget/opening placeholders;
- browser-clock-dependent lunch/dinner selection;
- iframe-based maps;
- direct loading of raw maintenance overlays.

### Required result views

Restored as product requirements:
1. **Leaflet/OpenStreetMap three-store overview map**
   - all generated restaurants with canonical coordinates;
   - numbered 1–3 to match cards/comparison;
   - fitted to generated points;
   - does not expose the private Area1 anchor.
2. **Per-store Leaflet/OpenStreetMap map**
   - one small map inside each result card when canonical coordinates exist;
   - shows immediate spatial context;
   - same numbered marker as overview.
3. **Three-store comparison table**
   - cuisine;
   - distance;
   - budget;
   - representative dishes;
   - opening/holiday information;
   - 百名店 status.
4. **Direct Google Maps business link**
   - uses verified Place ID for business/navigation lookup;
   - remains separate from the OSM visualization layer.

These views are complementary UI, not separate data pipelines. All of them consume the same `production_area1.js` records.

Leaflet maps use independently maintained canonical coordinates. Transient Google Places response coordinates are not rendered onto the non-Google map layer.

## Recommendation behavior

Hard rule:
- if >=3 restaurants pass current constraints, return exactly 3 distinct Place IDs.

Selection preference:
- maximize feasible cuisine diversity first;
- fill remaining slots even if fewer than three cuisine groups remain;
- Web Crypto randomness;
- verified 百名店 weight 2.2 vs ordinary 1.0;
- no rating/review popularity ranking.

## Filters

Neutral selections replace redundant enable/disable state:
- no cuisine exclusions;
- budget `不限`;
- distance `1.2km`.

Budget metadata currently exists for only 2 production entities, so the runtime hides the budget module until at least 3 production entities have known lunch/dinner budget. The feature should reappear automatically after enrichment rather than remain as a knowingly unusable control.

## Google identity/QC design

`scripts/verify_google_places.py` QC v4:
- source-ID keyed overlay;
- Text Search persists only Place ID;
- Place Details fields are transient QC inputs;
- permanent-closure rejection;
- Google-side Area1 boundary check;
- <=300 m source/Google maximum match distance;
- current food-related place type check;
- strong name evidence for wider matches;
- <=45 m transliteration-tolerant path for Japanese vs English/romanized display names;
- persistent cache limited to source ID/status/Place ID/reason/QC version;
- `GOOGLE_VERIFY_LIMIT=-1` half mode sorts by distance and takes alternating rows, producing a deterministic ~50% sample distributed across the full Area1 radius instead of the nearest half.

Changing half-sampling logic does not itself trigger another Google verification run.

Do not weaken QC rules merely to increase production count.

## Canonical build

`scripts/build_production_dataset.mjs`:
- admits only verified Google identities;
- collapses one production entity per Place ID;
- conservatively merges independent enrichment;
- prefers independent/OSM geospatial metadata;
- blocks >1,200 m rows;
- blocks duplicate Place IDs;
- leaves missing metadata missing;
- writes `data/production_area1.js` only during build/deploy.

## Validation infrastructure

### `scripts/audit_repository.mjs`
Blocking checks guard both data integrity and the current result-view contract:
- production >=3;
- unique Place IDs;
- every production row verified;
- every production distance <=1,200 m;
- forbidden long-lived Google response fields absent;
- local public runtime limited to canonical production data + `app.js`;
- Leaflet dependency present;
- overview map present;
- per-store maps present;
- three-store comparison table present;
- iframe map implementation absent;
- maintenance overlays absent from public runtime;
- redundant filter toggle state absent;
- generic verification badge absent;
- Google Maps and OpenStreetMap attribution present.

### `scripts/coverage_report.mjs`
Reports:
- source candidates;
- verification status/QC versions;
- rejection reasons;
- Google inventory overlap;
- production count;
- cuisine distribution;
- 300/500/800/1200 m pools;
- budget pools;
- award count.

### Workflows
- `pr-review.yml`: read-only PR build/audit, no deployment/API secret;
- `pages.yml`: canonical build -> JavaScript/Python syntax checks -> repository audit -> coverage report -> minimal `_site` -> Pages deployment;
- `verify-google-places.yml`: staged source -> Google Place ID verification;
- `discover-google-area1.yml`: Place-ID-only Google coverage discovery;
- `migrate-google-storage.yml`: one-time legacy full Places -> Place-ID-only migration;
- `refresh-area1.yml`: independent OSM candidate refresh.

## Current decision

The current architecture still passes review because:
- source matching remains build-time only;
- canonical build and data integrity rules remain unchanged;
- result visualization is now explicitly separated from data engineering;
- enough verified entities exist for cuisine/distance-based random choice;
- no pending verification remains in the requested half pool;
- weak metadata remains omitted rather than fabricated;
- coverage gaps are measured by CI.

The earlier conclusion that maps/comparison were unnecessary duplication is superseded by the product requirement that they provide distinct spatial/comparison value.

## Next priority 1 — product logic corrections

Further product/interaction changes should be applied incrementally to the current result structure rather than removing required views. Preserve:
- overview map;
- per-store maps;
- three-store comparison;
- direct Google Maps lookup.

## Next priority 2 — metadata enrichment

Current weak point is not restaurant count; it is metadata completeness.

Priority order:
1. lunch/dinner budget;
2. representative dishes;
3. opening hours / regular holidays;
4. Place-ID-centric 百名店/Tabelog branch matching;
5. cuisine normalization for generic `餐厅` rows.

Tabelog/official matching priority:
1. exact Place ID mapping when available;
2. branch-aware name + address + close coordinates;
3. strong unique name/location evidence;
4. otherwise unresolved/manual review.

Do not fabricate missing values.

## Next priority 3 — outer-ring coverage

If broader 1.2 km practical coverage is needed later:
- run the now distance-balanced `half` mode as an intentional new coverage task, which will reuse existing QC v4 results and only call Google for selected unresolved rows; or
- process the remaining candidate pool as a separate coverage task.

Do not rerun the 1,613-ID Google discovery merely for this purpose; the inventory already exists.

## Later product scope

Only after Area1 quality is stable:
- opening/holiday exclusion semantics;
- local recommendation history after privacy/persistence rules are defined;
- TOKYO 地区2️⃣ after its production data exists;
- SHIZUOKA after its production data exists.

Do not reintroduce inactive selector UI or browser-side source merging by default.
