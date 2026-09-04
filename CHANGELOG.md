# Eat Development Log

This file records product/architecture decisions and meaningful implementation milestones. It is not a replacement for Git history.

## 2026-09-05

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
- Added three independent filter modules:
  - food/cuisine exclusions
  - budget
  - preferred distance
- Each filter can be enabled/disabled without erasing its selected value.
- Distance choices: 300m / 500m / 800m / 1.2km.
- Absolute Area1 1.2km boundary remains active even when preferred-distance filtering is disabled.

### Recommendation algorithm
- Generates up to three restaurant proposals.
- Enforces different primary cuisine families when possible.
- Uses browser cryptographic randomness.
- 百名店 weighting set to 2.2 vs ordinary 1.0.
- No rating/review-count popularity weighting.
- Opening/holiday information does not yet exclude restaurants; final closure logic remains intentionally pending.

### Maps
- Overview map uses Leaflet/OpenStreetMap for the three selected coordinates.
- Individual business navigation uses Google Maps.
- Replaced coordinate-only Google business search links with business-name/address queries and Place ID when available.
- Google Place ID is the preferred stable identity for navigation/matching.

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

### Half-pool verification result
- Half-pool run processed 492 of 983 OSM candidates.
- API/QC execution itself completed successfully: 75 verified, 407 rejected, 10 pending, 942 new API calls.
- Final workflow initially failed only because concurrent commits advanced `main`, causing a non-fast-forward `git push`.
- Workflow was patched to fetch/rebase latest `main` before push.
- The unusually high reject rate exposed a more important architectural issue: source-name/source-coordinate agreement was being used too strongly as production identity logic.

### Google-first architecture decision
- Production architecture changed from **OSM/Tabelog candidate -> Google verification** to **Google Places discovery -> canonical Google entity -> Tabelog/OSM enrichment**.
- Google Place ID is now the canonical production business key.
- Google-native name/address/coordinates/business status/type define the production entity.
- Tabelog/OSM mismatches can invalidate only the enrichment match, not the Google business itself.
- A Google business may remain production-eligible without any Tabelog or OSM match.
- A Tabelog-only/OSM-only record cannot enter production without a corresponding Google business identity.
- Legacy `verify_google_places.py` is retained for source-candidate mapping/audit/migration, not as the primary production-universe builder.

### Google-first discovery implementation
- Added `scripts/discover_google_area1.py`.
- Added `.github/workflows/discover-google-area1.yml`.
- Discovery queries Google Places Nearby Search across overlapping spatial cells and multiple food-related place types.
- Results are deduplicated by Google Place ID.
- Google canonical coordinates are checked against the strict <=1200m Area1 boundary.
- Permanently closed businesses are excluded.
- Generated outputs are `data/area1_google_places.json` and `data/area1_google.js`.
- Added one-time push trigger to start the first full Google-first Area1 discovery run.

### Generated verification integration
- Fixed an integration gap where `data/google_entities.generated.js` was generated by Actions but not loaded by the webpage.
- Generated Google verification data is part of the current legacy frontend data load chain pending canonical-dataset migration.

### Developer documentation consolidation
- Updated `REQUIREMENTS.md` to make Google-first production discovery authoritative and separate Google-native admission QC from external-source enrichment matching QC.
- Expanded `README.md` into the repository/developer entry point with frontend, data, script and workflow responsibilities.
- Updated `ARCHITECTURE.md` to document Google-first production identity, source-enrichment behavior, legacy verifier role and canonical dataset target.
- Updated `DEVELOPMENT.md` so the roadmap now starts with Google-first discovery, then canonical normalization, Tabelog/百名店 enrichment, OSM audit and frontend migration.
- Updated `DATA_PIPELINE.md` so the primary lifecycle is Google discovery -> admission QC -> enrichment -> canonical production record.
- `DATA_RESEARCH.md` remains historical/manual research and is not authoritative when it conflicts with `REQUIREMENTS.md`.

## Earlier implementation milestones

### Initial page
- Built responsive single-page shell.
- Added profile/area selectors and random-generation result area.
- Established playful yellow/white visual language.

### Restaurant data expansion
- Added manually researched restaurant records and larger Area1 candidate files.
- Explored Tabelog and OSM as complementary discovery sources.
- Identified broad-radius and incomplete-identity problems, leading first to the 1.2km + Google verification architecture and now to the Google-first production architecture.

## Pending log items
Update this section as work completes:
- first Google-first Area1 discovery result
- Google type/result-cap coverage audit
- canonical Google-first dataset migration
- Tabelog enrichment completeness audit
- 百名店 identity audit against Place IDs
- OSM/Tabelog cross-source coverage report
- frontend migration away from legacy candidate overlays
- final Area1 v1 release
