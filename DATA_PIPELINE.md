# Eat Data Pipeline

## Purpose

This document defines how Area1 restaurant candidates are discovered, assigned a trustworthy business identity, bound to durable factual sources, enriched, admitted into production and audited.

Current core rule:

> **A production entity needs a verified Google Place ID, while durable display/recommendation metadata is maintained independently of Google Places response content. Every current production identity must also reach a terminal source-resolution state.**

Google is the identity/QC gate. OSM, Tabelog, restaurant/organization official sources and legacy curated records provide independently maintainable metadata and coverage leads.

## 1. Source roles

### Google Places API (New)
Used for:
- durable Google Place ID identity;
- transient verification of location, business status and food-related type;
- Google-side Area1 identity coverage discovery.

Persistent Google-derived state is restricted to the Place ID and compact verification/QC state. Display name, formatted address, coordinates, Maps URI, business status and type returned by Places remain transient maintenance inputs rather than the long-lived restaurant database.

### OpenStreetMap
Independent Area1 POI/geospatial source.

Useful persistent fields:
- source ID;
- local name/category;
- independent coordinates;
- opening-hours tags where available;
- independent coverage candidates.

An OSM row does not become production-ready until it receives a verified Google Place ID.

`build_area1_osm.py` keeps OSM rows whose names overlap legacy curated records and marks them `curatedOverlap:true`. Those rows are identity bridges: after Google verification, historical metadata can attach to a verified Place ID instead of remaining isolated by name.

### Tabelog / official sources
Preferred durable factual sources for an already identified business/branch.

Maintenance shards:
- `data/source_enrichment.js`;
- `data/source_enrichment_*.js`.

Every enrichment record is keyed by an existing verified Google Place ID and should carry field-level `sourceRefs` provenance.

Typical factual fields:
- exact/current name;
- cuisine refinement;
- lunch/dinner budget;
- representative dishes;
- opening hours / regular holidays;
- current closure/listing state;
- 百名店 status/year/category when the correct branch is confirmed.

A source-enrichment row is always `sourceOnly:true`. It **cannot self-verify and cannot create a production identity by itself**. It attaches only when the Place ID already exists in the verified identity groups.

Current non-geospatial field preference:
1. official restaurant/organization source;
2. Tabelog source-backed record;
3. legacy curated record;
4. generic OSM category metadata.

Coordinates remain independent of Google Places and prefer OSM.

### Explicit source-resolution ledger
Not every production identity can safely attach to a current usable Tabelog/official branch page.

Maintenance shards:
- `data/source_resolution.js`;
- `data/source_resolution_*.js`.

Supported terminal statuses:
- `ambiguous` — usually brand/chain name without enough branch metadata;
- `listing_hold` — a matching listing exists but current operating status is not established;
- `no_current_usable_source` — evidence exists but the matched current source is explicitly unusable/closed;
- `source_not_found` — exact-name/area research did not locate a current usable Tabelog/official page.

Each resolution must contain:
- current canonical `googlePlaceId`;
- name;
- terminal status;
- reviewed reason;
- `checkedAt` date;
- one or more HTTPS evidence references.

A production identity must never have both a usable source binding and a terminal resolution at the same time.

These statuses are terminal for a source-research pass, not permanent business-status decisions. The current canonical builder does not consume the resolution ledger, so all 32 exception identities remain in the recommendation pool. Current Google identity/status QC remains authoritative for admission; source conflicts must trigger targeted review of that existing identity.

### Legacy curated records
Historical files such as `restaurants.js`, `area1_bulk.js` and `area1_more.js` remain bridge/enrichment inputs. They are not the preferred destination for new source research.

New Tabelog/official facts should be added to a Place-ID keyed source-enrichment shard with field-level provenance rather than as opaque name-only patches.

Missing values are never fabricated.

## 2. Production lifecycle

```text
OSM / legacy curated candidate
             |
             v
      Google identity QC
             |
       verified Place ID
             |
      +------+--------------------------+
      |                                 |
      v                                 v
OSM/legacy metadata            source resolution
      |                        /                \
      |             usable Tabelog/official   explicit terminal state
      |                      sourceRefs
      +-------------------------+
                    |
                    v
        build_production_dataset.mjs
                    |
                    v
          canonical Place-ID entity
                    |
                    v
            production_area1.js
                    |
                    v
                  browser
```

A separate Google Nearby Search coverage inventory detects Google identities not yet represented by a verified independent-source entity.

## 3. Current source-resolution completion state

Latest passing 2026-09-05 build:
- canonical production identities: 269;
- usable source-indexed identities: 237 (88.1%);
  - Tabelog: 221;
  - official: 16;
- explicit terminal resolutions: 32;
  - `ambiguous`: 27;
  - `listing_hold`: 2;
  - `no_current_usable_source`: 1;
  - `source_not_found`: 2;
- total source-resolved: **269 / 269**;
- source-resolution coverage: **100%**;
- unresolved: **0**;
- unattached enrichment records: 0.

Every current production identity has a recorded source outcome. The 100% figure includes all 32 exceptions and must be reported alongside the 88.1% usable-source coverage. It does not establish complete fields or current operating status.

The review at `8c01e125` also found 114 usable-source records with only `name` evidence. These bindings support the next field-extraction pass without repeating source discovery.

Three exception records need current Google status rechecks before the broader field pass: キッチン グラン and 明神丸 (`listing_hold`), and カフェ ド クルーセ (`no_current_usable_source`, matching Tabelog page recorded as closed). These are recorded source issues, not freshly confirmed business closures. All three are still production-eligible under normal filters. Dates, compact QC results and resulting eligibility must be recorded when the planned recheck is performed.

## 4. Source candidate discovery

### OpenStreetMap
Script:
- `scripts/build_area1_osm.py`.

Output:
- `data/area1_osm.js`.

This provides the broad independent candidate pool for Area1 and enforces the source collection radius.

Curated-name overlap is retained and marked so historical records can acquire verified identity links.

### Source-backed enrichment
Files:
- `data/source_enrichment.js`;
- `data/source_enrichment_*.js`.

Each record should contain:
- `profile`, `area`;
- reviewed branch/store `name`;
- verified-identity cross-reference `googlePlaceId`;
- `sourceOnly:true`;
- provider label (`Tabelog` or `official`);
- only factual fields supported by the source;
- one or more `sourceRefs` entries with provider, URL, check date and supported field names.

Example:

```js
sourceRefs: [{
  provider: 'Tabelog',
  url: 'https://tabelog.com/.../',
  checkedAt: 'YYYY-MM-DD',
  fields: ['cuisine', 'budget', 'hours']
}]
```

Do not store review prose, ratings/review counts, or unsupported inferred values as production metadata.

A source-binding pass may intentionally declare only `fields:['name']`. Field extraction can then be performed separately without re-resolving the business identity.

## 5. Google source-to-identity verification

Primary script:
- `scripts/verify_google_places.py`.

Primary workflow:
- `.github/workflows/verify-google-places.yml`.

For each selected independent source candidate:
1. Text Search requests only the candidate Google Place ID.
2. Place Details fields needed for QC are fetched transiently.
3. Reject permanently closed places.
4. Reject Google coordinates outside the Area1 1.2 km boundary.
5. Reject implausible source/Google coordinate matches.
6. Require a current food-related Google place type.
7. For geographically loose matches, require strong name compatibility.
8. Persist only source ID, status, Place ID, compact reason and QC version.

The verifier is keyed by source ID. Normalized restaurant name is not the identity key.

### Curated-overlap recovery
Targeted script:
- `scripts/verify_curated_google.py`.

It selects only OSM rows marked `curatedOverlap:true`, reuses normal QCv4 verification and skips existing terminal QCv4 cache entries.

Current coverage reporting shows 7 curated-overlap candidates still unresolved by this targeted path. They are a potential future production-expansion task, not a gap in the 269 current production identities.

### Name/transliteration rule
Google may return an English/romanized display name for a Japanese source name. Therefore:
- a very close geographic result can pass despite low literal similarity;
- a wider 45–300 m match needs stronger name evidence;
- >300 m source/Google separation is rejected.

## 6. Verification states

### `verified`
Source record maps to a Google Place ID and passes current QC.

### `rejected`
The source-to-Google match failed a defined QC rule, for example:
- `closed_permanently`;
- `outside_1_2km`;
- `location_mismatch`;
- `name_mismatch`;
- `non_food_google_type`;
- `no_google_place`.

### `pending`
API/network failure or other unresolved state; retry is allowed later.

A rejected source candidate means the source-to-Google match is not trusted. It does not prove that no restaurant exists.

### Unprocessed candidates and refresh semantics

At the reviewed baseline, 499 of 990 current OSM candidates have cache entries: 274 verified, 225 rejected, 0 pending. The remaining **491 candidates have no cache entry**. Keep this unprocessed count separate from `pending`; zero pending does not mean full-pool verification is complete.

Cache verification counts refer to source rows, while the canonical count refers to unique production Place IDs. Do not subtract the two as though both counted restaurants.

Existing terminal QC-v4 entries are skipped by ordinary verification, and current entries carry no verification timestamp. A deliberate targeted refresh path and dated compact QC outcomes are needed for the three operating-status conflicts. This documentation update does not implement that path or refresh those statuses.

## 7. Google-side coverage discovery

Script:
- `scripts/discover_google_area1.py`.

Workflow:
- `.github/workflows/discover-google-area1.yml`.

Purpose:
- query overlapping Area1 cells;
- split dense Nearby Search queries by current food-related types;
- mitigate the 20-result-per-query limit;
- use Google location/business status transiently for strict Area1/permanent-closure QC;
- deduplicate and persist only Place IDs.

Output:
- `data/area1_google_ids.json`.

Current preserved inventory: 1,613 unique Place IDs.

This is a coverage inventory, not a browser dataset and not a reason to re-run Google discovery during normal Tabelog/official field enrichment.

The current production distance pools are 116 within 300 m, 192 within 500 m and 269 within both 800 m and 1,200 m. The maximum canonical distance is about 741 m. No production restaurant currently represents the 800–1,200 m ring. Expansion should target that gap after the existing-source field work, using unprocessed independent candidates and the preserved identity inventory.

## 8. Legacy Google discovery migration

Historical full Places payload files were removed from the active branch after migration to the Place-ID-only inventory.

`migrate_google_inventory.py` preserves previously obtained identity results without API calls while avoiding long-lived full Google response storage.

## 9. Canonical build

Script:
- `scripts/build_production_dataset.mjs`.

Inputs include:
- legacy curated restaurant records;
- OSM candidates;
- manual Place-ID hints;
- generated Google verification state;
- historical 百名店 metadata;
- all `source_enrichment*.js` shards.

Admission rules:
- `profile === TOKYO`;
- `area === 地区1️⃣`;
- Google status `verified`;
- Google Place ID exists;
- durable independent distance exists and is <=1,200 m.

Canonical identity:
- one production row per unique Google Place ID.

Enrichment:
- verified identity groups are created first;
- `sourceOnly` Place-ID rows attach only to an already verified identity;
- no-ID historical rows may enrich only when normalized name maps uniquely to one verified identity;
- ambiguous name matches do not merge;
- source-backed Tabelog/official facts outrank legacy curated/OSM metadata for non-geospatial fields;
- OSM remains preferred for map coordinates/distance.

Output:
- `data/production_area1.js`, generated during CI/deployment.

## 10. Canonical production schema

Identity/scope:
- `id`;
- `profile`, `area`;
- `googlePlaceId`;
- `googleStatus`.

Independent display/geospatial metadata:
- `name`;
- `address`;
- `lat`, `lng`;
- `distanceMeters`;
- `cuisine`, `tags`.

Recommendation metadata:
- `lunch`, `dinner`;
- `dishes`;
- `openingHoursRaw`;
- `closedDays`;
- `closedNote`.

Award/weighting:
- `hyakumeiten`;
- `hyakumeitenYear`;
- `hyakumeitenCategory`;
- `randomWeight`.

Public provenance:
- compact `sources` provider labels only.

Detailed `sourceRefs` and source-resolution evidence remain maintenance-only and are intentionally omitted from the browser dataset.

Forbidden long-lived Places-response fields include Google-returned display name/address/coordinates/business status/type/Maps URI.

## 11. Field-enrichment phase

New data work should reuse existing Place-ID/source bindings after the priority operating-status rechecks. Source-outcome accounting and field completion are separate progress measures.

Current field completeness:
- cuisine refs: 123;
- budget refs: 95;
- dish refs: 15;
- hours refs: 94;
- closure/status refs: 103;
- 百名店 refs: 17;
- production budget known: 95 / 269;
- production schedule known: 154 / 269;
- production dishes known: 20 / 269;
- generic `餐厅`: 22 / 269;
- address known: 61 / 269;
- production 百名店: 19.

Supplementary counts reproduced from the canonical dataset/source shards:
- lunch budget: 88; dinner budget: 77; both meal budgets: 70;
- opening-hours text: 143; closure/holiday information without opening-hours text: 11;
- all 19 award rows carry year and category;
- 114 usable-source rows have name evidence only.

| Field gap | Missing among the 237 usable-source production identities |
| --- | ---: |
| Budget | 142 |
| Opening/regular-holiday information | 102 |
| Non-generic cuisine | 22 |
| Representative dishes | 217 |
| Display address | 191 |

These counts overlap. A usable source, a source reference supporting a field, a populated production field and a field reviewed but unavailable are distinct states. Existing OSM/curated values can also supply production fields.

Field extraction rules:
- keep lunch and dinner distinct;
- declare exactly which fields a `sourceRefs` entry supports;
- do not infer missing facts from cuisine stereotypes or neighboring businesses;
- do not extract source-derived fields from terminal/ambiguous resolutions until their branch identity is resolved;
- do not re-run Google identity search merely to fill Tabelog/official fields.

For each batch, report source/Place IDs reviewed, newly populated fields, reviewed gaps with reasons, check dates and URLs, before/after production coverage and remaining exception/unprocessed queues. Prioritize budget, opening/regular holidays, cuisine, dishes and address. Keep new facts keyed to the exact branch and update `DEVELOPMENT.md` and `CHANGELOG.md` after validation.

Supplementary name-only and usable-source gap counts are currently review calculations, not outputs of the checked-in coverage script. Automating them and adding a computed source-completeness gate are planned improvements.

## 12. 百名店 enrichment

百名店 is metadata, not an admission source.

Sampling weights:
- ordinary: `1.0`;
- verified 百名店: `2.2`.

New/updated award facts should be branch-aware and preferably Place-ID keyed in source-enrichment shards. Historical name-matched `hyakumeiten.js` remains a compatibility input while migration continues.

## 13. Audits

Blocking production checks:
- production count >=3;
- unique Place IDs;
- every production row verified;
- every production distance <=1,200 m;
- forbidden persistent Google response fields absent;
- `sourceOnly` enrichment cannot self-verify;
- every enrichment row attaches to a current production Place ID;
- every terminal source resolution attaches to a current production Place ID;
- no identity has both a usable binding and terminal resolution;
- resolution status/reason/date/evidence are valid;
- maintenance `sourceRefs` do not leak into public canonical data.

Scripts:
- `scripts/audit_repository.mjs`;
- `scripts/audit_source_bindings.mjs`;
- `scripts/coverage_report.mjs`;
- `scripts/source_queue.mjs`.

Pages CI uploads `coverage.json` and `source_queue.json` as a short-lived private `eat-data-audit` workflow artifact so source/data completeness can be inspected without publishing maintenance evidence.

Current limitation: `source_queue.mjs` reports a nonzero unresolved count without failing, while `audit_source_bindings.mjs` prints a fixed `unresolvedByBindingAudit:0`. Read the calculated queue for completeness; the reviewed baseline is zero. Existing audits check structure/linkage and do not perform live status or source-content research. New production expansion should include a real completeness gate as planned maintenance work.

## 14. Frontend behavior

The browser receives only the canonical production data plus application code.

At recommendation time it performs:
- absolute 1.2 km safety check;
- optional cuisine exclusion;
- optional budget filter;
- optional preferred-distance filter;
- weighted random selection of three distinct Place IDs;
- maximum feasible cuisine diversity;
- required overview/per-store Leaflet maps;
- required three-store comparison;
- direct Place-ID-based Google Maps link.

Opening/holiday information remains descriptive and is not yet an exclusion criterion.

## 15. Security / cost / service rules

- Never commit an API key.
- Never put the Places key in browser JavaScript.
- Keep Google field masks narrow.
- Use staged/targeted verification instead of unnecessary full reruns.
- Reuse Place IDs and compact verification state.
- Do not fabricate missing source enrichment.
- New Tabelog/official facts must carry field-level provenance.
- Public Pages deployment publishes only the assembled `_site`, not source-enrichment/source-resolution maintenance files.
- Maintain Google Maps and OpenStreetMap attribution appropriate to content/services shown.
