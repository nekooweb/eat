# Eat Development Plan

## Current status — 2026-09-05 progress recheck and next work

The `TOKYO / 地区1️⃣` static runtime is implemented and its current build/audits pass. All 269 production identities have a recorded source outcome, but field enrichment, source exceptions and geographic coverage remain unfinished.

Review baseline: [`8c01e125`](https://github.com/nekooweb/eat/commit/8c01e125fcb08ea5ad9a8b493924bf077374b6c6), committed at 2026-09-05 13:38 JST. Its [Pages build/deployment](https://github.com/nekooweb/eat/actions/runs/33945096799) succeeded. A local rebuild, both audits, coverage report and source queue reproduced that baseline. This documentation update records the findings and planned work; it does not represent new restaurant verification or field entry.

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
- pending within the existing cache: 0;
- OSM candidates with no verification-cache entry: **491 / 990**;
- canonical production entities: 269;
- unique Google Place IDs: 269.

`pending:0` describes only the 499 processed source records. It does not mean all 990 candidates have been checked. Verified cache rows are source records, whereas production counts distinct Place IDs after canonical merging. The separate 1,613-ID Google discovery inventory is a coverage lead list, not 1,613 production restaurants.

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

The farthest canonical record is approximately 741 m away. The 800 m and 1.2 km options currently select the same pool; there are no production records in the 800–1,200 m ring. The 1.2 km boundary is implemented, but coverage of that full radius is incomplete.

The original half-pool run was near-biased because of historical source ordering. Future half-mode verification uses deterministic distance-balanced sampling instead.

## Source outcome accounting — complete for the current 269 identities

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

This is **source-outcome accounting coverage**: 237 usable bindings plus 32 documented exceptions. It does not mean 269 usable sources, complete restaurant fields or current operating-status confirmation. All 32 exception identities remain in the canonical recommendation pool; source-resolution records currently control the research ledger, not runtime admission.

### Source-resolution infrastructure

Current maintenance layer:
- `data/source_enrichment*.js` — Place-ID keyed usable Tabelog/official bindings and field enrichment;
- `data/source_resolution*.js` — explicit terminal source states;
- `scripts/source_queue.mjs` — completeness/unresolved report;
- `scripts/audit_source_bindings.mjs` — blocks stale/unattached source rows, invalid resolutions, duplicate usable/resolution states and unsupported evidence;
- Pages CI uploads `coverage.json` + `source_queue.json` as a short-lived private `eat-data-audit` artifact.

Source-resolution shards are intentionally supported so future additions do not require editing one conflict-prone monolithic ledger.

## Current metadata completeness

| Field | Known in all 269 production entities | Coverage | Missing within the 237 usable-source entities |
| --- | ---: | ---: | ---: |
| Non-generic cuisine | 247 | 91.8% | 22 |
| Lunch or dinner budget | 95 | 35.3% | 142 |
| Opening or regular-holiday information | 154 | 57.2% | 102 |
| Representative dishes | 20 | 7.4% | 217 |
| Display address | 61 | 22.7% | 191 |

The last column uses the 237 usable-source entities as its denominator, not all 269 restaurants. The gaps overlap and must not be summed as distinct restaurants.

Additional detail from the rebuilt data:
- 33 distinct cuisine labels; 22 rows still use generic `餐厅`;
- lunch budget known: 88; dinner budget known: 77; both known: 70;
- `openingHoursRaw` present: 143; another 11 rows have only closure/holiday information;
- 19 百名店 records, all carrying year and category; this is an award count, not a completeness target for all restaurants;
- **114 of the 237 usable-source records declare only `name` in their source references**. Their source pages have been located, but richer field extraction is still pending. Existing OSM/curated fields may already appear on those restaurants.

Source-reference coverage by field currently includes:
- cuisine: 123 reviewed refs;
- budget: 95;
- dishes: 15;
- hours: 94;
- closure/status: 103;
- 百名店: 17.

Source-reference counts measure field evidence entries and can differ from production field counts because canonical data also incorporates OSM/curated information. They must be reported separately. New extraction should reuse the reviewed Place-ID/source bindings.

## Next work — planned, not yet executed

### 1. Recheck three operating-status conflicts

| Current production name | Recorded source issue | Current recommendation state |
| --- | --- | --- |
| キッチン グラン | `listing_hold`: Tabelog operating status unconfirmed | Still eligible under normal filters |
| 明神丸 | `listing_hold`: Tabelog operating status unconfirmed | Still eligible under normal filters |
| カフェ ド クルーセ | `no_current_usable_source`: matching Tabelog source marked closed | Still eligible under normal filters |

Use the existing Place IDs for targeted current Google identity/status QC, following the product owner's Google-first decision. Record the check date, compact QC outcome and resulting recommendation eligibility. A source-page exception alone does not establish the business's current status. The present cache has no per-entry verification timestamp, and ordinary runs skip terminal QC-v4 entries; an explicit targeted recheck path is needed to refresh these cases without rerunning the whole pool.

Completion evidence: an explicit fresh QC outcome for each of the three identities, consistent source/production records and passing audits. These checks have not been performed in this documentation pass.

### 2. Enrich the 237 existing usable-source restaurants

Process budget first, then opening/regular holidays, cuisine normalization, representative dishes and address. Use the missing-field counts above to select work, including the 114 name-only source records. Maintain the existing 19 award records and add or correct award facts only with branch-specific evidence; year/category fields are already present for all 19.

Each restaurant should receive a field review even when a source does not provide every value. Store supported facts and record the reason for any reviewed gap. A completed review is distinct from a populated field.

### 3. Resolve remaining source exceptions, then expand distance coverage

- Resolve the 27 branch-ambiguous records using existing Place IDs, independent coordinates/address and official branch information; move an exception to usable enrichment only when the specific branch is supported.
- Revisit the two `source_not_found` cases when better evidence becomes available.
- Target unverified candidates in the 800–1,200 m ring using distance-balanced verification and reuse the existing 1,613-ID inventory.
- Keep the seven unresolved `curatedOverlap` candidates as a separate expansion queue.
- Apply the same source-outcome and field-review process to every newly admitted production identity.

### 4. Implement opening/holiday filtering after schedule data is stronger

Opening information is currently descriptive. Design and verify Japan-time interpretation, split service periods, regular holidays and unknown/irregular schedules before using it to exclude recommendations. Preserve the overview map, per-store maps and three-store comparison. Area2 and SHIZUOKA follow the current Area1 data work.

### Field entry and batch reporting rules

Field extraction rules:
- use the already reviewed Place-ID -> source relationship;
- declare exactly which fields each `sourceRefs` entry supports;
- do not infer a value merely because a restaurant category normally implies it;
- lunch and dinner remain separate;
- no visitor-clock-dependent price selection;
- no fabricated `unknown` replacements;
- ambiguous/terminal source-resolution records stay excluded from source-derived field extraction until the identity issue is resolved.

For each future batch, update this document and `CHANGELOG.md` with:
- scope/Place IDs processed and source URLs/check dates;
- before/after production count and field coverage;
- newly populated fields and reviewed-but-missing fields with reasons;
- source-exception changes and remaining unverified candidates;
- distance-ring counts and validation results/commit or CI reference.

The current coverage script does not yet emit every supplementary metric in this review, including name-only source counts and usable-source field gaps. Those values were calculated from the same rebuilt canonical dataset and source shards. Extending the maintenance reports to reproduce them is planned work; it must not be presented as an existing automated gate.

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

The reviewed baseline passed all of these checks and deployed successfully. They establish build and repository consistency; they do not perform live restaurant-status research or prove field completeness.

Current completeness-gate limitation: `source_queue.mjs` calculates and reports missing source outcomes, but does not fail on a nonzero unresolved count. `audit_source_bindings.mjs` validates existing rows and emits a fixed `unresolvedByBindingAudit:0`; that field is not a computed completeness measure. The actual reviewed queue is zero. Future expansion should add a real completeness gate rather than rely on that fixed value.

## Later work

After the ordered Area1 work above:
- local recommendation history after privacy/persistence rules are defined;
- TOKYO 地区2️⃣ after production data exists;
- SHIZUOKA after production data exists.

Do not rerun the 1,613-ID Google coverage discovery merely to improve source/field enrichment; that identity inventory already exists.
