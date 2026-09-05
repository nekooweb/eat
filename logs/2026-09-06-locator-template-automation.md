# Locator template automation pass — 2026-09-06

## Purpose

Replace repeated manual checking of official chain/store locator pages with a reusable, conservative parser for branch address and weekly opening hours.

## What changed

- Added `scripts/build_locator_template_fields.mjs`.
- Added `scripts/filter_locator_resolution_conflicts.mjs`.
- Added manual-only workflow `.github/workflows/promote-locator-templates.yml`.
- Added generated maintenance shard `data/source_enrichment_zzlocatorauto.js`.
- Removed the superseded first parser prototype after its self-test exposed an inline-weekly-hours failure.

## Parsing rules

A locator patch requires:

1. exact production Google Place ID from the maintained official index;
2. a trusted official branch/store locator host;
3. a branch-specific URL;
4. successful current page fetch;
5. maintained restaurant name / page-title agreement;
6. a structured `住所` or `営業時間` section;
7. no temporary, dated, COVID-era, irregular or special-hours wording;
8. a normalized schedule with at least five known weekday/day states;
9. no reduction in known-day completeness relative to the current canonical schedule.

Before normalization, inline weekly text such as `日曜日 09:00-21:00 月曜日 09:00-21:00 ...` is split at every weekday token. This prevents the canonical parser from attaching several intervals to the first day.

Existing `source_resolution*` identities are filtered before promotion. A generic-brand ambiguity is not automatically reopened merely because a current official branch URL was discovered through the Google recovery pipeline; reopening requires separate independent branch confirmation.

## Validation run

Authoritative run: `33981430074`.

Raw locator scan:

- trusted locator targets: 32;
- current page fetches: 31 / 32;
- identity matches: 25;
- raw safe patches: 7;
- address candidates: 2;
- hours candidates: 5;
- seven-day schedules: 3.

Resolution guard removed four generic-brand identities that remain intentionally ambiguous:

- Tully's generic record `ChIJA7vjSxCMGGARpf4TitkGqMk`;
- Cafe de Crie generic record `ChIJcf2INWuMGGARteCaKYtQc1E`;
- Starbucks generic record `ChIJ4e3_CQ6MGGARgbvLFz2U9kQ`;
- Royal Host generic record `ChIJeygUHWuMGGAR6JSkGxomd2c`.

Three current official schedule refreshes remained:

- Tully's `ChIJCRf6uziMGGARPOpXUziKe7s`: corrected from a one-day/multi-interval interpretation to seven explicit day segments, all 09:00-21:00;
- Ueshima Coffee `ChIJhXD3-AaMGGARbLVQPEtml80`: weekday 07:00-21:00 with Saturday/Sunday/holiday closure explicitly preserved;
- Tully's Sumitomo Fudosan Akihabara First Building Terrace `ChIJVwXD9E6NGGARkHzeYVBeacw`: refreshed to current seven-day schedule, Sunday 07:00-21:00 and Monday-Saturday 07:00-22:00.

The Ueshima official store page independently confirms `平日 07:00-21:00` and `定休日 土日祝` on 2026-09-06.

## Audit result

After the resolution guard:

- canonical production: 648;
- source-backed production: 397;
- opening-hours coverage: 278;
- featured dishes: 124;
- strict recommendations: 27;
- address coverage: 259;
- repository audit: pass;
- source-binding audit: pass;
- normalized-field audit: pass.

Coverage counts do not increase in this pass because the three accepted rows already had schedules. The value of this pass is correctness and reusable automation: future trusted locator pages can be refreshed in one batch without restaurant-by-restaurant inspection.

## Cost

Zero new Google Places API calls. Only persisted official URLs were fetched.

## Next automation step

Extend the same line-preserving schedule parser to single-restaurant official sites where identity is independently strong. Generic chain-name identities remain locked unless official address/coordinates can independently match the maintained production identity.
