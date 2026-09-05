# Eat Development Log

This file records product/architecture decisions and meaningful implementation milestones. It is not a replacement for Git history.

## 2026-09-06 — Normalized hours, featured dishes, and full-range expansion approval

### Release and validation
- Merged PR #6, `Normalize opening hours and featured dishes`, into `main` as commit `907ac8afefefc795e4aaf8ecaecae23f695dbd66`.
- Production Pages run `33977830093` completed successfully after canonical build, repository audit, source-binding audit, normalized-field audit, coverage generation, artifact assembly and deployment.
- The normalization/featured-dish pass introduced no new Google Places calls.
- The current production pool remains **648 unique verified Place IDs** inside the strict Area1 <=1,200 m boundary.

### Opening-hours normalization
- Replaced mixed display-oriented schedule prose in canonical production with filter-ready `openingHours`.
- `openingHours.timezone` is fixed to `Asia/Tokyo`.
- Missing day key means unknown; `[]` means explicitly closed; interval arrays mean known opening periods.
- `hoursReference` is now derived from normalized schedule data instead of copied from raw source prose.
- Raw `openingHoursRaw`, `closedDays` and `closedNote` remain maintenance/source-only fields.
- Day-less time ranges are accepted only when weekly coverage can be inferred safely from explicit closure/no-closure evidence.
- `不定休`, reservation-only prose, calendar/SNS-dependent schedules and otherwise ambiguous weekly schedules are omitted from canonical filterable hours.
- Previous descriptive schedule coverage was 304 restaurants; conservative filter-ready coverage is now **273 / 648**.
- The parser regression suite covers Japanese/English weekday ranges, weekends/holidays, split lunch+dinner periods, L.O. text, exact closed days, 無休 and irregular schedules; **9 / 9 tests pass**.

### Featured-dish model
- Kept strict `recommendedDishes` separate from the broader display field.
- Added structured `featuredDishes` with Chinese/Japanese names, `recommended` / `signature` / `representative` semantics and optional direct menu-price fields.
- Strict reviewed recommendation coverage remains **27 / 648**.
- Public featured-dish coverage increased to **84 / 648**.
- Added **57** source-backed representative-dish rows with reviewed Chinese display names.
- All existing legacy dish rows with maintained dish-source evidence now have reviewed Chinese featured output: **64 / 64**; remaining legacy conversion gap is zero.
- Representative featured dishes must resolve to an already-maintained dish source for the same Place ID or the canonical build fails.
- Public UI label changed from the overly strict `推荐菜` wording to `特色菜`; strict recommendations remain available separately in the data model.

### Current data baseline after the pass
- exact Area1 Google identity inventory: **2,804 / 2,804**;
- OSM candidates: **1,273**;
- Google QC-v4: **658 verified / 615 rejected / 0 pending**;
- canonical production: **648**;
- usable Tabelog/official source-backed production: **396 / 648 = 61.1%**;
- explicit terminal source resolutions: **44**;
- source outcomes accounted for: **440 / 648 = 67.9%**;
- unresolved current-production source queue: **208**;
- non-generic cuisine: **571 / 648**;
- budget known: **192 / 648**;
- address known: **261 / 648**;
- filter-ready `openingHours`: **273 / 648**;
- `featuredDishes`: **84 / 648**;
- strict `recommendedDishes`: **27 / 648**;
- 百名店: **22**.

Among the 396 restaurants that already have a usable maintained Tabelog/official source, the immediate field gaps are:
- `openingHours`: **161**;
- `featuredDishes`: **314**;
- budget: **204**;
- address: **169**;
- cuisine: **27**.

### Approved expansion sequence
The data roadmap is now explicitly ordered rather than treated as a loose backlog:

1. complete useful durable fields for the current 648 production restaurants, prioritizing normalized hours and featured dishes;
2. close the remaining 208 current-production source outcomes conservatively;
3. expand the same identity/source pipeline across the full **2,804-ID Area1 inventory**;
4. apply the same normalized field-completion process to newly promoted production identities;
5. enable opening-hours runtime filtering only after coverage/freshness review, with missing schedules treated as unknown rather than closed.

The full-range expansion queue is currently **2,161** inventory Place IDs without a verified independent-source identity suitable for production admission.

“Full range” means all 2,804 inventory identities receive an explicit auditable outcome. It does **not** require the public production count to equal 2,804. An identity may remain needs-review, no-independent-source-yet or terminally excluded rather than being force-promoted.

### Documentation contract
- Rewrote `DEVELOPMENT.md` around the current 2026-09-06 baseline, normalized field schemas and approved full-range expansion gates.
- `DATA_SCHEMA.md` remains the field-level contract for normalized hours and featured dishes.
- `DATA_ENRICHMENT_PROGRESS.md` remains the detailed source-acquisition/coverage progress report.
- This 2026-09-06 entry supersedes the stale numerical pending items in older log sections below; older sections are retained as historical development context.

## 2026-09-05 — Progress recheck, documentation correction and ordered next work

### Review scope and evidence
- Reviewed `main` at [`8c01e125`](https://github.com/nekooweb/eat/commit/8c01e125fcb08ea5ad9a8b493924bf077374b6c6), committed at 13:38 JST.
- Confirmed the associated [Pages build and deployment](https://github.com/nekooweb/eat/actions/runs/33945096799) succeeded.
- Reproduced the canonical build, repository audit, source-binding audit, coverage report and source queue locally.
- This entry records a repository/data review and documentation update. No restaurant fields, live business-status results, API verification runs or runtime features were added in this pass.

### Corrected progress interpretation
- Production remains 269 restaurants with 269 unique Google Place IDs.
- Source-outcome accounting is 269/269, comprising 237 usable bindings (221 Tabelog, 16 official) and 32 exceptions (27 ambiguous, 2 listing holds, 1 unusable/closed source, 2 source-not-found).
- The 100% accounting figure does not mean all restaurants have usable sources, complete fields or freshly confirmed operating status.
- The Google QC cache covers 499 of 990 OSM candidates: 274 verified source rows, 225 rejected, 0 pending. **491 candidates have no cache entry.** Zero pending is not full-pool verification.
- The 1,613 Google Place IDs remain a discovery inventory; inventory, verified source-row and unique production counts have different meanings.
- **114 usable-source records declare name evidence only**, so page identification has not yet been followed by broader source-backed field extraction for those rows.

### Field and geographic gaps
- Known production fields: non-generic cuisine 247/269; budget 95/269; opening/holiday information 154/269; dishes 20/269; display address 61/269.
- Lunch budget 88, dinner budget 77, both 70; 143 rows have opening-hours text, while 11 more have closure/holiday information only.
- All 19 百名店 records already contain award year and category.
- Within the 237 usable-source restaurants, missing fields are budget 142, schedule 102, non-generic cuisine 22, dishes 217 and address 191. These overlapping gaps use a different denominator from whole-production completeness.
- Distance pools remain 116/192/269/269 at 300/500/800/1,200 m. The farthest production record is about 741 m; the 800–1,200 m ring has no production coverage.
- Supplemental name-only/field-gap counts were calculated from the rebuilt data and source shards. Adding these metrics to the automated report remains planned work.

### Operating-status and maintenance findings
- キッチン グラン and 明神丸 have `listing_hold` source records; カフェ ド クルーセ has a `no_current_usable_source` record referencing a matching source recorded as closed. All three remain in the recommendation pool and need current Google status QC using their existing Place IDs.
- The source-resolution ledger is a maintenance input, not a canonical/runtime admission filter. All 32 exception identities remain in production.
- The current Google cache has no per-entry verification timestamp, and ordinary runs skip terminal QC-v4 records. A deliberate targeted refresh path and dated compact outcomes are needed for the status rechecks.
- `source_queue.mjs` computes completeness but does not fail on missing outcomes. `audit_source_bindings.mjs` prints a fixed `unresolvedByBindingAudit:0`; that field must not be treated as the completeness calculation. The actual reviewed queue is zero. A computed blocking completeness gate remains planned work.

### Documentation changes
- Updated `DEVELOPMENT.md` with the verified baseline, explicit denominators, field-gap table, three status-conflict cases and completion evidence for the next work.
- Updated `DATA_PIPELINE.md` with outcome-ledger semantics, unprocessed-candidate/refresh rules, enrichment metrics and per-batch reporting requirements.
- Corrected stale `ARCHITECTURE.md` statements that maps/comparison were removed or Leaflet was forbidden. The actual runtime retains the overview map, per-store maps and comparison; the current source shards and CI/reporting flow are documented.
- Aligned `README.md` and `REQUIREMENTS.md` with the progress definitions and Google-first status-conflict review rule.
- Marked conflicting proposals in `DATA_RESEARCH.md` as historical without treating its sample restaurant facts as newly verified.

### Next work — pending
1. Recheck the three operating-status conflicts with targeted current Google QC and record the resulting recommendation decisions.
2. Review fields for all 237 usable-source restaurants, prioritizing budget, opening/regular holidays, cuisine, dishes and address; preserve branch-specific provenance and record reviewed gaps.
3. Resolve branch/source exceptions, then target the 800–1,200 m coverage gap using existing candidates/inventory; keep the seven curated-overlap candidates in a separate expansion queue.
4. Implement opening/holiday exclusion after schedule coverage and semantics are ready. Preserve the required maps and comparison; Area2/SHIZUOKA follow Area1 work.
5. With each batch, update development/log records with new facts, remaining gaps, check dates/source references, coverage deltas and validation evidence.

## 2026-09-05 — Current source-resolution and result-view state

This is the preceding source-accounting milestone. The progress recheck above clarifies its completion claims and supersedes its next-work ordering where they differ.

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
