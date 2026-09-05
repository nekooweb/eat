# Area1 1.2 km Completeness Audit

Updated: 2026-09-05

## Current result

The Area1 identity-count phase is now **complete and independently audited** for the project's food-business scope.

- strict radius: **1,200 m**
- exact Google Places Aggregate count: **2,804** operational in-scope food businesses
- enumerated unique Place IDs: **2,804 / 2,804**
- inventory status: `complete:true`
- coverage verification: `coverageVerified:true`
- independent count verification: `independentCountVerified:true`
- inventory method: `places_aggregate_geodesic_partition_boundary_qc_v3`
- checked: 2026-09-05

The persisted inventory is `data/area1_google_ids.json` at commit `81d874558e556a6942e81606a7855de455d8a7b4`.

This count is the complete number for the repository's configured **food-business universe** (restaurant/cafe/bakery/bar/takeaway and related food-service types). It is not a count of every retail shop or every Google Maps POI category.

## How the exact inventory was established

The old 1,613-ID inventory was a Nearby Search union and was not treated as complete because of per-query result limits.

The replacement workflow now:

1. requests `INSIGHT_COUNT` for the exact 1,200 m circle;
2. builds geodesic sector polygons rather than using a linear latitude/longitude approximation;
3. requests a count before Place IDs for every sector;
4. recursively splits sectors above the 100-place `INSIGHT_PLACES` limit;
5. enumerates IDs only after a sector is small enough;
6. uses a 1,205 m guard band only when the inscribed sector union differs from the exact circle count;
7. requests transient Place Details location/status only for guard-band candidates;
8. trims those candidates back to the strict 1,200 m circle;
9. refuses completion unless the final unique ID count equals the independent exact Aggregate circle count.

Successful run `33953718846` produced:

- exact circle count: 2,804;
- geodesic 1,200 m sector union: 2,801 IDs;
- 1,205 m guard-band union: 2,835 IDs;
- guard-band-only candidates checked: 34;
- candidates recovered inside the strict circle: 3;
- final unique IDs: 2,804;
- Aggregate requests: 238;
- transient Place Details requests: 34.

The old inventory had 1,613 IDs. Relative to it, the exact inventory contains:

- **1,215 newly discovered IDs**;
- **24 old IDs no longer present** under the current exact operational/type/radius criteria.

## Full OSM verification completed in the same expansion pass

All current OSM source candidates have now been processed through Google QC-v4:

- OSM source candidates: 990;
- verification cache entries: **990 / 990**;
- verified source rows: 526;
- rejected source rows: 464;
- pending: 0.

Current rejection reasons:

- `outside_1_2km`: 258;
- `location_mismatch`: 80;
- `closed_permanently`: 67;
- `name_mismatch`: 40;
- `non_food_google_type`: 14;
- `no_google_place`: 5.

The full verification run expanded the canonical production dataset from the previous 269 entities to **517 unique production entities**.

## Current production coverage after expansion

Latest passing Pages build/deploy after the full OSM verification and exact inventory:

- production entities: **517**;
- unique production Place IDs: 517;
- production entities represented in the exact Google inventory: 515;
- cuisine known: 425;
- budget known: 95;
- schedule/holiday known: 202;
- dishes known: 20;
- display address known: 95;
- current Tabelog/official-source-backed production: 237;
- 百名店 rows: 22.

Distance pools are now:

- <=300 m: 116;
- <=500 m: 192;
- <=800 m: 295;
- <=1,200 m: 517.

Therefore the previously empty 800–1,200 m ring now contains **222 production entities**.

## Identity reconciliation gap

The exact inventory and the production dataset answer different questions.

Exact inventory audit:

- exact Google inventory IDs: 2,804;
- unique verified Google IDs represented by the current QC cache: 516;
- verified IDs covered by the exact inventory: 513;
- inventory IDs without a verified independent-source identity: **2,291**;
- rejected source-match Place IDs that are nevertheless present in the exact inventory: 91;
- verified source Place IDs outside the current exact inventory: 3.

The `2,291` figure is the principal **identity-reconciliation queue**. It does not mean 2,291 confirmed missing production restaurants: some will correspond to duplicate/alternate source rows, records that require independent-source discovery, or identities that need further reconciliation before admission.

## Full-information completion state

Source outcome accounting has not yet caught up with the production expansion.

Current source queue:

- production entities: 517;
- usable Tabelog/official bindings: 237;
- explicit terminal source resolutions: 32;
- source outcomes already accounted for: 269;
- newly unresolved production identities: **248**;
- current source-resolution coverage: about 52%.

The immediate full-information queue should therefore be processed in this order:

1. **248 newly admitted OSM-backed production identities** — they already have independent name/location + verified Place ID, so Tabelog/official branch resolution and field extraction can proceed directly.
2. **2,291 exact-inventory IDs without a verified independent-source identity** — use transient Google identity/location only as a discovery aid, then establish an independent durable source before admission.
3. Reconcile the 91 exact-inventory IDs that appear in rejected source matches to distinguish a bad source-to-Google match from a genuinely unusable business identity.
4. Review the small verified-outside-inventory exception set separately rather than weakening the strict 1,200 m gate.

## Persistent full-information fields

Google Places remains the identity/QC layer, not the durable application database. Persistent restaurant facts continue to come from OSM, Tabelog and restaurant/organization official sources.

Target fields per branch:

- exact display/branch name;
- cuisine/category;
- independent address;
- independent coordinates/distance;
- lunch budget;
- dinner budget;
- opening hours;
- regular holidays/closure notes;
- representative dishes;
- Tabelog and/or official source reference;
- Google Place ID for identity/navigation;
- source/QC outcome and review date;
- 百名店 metadata where applicable.

Unknown fields stay unknown; values are not inferred from cuisine stereotypes or neighboring businesses.

## Completeness definitions

Two completion states must remain separate:

### Identity-count complete

**Achieved on 2026-09-05.**

Requirements:

- exact 1,200 m Aggregate count exists;
- unique Place-ID inventory size equals that count;
- `complete`, `coverageVerified` and `independentCountVerified` are all true;
- the exact-coverage audit passes.

Current result: **2,804 / 2,804**.

### Full-information complete

Not yet achieved.

Requirements:

- every exact-inventory identity has an explicit reconciliation outcome;
- every admitted production entity has a usable source or documented terminal source resolution;
- persistent target fields are reviewed with field-level provenance or an explicit reviewed-missing reason;
- duplicate/closed/non-food/outside exceptions are recorded rather than silently dropped;
- canonical/runtime/source audits pass.

## Validation evidence

- exact discovery workflow run: `33953718846` — success;
- exact inventory commit: `81d874558e556a6942e81606a7855de455d8a7b4`;
- strengthened independent-count gate: `9ba11132310fe3adf40b205021ecff7adc6bd39b`;
- Pages build/deploy run after the exact inventory: `33953786379` — success;
- canonical build: 517 entities / 517 unique Place IDs;
- repository audit: pass;
- source-binding audit: pass.
