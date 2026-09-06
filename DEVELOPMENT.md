# Eat Development Plan

Updated: 2026-09-07

## Current state

`TOKYO / 地区1️⃣` has completed the expensive restaurant-list/identity discovery stage. The frozen historical Area1 benchmark remains **2,804 exact Google Place IDs** and must not be recollected with paid Google APIs.

The production pool is now **662 restaurants**:

- legacy verified production identities: **656**;
- catalog-reviewed admissions: **6**;
- current production identities: **662**;
- unique current Place-ID compatibility keys: **662**.

Latest full rebuild metrics from Actions run `34041362830`:

- cuisine known: **607 / 662**;
- any meal budget known: **280 / 662**;
- lunch budget known: **167 / 662**;
- dinner budget known: **260 / 662**;
- both meal budgets known: **147 / 662**;
- normalized opening hours known: **366 / 662**;
- featured dishes known: **129 / 662**;
- strict recommended dishes known: **30 / 662**;
- 百名店: **22**;
- usable maintained source attached: **452 / 662**.

Evidence overlays have also expanded with the 662-row production pool:

- public source provenance: **452 identities / 619 concrete public source URLs**;
- provider-level source facts: **452 identities / 543 provider fact records**;
- reviewed Hot Pepper maximum non-image rich metadata: **135 identities**.

Historical 656-era coverage numbers in older logs remain valid for those earlier checkpoints but must not be reused as the current production denominator.

## Primary strategy: full-load first, then field completion

The project is no longer organized around isolated enrichment passes such as “fill lunch price first” or “fill hours first.”

The authoritative operating model is now:

> **Load the complete current production pool -> build a complete per-restaurant field matrix -> identify all missing/uncertain fields -> enrich each restaurant across as many fields as possible per source visit -> rebuild the matrix -> repeat.**

This replaces the earlier top-200 field queue as the main controller.

### Full enrichment matrix

`scripts/build_full_enrichment_matrix.mjs` combines the complete production set with:

- canonical `production_area1.js`;
- `source_provenance.js`;
- `source_facts.js`;
- `hotpepper_rich_metadata.js`.

It writes:

`data/area1_enrichment_matrix.json`

The matrix contains **every current production restaurant**, not a truncated priority sample. Each record tracks:

- current canonical values;
- provider/source evidence availability;
- provider-level facts;
- Hot Pepper reviewed rich metadata;
- core fields present/missing;
- practical fields present/missing;
- core/practical/overall completion score;
- recommended next action.

Actions run `34041362830` generated the first complete **662 / 662** matrix and committed it as `4510c99`.

## Current full-matrix baseline

The first full matrix shows that identity coverage is mature but field completion is not.

### Core-field gaps

- name missing: **0**;
- address missing: **333**;
- cuisine missing: **55**;
- lunch budget missing: **495**;
- dinner budget missing: **402**;
- normalized opening hours missing: **296**;
- featured dishes missing: **533**;
- strict recommended dishes missing: **632**.

Only **14 restaurants** currently have every field in the provisional core-completeness set populated.

Average scores:

- average core score: **48%**;
- average practical score: **31%**;
- average overall score: **40%**.

### Practical/source-native gaps

- public source links missing: **210**;
- provider source facts missing: **210**;
- nearest station missing: **527**;
- access text missing: **527**;
- capacity missing: **527**;
- party capacity missing: **553**;
- lunch-availability signal missing: **527**;
- payment-method details missing: **543**;
- amenities missing: **527**;
- source-native area hierarchy missing: **527**;
- raw provider budget missing: **527**;
- raw source hours missing: **351**;
- raw source closure information missing: **395**.

These counts are intentionally explicit. A restaurant being admitted to production no longer implies that its useful data fields are complete.

## Field-state model

A binary “present/missing” flag is not sufficient for long-term completion work. New enrichment logic must distinguish at least these states:

- `known` — a trusted value is available;
- `source_available_unextracted` — an exact maintained source exists but the field has not yet been extracted;
- `unknown` — no usable evidence has been found;
- `reviewed_none` — the relevant source was reviewed and explicitly provides no such value/evidence;
- `conflict` — multiple maintained sources disagree materially;
- `not_applicable` — the field does not reasonably apply to this restaurant.

This is especially important for fields such as `recommendedDishes`, amenities and lunch availability. An empty strict recommendation list must not be treated forever as an enrichment failure when no source explicitly marks any dish as recommended/signature/popular.

The current matrix is the first full-load baseline. Future matrix revisions should move from simple missing flags toward this field-state model.

## Enrichment unit: restaurant bundle, not single field

When a source page/API row is opened for one restaurant, the enrichment task should extract **all trustworthy useful fields available in that visit**, not only the field that originally caused the restaurant to enter the queue.

A normal per-restaurant extraction bundle should attempt, where supported:

### Identity and classification

- name / name kana;
- address;
- source coordinates;
- cuisine / provider genre/sub-genre;
- currentness / closure evidence;
- source-native IDs and branch identifiers.

### Price and menu

- lunch budget;
- dinner budget;
- lunch availability;
- representative/featured dishes;
- strict recommended/signature dishes only when explicitly supported;
- reproducible official-menu price derivations where appropriate.

### Hours and access

- raw opening hours;
- normalized weekly schedule when safely parseable;
- regular closure;
- nearest station;
- access/transport text.

### Practical metadata

- seats/capacity;
- party capacity;
- payment/card methods;
- Wi-Fi;
- private rooms;
- smoking policy;
- parking;
- barrier-free access;
- children/pets;
- late-night operation;
- all-you-can-eat/drink;
- karaoke/live show/TV/projector;
- tatami/horigotatsu/charter and similar provider-supported fields.

A source fetch should therefore maximize **trusted fields gained per restaurant visit**, not merely complete one queue column.

## Batch execution order

The full matrix is the source of truth for batch selection.

Prioritize restaurants in this order:

1. **Existing exact maintained source + many missing fields** — highest return, usually no new discovery needed.
2. **Repeated official domains/brands** — one extraction template can complete many branches.
3. **Exact Tabelog / official bindings** — extract all stable fields already represented by the maintained source.
4. **Reviewed Hot Pepper bindings** — use already-authorized structured details and retained artifacts before any new geographic discovery.
5. **Rows with source facts but canonical gaps** — reconcile or promote only where provenance rules permit.
6. **Rows with conflicts** — review rather than average/overwrite silently.
7. **Rows with no usable source** — only then perform targeted ordinary web/search discovery for an underlying official/permitted source.
8. Use OSM / Overture / other open sources mainly for identity, address, category and currentness checks.

Do not expand restaurant count simply to improve a discovery metric while the existing production pool remains substantially incomplete.

## Completion priorities

For the current 662-row pool:

### P0 — identity-critical

- address;
- cuisine/category;
- currentness/closure;
- exact source binding.

### P1 — recommendation/filter-critical

- lunch budget;
- dinner budget;
- normalized opening hours.

### P2 — decision-support

- featured/representative dishes;
- raw hours and closure evidence;
- station/access;
- payment and capacity information.

### P3 — rich practical metadata

- amenities and service conditions;
- source-native area/genre/budget objects;
- branch-specific provider metadata.

Strict `recommendedDishes` remains evidence-constrained: completeness means the field has been evaluated, not that every restaurant must have a non-empty recommendation list.

## Price architecture

`scripts/price_resolver.mjs` resolves lunch and dinner independently.

Price evidence classes remain:

- **A / `explicit_range`** — explicit branch budget/average-spend range; hard-filter eligible;
- **B / `menu_derived`** — reviewed representative range from a sufficiently complete official menu;
- **C / `sparse`** — one item/course/charge/promotion/search snippet; never enters hard budget filtering.

Evidence strength is ranked before provider priority. Strong-source conflicts are retained, never silently averaged.

A stored source-only meal price requires explicit `budget`, `lunchBudget` or `dinnerBudget` provenance. Pages and enrichment promotion continue to enforce strict price provenance.

## Evidence layers

### Public provenance

`source_provenance.js` preserves public URLs, claimed fields and check dates.

Current 662-row rebuild:

- rows with public source links: **452**;
- public source URLs: **619**;
- provider reach includes Tabelog **322**, Hot Pepper **100**, official **149**, plus small exact-source groups.

### Provider source facts

`source_facts.js` preserves source-specific facts that canonical resolution would otherwise discard.

Current rebuild:

- rows with source facts: **452**;
- provider fact records: **543**;
- Tabelog records: **303**;
- official records: **140**;
- Hot Pepper records: **100**;
- unattached maintained source rows: **0**.

This layer is important for full-matrix enrichment because a canonical gap may already have usable provider evidence that has not yet been safely promoted.

### Hot Pepper rich metadata

The reviewed Hot Pepper rich layer remains **135 exact current-production bindings** and preserves maximum non-image source-native metadata without overwriting canonical core fields.

Do not rerun geographic Hot Pepper discovery merely to refresh these rows. Focused detail refreshes must use reviewed IDs in <=20-ID batches and remain manual-only.

## Billable API prohibition

Repository maintenance must not execute billable Google place/search/map data APIs.

- no live Google Places / Area Insights / Text Search / Place Details;
- no paid place/search fallback;
- no Google data API key injected into Pages;
- historical Google IDs/QC are frozen compatibility inputs;
- retired paid scripts remain fail-closed;
- CI runs `scripts/audit_no_paid_apis.mjs` and must report zero active paid-data-API hits.

Ordinary external Google Maps navigation links may remain. Ordinary web/search may be used only to discover the underlying official/permitted source; search snippets are not durable factual evidence.

## Production-count rule

**Never hard-code the production count in enrichment workflows.**

The pool changed from 656 to 662 when six catalog-reviewed identities were admitted. Any workflow or audit must derive the current count from `production_area1.js` / matrix metadata and verify:

```text
matrix.records.length === matrix.productionEntities
```

The first matrix workflow exposed this exact issue: generation succeeded for 662 rows but the initial check still expected 656. The check was corrected to be production-size aware.

## Workflow safety

External-data workflows remain manual-only after any one-time bootstrap trigger is removed.

The full matrix workflow is a **zero-external-request** repository rebuild: it derives the matrix from current canonical and maintained overlays. It may be run after each meaningful enrichment batch to measure progress.

Normal documentation/code pushes must not trigger paid Google data APIs or automatic Hot Pepper collection.

## Definition of progress

Do not judge enrichment progress by restaurant count alone.

Primary progress metrics are now:

- number of current production restaurants evaluated in the full matrix;
- average core/practical/overall completion score;
- number of restaurants with unresolved identity-critical gaps;
- number of trusted field values added per source visit;
- number of `source_available_unextracted` states converted to `known` or `reviewed_none`;
- number of conflicts resolved without weakening provenance;
- number of completely evaluated restaurant records.

The full production pool should remain stable while field completeness rises.

## Runtime contract

Public runtime remains layered:

```text
production_area1.js          canonical filter/recommendation facts
source_provenance.js         public evidence URLs and field lineage
source_facts.js              provider-level maintained facts
hotpepper_rich_metadata.js   maximum reviewed non-image Hot Pepper metadata
app.js                       product logic
```

`area1_enrichment_matrix.json` is a **maintenance/control artifact**, not a direct public recommendation data source.

Recommendation behavior remains: <=1,200m, current canonical production identities, cuisine/budget/distance filters, three distinct results when possible, cuisine-diversity preference, Web Crypto randomness, 百名店 weight 2.2 and no rating/review popularity ranking.

Embedded maps use Leaflet/OpenStreetMap. Hot Pepper photos/logo URLs are not ingested. The required Hot Pepper service credit remains on the public page.
