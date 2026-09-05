# Eat Development Plan

## Current status — 2026-09-05 source layer complete

The `TOKYO / 地区1️⃣` runtime architecture and current production identity/source layer are reviewed and stable.

Required product behavior remains:
- static GitHub Pages site;
- strict internal Area1 boundary <=1,200 m;
- Google Place ID required for production identity;
- Google Places details used only transiently for QC;
- build-time OSM/curated/Tabelog/official enrichment;
- one deploy-time canonical dataset;
- browser filtering/random selection only, plus the required Leaflet overview map, per-store maps and three-store comparison;
- no browser-side source matching;
- Pages publishes only deployable assets, not maintenance data/scripts.

Restoring result maps/comparison does **not** restore the old browser-side multi-source architecture.

## Current production / verification baseline

Latest passing Pages build after source-resolution completion:
- OSM source candidates: 990;
- Google verification cache: 499 terminal QC-v4 entries;
- verified: 274;
- rejected: 225;
- pending: 0;
- canonical production entities: 269;
- unique Google Place IDs: 269.

Current rejection reasons remain:
- `outside_1_2km`: 114;
- `location_mismatch`: 42;
- `closed_permanently`: 35;
- `name_mismatch`: 27;
- `non_food_google_type`: 5;
- `no_google_place`: 2.

Distance pools:
- <=300 m: 116;
- <=500 m: 192;
- <=800 m: 269;
- <=1,200 m: 269.

The original half-pool run was near-biased because of historical source ordering. Future half-mode verification uses deterministic distance-balanced sampling instead.

## Source identity/resolution — COMPLETE

Every one of the current 269 production identities now has a terminal source state.

### Usable source bindings

237 / 269 production identities have a current usable Tabelog or official source binding:
- Tabelog-backed: 221;
- official-source-backed: 16;
- attached enrichment rows: 237;
- unattached enrichment rows: 0.

These bindings are keyed by the existing canonical Google Place ID. Source discovery never replaces the verified Place ID with a newly guessed identity.

### Explicit terminal resolutions

The remaining 32 production identities are explicitly resolved rather than left unknown:
- `ambiguous`: 27 — usually a chain/brand-only canonical name where a specific branch cannot be assigned safely;
- `listing_hold`: 2 — matching listing exists but current operating status is not established;
- `no_current_usable_source`: 1 — evidence exists but the matched current source is explicitly unusable/closed;
- `source_not_found`: 2 — exact-name/area research found no current Tabelog or restaurant-official page; identity evidence is retained without inventing a source.

Final source-resolution result:
- resolved: **269 / 269**;
- coverage: **100%**;
- unresolved queue: **0**.

### Source-resolution infrastructure

Current maintenance layer:
- `data/source_enrichment*.js` — Place-ID keyed usable Tabelog/official bindings and field enrichment;
- `data/source_resolution*.js` — explicit terminal source states;
- `scripts/source_queue.mjs` — completeness/unresolved report;
- `scripts/audit_source_bindings.mjs` — blocks stale/unattached source rows, invalid resolutions, duplicate usable/resolution states and unsupported evidence;
- Pages CI uploads `coverage.json` + `source_queue.json` as a short-lived private `eat-data-audit` artifact.

Source-resolution shards are intentionally supported so future additions do not require editing one conflict-prone monolithic ledger.

## Current metadata completeness

The weak point has moved from source discovery to field completeness.

Latest coverage:
- distinct cuisine labels: 33;
- generic `餐厅` rows: 22;
- address known: 61 / 269;
- lunch/dinner budget known: 95 / 269;
- schedule / regular-holiday information known: 154 / 269;
- representative dishes known: 20 / 269;
- 百名店: 19.

Source-reference coverage by field currently includes:
- cuisine: 123 reviewed refs;
- budget: 95;
- dishes: 15;
- hours: 94;
- closure/status: 103;
- 百名店: 17.

These figures should rise through field-level enrichment against the completed Place-ID/source map. Do **not** restart loose name-based source matching for every field.

## Immediate development phase — field enrichment

Priority order:
1. **budget** — expand lunch/dinner price coverage from 95/269;
2. **opening / regular holidays** — expand schedule coverage from 154/269 and normalize semantics;
3. **cuisine normalization** — resolve 22 generic `餐厅` rows and correct source-confirmed mismatches (for example ramen/udon distinctions);
4. **representative dishes** — expand the current 20/269 carefully from menu/official/Tabelog evidence;
5. **百名店** — finish year/category identity attachment, including newly identified current award pages;
6. **address** — increase independent/source-backed display address coverage where licensing/storage is appropriate.

Field extraction rules:
- use the already reviewed Place-ID -> source relationship;
- declare exactly which fields each `sourceRefs` entry supports;
- do not infer a value merely because a restaurant category normally implies it;
- lunch and dinner remain separate;
- no visitor-clock-dependent price selection;
- no fabricated `unknown` replacements;
- ambiguous/terminal source-resolution records stay excluded from source-derived field extraction until the identity issue is resolved.

## Google identity/QC design

`scripts/verify_google_places.py` QC v4 remains authoritative:
- source-ID keyed overlay;
- Text Search persists only Place ID;
- Place Details fields are transient QC inputs;
- permanent-closure rejection;
- Google-side Area1 boundary check;
- <=300 m source/Google maximum match distance;
- current food-related type check;
- stronger name evidence for wider matches;
- <=45 m transliteration-tolerant path for Japanese vs English/romanized names;
- persistent cache limited to source ID/status/Place ID/reason/QC version.

Do not weaken QC rules to increase the production count.

Seven `curatedOverlap` candidates are currently visible in coverage reporting but still unresolved by the targeted curated-overlap verifier. They are a **separate possible production-expansion task**, not a gap in the current 269-entity source-resolution layer.

## Canonical build

`scripts/build_production_dataset.mjs`:
- admits only verified Google identities;
- collapses one production entity per Place ID;
- merges reviewed independent enrichment conservatively;
- prefers independent/OSM geospatial metadata;
- blocks >1,200 m rows and duplicate Place IDs;
- leaves missing metadata missing;
- writes `data/production_area1.js` only during build/deploy.

## Runtime/result contract

Required result views:
1. Leaflet/OpenStreetMap three-store overview map;
2. per-store Leaflet map inside each result card;
3. three-store comparison table;
4. direct Place-ID-based Google Maps business/navigation link.

These are presentation views over the same canonical records, not separate data pipelines.

Still intentionally absent:
- browser-side source matching;
- iframe maps;
- raw maintenance datasets as public dependencies;
- redundant filter enable/disable state;
- generic identity-verification badge on every result;
- visitor-time Google Places calls.

## Validation / CI

Pages CI currently runs:
- canonical production build;
- JavaScript syntax check;
- Python compile checks;
- repository/runtime audit;
- source-binding/resolution audit;
- coverage report;
- source-resolution queue report;
- private data-audit artifact upload;
- minimal public-site assembly;
- GitHub Pages deployment.

Current source-completion build passed all of these checks and deployed successfully.

## Later work

After field enrichment is materially stronger:
- opening/holiday exclusion semantics;
- optional curated-overlap Google verification if the seven historical rows are worth admitting;
- broader distance-balanced outer-ring verification only if practical 1.2 km coverage needs expansion;
- local recommendation history after privacy/persistence rules are defined;
- TOKYO 地区2️⃣ after production data exists;
- SHIZUOKA after production data exists.

Do not rerun the 1,613-ID Google coverage discovery merely to improve source/field enrichment; that identity inventory already exists.