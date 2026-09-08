# 2026-09-08 — Independent dish-source recovery: Overture -> strict review -> OSM website lane

## Objective

Continue source-backed dish completion after retained-source and already-bound official URL discovery reached diminishing returns.

This work targets the **301** public restaurants whose recommendation queue action is:

`find_independent_dish_source`

At baseline, the retained `official_candidate_index.json` produced **0** proposal rows for these targets.

## Constraints kept unchanged

- frozen Google Place-ID catalog: **2,804**;
- public named runtime: **1,415**;
- no paid Google data API calls;
- Google display payload not used for source discovery;
- no cuisine/name/brand dish inference;
- no generic dish fallback;
- proximity-only source binding forbidden;
- proposal generation cannot change identity;
- proposed websites cannot create dish evidence before review;
- R/F semantics remain unchanged downstream;
- source review may add a source URL only after independent page validation.

## Stage 1 — Overture proposal generator expansion

Updated:

`scripts/build_independent_dish_source_candidate_plan.mjs`

Initial implementation commit:

`8d9f23c722ee06b3ad2a8a2368e6f6cef90d1630` — `Expand independent dish source candidates with Overture`

The generator consumes the retained Area1 Overture snapshot in addition to the existing official candidate index.

Candidate filtering uses:

- independent website URL required;
- normalized restaurant-name similarity;
- current independent runtime coordinates;
- maximum 120 m Overture candidate distance;
- minimum strong name/distance combinations;
- winner-margin ambiguity control;
- one Overture native ID cannot be proposed to multiple frozen Place IDs;
- social/Google/OpenStreetMap URLs excluded;
- proposal-only output, with no identity or dish mutation.

### First proposal result

Workflow run:

`34187915362` — **success**

Generated plan commit:

`e46358b` — `Update independent dish source candidate plan`

Metrics:

- current source-less recommendation targets: **301**;
- Overture snapshot rows: **3,908**;
- Overture rows carrying candidate websites: **2,516**;
- targets with nearby Overture candidates: **301 / 301**;
- proposal rows accepted for review: **36**;
- high-confidence proposal rows: **24**;
- proposal coverage: **12.0%**;
- name-incompatible candidates rejected: **252**;
- weak candidates rejected: **13**;
- ambiguous winner rejected: **0**.

The large reject count is intentional: Overture proximity alone is not enough.

## Stage 2 — strict live website review

Added:

`scripts/review_independent_dish_source_candidates.mjs`

Commit:

`f81938779ccd7bfe5a3e8682256e7b979b9f0262` — `Add strict review for independent dish source candidates`

Workflow:

`.github/workflows/review-independent-dish-sources.yml`

Commit:

`d18ec89d1144c0d3fe123eecb74785fb571bb337` — `Automate strict independent dish source review`

A site is not accepted merely because its domain matches a brand. It requires strong page-native name evidence and, for a generic/root page, independent location confirmation through structured geo/address or visible address agreement.

The review output is source-only. It cannot mutate name, coordinates, identity or dishes.

### First review exposed an aggregator-policy bug

First strict-review run:

`34188054647` — **success**

Initial result:

- high-confidence rows reviewed: **24**;
- approved: **3**;
- rejected: **21**.

Manual inspection of all three approved rows showed that every accepted URL was on Rakuten Gurunavi (`r.gnavi.co.jp`). The pages had strong restaurant-name and geo evidence, but Gurunavi is a third-party restaurant directory/aggregator, not an independent restaurant source.

Therefore **none of these three rows was promoted into runtime or dish evidence**.

This exposed a mismatch between the declared policy (`thirdPartyAggregatorUrlsExcluded`) and the first URL filter implementation.

## Stage 3 — aggregator exclusion corrected

Updated proposal filtering:

`2e1fde22f4c5279c3553dc1a4ccdbae339fb405d` — `Exclude third-party aggregators from independent source plan`

Explicitly excluded families now include:

- Gurunavi;
- Retty;
- Tripadvisor;
- Yelp;
- Foursquare;
- Yahoo Loco / PayPay Gourmet;
- AutoReserve;
- Ekiten;
- Ikyu Restaurant;
- Suntory Bar-Navi;
- plus the existing Google/social/Tabelog/Hot Pepper/OpenStreetMap direct-source exclusions in the Overture lane.

Corrected proposal run:

`34188180511` — **success**

Generated data commit:

`b78eb7f2d3993182743563f120cfafe037e18ede` — `Update independent dish source candidate plan`

Corrected metrics:

- source-less recommendation targets: **301**;
- proposal rows: **32**;
- high-confidence proposal rows: **20**;
- proposal coverage: **10.6%**;
- explicit aggregator URL values excluded: **328**;
- nearby Overture candidates: **301 / 301**;
- name rejection: **257**;
- weak rejection: **12**;
- ambiguous rejection: **0**.

The reduction from 36/24 to 32/20 is expected and is the correct direction: directory URLs must not be counted as independent source recovery.

## Stage 4 — defensive review validation and re-run

A second defensive boundary was added to the review workflow:

`ed13a34b83fdbab7d4637cdb7f1fbc9d00fc04a2` — `Block aggregator URLs in strict source review`

This makes the pipeline fail if an excluded aggregator somehow reaches the reviewed source output even if the proposal filter regresses later.

Corrected strict-review run:

`34188226250` — **success**

Results:

- true-independent high-confidence rows reviewed: **20**;
- approved: **0**;
- rejected: **20**;
- rows with fetch errors: **5**;
- `no_strong_page_name_evidence`: **14**;
- `generic_root_missing_location_confirmation`: **1**;
- `fetch_failed`: **5**.

Cleanup data commit:

`3af4b65` — `Update strict reviewed independent dish sources`

The cleanup removed the three earlier Gurunavi approvals. Current reviewed Overture independent-source overlay therefore contains **0 approved rows**.

### Interpretation

The Overture website field is useful for proposal discovery, but many values resolve to:

- generic brand homepages;
- third-party directories;
- pages without branch-level restaurant identity evidence;
- inaccessible/stale pages.

The correct response is **not** to relax review thresholds. Doing so would incorrectly apply brand/global menus to individual branches.

## Stage 5 — recover door-level website metadata from OpenStreetMap

Inspection of `scripts/build_area1_osm.py` found another concrete data-loss point:

- the Overpass query already uses `out center tags`, so full OSM tags are available;
- the generated `data/area1_osm.js` previously retained name, coordinates, address and opening hours;
- `website` and `contact:website` tags were not serialized.

This meant potentially useful door-level public source URLs were being discarded before source recovery.

### OSM serializer update

Commit:

`03b22827f6a7fca4660e0fd386b571b584cbd56b` — `Retain OSM website metadata for source recovery`

The OSM builder now retains valid HTTP(S) values from:

- `contact:website`;
- `website`.

They are stored as `sourceWebsites` on the OSM candidate row.

Hard boundary remains:

- OSM `googleStatus` stays `pending`;
- website metadata is source metadata only;
- OSM website presence does not bind a frozen Google Place ID;
- no identity promotion occurs in the OSM builder.

### OSM proposal/review scripts

Added:

`scripts/build_osm_independent_dish_source_candidate_plan.mjs`

Commit:

`62726d3411e0030100157f181ff6cfcab2317e25` — `Build OSM website source recovery candidates`

The OSM plan requires:

- current `find_independent_dish_source` target only;
- OSM POI with retained independent HTTP(S) website;
- bounded distance (maximum 60 m);
- strong normalized name agreement;
- ambiguity margin against competing nearby OSM POIs;
- one OSM native POI cannot fan out to multiple frozen Place IDs;
- proposal-only output.

Added strict OSM website reviewer:

`scripts/review_osm_independent_dish_source_candidates.mjs`

Commit:

`567aedd507849da2c72efc5d0e606e42f52306aa` — `Add strict OSM website source review`

The OSM website reviewer applies the same source boundary:

- high-confidence proposals only;
- strong page title / Schema.org restaurant-name evidence;
- generic root/brand homepage requires page-native location evidence;
- same-site redirects only;
- known aggregator/social/Google sources excluded;
- source-only output;
- no identity/core/dish mutation.

### Refresh workflow integration

Updated:

`.github/workflows/refresh-area1.yml`

Commit:

`37d9582d2e97579f3a2f802244c52fc415649452` — `Extend Area1 refresh with OSM source recovery`

The refresh now runs:

```text
Overpass OSM refresh
  -> retain website/contact:website metadata
  -> build OSM proposal-only plan
  -> strict website review
  -> zero-paid-API re-audit
  -> commit OSM + proposal + reviewed-source artifacts together
```

The workflow is serialized and rebases on latest main before pushing generated artifacts.

## Current status

The OSM source-recovery refresh is running. Final counts for:

- OSM rows with website metadata;
- OSM proposals against the 301-source gap;
- high-confidence proposals;
- strict-reviewed approvals;

will be appended after the workflow completes.

No Overture/Gurunavi candidate has been promoted to runtime, and the public recommendation/featured dataset remains protected by the existing R/F and source-review boundaries.
