# Area1 Data Enrichment Progress

Updated: 2026-09-06

## Current milestone: full-range collection

`TOKYO / 地区1️⃣` has moved from field-by-field enrichment to **full 2,804-identity collection**.

The fixed snapshot baseline is confirmed complete for the 2026-09-05 Area1 definition (<=1,200 m and the configured food-business type universe):

- Google Aggregate exact circle count: **2,804**;
- unique partition-enumerated Place IDs: **2,804**;
- `complete`: true;
- `coverageVerified`: true;
- `independentCountVerified`: true;
- completeness basis: `aggregate_exact_circle_count_equals_geodesic_partition_inventory`.

This is the authoritative identity universe for the current collection pass. Future openings/closures may change a later snapshot.

## Full inventory-only identity sweep

Branch workflow run **`34018919233`** processed the then-current **2,159 / 2,159 inventory-only Place IDs** using transient Google Place Details Pro identity/QC fields only. Google display payload was kept in a short-lived Actions artifact and was not committed to the durable database. `websiteUri` / Enterprise discovery was not requested.

Initial result:

- operational food identities: 1,715;
- permanently closed: 1;
- transient fetch errors: 443.

Retry run **`34019078280`** retried only those 443 failures at lower concurrency and resolved all of them in one wave.

Final identity-seed result for the 2,159 rows:

- operational food: **2,158**;
- permanently closed: **1**;
- remaining fetch errors: **0**.

Every previously inventory-only Place ID therefore now has a current collection-stage identity status rather than being a blind ID.

## Global OSM independent-source matching

All 2,158 operational identities were compared against the existing **1,273 OSM independent-source rows** using transient Google name/location plus durable OSM facts.

Candidate classification:

- high confidence: **41**;
- medium confidence: **3**;
- review: **49**;
- low confidence: **1,904**;
- no OSM candidate: **161**.

`data/area1_full_collection_queue.json` persists the 2,159-row maintenance result without persisting Google display names, Google addresses, Google coordinates, or `websiteUri`.

## Safe high-confidence production expansion

Run **`34019143688`** tested all 41 high-confidence OSM matches against the existing QC cache and collision rules.

- high-confidence candidates examined: **41**;
- safely promoted: **8**;
- blocked by historical terminal/conflicting QC: **33**.

Blocked candidates were not force-promoted. Common blockers were earlier `outside_1_2km` candidate pairings, non-food/no-place terminal states, or an OSM source already verified to another Place ID.

After the 8 safe promotions:

- canonical production: **648 -> 656**;
- production inside exact inventory: **645 -> 653**;
- non-generic cuisine known: **571 -> 578**;
- verified QC rows: **658 -> 666**;
- unique verified Place IDs: **655**;
- verified Place IDs covered by inventory: **651**;
- source-backed enrichment remains **397** because the new OSM admissions do not automatically create Tabelog/official enrichment claims;
- address: **261**;
- normalized opening hours: **282**;
- budget: **192**;
- featured dishes: **125**;
- strict recommendations: **27**.

Repository, source-binding, normalized-field, coverage, and identity audits all passed.

## Rebuilt 2,804 ledger

Run **`34019222744`** regenerated the full ledger after expansion:

- inventory total: **2,804**;
- canonical production total: **656**;
- production inside inventory: **653**;
- production outside this snapshot: **3**;
- inventory-only: **2,151**;
- verified independent-source identities inside inventory: **651**;
- rejected-candidate review queue: **51 identities / 58 links**;
- ledger identities with no prior OSM QC row: **2,100**.

Important: those 2,100 are no longer uncollected blind IDs. They have completed the full transient Google identity sweep; they simply still lack a verified independent-source admission path.

## Existing production source work

The previous source-enrichment baseline remains:

- usable Tabelog/official source-backed production: **397**;
- explicit source resolutions: **44**;
- source outcomes accounted for before the new OSM-only admissions: **441**;
- previously unresolved production-source queue: **207**.

The next source-completion pass must recalculate this queue against the 656-row production set and handle both the old unresolved rows and the 8 newly admitted OSM-only rows.

## Cost / persistence guardrails

The full identity sweep uses Place Details Pro minimum QC fields and does not request Enterprise `websiteUri`. Existing Google display content is treated as transient maintenance input and is not committed as the restaurant database.

The initial 2,159 calls plus 443 bounded retries, together with the earlier 1,273-candidate QC workload, remain below the current 5,000-request monthly Place Details Pro free usage cap if they fall in the same billing month. Actual Cloud billing is not visible from this repository, so billing is not asserted here.

Enterprise official-site recovery remains separately budget-gated and manual-only.

## Ordered full-collection work from here

1. Review the **3 medium + 49 review** OSM candidates and promote only independently safe matches.
2. Recalculate and resolve the complete source-outcome queue for all **656 production** rows.
3. Perform independent-source discovery for the remaining **2,151 inventory-only** identities, prioritizing reusable brand/store-locator and public-source templates rather than one-by-one manual work.
4. For each newly source-confirmed identity, extract all safe fields in the same pass: cuisine, address, normalized opening hours, explicit budget, menu/featured dishes, and strict recommendation evidence where present.
5. Record an explicit terminal/unknown reason when a field or identity cannot be safely resolved; do not force non-null coverage.
6. Keep the full 2,804 ledger as the completion denominator until a deliberately refreshed inventory snapshot is generated.

## Completion definition

Full collection is complete when **2,804 / 2,804 identities have an auditable final maintenance outcome**, not when every Place ID is forced into public production and not when every optional field is non-null.

Current full-range collection has completed the identity-seed sweep for all 2,804 identities and has begun independent-source promotion; independent-source resolution and field completion remain in progress.
