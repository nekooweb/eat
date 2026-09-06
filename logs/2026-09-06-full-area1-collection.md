# Full Area1 Collection — 2026-09-06

## Goal

Switch the project from incremental field enrichment to collection-first processing of the entire confirmed Area1 identity universe.

## Inventory confirmation

The current snapshot contains exactly 2,804 unique food-business Place IDs within the configured <=1,200 m Area1 scope. Google Aggregate exact count and the geodesic partition inventory both equal 2,804. `complete`, `coverageVerified`, and `independentCountVerified` are all true.

## Full identity sweep

Run `34018919233` processed all 2,159 identities that were inventory-only at the beginning of this pass. It requested only transient Place Details Pro QC fields and did not request `websiteUri`.

Initial result: 1,715 operational food identities, 1 permanently closed identity, and 443 transient fetch errors.

Run `34019078280` retried only the 443 errors at lower concurrency. All 443 resolved in the first retry wave. Final status across the original 2,159 rows: 2,158 operational food, 1 permanently closed, 0 fetch errors.

Google display names, addresses, and coordinates were used only inside short-lived Actions audit data and were not committed. The durable `area1_full_collection_queue.json` stores Place IDs, status classes, and independent OSM candidate facts only.

## OSM global match

The 2,158 operational identities were globally compared against 1,273 OSM rows.

- high: 41
- medium: 3
- review: 49
- low: 1,904
- none: 161

This replaces the old situation where 2,103 inventory-only identities had no practical matching queue at all.

## High-confidence promotion

Run `34019143688` applied collision and historical-QC protection to the 41 high-confidence candidates.

- promoted: 8
- blocked: 33

Most blocked candidates conflicted with an existing terminal QC result such as an old outside-scope pairing, or reused an OSM row already verified to another Place ID. Those candidates were intentionally not force-promoted.

Production changed from 648 to 656. Cuisine-known changed from 571 to 578. Address, budget, normalized hours, featured dishes, and strict recommendations were unchanged.

All canonical/repository/source/normalized-field/identity audits passed.

## Rebuilt ledger

Run `34019222744` rebuilt the 2,804-identity ledger after the expansion.

- production total: 656
- production in inventory: 653
- production outside inventory snapshot: 3
- inventory-only: 2,151
- verified independent source inside inventory: 651
- rejected-candidate queue: 51 identities / 58 links
- no prior OSM-QC ledger row: 2,100

The 2,100 count now means “no verified OSM admission path”, not “identity has never been collected”: every one of those identities completed the transient Google identity sweep in this pass.

## Cost and policy

This pass did not request Place Details Enterprise `websiteUri`. It used the existing `GOOGLE_MAP_API` secret only for minimum Pro-level identity/QC fields. Google display payload remains transient and is not used as the durable public restaurant database.

Enterprise official-site recovery remains manually budget-gated.

## Next full-collection stages

1. Resolve the 3 medium and 49 review OSM matches.
2. Recalculate source outcomes across all 656 production rows and eliminate the unresolved source queue.
3. Discover independent sources for all remaining 2,151 inventory-only identities in batch, using reusable store-locator/official-source patterns where possible.
4. Extract all safe fields during the same source pass instead of repeatedly revisiting each restaurant for individual fields.
5. Give every one of the 2,804 identities an auditable final outcome.
