# 2026-09-07 — Identity recovery diagnostics v5–v6.1

## Scope

This log records the strict diagnostics performed after the v2 structured-address, v3 independent multi-source and v4 public official-page recovery stages.

All stages in this log preserve the same hard policy:

- zero new Google data API calls;
- historical Google Places data is short-lived private linkage context only;
- no Google display payload is durable;
- no proximity-only identity binding;
- no direct promotion from a diagnostic;
- robots.txt and 401/403/429/access restrictions are respected;
- no CAPTCHA/login bypass;
- raw HTML is not persisted.

## v5 — strong retained-source consensus

Workflow run: `34123552810` — success.

Rule: `private-strong-consensus-diagnostic-v5`.

The diagnostic tested whether unresolved multi-source Hot Pepper / OpenStreetMap / Overture components already contained one of three strong discriminators:

- exact cross-provider phone;
- exact cross-provider official URL;
- shared allowed official domain plus structured-address support.

Result:

- ID-only inspected: 1,388
- with at least one multi-source cluster: 566
- historical non-operational: 1
- no historical hint: 1
- no strong signal: 1,386
- strong candidates: **0**

Conclusion: the retained HP/OSM/Overture payloads do not contain unused strong phone/domain/URL consensus for the remaining ID-only records. Lowering fuzzy-name or distance thresholds is not justified.

## v6 — same-origin official detail-page diagnostic

Implementation:

- `scripts/database/diagnose_private_official_detail_consensus_v6.py`
- `.github/workflows/private-official-detail-consensus-v6.yml`

Workflow run: `34125988881` — success.

The stage starts only from unresolved multi-source components that already carry an allowed public website. It follows at most two same-origin hops toward store/access/info/listing pages. Every page is independently robots/access-gated.

Observed coverage:

- unresolved Place IDs with a multi-source cluster: 566
- components with an allowed website: 175
- unique landing pages scheduled: 29
- landing pages fetched successfully: 20
- hop-1 links selected: 209
- hop-1 pages fetched successfully: 35
- hop-1 page-level identity matches: 9
- hop-2 links selected: 358
- hop-2 pages fetched successfully: 40
- hop-2 page-level identity matches: 16
- Place-ID-level provisional matches deferred because the official URL was reused: 9
- final strong detail candidates: **0**

Access-policy skips included 404/503 responses, a robots 403, unavailable robots checks, one 429 and a small number of URL encoding failures. None was bypassed.

Interpretation: same-origin traversal found useful store-level signals, but the nine surviving Place-ID-level provisional matches all pointed to shared official listing URLs. A URL alone cannot identify a unique store, so v6 correctly quarantined them.

## v6.1 — shared official listing fact uniqueness

Implementation:

- `scripts/database/diagnose_private_official_listing_consensus_v6_1.py`
- `.github/workflows/private-official-listing-consensus-v6-1.yml`

Workflow run: `34126400628` — success.

v6.1 allows a shared official listing URL to be considered only if every Place ID maps to a different discriminating store-fact fingerprint. The fingerprint uses independently published official fact content (normalized store name/address, phone hash and rounded geo when present). It still requires structured-address, phone or <=45 m official geo support against the independent provider component. Native provider keys must not be reused across final candidates.

Result:

- shared official listing URLs among provisional matches: 2
- provisional rows on those shared URLs: 9
- rows deferred because the extracted official store fact fingerprint was duplicated: **9**
- rows accepted as unique store facts: 0
- final strong candidates: **0**

Conclusion: the currently extractable structured facts on those shared pages are not sufficient to distinguish the stores. The system must not remove URL/fact collision quarantine or fall back to layout-specific visible-text heuristics merely to increase recovery count.

## Identity decision after v6.1

The v2–v6.1 line has now exhausted the strong signals available from the currently retained Hot Pepper / OSM / Overture records and their directly carried public official websites under the strict identity policy.

The remaining identity recovery queue should therefore advance by adding genuinely new independent public evidence coverage, not by lowering existing name/distance/postcode thresholds. Any future source should still enter as proposal/evidence and pass central collision/provenance validation before promotion.
