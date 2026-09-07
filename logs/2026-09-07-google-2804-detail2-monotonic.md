# 2026-09-07 — Google 2,804 runtime, detail pass 2

## Stable basic runtime

- Frozen Google Place ID inventory: **2,804 / 2,804** live in the default 1.2 km runtime.
- Independently source-matched durable name / coordinate basics: **1,411**.
- Place-ID-only identities still awaiting durable independent basic metadata: **1,393**.
- Strong basic providers: Hot Pepper **357**, Overture Maps **392**, OpenStreetMap **11**, plus **651** existing canonical rows.
- Source-matched Hot Pepper rows with reusable basic detail overlay: **353**.
- Runtime dinner-budget coverage after the Hot Pepper basic overlay: **607** restaurants.
- Runtime hours coverage: **363** restaurants.
- No new paid Google data API calls were made.

## Recommendation evidence regression fix

A later website crawl returned fewer matches because many previously matched sites did not reproduce the same extractable text. The old collector replaced the evidence file with only the latest crawl and temporarily reduced recommendation coverage.

This was fixed by restoring the previously verified evidence snapshot and adding a monotonic evidence merger. Each future crawl now performs:

`verified previous evidence ∪ newly collected evidence`

Previously verified source-backed recommendation / featured evidence may be refreshed or extended but is not deleted merely because a later crawl fails or returns no match.

## Detail pass 2 final result

Before the new crawl:

- recommendation evidence restaurants: **155**;
- featured-evidence restaurants: **60**;
- total evidence restaurants: **208**;
- recommendation evidence items: **217**;
- featured evidence items: **61**.

Fresh crawl result:

- recommendation evidence restaurants: **32**;
- featured-evidence restaurants: **60**;
- total fresh evidence restaurants: **92**;
- recommendation items: **35**;
- featured items: **61**.

Monotonic merged result:

- recommendation evidence restaurants: **158**;
- featured-evidence restaurants: **60**;
- total evidence restaurants: **211**;
- recommendation evidence items: **222**;
- featured evidence items: **61**.

After merging this evidence with the existing canonical restaurant data, the exact 2,804 public runtime now has:

- strict recommended dishes: **186 restaurants**;
- source-backed featured dishes: **181 restaurants**.

The detailed-enrichment queue remains:

1. unresolved independent basic identity;
2. strict recommended dishes;
3. source-backed featured dishes;
4. opening hours;
5. dinner / lunch budget;
6. remaining identity-detail fields.

No inferred/reference dishes and no non-Google public restaurant identities are used.
