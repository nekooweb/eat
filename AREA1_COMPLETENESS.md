# Area1 1.2 km Completeness Audit

Updated: 2026-09-05

## Goal

Build an auditable inventory of **all in-scope food businesses within the strict 1,200 m Area1 circle**, then reconcile every identity into the canonical production dataset with independent-source field enrichment.

This document distinguishes three different numbers that must not be conflated:

1. **Google coverage inventory** — Place IDs discovered for coverage/reconciliation.
2. **Source candidates** — OSM / curated / reviewed independent-source records presented for identity verification.
3. **Canonical production entities** — unique verified Place IDs admitted after QC and canonical merging.

A large discovery list is not proof of complete geographic coverage.

## Baseline before this completeness pass

From the 2026-09-05 reviewed baseline:

- OSM source candidates: 990
- Google QC-v4 terminal cache entries: 499
- verified source candidates: 274
- rejected source candidates: 225
- OSM candidates with no Google verification-cache entry: 491
- canonical production entities: 269
- current canonical coverage stops at about 741 m despite a configured 1,200 m product boundary
- legacy Google coverage inventory: 1,613 unique Place IDs

The 1,613-ID inventory came from a gridded Nearby Search discovery workflow. Nearby Search result limits mean that inventory is a lead set, not an exact all-business count.

## Work started in this pass

### A. Full verification of the remaining OSM pool

The verification workflow now supports an explicit `all` mode (`GOOGLE_VERIFY_LIMIT=0`) in addition to the historical half mode.

A full-pool run was triggered on 2026-09-05 to process all 491 source candidates that had no Google QC-v4 cache entry at the baseline.

This task expands the independently sourced candidate pool. It is useful but **cannot by itself prove 1,200 m completeness**, because OSM completeness is not guaranteed.

### B. Exact Google coverage count + enumerated Place-ID inventory

`scripts/discover_google_area1.py` was replaced with a completeness-audited Places Aggregate workflow:

1. Request `INSIGHT_COUNT` for the exact 1,200 m Area1 circle and the project food-business type filter.
2. Partition the area into angular sectors.
3. Request `INSIGHT_COUNT + INSIGHT_PLACES` per sector.
4. Recursively split any sector containing more than 100 matching places so every enumerated sector is within the Place-ID return limit.
5. Extend sector polygons slightly beyond 1,200 m to avoid polygon-chord edge loss.
6. Use transient Places Details `location` + `businessStatus` only to trim the sector union back to the exact 1,200 m operational circle.
7. Persist only Place IDs and audit metadata.
8. Refuse to write the inventory unless the final unique in-circle Place-ID count exactly equals the independent Aggregate circle count.

The output schema now includes `count`, `complete`, request counts, method and search types. A successful output with `complete: true` is the gate for claiming a Google-derived exact Area1 identity count.

## Current blocker: Places Aggregate API key authorization

The first completeness run failed before any inventory write with:

- HTTP 403 `PERMISSION_DENIED`
- reason: `API_KEY_SERVICE_BLOCKED`
- service: `areainsights.googleapis.com`
- method: `google.maps.areainsights.v1.AreaInsights.ComputeInsights`

Therefore:

- the legacy 1,613-ID inventory remains untouched;
- no exact 1,200 m count is claimed yet;
- the new algorithm has not falsely promoted an incomplete result.

To unblock the exact count, enable **Places Aggregate API** for the Google Cloud project behind the repository secret `GOOGLE_MAP_API` and authorize that service in the key's API restrictions. Then rerun `Discover Google Area1`.

## Completeness gate

Area1 must not be labelled geographically complete until all of the following are true:

- `data/area1_google_ids.json` uses the completeness-audited Aggregate method;
- `complete === true`;
- enumerated unique in-circle Place IDs equal the exact Aggregate count;
- every enumerated Place ID has a reconciliation state against production / independent-source research;
- all newly admitted production identities pass the existing QC-v4 and <=1,200 m gates;
- source-outcome and field-review accounting is recorded for newly admitted identities;
- repository/runtime/source audits pass.

## Full-information enrichment after identity completeness

Google Place Details remains transient QC input. Full persistent restaurant fields should continue to be sourced from OSM, Tabelog and restaurant-official pages under the existing repository policy.

For every Place ID in the exact inventory, reconciliation should end in one explicit state:

- already canonical;
- independent source found -> verify/admit/enrich;
- duplicate/merged identity;
- closed/non-food/outside after fresh QC;
- independent source unresolved / research hold.

Priority persistent fields remain:

- display name / branch identity
- cuisine/category
- display address
- lunch budget
- dinner budget
- opening hours / regular holiday
- representative dishes
- Tabelog and/or official source reference
- Google Place ID for identity/navigation
- current source/QC outcome and review date

## Definition of “complete number”

The number shown as the complete 1.2 km food-business count must be the successful exact Aggregate `count`, not:

- the current production count;
- the number of OSM candidates;
- the legacy 1,613-ID Nearby Search union;
- a partially processed verification-cache count.
