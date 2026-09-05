# 2026-09-06 — Official enrichment acceleration

## Goal
Reduce restaurant-by-restaurant manual source review without weakening the exact-Place-ID/source-provenance rules.

## New review model
Official-source field maintenance now uses three confidence tiers:

- **A — automatic promotion**: exact production Place ID, successful official page fetch, maintained name/page agreement, plus either matching structured data or a trusted branch/store-locator page. Only durable address, normalized opening-hours evidence and conservative cuisine signals are eligible.
- **B — fast review**: the workflow extracts the likely address/hours/cuisine text, menu/product candidates, recommendation snippets, price snippets and menu URLs into one review artifact. A reviewer checks the evidence directly instead of manually searching each restaurant.
- **C — no action**: no sufficiently useful current signal is found; nothing is guessed into production.

`recommendedDishes` remains strict. Featured-dish and budget interpretation are intentionally left in B-review unless an explicit deterministic rule already exists.

## Fetch acceleration
`scripts/extract_official_index_fields.mjs` now:

- reuses the persisted 187-row independently fetched official-site index;
- skips production rows whose relevant fields are already complete;
- fetches remaining pages with concurrency 8;
- caches URL fetch promises, so the same chain/menu URL is downloaded only once per run;
- fetches menu pages only when budget or featured-dish signals are still needed;
- extracts up to 40 JSON-LD facts so Product/MenuItem candidates can reach the review queue.

Validated run `33980591040`:

- indexed production official pages: **187**;
- records requiring some work: **173**;
- rows skipped as already complete: **14**;
- unique URLs fetched: **361**;
- duplicate URL fetches avoided by cache: **23**;
- main official pages fetched successfully: **172 / 173**;
- main pages with maintained name agreement: **148**;
- structured-fact pages: **75**;
- pages with visible address signal: **135**;
- pages with visible hours signal: **101**;
- pages with cuisine signal: **142**;
- pages with recommendation/menu signals: **115**;
- requested menu pages: **211**; successful: **203**.

No Google Places request is used by this pass.

## Stable A-tier writer
`scripts/build_auto_official_enrichment.mjs` is now incremental instead of rebuilding from one network snapshot.

Rules:

- previous reviewed auto-official fields survive transient fetch failures;
- generic free-text addresses are not automatically promoted;
- structured address/hours require matching official business facts;
- trusted store-locator address/hours require a branch-specific page/title match;
- temporary, dated, COVID-era, year-end and special-hours notices are rejected;
- opening-hours text must normalize and validate under the canonical weekly schedule contract;
- existing invalid auto-official address claims are removed rather than preserved indefinitely.

The first strict cleanup removed **2 historical false/low-quality address claims**, changing canonical address coverage from 261 to **259**. This is a quality correction, not a network-loss regression.

Latest validated A-tier refresh (`33980591040`):

- stable auto-official rows: **74**;
- refreshed rows: **63**;
- structured address refreshes: **11**;
- trusted-locator address refreshes: **2**;
- structured hours refreshes: **2**;
- trusted-locator hours added in this run: **0**;
- structured cuisine refreshes: **3**;
- canonical production remains **648**;
- source-backed remains **397**;
- normalized openingHours remains **278**;
- featuredDishes remains **124**;
- strict recommendedDishes remains **27**;
- addressKnown is now **259** after cleanup.

All repository, source-binding and normalized-field audits passed.

## B-tier fast review queue
`scripts/build_official_fast_review_queue.mjs` produces `_audit/official_fast_review_queue.json` instead of requiring a reviewer to browse the official sites manually.

Latest queue:

- restaurants with at least one B-review signal: **120**;
- fields already classed A-auto during queue analysis: **7**;
- fetch/identity failures: **25**;
- rows with no useful B signal: **28**;
- B-review address candidates: **34**;
- B-review opening-hours candidates: **51**;
- B-review cuisine candidates: **12**;
- B-review budget candidates: **66**;
- B-review featured-dish candidates: **79**.

These counts overlap. The reviewer now evaluates extracted evidence cards, not 187 separate web searches.

## Workflow behavior
`.github/workflows/promote-official-bulk.yml` now runs the accelerated pipeline as a manual maintenance action:

1. use the persisted official index;
2. build a stable production baseline;
3. fetch only incomplete official records with URL deduplication;
4. auto-promote A-confidence fields;
5. rebuild canonical production;
6. generate the B-confidence review artifact;
7. run repository/source/normalized audits and gap reports;
8. upload the short-lived audit artifact;
9. commit only stable generated official maintenance data.

The validation-only branch push trigger used during development was removed before merge; production maintenance remains `workflow_dispatch` only.

## Next speed improvements
1. Process B-review rows by repeated host/template instead of restaurant order.
2. Add deterministic template rules only when a host exposes stable branch/menu semantics.
3. Keep price/featured-dish semantics review-gated unless the page explicitly identifies the item/price role.
4. Apply the same A/B/C idea to the 56-item prioritized inventory-expansion queue before touching the 2,103 completely untouched identities.
