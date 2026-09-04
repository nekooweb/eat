# Eat Development Plan

## Current status — 2026-09-05 review passed

The `TOKYO / 地区1️⃣` runtime/architecture review is complete.

Current implementation:
- static GitHub Pages site;
- strict internal Area1 boundary <=1,200 m;
- Google Place ID required for production identity;
- Google Places response fields used only transiently for QC;
- independently maintainable OSM/curated/Tabelog/official metadata;
- one deploy-time canonical dataset;
- browser limited to filtering, random selection and card rendering;
- Pages publishes only deployable assets, not maintenance data/scripts.

The September 5 architecture review supersedes the earlier plan to keep full Google Places business records as the long-lived browser production dataset.

## Review result

### Final verification state

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

### Final canonical production build

Latest passing Pages build:
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

The verified half-pool is currently concentrated in the nearer part of the OSM candidate ordering, so the 800-1,200 m outer ring remains a measured coverage gap rather than a hidden assumption. This describes the already-completed run; future `half` mode has now been changed to distance-balanced systematic sampling.

### Verification rejection reasons

Final half-pool rejections:
- `outside_1_2km`: 114;
- `location_mismatch`: 42;
- `closed_permanently`: 35;
- `name_mismatch`: 27;
- `non_food_google_type`: 5;
- `no_google_place`: 2.

These are source-to-Google match failures, not claims that no restaurant exists at those locations.

### Google coverage inventory

Historical Google-first discovery was migrated without new API calls:
- 1,613 unique Google Place IDs preserved in `data/area1_google_ids.json`;
- legacy full `area1_google_places.json` removed;
- legacy `area1_google.js` removed.

Current canonical overlap with the 1,613-ID inventory:
- 184 production IDs;
- 11.4% of the Google identity inventory.

The inventory is a coverage reference, not a target requiring every Google ID to become a production recommendation.

## Completed architecture changes

### Runtime simplification

Removed:
- browser-side multi-source entity matching;
- Leaflet/OSM overview map;
- per-store embedded maps;
- duplicate three-store comparison table;
- selectable TBD areas/profiles;
- redundant per-filter enable/disable toggles;
- generic `identity verified` badge on every card;
- repeated `unknown` budget/opening placeholders;
- browser-clock-dependent lunch/dinner selection.

Current public runtime loads exactly:
1. `data/production_area1.js`;
2. `app.js`.

### Result behavior

Hard rule:
- if >=3 restaurants pass current constraints, return exactly 3 distinct Place IDs.

Selection preference:
- maximize feasible cuisine diversity first;
- fill remaining slots even if fewer than three cuisine groups remain;
- Web Crypto randomness;
- verified 百名店 weight 2.2 vs ordinary 1.0;
- no rating/review popularity ranking.

Cards show only useful known information:
- name;
- cuisine;
- distance;
- known budget when available;
- known dishes when available;
- known schedule/holiday note when available;
- 百名店 badge when applicable;
- direct Google Maps link.

### Filter simplification

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
- future `GOOGLE_VERIFY_LIMIT=-1` half mode sorts by distance and takes alternating rows, producing a deterministic ~50% sample distributed across the full Area1 radius instead of the nearest half.

Changing the half-sampling logic does not itself trigger another Google verification run.

Do not weaken these rules merely to increase production count.

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
Blocking checks now guard both data integrity and the simplified UI contract:
- production >=3;
- unique Place IDs;
- every production row verified;
- every production distance <=1,200 m;
- forbidden long-lived Google response fields absent;
- exactly production data + `app.js` as public script dependencies;
- no Leaflet/iframe map layer;
- no maintenance overlays in public runtime;
- no redundant filter toggle state;
- no generic verification badge;
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

## Current decision: review passed

The current Area1 version passes code/data architecture review because:
- runtime responsibilities are small and explicit;
- canonical build and audit pass;
- enough verified entities exist for cuisine/distance-based random choice;
- no pending verification remains in the requested half pool;
- known weak metadata is hidden/omitted instead of fabricated;
- remaining coverage gaps are measured by CI.

The following are **not blockers for this review** and should be handled as separate data/product iterations.

## Next priority 1 — metadata enrichment

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

## Next priority 2 — outer-ring coverage

The current half-pool verification produced 262 canonical entities, all within <=800 m because the source candidate ordering prioritized nearer rows at the time that run was executed.

If broader 1.2 km practical coverage is needed later:
- run the now distance-balanced `half` mode as an intentional new coverage task, which will reuse existing QC v4 results and only call Google for selected unresolved rows; or
- process the remaining candidate pool as a separate coverage task.

Do not rerun the 1,613-ID Google discovery merely for this purpose; the inventory already exists.

The verifier no longer assumes input order is geographically representative when `GOOGLE_VERIFY_LIMIT=-1` is used.

## Later product scope

Only after Area1 metadata quality is stable:
- opening/holiday exclusion semantics;
- local recommendation history after privacy/persistence rules are defined;
- TOKYO 地区2️⃣ after its production data exists;
- SHIZUOKA after its production data exists;
- richer result UI only if a demonstrated user need justifies it.

Do not reintroduce inactive selector UI or duplicated map/comparison layers by default.
