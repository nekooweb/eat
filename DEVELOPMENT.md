# Eat Development Plan

Updated: 2026-09-06

## Current milestone

`TOKYO / 地区1️⃣` is in **bulk source/field completion**.

The product/runtime layer is already usable. The current work is data quality and coverage: identify exact branch sources, fill durable factual fields conservatively, and keep Google Places usage as a bounded identity/discovery aid rather than the long-lived restaurant database.

The project now has a repeatable bulk path instead of a one-restaurant-at-a-time search loop.

## Current audited production state

Latest validated bulk build after the 2026-09-06 acceleration pass:

- exact in-scope Google food-business identity inventory: **2,804 / 2,804**;
- OSM independent-source candidates: **1,273**;
- Google QC-v4 source rows: **658 verified / 615 rejected / 0 pending**;
- canonical production entities: **648** unique verified Place IDs;
- production IDs present in the exact Google inventory: **645**;
- usable Tabelog/official source-backed production: **396 / 648 = 61.1%**;
- explicit terminal source resolutions: **44**;
- source outcomes accounted for: **440 / 648 = 67.9%**;
- unresolved current-production source queue: **208**;
- non-generic cuisine: **571 / 648**;
- budget known: **192 / 648**;
- address known: **261 / 648**;
- reference hours/holiday information: **304 / 648**;
- reviewed Chinese recommendations: **27 / 648**;
- legacy representative dishes: **72 / 648**;
- 百名店: **22**.

Distance pools remain:

- <=300 m: 137;
- <=500 m: 220;
- <=800 m: 359;
- <=1,200 m: 648.

## What “full data” means

Three different completion levels must not be conflated:

1. **Exact Google identity inventory — complete.** `data/area1_google_ids.json` contains 2,804 / 2,804 in-scope operational food-business Place IDs inside the strict 1.2 km Area1 circle.
2. **Current canonical production — 648 entities.** These have independently maintained geospatial/source identities that passed Google identity QC and are safe for the public recommendation pool.
3. **Full-information completion — still in progress.** Exact-inventory IDs without a verified independent-source identity remain **2,161**. Current production also still has field gaps.

A Google Place ID in the exact inventory is not automatically promoted into production. Expanding 2,804 identities into a durable public database requires an independent source identity and cannot be achieved safely by persisting Google Places display payloads.

## 2026-09-06 accelerated bulk acquisition pass

### Result

This pass replaced most manual source discovery with a staged bulk workflow.

Starting point:

- source-backed: 356;
- source outcomes: 400;
- unresolved: 248;
- address: 207;
- reference hours: 302;
- non-generic cuisine: 568;
- strict recommendations: 10.

Final audited result:

- source-backed: **396** (+40);
- source outcomes: **440** (+40);
- unresolved: **208** (-40);
- address: **261** (+54);
- reference hours: **304** (+2, structured evidence only);
- non-generic cuisine: **571** (+3, structured evidence only);
- strict recommendations: **27** (+17).

All canonical build, repository audit, source-binding audit and normalized-field audit checks passed.

### Reusable official-site index

`data/official_candidate_index.json` is now a reusable maintenance index of independently fetched official pages.

Current index:

- records: **187**;
- latest zero-Google refetch: 186 pages fetched successfully;
- canonical-name matched: 161;
- pages with structured facts: 83;
- pages with visible Area1 address signals: 148;
- pages with recommendation signals: 126;
- same-host menu links are retained where useful.

The index stores the **final URL returned by the website fetch**, not the Google Places `websiteUri` response field. This allows future field extraction runs to re-fetch official pages without repeating Places calls.

### Conservative automatic official enrichment

Generated shard:

- `data/source_enrichment_autoofficial.js`.

Latest full generation contains:

- 74 exact-Place-ID official enrichment rows;
- 54 new address claims;
- 2 opening-hours claims;
- 3 cuisine claims;
- 19 branch-specific name/source-only bindings.

Safety rules:

- source-resolution conflicts are skipped;
- an auto row attaches only to an already verified production Place ID;
- free-text historical announcements are **not** promoted as current opening hours;
- current hours require matching structured data (JSON-LD/opening-hours object) tied to an Area1 address;
- cuisine auto-promotion requires matching structured `servesCuisine`-type evidence;
- visible addresses are accepted only after the official page is already tied to the exact Place ID, the page matches the canonical restaurant name, the address is in Area1 (`千代田区` / `文京区`), and the canonical name is non-trivial;
- generated enrichment is always rebuilt from a baseline that excludes the prior auto shard, preventing self-referential pruning.

### Reviewed recommendations

`data/recommended_dishes.js` is exact-Place-ID keyed and intentionally sparse.

A recommendation is written only when the reviewed source explicitly identifies a concrete item as recommended, popular, signature, specialty, famous/名物, 看板, 自慢 or equivalent. Generic menu items and old representative-dish data are not promoted automatically.

Current reviewed recommendation coverage: **27 restaurants**.

Examples added in this pass include Thai suki, 大金星's signature yakisoba, 川府's Peking duck / dandan knife-cut noodles, folk burgers' popular burgers, ベト屋's pho, 漢陽楼's lion's-head meatball and 淡路坂珈琲's shrimp-and-egg sandwich.

## Google API cost control

The existing `GOOGLE_MAP_API` remains the single project key.

### This pass

The cost-sensitive recovery job made exactly **100** Place Details requests using the Enterprise `websiteUri` field mask. At the current list-price marginal rate of USD 20 / 1,000 requests, the **worst-case billable exposure is USD 2.00**.

Actual billing may be lower or zero if the account still has unused monthly free-tier quota; repository Actions cannot see the billing account, so project reporting uses the conservative worst-case figure.

The recovery produced:

- 24 additional independently fetched usable official-site URLs;
- 18 of those belonged to previously unresolved current-production identities;
- official index expanded from 163 to 187.

### Guardrails

- no further paid Google discovery was run after reaching the USD 2 worst-case cap;
- `.github/workflows/recover-official-sites.yml` is now **manual-dispatch only**;
- the generic official discovery workflow defaults to a bounded request batch instead of unlimited discovery;
- routine official-index extraction uses only persisted independent HTTPS website URLs and makes **zero Google API calls**;
- Maps Embed is separate from the maintenance discovery loop and remains the per-store result map with Leaflet fallback.

## Tabelog bulk extraction result

A bulk extractor for already-bound Tabelog URLs was implemented, but GitHub-hosted Actions received HTTP 403 for **211 / 211** tested bound pages.

Therefore:

- no anti-bot bypass is used;
- the Tabelog extractor is diagnostic/manual only;
- current automated bulk completion prioritizes restaurant/brand official sites;
- existing reviewed Tabelog records remain valid durable sources and are not removed.

## Runtime/product contract

The public site remains static GitHub Pages:

- strict production boundary <=1,200 m;
- Google Place ID required for production identity;
- cuisine exclusion, budget and distance filters;
- exactly three distinct results whenever >=3 eligible restaurants exist;
- cuisine diversity is a preference, not a hard requirement;
- Web Crypto randomness;
- 百名店 weight 2.2 vs ordinary 1.0;
- no rating/review-count popularity ranking.

Result views:

1. three-store overview: Leaflet + OpenStreetMap;
2. one per-store Google Maps Embed place map using verified Place ID, with Leaflet fallback;
3. three restaurant cards;
4. three-store comparison table;
5. direct Google Maps navigation/business link.

Opening/holiday information remains descriptive only; it does not yet implement a reliable “open now” exclusion.

## Data pipeline

```text
OSM / curated independent candidates
          |
          v
Google identity QC ----> exact Google ID inventory (coverage audit)
          |
    verified Place ID
          |
          +-------------------------------+
          |                               |
          v                               v
reviewed Tabelog/official source    official candidate index
          |                               |
          |                        zero-Google site refetch
          |                               |
          +-----------+-------------------+
                      v
              source_enrichment*.js
                      +
              reviewed recommendations
                      |
                      v
          build_production_dataset.mjs
                      |
                      v
             production_area1.js
                      |
                      v
                    browser
```

The browser never performs source matching or source enrichment.

## Ordered next work

### Priority 1 — remaining 208 current-production source outcomes

Continue exact Place-ID source reconciliation, prioritizing official pages already discoverable without new paid Google requests. Ambiguous branches stay unresolved rather than being force-bound.

### Priority 2 — field completion for 648 production rows

Largest remaining gaps:

- budget: 192 known / 456 missing;
- reference hours: 304 known / 344 missing;
- address: 261 known / 387 missing;
- non-generic cuisine: 571 known / 77 generic;
- explicit recommendation: 27 known / unknown by design for the remainder.

Recommendations should remain sparse; no target percentage is required if sources do not make a recommendation claim.

### Priority 3 — exact-inventory expansion

2,161 exact Google inventory IDs still lack a verified independent-source identity. This is the long-term expansion queue.

Do not spend large Places quotas or persist full Google Details responses merely to inflate production count. Expansion should proceed in bounded batches when an independent OSM/official/Tabelog identity can be established.

### Priority 4 — opening/holiday exclusion

Implement only after schedule semantics and coverage are strong enough to avoid systematically excluding restaurants with missing or stale data.

### Priority 5 — future scopes

- TOKYO / 地区2️⃣;
- SHIZUOKA;
- optional local recommendation history after persistence/privacy semantics are defined.

## Validation evidence

Key successful Actions runs in this pass:

- existing official-source batch extraction: `33974331919`;
- Google-assisted initial official discovery: `33974475744`;
- zero-Google safe bulk rebuild: `33975776551`;
- cost-capped official recovery: `33975941715`;
- final clean-baseline zero-Google rebuild: `33976128092`.

The final clean-baseline build is the authoritative state for the metrics at the top of this document.
