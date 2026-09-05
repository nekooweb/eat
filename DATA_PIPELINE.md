# Eat Data Pipeline

Updated: 2026-09-06

## 1. Purpose

This document defines the current Area1 data path from candidate discovery to the public canonical dataset.

Core rules:

1. production identity requires a verified Google Place ID;
2. durable restaurant fields come from independent/reviewed sources;
3. Google Places response content used for QC/discovery stays transient except permitted identity state such as Place ID;
4. source extraction may be automated, but candidate facts do not become production facts without a conservative binding/review rule;
5. unknown values remain unknown.

## 2. Current scale

Current production baseline:

- exact Google food-business Place-ID inventory: **2,804**;
- independent OSM candidates: **1,273**;
- QC-v4: **658 verified / 615 rejected** source rows;
- canonical production: **648** unique Place IDs;
- usable Tabelog/official bindings: **356**;
- explicit source resolutions: **44**;
- accounted source outcomes: **400 / 648**;
- unresolved source outcomes: **248**.

Current canonical field coverage:

- non-generic cuisine: **568**;
- budget: **192**;
- address: **207**;
- `hoursReference`: **302**;
- legacy representative dishes: **72**;
- reviewed explicit recommendation rows on this branch: **10**;
- 百名店: **22**.

## 3. Source roles

### Google Places

Used for:

- business identity;
- location/status/type QC;
- exact Area1 Place-ID coverage inventory;
- transient official-website discovery for an already known Place ID.

Long-lived application data must not become a dump of Places Details responses.

### OpenStreetMap

Used for:

- independent candidate discovery;
- durable coordinates/distance where available;
- coverage comparison.

OSM does not self-admit a row into production; Google identity verification is still required.

### Official pages

Preferred durable source for exact branch facts when available:

- name/address;
- cuisine;
- reference opening schedule;
- menu/signature dishes;
- directly supported price information.

### Tabelog

Reviewed fallback/parallel factual source for exact branch metadata.

### Legacy curated data

Compatibility/enrichment input only. New research should prefer Place-ID keyed source records.

## 4. Production identity lifecycle

```text
OSM / curated source candidate
       |
       v
Google identity QC
       |
       v
verified Place ID
       |
       +--------------------------+
       |                          |
       v                          v
independent durable fields   source discovery/review
       |                          |
       +-------------+------------+
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

A source-only row can enrich a verified identity but cannot create one.

## 5. Canonical source binding

Maintenance files:

- `data/source_enrichment.js`;
- `data/source_enrichment_*.js`.

Each source-enrichment record must:

- be keyed by exact `googlePlaceId`;
- use `sourceOnly:true`;
- use provider `official` or `Tabelog`;
- include one or more `sourceRefs`;
- use HTTPS source references;
- include ISO `checkedAt` dates;
- state exactly which fields each reference supports.

Source fields are merged only after the corresponding identity already exists in the verified group.

## 6. Source-resolution ledger

Maintenance files:

- `data/source_resolution.js`;
- `data/source_resolution_*.js`.

Supported terminal research states include:

- `ambiguous`;
- `listing_hold`;
- `no_current_usable_source`;
- `source_not_found`.

These states record the outcome of a research pass. They do not automatically prove current opening/closure and are not currently runtime recommendation filters.

## 7. Normalized display fields

The canonical builder guarantees a common public shape.

### Recommended dishes

Public field:

- `recommendedDishes: []` or 1-2 Chinese strings.

Maintenance source:

- `data/recommended_dishes.js`.

Each recommendation maintenance row requires:

- exact production Place ID;
- 1-2 Chinese dish labels;
- source URL;
- check date.

Promotion rule is strict: a concrete dish needs explicit source language showing recommended/popular/signature/specialty status. Generic representative `dishes` do not automatically become recommendations.

### Hours

Public field:

- `hoursReference: string | null`.

The builder combines supported opening-hours and regular-closure notes into this display value. It is reference-only; no open-now filtering is performed.

## 8. Batch field-acquisition strategy

The old one-by-one source search remains available for difficult exceptions, but it is no longer the default path.

### 8.1 Existing official pages

`scripts/extract_official_fields.mjs` fetches all already-known official source URLs concurrently and extracts staging signals:

- JSON-LD/Schema.org fields;
- menu links;
- recommendation/signature snippets;
- price snippets.

First successful test run `33974331919`:

- 60 URLs targeted;
- 55 fetched;
- 10 with structured facts;
- 21 with recommendation signals;
- 22 with price signals;
- 36 with menu links.

Remote sites are unstable, so a failed generic fetch means retry/review, not source rejection.

### 8.2 Discover additional official pages through existing Place IDs

`scripts/discover_google_official_sites.mjs` operates only on production identities without an existing official binding.

For each Place ID:

1. request Place Details with field mask `websiteUri`;
2. do not persist that Google-returned value as the durable record;
3. immediately fetch the website;
4. follow redirects;
5. inspect the final website page;
6. emit the final fetched URL and independently extracted page facts into a short-lived review artifact.

Full test run `33974475744`:

- targets: **589**;
- Google lookups successful: **589**;
- websites found: **445**;
- websites fetched: **287**;
- canonical-name match: **195**;
- candidate official/non-platform hosts: **265**;
- structured-fact pages: **121**;
- recommendation-signal pages: **160**;
- price-signal pages: **107**;
- menu-link pages: **223**;
- no website: **144**;
- website fetch failures: **158**.

### 8.3 High-confidence review queue

`scripts/filter_official_site_candidates.mjs` keeps only rows satisfying:

- successful website fetch;
- candidate official/non-platform host;
- canonical restaurant name appears in page content/title;
- final URL uses HTTPS.

Current high-confidence set derived from the full run: **164** restaurants.

Within that set:

- 72 have structured facts;
- 97 have recommendation signals;
- 60 have price signals;
- 134 have menu links.

These are review candidates, not auto-approved source facts.

## 9. Host/template processing

Process repeated official hosts as a batch whenever possible.

A host-specific adapter may safely standardize extraction of:

- branch name/address;
- opening hours;
- menu URLs;
- predictable menu/signature sections.

Do not infer missing values simply because another branch on the same chain has them.

## 10. Google request/cost control

`.github/workflows/extract-official-fields.yml` is manual (`workflow_dispatch`). A normal commit must not automatically repeat the hundreds of Place Details calls used for website discovery.

The workflow accepts `google_limit`:

- `0`: all production rows without an official binding;
- positive integer: only that many rows for testing/review.

Keep Places field masks narrow.

## 11. Canonical build

`scripts/build_production_dataset.mjs`:

- creates groups only from verified identities;
- attaches exact Place-ID source-only records afterward;
- allows no-ID historical enrichment only for unique normalized-name matches;
- prefers independent OSM geospatial data;
- applies field-level source claims/suppression;
- applies exact reviewed recommendation rows;
- emits one canonical row per Place ID;
- rejects duplicate identities, out-of-radius rows and malformed normalized data.

Output:

- `data/production_area1.js` generated during build/deployment.

## 12. Coverage / review reports

Current automated reports include:

- `coverage_report.mjs`;
- `source_queue.mjs`;
- `build_enrichment_queue.mjs`;
- `audit_area1_identity_coverage.mjs`;
- official extraction/discovery review artifacts.

`build_enrichment_queue.mjs` groups missing fields by source host so repeated website templates can be processed together.

Do not confuse:

- source binding;
- source outcome;
- field populated;
- field source evidence;
- high-confidence extraction candidate.

They are different completion states.

## 13. Next processing order

1. review/promote the 164 high-confidence official candidates by host/template;
2. retry worthwhile website-fetch failures with host-specific handling;
3. use Tabelog/manual research for rows with no official website;
4. continue the 248 unresolved source outcomes;
5. after current production fields stabilize, resume independent-source reconciliation for the remaining exact Google inventory.
