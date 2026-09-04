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

## Phase A — Google-first Area1 discovery [in progress]

Implemented:
- `scripts/discover_google_area1.py`
- `.github/workflows/discover-google-area1.yml`
- overlapping spatial-cell Nearby Search strategy
- multiple food-related Google place types
- Place ID deduplication
- strict <=1200m boundary filtering
- permanent closure exclusion
- Google-native static outputs

In progress:
- run full Area1 Google discovery
- record unique Place ID count
- inspect type distribution
- inspect whether search cells/types hit practical result caps
- check Google-only entities missing from OSM/Tabelog

## Phase B — Canonical production dataset normalization

Required:
- promote Google-first data to the canonical Area1 production dataset
- one production record per Google Place ID
- use Google canonical name/address/coordinates/business status/type
- calculate exact Area1 distance from Google coordinates
- remove duplicate Place IDs
- separate production dataset from legacy source-candidate audit data
- ensure manual corrections override generated values only when tied to the same Google identity

Target output:
- `data/area1_verified.js` or equivalent canonical production file

Do not delete legacy files until parity/coverage is checked.

## Phase C — Tabelog / 百名店 enrichment

For each Google production entity, match Tabelog where possible and enrich:
- cuisine/category refinement
- lunch budget
- dinner budget
- 1–2 representative dishes
- opening hours
- regular closed days
- 百名店 year/category

Matching priority:
1. exact known Google Place ID mapping
2. branch-aware name + address + nearby coordinates
3. strong normalized name + compatible location/address

Ambiguous Tabelog matches remain unresolved. They must not remove the Google production entity.

## Phase D — OSM/legacy candidate audit

Use OSM and the legacy verifier to answer coverage questions, not to define the main business universe.

Tasks:
- compare Google production entities vs OSM candidates
- identify Google-only entities
- identify OSM-only candidates with no Google match
- preserve source-to-Google diagnostics
- stop presenting legacy `verified/rejected/pending` as production database status

The previous half-pool run produced a large rejection count because source-name/source-coordinate matching was too strict for production identity. That result is now audit data, not the production database definition.

## Phase E — Coverage and metadata quality

Planned metrics:
- total Google production entities
- unique Place IDs
- Google-only count
- Google + Tabelog match count/rate
- Google + OSM match count/rate
- cuisine completeness
- lunch/dinner budget completeness
- opening-hours completeness
- closed-day completeness
- representative-dish completeness
- 百名店 count/coverage
- duplicate Place IDs
- outside-boundary production records (must be zero)

Operational completion means audited Google-first cross-source coverage, not a claim of universal real-world completeness.

## Phase F — Frontend migration

Required after canonical dataset is ready:
- load Google-first canonical production dataset as the main Area1 source
- remove dependence on historical candidate overlays for eligibility
- keep absolute 1200m frontend safety check
- keep filters independent
- preserve 3-distinct-cuisine behavior when possible
- preserve browser cryptographic randomness
- preserve 百名店 weight 2.2 vs ordinary 1.0
- prefer Place ID/exact Google Maps URI for navigation
- update database statistics to show Google production count + metadata completeness, not legacy candidate rejection counts

## Phase G — UI/data quality

Planned:
- improve card/comparison layout after product feedback
- ensure every production entity can render on overview map
- ensure incomplete metadata displays cleanly without fabricated values
- audit cuisine taxonomy for useful random diversity

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
1. Run Google-first discovery.
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
- Google links resolve to business entities rather than bare coordinates
- three-result cuisine diversity works when sufficient categories exist
- filter toggles bypass their corresponding conditions
- no personal names appear in public repository content

## Cost control
Google Places calls are maintenance-time only. Discovery runs should be deliberate rather than frequent. Keep field masks compact, avoid redundant repeat runs, and store generated outputs for audit/comparison.

## Definition of done for Area1 v1
- Google-first canonical dataset exists
- practical Google/Tabelog/OSM coverage audit completed
- strict <=1.2km boundary validated from Google canonical coordinates
- production frontend uses Google-first canonical records
- no known duplicate Place IDs
- cuisine coverage sufficient for 3-way recommendations
- budget metadata reasonably populated without fabrication
- 百名店 identity/weighting audited against Google entities
- database statistics reflect production coverage and metadata quality
- documentation and changelog reflect final state
