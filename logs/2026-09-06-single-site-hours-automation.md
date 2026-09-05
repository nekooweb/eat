# Single-site official-hours automation — 2026-09-06

## Purpose

Extend the official-source acceleration pipeline beyond chain/store locators so existing source-backed restaurants with direct official websites can receive reliable normalized weekly opening hours without restaurant-by-restaurant manual entry.

This pass is deliberately field-completion only. It does **not** admit new restaurant identities or convert generic brand records into source-backed production.

## Implementation

Added:

- `scripts/build_single_site_hours_enrichment.mjs`;
- `.github/workflows/promote-single-site-hours.yml`;
- generated shard `data/source_enrichment_zzzsinglehours.js`.

The workflow is manual `workflow_dispatch` only after validation.

Every refresh starts from a **clean baseline**: the previous generated single-site-hours shard is removed before target selection and then rebuilt from current official pages. Generated data therefore cannot hide its own stale targets on the next run.

## Admission rules

A direct official-site schedule is auto-promoted only when all of the following hold:

1. the production Place ID already has independently maintained source support;
2. the Place ID has no terminal/source-resolution state;
3. the page is not a chain locator handled by the dedicated locator pipeline;
4. the page is not a known third-party/aggregator/site-builder host kept review-only;
5. the current page fetch succeeds;
6. the page title matches the maintained restaurant identity;
7. an explicit opening-hours section exists;
8. the schedule normalizes to at least five known day states;
9. temporary, dated, irregular or conditional-calendar language is absent;
10. overlapping intervals are rejected as a likely parsing error.

The parser supports common durable official-page patterns including:

- separate day-group lines followed by a time line (`平日・土` then `12:00-23:00`);
- bracketed groups (`[平日]`, `[日祝]`);
- compact regular-closure notes (`※土曜定休`);
- `定休日 無` as no regular closure;
- multiple Japanese day groups with different hours.

## Safety corrections during development

The first permissive prototype produced six structurally valid schedules, but source review showed several semantic problems. These were not merged.

Rules were tightened so that:

- `祝前日` and holiday-dependent substitute closures are rejected;
- generic statements that hours may change are rejected;
- summer/New-Year/seasonal closure notes are rejected from automatic weekly promotion;
- generic-brand identities cannot become newly source-backed through this field-completion pass;
- each run recomputes from a clean baseline instead of trusting its previous generated shard.

This rejected examples such as holiday-eve schedules and conditional Monday/Tuesday closures that the static weekly contract cannot represent faithfully.

## Final validation

Authoritative run: **`33982241187`**.

Clean baseline:

- production: **648**;
- source-backed: **397**;
- normalized opening hours: **278**.

Batch processing:

- existing-source direct official targets: **40**;
- current fetch success: **40 / 40**;
- page-title identity matches: **28**;
- auto-promoted schedules: **4**;
- all four have complete seven-day + holiday state representation.

Reason distribution for rejected rows:

- conditional calendar: 4;
- no explicit hours section: 10;
- identity mismatch: 12;
- no clock range: 2;
- temporary/dated/seasonal wording: 6;
- irregular closure: 1;
- no parseable intervals: 1.

Accepted schedules:

1. **ヒナタ屋** (`ChIJDUGL7RCMGGARErPxhJ7bXgc`) — Mon-Sat 11:30-15:30; Sunday/holiday closed.
2. **眞踏珈琲店** (`ChIJ2QzuEhCMGGAR_GwijOC6vao`) — Mon-Sat 12:00-23:00; Sunday/holiday 12:00-21:00; no regular closure.
3. **まぐろ市場** (`ChIJK-zPABCMGGARny83K5PNya0`) — weekdays 11:00-21:00; Sunday/holiday 11:00-15:00; Saturday closed.
4. **麺屋武蔵 巌虎** (`ChIJ3wcsHh2MGGAR-BCRlpETRq0`) — daily/holiday 11:00-22:00; no regular closure.

## Result

After the final batch:

- production: **648**;
- source-backed: **397**;
- normalized `openingHours`: **278 -> 282**;
- source-backed opening-hours gap: **157 -> 153**;
- address: **259**;
- featured dishes: **124**;
- strict recommendations: **27**.

Repository audit, source-binding audit and normalized-field audit all passed.

## Cost

**Zero new Google Places API calls.** The pass only fetches persisted official URLs.

## Next step

Continue converting repeated B-review patterns into deterministic parsers. The next high-value groups are:

1. remaining official/locator opening-hours hosts that require host-specific extraction rather than generic parsing;
2. structured budget/price evidence for repeated chain hosts;
3. source-backed featured-dish evidence where official menu semantics clearly identify representative/signature items.

Ambiguous schedules and generic-brand identity conflicts remain review-only.
