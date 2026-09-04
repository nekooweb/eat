# Eat Development Log

This file records product/architecture decisions and meaningful implementation milestones. It is not a replacement for Git history.

## 2026-09-05 — Architecture review final state

### Review outcome
- Completed a full product/runtime/data-pipeline review focused on removing unnecessary complexity and making result generation predictable.
- Review status: **PASS** after canonical build, repository audit, coverage report and Pages build all succeeded.
- Merged review PR #1 and continued final QC/data fixes on `main`.

### Final runtime simplification
- Removed browser-side multi-source entity matching; all source combination now happens at build time.
- Removed Leaflet/OSM overview map, per-store embedded maps and duplicate three-store comparison table.
- Removed interactive TBD profile/area choices that could only return an error.
- Removed redundant per-filter enable/disable switches; neutral filter choices already represent no extra restriction.
- Removed generic `身份已核验` badge because every production entity is verified by definition.
- Missing optional budget/dish/opening metadata is omitted instead of rendered as repeated `unknown`/`待补充` noise.
- Browser runtime now loads exactly `data/production_area1.js` + `app.js`.

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
- Pages deployment now assembles and publishes only site assets instead of exposing the maintenance repository.

### Google storage/policy cleanup
- Historical Google-first discovery result was preserved without new API calls as a Place-ID-only inventory.
- Preserved 1,613 unique Google Place IDs in `data/area1_google_ids.json`.
- Removed active-branch legacy full Places payloads `data/area1_google_places.json` and `data/area1_google.js`.
- Verification/discovery scripts now persist Place IDs and compact QC state rather than Google display name/address/coordinates/Maps URI/type payloads.
- Replaced non-Google result maps with direct Google Maps navigation links and retained service attribution/legal pages.

### Google verification QC v4
- Generated verification overlay now binds by exact source ID rather than normalized restaurant name.
- Added current food-related Places types.
- Retained strict Google-side 1.2 km boundary and 300 m source/Google maximum match distance.
- Added a <=45 m transliteration-tolerant path for Japanese source names vs English/romanized Google display names; wider matches still require stronger name agreement.
- Fixed known stale/incorrect historical verification including an out-of-scope `なかや` match.
- Persistent verification cache now contains only source ID, status, Google Place ID, compact reason and QC version.

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

### Final canonical Area1 baseline
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

### Product handling of incomplete metadata
- Restaurant count is no longer the main blocker; metadata completeness is.
- Because only two production entities currently have known lunch/dinner budget, the budget filter is automatically hidden until >=3 entities have usable budget data.
- Cards still display known budget/dishes/opening information when present.
- No missing value is fabricated to make the UI look complete.

### Validation/CI added
- Added read-only PR validation workflow.
- Pages workflow now runs canonical build, JS syntax check, repository audit and coverage report before deployment.
- Added `scripts/audit_repository.mjs` to block:
  - duplicate/unverified/out-of-bound production entities
  - accidental Google Places response fields in canonical output
  - Leaflet/iframe result maps
  - raw maintenance overlays in public runtime
  - redundant filter-toggle state
  - reintroduction of the generic verification badge
  - missing Google Maps/OpenStreetMap attribution
- Added `scripts/coverage_report.mjs` for verification status, rejection reasons, inventory overlap, distance pools, cuisine distribution, budget pools and award count.

### Remaining measured data work
- Budget/dish/opening enrichment is the next priority.
- The requested half-pool source ordering favored nearer candidates; current verified production coverage reaches 800 m strongly, while the 800-1,200 m outer ring remains an explicit future coverage task.
- Future half-sampling should be distance-balanced rather than assuming source input order is representative.
- Do not rerun the full 1,613-ID Google discovery solely to expand source verification; the identity inventory already exists.

## 2026-09-05 — Earlier same-day exploration (historical; superseded where conflicting)

The entries below preserve the path that led to the final review. When they conflict with the final-state section above, the final-state architecture is authoritative.

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
- Final review later removed the redundant enabled/disabled layer; see final-state section above.

### Recommendation algorithm
- Initially generated up to three restaurant proposals and attempted different primary cuisine families.
- Uses browser cryptographic randomness.
- 百名店 weighting set to 2.2 vs ordinary 1.0.
- No rating/review-count popularity weighting.
- Opening/holiday information does not yet exclude restaurants; final closure logic remains intentionally pending.
- Final review later corrected the hard three-result behavior; see final-state section above.

### Maps
- Earlier result design used Leaflet/OpenStreetMap overview map plus individual Google Maps navigation.
- Replaced coordinate-only Google business search links with business-name/address queries and Place ID when available.
- Google Place ID became the preferred stable identity for navigation/matching.
- Final review removed the Leaflet/embedded/duplicate map layers.

### 百名店
- Added a curated 百名店 enrichment layer with award year/category where known.
- Identified name-only matching as technical debt; long-term matching must use verified business identity/Place ID.

### OSM candidate data
- Reworked OSM output to a compact restaurant candidate schema.
- Removed unrelated/low-value fields from generated candidate records.
- OSM candidates default to Google verification `pending` rather than being assumed valid businesses.

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
- First successful API batch: 20 candidates, 19 verified, 1 rejected, 0 pending before strict QC v2.

### Google verification QC v2
Added strict source-candidate matching QC:
- permanent closure rejection
- Google location required
- Google location must remain inside Area1 1.2km boundary
- candidate vs Google coordinate mismatch threshold
- normalized candidate/Google business name similarity
- food-related Google place type
- QC versioning so old terminal results are revalidated when rules change

### Earlier half-pool verification result
- Earlier run processed 492 of 983 OSM candidates.
- API/QC execution itself completed: 75 verified, 407 rejected, 10 pending, 942 new API calls.
- Final workflow failed because concurrent commits advanced `main`, causing a non-fast-forward `git push`.
- Workflow was patched to fetch/rebase latest `main` before push.
- The unusually high reject rate helped expose problems in the old matching architecture.
- This result was superseded by the QC v4 rerun in the final-state section.

### Temporary Google-first architecture direction
- The project temporarily changed toward Google Places discovery as the entire production record source.
- Google-native name/address/coordinates/business status/type were treated as browser production fields.
- Tabelog/OSM became enrichment only.
- This direction produced good coverage but was later rejected in the final architecture review because it unnecessarily coupled persistent application data and browser rendering to full Places response content.

### First full Google-first Area1 discovery result
- Workflow `Discover Google Area1` completed successfully.
- 37 spatial grid points were queried.
- 740 Google Nearby Search API calls completed with 0 API errors.
- 1,613 unique Google-verified food-related business identities remained after Place ID deduplication and strict <=1.2km filtering.
- Full Google response outputs were initially committed.
- Final review later migrated this result to a Place-ID-only inventory and removed the full payload files.

### Temporary Google-first frontend migration
- Earlier frontend loaded `data/area1_google.js` directly.
- Historical/manual/OSM datasets were merged onto Google entities in the browser.
- Google-native name/address/coordinates/status/type were treated as authoritative.
- Final review replaced this with build-time canonicalization and a single browser production file.

### Earlier metadata-completeness UI
- Earlier cards displayed a `Google已核验` badge and explicit missing-data states.
- Earlier comparison table displayed metadata completeness status.
- Final review removed this repeated/debug-like UI and hides/omits unsupported controls/fields instead.

### Developer documentation consolidation
- `REQUIREMENTS.md`, `ARCHITECTURE.md`, `DEVELOPMENT.md` and `DATA_PIPELINE.md` were progressively updated during the architecture changes.
- `DATA_RESEARCH.md` remains historical/manual research and is not authoritative when it conflicts with current requirements.

## Earlier implementation milestones

### Initial page
- Built responsive single-page shell.
- Added profile/area selectors and random-generation result area.
- Established playful yellow/white visual language.

### Restaurant data expansion
- Added manually researched restaurant records and larger Area1 candidate files.
- Explored Tabelog and OSM as complementary discovery sources.
- Identified broad-radius and incomplete-identity problems, leading to the current 1.2km + verified-identity + canonical-build architecture.

## Pending log items
- budget/lunch/dinner enrichment
- representative-dish enrichment
- opening-hours/regular-holiday enrichment
- Place-ID-centric Tabelog enrichment completeness audit
- 百名店 branch identity audit
- distance-balanced verification of the remaining/outer-ring candidate pool if broader practical 1.2km coverage is needed
- opening/holiday exclusion semantics
- final Area1 content-quality release review after enrichment
