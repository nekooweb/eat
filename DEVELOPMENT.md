# Eat Development Plan

Updated: 2026-09-06

## Current state

`TOKYO / 地区1️⃣` is in **collection-first full-range execution with parallel field completion**.

Current audited baseline:

- exact Area1 inventory: **2,804 / 2,804** unique Google Place IDs;
- canonical production: **656**;
- production inside exact inventory: **653**;
- inventory-only: **2,151**;
- OSM independent-source candidates: **1,273**;
- verified QC rows: **666**;
- Tabelog/official source-backed production: **397**;
- cuisine known: **578**;
- address known: **261**;
- normalized opening hours: **282**;
- budget known: **192**;
- featured dishes: **125**;
- strict recommendations: **27**;
- 百名店: **22**.

`DATA_ENRICHMENT_PROGRESS.md` is the authoritative numeric report. Detailed run history belongs under `logs/`.

## Development direction

The current goal is to process the complete **2,804-identity** universe and give every identity an auditable source/admission outcome.

During each source pass, collect all safe fields at the same time rather than revisiting restaurants field by field:

- exact business/branch identity;
- cuisine;
- address;
- normalized weekly opening hours;
- explicit lunch/dinner spend range when available;
- representative/signature dishes;
- strict recommendation evidence when explicitly stated;
- maintainable independent source URLs.

Field completion therefore continues in parallel with full-range collection, but missing values remain missing when evidence is insufficient.

## Data admission rules

- Google Place ID is the canonical identity key.
- Durable display data comes from maintainable independent sources such as OSM, official pages, Tabelog and curated evidence.
- Google display payload is maintenance/QC input and is not stored as the restaurant database.
- Exact branch identity and <=1,200 m scope must be verified before production admission.
- Existing terminal QC conflicts and already-bound OSM entities must not be overwritten automatically.
- Ambiguous, stale, closed or unsupported cases receive an explicit unresolved/terminal outcome rather than guessed data.

## Field rules

### Opening hours

`openingHours` is a normalized weekly schedule. Temporary, holiday-only or irregular schedules are not forced into the static weekly model.

### Budget

Menu-item/course prices do not automatically define restaurant lunch/dinner budget. Only explicit spend-range evidence is accepted.

### Dishes

- `recommendedDishes`: strict explicit recommendation/popularity/signature evidence;
- `featuredDishes`: broader source-backed representative/signature items.

Brand/template propagation may fill fields only after branch identity is already independently established.

## Current maintenance pipeline

1. Maintain the fixed **2,804** exact identity inventory.
2. Resolve high/medium/review independent-source candidates safely.
3. Discover independent sources for remaining inventory-only identities in batches.
4. Reuse the persisted official-site index and trusted locator patterns before making new paid Google requests.
5. On each source pass, extract safe address/hours/cuisine/budget/menu fields together.
6. Rebuild canonical production and all ledgers after admission changes.
7. Run repository, source-binding, normalized-field and identity-coverage audits before merge.

## Cost policy

Routine continuation should be zero-Google-cost whenever possible by using persisted official URLs, OSM, existing Tabelog bindings, trusted locators and reviewed templates.

`websiteUri` / Enterprise discovery remains budget-gated and manual-only. Do not start another paid recovery batch without an explicit new budget decision.

## Ordered next work

1. Refresh safe fields from the existing official-site index and trusted locator/direct-site parsers.
2. Resolve the remaining medium/review full-range OSM candidates.
3. Work through the current production source-outcome queue, collecting fields in the same pass.
4. Continue independent-source discovery across the remaining **2,151 inventory-only** identities, prioritizing repeated brands and official locator patterns.
5. Keep rebuilding the 2,804 ledger until every identity has an auditable maintenance outcome.

## Runtime contract

The public product remains a static GitHub Pages application. Recommendation behavior is unchanged: <=1,200 m scope, verified Place IDs, cuisine/budget/distance filters, three distinct results when possible, cuisine diversity preference, Web Crypto randomness, 百名店 weight 2.2, no rating/review popularity ranking, hybrid Google Maps Embed/Leaflet views, and isolated voice/mascot feedback.
