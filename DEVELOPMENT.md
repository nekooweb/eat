# Eat Development Plan

## Current milestone
Build a reliable `地区1️⃣` recommendation database inside the strict 1.2km boundary with **Google Places as the production merchant universe**, then enrich those Google entities with Tabelog/OSM/manual data.

## Development principles
1. Google Place ID is the canonical production business key.
2. Google-native discovery comes before external-source enrichment.
3. Tabelog/OSM cannot veto a valid Google business merely because names/coordinates differ.
4. Keep runtime static and fast.
5. Never put private API credentials in frontend code.
6. Do not fabricate restaurant metadata.
7. Preserve anonymous public area labels.
8. Every widening/narrowing of geographic scope must be explicit.
9. External-source-only records are audit leads, not automatic production recommendations.

## Phase A — Google-first Area1 discovery [completed]

Implemented:
- `scripts/discover_google_area1.py`
- `.github/workflows/discover-google-area1.yml`
- overlapping spatial-cell Nearby Search strategy
- multiple food-related Google place types
- Place ID deduplication
- strict <=1200m boundary filtering
- permanent closure exclusion
- Google-native static outputs

First full discovery result:
- 37 spatial grid points
- 740 Google Nearby Search API calls
- 0 API errors
- 1,613 unique Google-verified Area1 food-related entities

Remaining audit work:
- inspect type distribution
- inspect whether search cells/types hit practical result caps
- check Google-only entities missing from OSM/Tabelog

## Phase B — Canonical production dataset normalization [frontend migration completed]

Completed:
- Google-first `data/area1_google.js` is now loaded by the webpage
- one production identity per Google Place ID from the generated discovery output
- Google canonical name/address/coordinates/status/type remain authoritative
- strict <=1200m production safety check remains in the browser
- legacy/manual/OSM records no longer independently enter the recommendation pool
- compatible historical/manual records may only enrich Google entities
- manual correction layer loads last

Current implementation note:
- enrichment is still merged in-browser rather than precompiled into a single canonical `data/area1_verified.js`

Next normalization target:
- precompile enrichment into one canonical static production file to reduce client payload and simplify runtime logic

## Phase C — Tabelog / 百名店 enrichment [in progress]

Current frontend can consume enrichment for:
- cuisine/category refinement
- lunch budget
- dinner budget
- representative dishes
- opening hours
- regular closed days / closure notes
- 百名店 year/category

Matching priority:
1. exact known Google Place ID mapping
2. branch-aware name + address + nearby coordinates
3. strong normalized name + compatible location/address

Ambiguous Tabelog matches remain unresolved. They must not remove the Google production entity.

Missing fields are shown explicitly as `待补充` rather than fabricated.

## Phase D — OSM/legacy candidate audit

Use OSM and the legacy verifier to answer coverage questions, not to define the main business universe.

Tasks:
- compare Google production entities vs OSM candidates
- identify Google-only entities
- identify OSM-only candidates with no Google match
- preserve source-to-Google diagnostics
- stop presenting legacy `verified/rejected/pending` as production database status

The previous half-pool run produced a large rejection count because source-name/source-coordinate matching was too strict for production identity. That result is now audit data, not the production database definition.

## Phase E — Coverage and metadata quality [partially surfaced in UI]

Public stats now report:
- total Google production entities
- cuisine-classified count
- budget-enriched count
- representative-dish enriched count
- opening/holiday enriched count
- 百名店 count

Still planned:
- Google-only count
- Google + Tabelog match count/rate
- Google + OSM match count/rate
- duplicate Place IDs
- outside-boundary production records (must be zero)
- detailed type distribution
- result-cap coverage audit

Operational completion means audited Google-first cross-source coverage, not a claim of universal real-world completeness.

## Phase F — Frontend migration [completed for production eligibility]

Completed:
- Google-first Area1 dataset is the sole source of production eligibility
- historical candidate overlays are no longer admission gates
- absolute 1200m frontend safety check retained
- filters remain independent
- 3-distinct-cuisine behavior preserved when possible
- browser cryptographic randomness preserved
- 百名店 weight 2.2 vs ordinary 1.0 preserved
- Place ID is preferred for Google Maps navigation
- database statistics now show production count + metadata completeness instead of legacy rejection counts
- missing metadata renders clearly

Remaining optimization:
- remove unnecessary legacy payload from browser after enrichment is precompiled

## Phase G — UI/data quality [in progress]

Completed:
- Google-verified badge
- temporary-closure warning badge
- explicit metadata completeness line per restaurant
- cleaner source/metadata state wording
- comparison table includes metadata status

Planned:
- improve cuisine taxonomy beyond generic `餐厅`
- audit whether some Google food-adjacent types should be excluded from random meal recommendations
- ensure every production entity renders correctly on overview map
- further improve card/comparison layout after product feedback

## Phase H — User-specified future logic

Do not implement until requirements are supplied:
- holiday/open-now exclusion logic
- recommendation history behavior
- persistent local installation/device ID
- history reset/privacy behavior
- whether history changes future random probability

## Area2 / SHIZUOKA
Area2 and SHIZUOKA remain secondary until Area1 Google-first architecture is stable.
Reuse the same Google discovery -> canonical dataset -> Tabelog/OSM enrichment pipeline.

## Routine maintenance workflow

### Google discovery
1. Run Google-first discovery deliberately, not continuously.
2. Check unique Place ID count and API errors.
3. Check strict <=1200m boundary.
4. Audit type distribution/result-cap risk.
5. Commit generated data.

### Tabelog enrichment
1. Start only from Google production entities.
2. Match branch identity carefully.
3. Record source-backed values only.
4. Leave ambiguous values unresolved.
5. Update 百名店 metadata only after identity is clear.

### OSM/source audit
1. Compare source candidates against Google production entities.
2. Use source-only records as coverage leads.
3. Do not auto-promote external-only records.
4. Do not reject Google-native entities due to source mismatch.

### Release check
- page loads on mobile and desktop
- no API key in page source/repository
- production dataset is Google-first
- no Area1 production result exceeds 1.2km
- no duplicate Place IDs
- Google links resolve by Place ID when available
- three-result cuisine diversity works when sufficient categories exist
- filter toggles bypass their corresponding conditions
- missing metadata is explicit, not fabricated
- no personal names appear in public repository content

## Cost control
Google Places calls are maintenance-time only. Discovery runs should be deliberate rather than frequent. Keep field masks compact, avoid redundant repeat runs, and store generated outputs for audit/comparison.

## Definition of done for Area1 v1
- Google-first canonical dataset exists and is used by the frontend
- practical Google/Tabelog/OSM coverage audit completed
- strict <=1.2km boundary validated from Google canonical coordinates
- no known duplicate Place IDs
- cuisine coverage sufficient for 3-way recommendations
- budget metadata reasonably populated without fabrication
- 百名店 identity/weighting audited against Google entities
- database statistics reflect production coverage and metadata quality
- legacy enrichment payload precompiled or otherwise minimized
- documentation and changelog reflect final state
