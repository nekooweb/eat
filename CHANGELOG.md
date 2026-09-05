# Eat Development Log

This file records product/architecture decisions and meaningful implementation milestones. It is not a replacement for Git history.

## 2026-09-05 — Current source-resolution and result-view state

This section is the current state and supersedes same-day historical statements below where they conflict.

### Required result views restored
- Restored the Leaflet/OpenStreetMap three-store overview map.
- Restored one small Leaflet map per restaurant card.
- Restored the three-store comparison table.
- Kept the direct verified Place-ID Google Maps link.
- These views consume the same canonical production records and do **not** restore browser-side multi-source matching.
- Repository audit now requires overview map + per-store maps + comparison and continues to forbid iframe maps/raw maintenance overlays.

### Production/source baseline after data-source completion
- OSM source candidates: 990.
- Google QC-v4 cache: 274 verified / 225 rejected / 0 pending.
- Canonical production identities: 269 unique Google Place IDs.
- Source-enrichment records attached to production: 237.
  - Tabelog: 221.
  - official: 16.
- Explicit terminal source resolutions: 32.
  - `ambiguous`: 27.
  - `listing_hold`: 2.
  - `no_current_usable_source`: 1.
  - `source_not_found`: 2.
- **Source resolution: 269 / 269 = 100%; unresolved = 0.**
- Source-binding audit reports zero unattached enrichment records.

### Source-resolution architecture completed
- Split researched source bindings into Place-ID keyed `data/source_enrichment*.js` shards.
- Added `data/source_resolution*.js` shards for identities that cannot safely attach to a current usable Tabelog/official branch page.
- Added sharded-resolution support to `scripts/source_queue.mjs` and `scripts/audit_source_bindings.mjs`.
- Terminal resolution records require current production Place ID, supported status, reason, review date and HTTPS evidence.
- A Place ID may not simultaneously have a usable source binding and a terminal resolution.
- Pages CI now uploads `coverage.json` + `source_queue.json` as a short-lived private `eat-data-audit` artifact.
- The final source-completion CI/Pages run passed canonical build, repository audit, source-binding audit, coverage/source queue generation and deployment.

### Final difficult source cases
- Resolved abbreviated/legacy names conservatively against canonical coordinates/Place IDs, including `由〇` -> current 由丸 九段下店, `一番どり` -> 竹橋パレスサイドビル店, `Cafe &Beer SWING` -> SWING 水道橋店 and `まさみ` -> お食事の店 まさみ.
- `ばんびカレー屋` was bound to current カレー屋ばんび rather than left unresolved.
- `とんかつ かつ村` was left as `source_not_found`; a same-name Kochi Tabelog page was explicitly rejected as the wrong business. Kanda Curry Grand Prix evidence retains the West Kanda identity.
- `ぽっぽっ堂` was left as `source_not_found` after exact-name/area searches found no current usable Tabelog/official page; verified Place ID/OSM evidence remains the identity anchor.
- Chain/brand-only records without enough branch metadata are `ambiguous` instead of being force-matched to a convenient branch page.

### Field completeness after source identity closure
- Distinct cuisine labels: 33; generic `餐厅`: 22.
- Address known: 61 / 269.
- Budget known: 95 / 269.
- Schedule/holiday known: 154 / 269.
- Representative dishes known: 20 / 269.
- 百名店: 19.
- Source field references currently include cuisine 123, budget 95, dishes 15, hours 94, closure 103 and 百名店 17.
- Next data phase is field extraction from the now-stable Place-ID/source map, not another loose-name source-discovery pass.

## 2026-09-05 — Architecture review final state (historical; superseded where conflicting)

### Review outcome
- Completed a full product/runtime/data-pipeline review focused on removing unnecessary complexity and making result generation predictable.
- Review status: **PASS** after canonical build, repository audit, coverage report and Pages build all succeeded.
- Merged review PR #1 and continued final QC/data fixes on `main`.

### Final runtime simplification
- Removed browser-side multi-source entity matching; all source combination now happens at build time.
- Removed Leaflet/OSM overview map, per-store embedded maps and duplicate three-store comparison table. **Superseded: these views were later restored as explicit product requirements; browser-side source matching remains removed.**
- Removed interactive TBD profile/area choices that could only return an error.
- Removed redundant per-filter enable/disable switches; neutral filter choices already represent no extra restriction.
- Removed generic `身份已核验` badge because every production entity is verified by definition.
- Missing optional budget/dish/opening metadata is omitted instead of rendered as repeated `unknown`/`待补充` noise.
- Browser runtime uses canonical production data + `app.js`; Leaflet is a presentation dependency only.

### Recommendation behavior correction
- Fixed the old failure mode where a pool with >=3 restaurants but fewer than three cuisine groups could fail to generate.
- New hard rule: whenever >=3 entities satisfy the filters, return exactly three distinct Google Place IDs.
- Cuisine diversity is a preference: select across different cuisine groups first, then fill any remaining slots.
- Web Crypto randomness retained.
- 百名店 sampling weight retained at 2.2 vs ordinary 1.0.
- No rating/review-count popularity ranking added.

### Canonical production architecture
- Added `scripts/build_production_dataset.mjs`.
- Google Place ID is the durable business identity/admission key.
- Google Places name/address/location/status/type fields are used transiently for QC rather than persisted as the long-lived application database.
- OSM/curated/Tabelog/official records provide independently maintainable display/recommendation metadata.
- One production entity is emitted per unique Place ID.
- Build fails on duplicate Place IDs, malformed identities or any distance >1,200 m.
- Pages deployment assembles and publishes only site assets instead of exposing the maintenance repository.

### Google storage/policy cleanup
- Historical Google-first discovery result was preserved without new API calls as a Place-ID-only inventory.
- Preserved 1,613 unique Google Place IDs in `data/area1_google_ids.json`.
- Removed active-branch legacy full Places payloads `data/area1_google_places.json` and `data/area1_google.js`.
- Verification/discovery scripts persist Place IDs and compact QC state rather than Google display name/address/coordinates/Maps URI/type payloads.
- Retained service attribution/legal pages.

### Google verification QC v4
- Generated verification overlay binds by exact source ID rather than normalized restaurant name.
- Added current food-related Places types.
- Retained strict Google-side 1.2 km boundary and 300 m source/Google maximum match distance.
- Added a <=45 m transliteration-tolerant path for Japanese source names vs English/romanized Google display names; wider matches still require stronger name agreement.
- Fixed known stale/incorrect historical verification including an out-of-scope `なかや` match.
- Persistent verification cache contains only source ID, status, Google Place ID, compact reason and QC version.

### Requested half-pool verification
- Re-ran the requested half-pool verification against 492 of 983 OSM candidates using QC v4.
- First pass: 262 verified / 223 rejected / 7 pending, 948 API calls.
- Pending-only retry used 14 API calls and finished at 267 verified / 225 rejected / 0 pending.
- Final reject reasons:
  - outside 1.2 km: 114
  - location mismatch: 42
  - permanently closed: 35
  - name mismatch: 27
  - non-food Google type: 5
  - no Google Place: 2
- Workflow push/rebase logic succeeded; the previous non-fast-forward result-loss problem did not recur.

### Earlier canonical Area1 baseline
- Source rows considered: 1,045.
- Verified source rows: 269.
- Production entities: 262.
- Unique Google Place IDs: 262.
- Cuisine known: 222.
- Distinct cuisine labels: 25.
- Budget known: 2.
- Representative dishes known: 2.
- 百名店: 8.
- Distance pools:
  - <=300 m: 114
  - <=500 m: 187
  - <=800 m: 262
  - <=1,200 m: 262
- Canonical overlap with the 1,613-ID Google inventory: 184 IDs (11.4%).
- **Superseded by the current 269-entity source-complete baseline above.**

### Product handling of incomplete metadata
- Restaurant count is no longer the main blocker; metadata completeness is.
- Missing values are not fabricated to make the UI look complete.
- Cards display only known budget/dishes/opening information.

### Validation/CI evolution
- Added read-only PR validation workflow.
- Pages workflow runs canonical build, syntax checks, repository audit, source-binding audit, coverage/source queue reports and deployment.
- Added `scripts/audit_repository.mjs`, `scripts/audit_source_bindings.mjs`, `scripts/coverage_report.mjs` and `scripts/source_queue.mjs`.
- Current audit contract requires the restored map/comparison views while keeping maintenance/source data out of the public runtime.

## 2026-09-05 — Earlier same-day exploration (historical; superseded where conflicting)

The entries below preserve the path that led to the current implementation. When they conflict with the current-state section above, the current implementation/requirements are authoritative.

### Project architecture
- Confirmed the project as a standalone static GitHub Pages application under `nekooweb/eat`.
- Runtime architecture remains HTML/CSS/vanilla JavaScript with no application backend.
- Maintenance/build-time Python scripts and GitHub Actions act as the data-maintenance layer and may collect/verify data and commit static outputs.
- Google API credentials are stored only in GitHub Actions Secrets.

### Public profiles and privacy
- Public profile names are `TOKYO` and `SHIZUOKA`.
- TOKYO exposes only anonymous `地区1️⃣` / `地区2️⃣` labels.
- Internal station anchors must not be exposed in public UI.
- Personal names are prohibited from repository code/data/docs/comments/UI.

### Area1 scope
- Replaced earlier broad-radius collection targets with a strict straight-line `<=1.2km` Area1 boundary.
- OSM builder radius changed to 1200m.
- Frontend keeps an independent 1200m safety filter so stale/wider records cannot enter recommendations.

### Filter system
- Initially added three independent filter modules with separate enabled/disabled state.
- Distance choices: 300m / 500m / 800m / 1.2km.
- Final review later removed the redundant enabled/disabled layer.

### Recommendation algorithm
- Initially generated up to three restaurant proposals and attempted different primary cuisine families.
- Uses browser cryptographic randomness.
- 百名店 weighting set to 2.2 vs ordinary 1.0.
- No rating/review-count popularity weighting.
- Opening/holiday information does not yet exclude restaurants; final closure logic remains intentionally pending.
- Later corrected the hard three-result behavior: >=3 eligible entities always yields 3 distinct Place IDs.

### Maps
- Earlier result design used Leaflet/OpenStreetMap overview map plus individual Google Maps navigation.
- Replaced coordinate-only Google business search links with business-name/address queries and Place ID when available.
- Google Place ID became the preferred stable identity for navigation/matching.
- One review temporarily removed the Leaflet/embedded/comparison layers; product-owner feedback explicitly restored overview Leaflet map, per-store Leaflet maps and the three-store comparison table.

### 百名店
- Added a curated 百名店 enrichment layer with award year/category where known.
- Identified name-only matching as technical debt; long-term matching uses verified business identity/Place ID.

### OSM candidate data
- Reworked OSM output to a compact restaurant candidate schema.
- Removed unrelated/low-value fields from generated candidate records.
- OSM candidates default to Google verification `pending` rather than being assumed valid businesses.
- Curated-name overlaps are now retained as potential identity bridges instead of being excluded.

### Google Maps as production gate
- Established Google Maps/Places business identity as the production admission criterion.
- Tabelog and OSM are discovery/enrichment sources rather than final identity authority.
- Candidates not reliably corresponding to a Google business may be rejected/ignored.
- Added manually curated Google entity overlay for selected restaurants and closures/corrections.

### Google Places API
- Added `scripts/verify_google_places.py`.
- Added GitHub Actions workflow `Verify Google Places`.
- Repository Secret: `GOOGLE_MAP_API`; exposed only to script environment as `GOOGLE_MAPS_API_KEY`.
- Initial test diagnosed an invalid credential value; key was replaced and API calls then succeeded.

### Google verification QC evolution
Added strict source-candidate matching QC:
- permanent closure rejection
- Google location required
- Google location must remain inside Area1 1.2km boundary
- candidate vs Google coordinate mismatch threshold
- normalized candidate/Google business name compatibility
- food-related Google place type
- QC versioning so old terminal results are revalidated when rules change
- source-ID keyed matching
- close-distance transliteration tolerance.

### Earlier half-pool verification result
- Earlier run processed 492 of 983 OSM candidates.
- API/QC execution completed but one workflow push failed because concurrent commits advanced `main`.
- Workflow was patched to fetch/rebase latest `main` before push.
- The high reject rate helped expose problems in the old matching architecture.
- This was superseded by the later QC-v4 results/current cache.

### Temporary Google-first architecture direction
- The project temporarily changed toward Google Places discovery as the entire production record source.
- Google-native name/address/coordinates/business status/type were treated as browser production fields.
- Tabelog/OSM became enrichment only.
- This direction produced good coverage but was rejected because it unnecessarily coupled persistent application data/browser rendering to full Places response content.

### First full Google-first Area1 discovery result
- Workflow `Discover Google Area1` completed successfully.
- 37 spatial grid points were queried.
- 740 Google Nearby Search API calls completed with 0 API errors.
- 1,613 unique Google-verified food-related business identities remained after Place ID deduplication and strict <=1.2km filtering.
- Full Google response outputs were initially committed.
- Later migrated to a Place-ID-only inventory and removed the full payload files.

### Temporary Google-first frontend migration
- Earlier frontend loaded `data/area1_google.js` directly.
- Historical/manual/OSM datasets were merged onto Google entities in the browser.
- Google-native name/address/coordinates/status/type were treated as authoritative.
- Replaced with build-time canonicalization and a single browser production file.

### Earlier metadata-completeness UI
- Earlier cards displayed a `Google已核验` badge and explicit missing-data states.
- Earlier comparison table displayed metadata completeness status.
- Repeated/debug-like missing/verification UI was removed; the comparison table itself was later restored with useful differentiating fields.

### Developer documentation consolidation
- `REQUIREMENTS.md`, `ARCHITECTURE.md`, `DEVELOPMENT.md`, `DATA_PIPELINE.md`, `README.md` and this log are kept synchronized with the current source-complete architecture.
- `DATA_RESEARCH.md` remains historical/manual research and is not authoritative when it conflicts with current requirements.

## Earlier implementation milestones

### Initial page
- Built responsive single-page shell.
- Added profile/area selectors and random-generation result area.
- Established playful yellow/white visual language.

### Restaurant data expansion
- Added manually researched restaurant records and larger Area1 candidate files.
- Explored Tabelog and OSM as complementary discovery sources.
- Identified broad-radius and incomplete-identity problems, leading to the current 1.2km + verified-identity + canonical-build + source-resolution architecture.

## Pending log items
- budget/lunch/dinner enrichment beyond 95/269
- representative-dish enrichment beyond 20/269
- opening-hours/regular-holiday enrichment beyond 154/269
- normalize 22 generic cuisine rows and source-confirmed mismatches
- complete Place-ID-centric 百名店 year/category enrichment
- optionally verify the 7 curated-overlap candidates as a separate production-expansion task
- distance-balanced verification of remaining/outer-ring candidates if broader practical 1.2km coverage is needed
- opening/holiday exclusion semantics
- final Area1 content-quality release review after enrichment
