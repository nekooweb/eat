# Eat Development Plan

Updated: 2026-09-06

## Authoritative current state

`TOKYO / 地区1️⃣` is now in **collection-first full-range execution**.

The current fixed Area1 snapshot is confirmed at **2,804 / 2,804 unique Google food-business Place IDs**. Completeness is not inferred from production size: the Google Aggregate exact circle count and the geodesic partition inventory independently equal 2,804, with `complete`, `coverageVerified`, and `independentCountVerified` all true.

After the first full-range identity sweep and collision-safe OSM promotion:

- exact inventory: **2,804**;
- canonical production: **656**;
- production inside exact inventory: **653**;
- production outside this exact snapshot: **3**;
- inventory-only: **2,151**;
- verified independent-source identities inside inventory: **651**;
- OSM QC rows: **1,273**;
- verified QC rows: **666**;
- source-backed Tabelog/official enrichment: **397**;
- cuisine known: **578**;
- address known: **261**;
- normalized opening hours: **282**;
- budget known: **192**;
- featured dishes: **125**;
- strict recommendations: **27**;
- 百名店: **22**.

`DATA_ENRICHMENT_PROGRESS.md` is the authoritative numeric report. Detailed implementation history lives under `logs/`.

## Current development priority

The previous priority of incrementally increasing individual fields is suspended. The main objective is now:

> Process the entire 2,804-identity universe, give every identity an auditable source/admission outcome, and extract all safe fields during the same source pass.

This means identity/source collection comes before optimizing optional field coverage.

## Full-range collection pipeline

### 1. Fixed identity universe

`data/area1_google_ids.json` is the current collection denominator. It represents the 2026-09-05 Area1 <=1,200 m snapshot under the configured food-business type universe.

A later deliberate inventory refresh may change this number as businesses open/close, but the current full collection must finish against 2,804 before changing denominator casually.

### 2. Full transient identity sweep

Implemented by:

- `scripts/full_inventory_collection.py`;
- `.github/workflows/full-area1-collection.yml`;
- `data/area1_full_collection_queue.json`.

The first full sweep processed all **2,159 identities that were inventory-only at the start of the pass**.

Run `34018919233` initially returned 1,715 operational-food identities, 1 permanently closed identity, and 443 transient fetch failures. Run `34019078280` retried only those failures at lower concurrency and resolved all 443.

Final seed status:

- operational food: **2,158**;
- permanently closed: **1**;
- fetch errors: **0**.

Google display name/address/location is maintenance-only transient data and is not committed as the durable restaurant database. The committed queue stores Place ID, status class, and independent-source candidate facts only.

### 3. Global independent-source candidate matching

The 2,158 operational identities were compared against all **1,273 OSM independent-source rows**.

- high confidence: **41**;
- medium: **3**;
- review: **49**;
- low: **1,904**;
- none: **161**.

Confidence is only a review/admission aid. It is not permission to overwrite historical QC or reuse an OSM entity already bound to another Place ID.

### 4. Collision-safe high-confidence promotion

Implemented by:

- `scripts/promote_full_high_confidence_osm.py`;
- `.github/workflows/promote-full-high-confidence-osm.yml`.

Run `34019143688` examined all 41 high-confidence matches:

- promoted: **8**;
- blocked: **33**.

Blocks include terminal historical candidate rejections and OSM rows already verified to another Place ID. These rules prevent aggressive full-range collection from creating false branch identities.

The eight safe promotions changed production **648 -> 656** and cuisine-known **571 -> 578** while all audits remained green.

### 5. Rebuilt 2,804 ledger

`data/area1_inventory_ledger.json` and `data/area1_inventory_expansion_queue.json` are rebuilt after identity promotions.

Run `34019222744` produced:

- inventory total: 2,804;
- production total: 656;
- production in inventory: 653;
- inventory-only: 2,151;
- verified independent source inside inventory: 651;
- rejected-candidate queue: **51 identities / 58 links**;
- ledger rows without previous OSM-QC binding: 2,100.

The 2,100 count no longer means “not collected”. All completed the current transient Google identity sweep; they still need independent-source discovery.

## Source and field strategy

For every identity under investigation, source discovery and field extraction should happen in one pass whenever possible:

- exact branch/business identity;
- cuisine;
- address;
- normalized weekly opening hours;
- explicit lunch/dinner spend range if actually stated;
- menu / representative or signature dishes;
- strict recommendation evidence when explicitly stated;
- maintainable independent source URLs.

Do not revisit the same restaurant in separate manual passes merely to collect one field at a time.

## A / B / C confidence model

1. **A — auto-promote:** exact identity + deterministic independent-source evidence + no collision/terminal conflict.
2. **B — prepared review:** evidence is extracted and grouped for rapid review; no fresh manual search should be required when possible.
3. **C — unresolved/terminal:** evidence is insufficient, contradictory, stale, closed, or cannot safely establish branch identity. Record the reason instead of guessing.

Full completion is based on auditable outcomes, not forced non-null values.

## Field semantics that remain mandatory

### Opening hours

`openingHours` remains the filter-ready weekly contract. Missing day = unknown, `[]` = explicitly closed, missing `openingHours` = no reliable weekly schedule. Temporary/holiday-conditional schedules are not forced into the weekly model.

### Budget

Menu-item or course prices do not define restaurant lunch/dinner budget. Generic automatic budget inference remains prohibited.

### Dishes

- `recommendedDishes`: strict explicit recommendation/popularity/signature evidence only;
- `featuredDishes`: broader source-backed representative/signature items.

Brand/template propagation is a field rule, never an identity-admission rule.

## Google data / cost guardrails

- Google Place ID is the durable identity key.
- Full Google display payload is not persisted as the restaurant database.
- Full-range identity sweep uses minimum Place Details Pro QC fields transiently.
- `websiteUri` / Enterprise discovery is not part of the automatic full sweep.
- Enterprise official-site recovery remains separately budget-gated and manual-only.
- The current full sweep plus its bounded retry stays below the current Place Details Pro monthly free request cap when counted with the earlier OSM QC workload, but actual Cloud billing is not observable from the repository.

## CI and audit contract

Every identity-admission batch must rebuild canonical production and pass:

- repository audit;
- source-binding audit;
- normalized-field audit;
- identity-coverage audit;
- relevant coverage/source reports.

Piped reports use `set -o pipefail`. Generated durable queues must be checked to ensure Google display fields were not accidentally persisted.

## Ordered next work

1. Resolve the **3 medium + 49 review** full-range OSM candidates.
2. Recalculate the source-outcome queue against all **656 production** identities, then drive it to an explicit outcome for every row.
3. Batch independent-source discovery for the remaining **2,151 inventory-only** identities, prioritizing repeated brands/locators/official-site patterns.
4. Extract all safe restaurant fields during the same independent-source pass.
5. Convert ambiguous/no-source/closed cases into explicit auditable outcomes rather than leaving them as unprocessed IDs.
6. Keep processing until **2,804 / 2,804** identities have a final maintenance outcome.
7. Only after full identity/source collection is substantially complete, return to optional field-coverage optimization and schedule-aware runtime filtering.

## Runtime/product contract

The browser remains a static GitHub Pages product. Recommendation behavior is unchanged: <=1,200 m scope, verified Place IDs, cuisine/budget/distance filters, exactly three distinct results when possible, cuisine diversity preference, Web Crypto randomness, 百名店 weight 2.2, no rating/review popularity ranking, hybrid Google Maps Embed/Leaflet views, and isolated voice/mascot feedback.
