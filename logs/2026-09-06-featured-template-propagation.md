# Reviewed featured-dish template propagation — 2026-09-06

## Purpose

Reduce repeated `featuredDishes` review by reusing already-reviewed brand menu semantics across same-brand production identities, without allowing a generic brand name to substitute for independent branch identity evidence.

## Architecture

Added:

- `scripts/featured_template_registry.mjs` — central registry for previously reviewed brand-menu templates and bilingual dish labels;
- `scripts/audit_featured_template_gaps.mjs` — reports same-brand production rows still missing `featuredDishes`;
- `scripts/build_featured_template_propagation.mjs` — promotes a reviewed template only to eligible exact production identities;
- `.github/workflows/promote-featured-templates.yml` — manual-only regeneration/audit workflow;
- `data/source_enrichment_zzzzzfeaturedtemplates.js` — generated exact-Place-ID field shard.

The temporary standalone audit workflow used during development was removed after the promotion workflow subsumed it.

## Safety rule

A brand template is reusable only when all of the following are true:

1. the dish/menu semantics and Chinese label were already reviewed in committed enrichment;
2. the target is an exact canonical production Place ID;
3. the target currently lacks `featuredDishes`;
4. the target is already independently source-backed (`sources` contains something other than OpenStreetMap);
5. the target does not have a `source_resolution` state;
6. the generated official `dishes` `sourceRef` and `FEATURED_DISHES.sourceUrl` use the same maintained official menu URL.

This means brand matching is a **field propagation rule**, not an identity-admission rule.

## Validation

Authoritative run: **`33983081967`**.

Clean baseline:

- production: **648**;
- source-backed: **397**;
- featured dishes: **124**;
- legacy/source-backed dish rows: **111**.

Reviewed-template audit:

- registry brands: **15**;
- production rows matching those brands: **46**;
- rows still missing featured dishes: **15**;
- source-backed missing rows: **1**.

Promotion result:

- promoted: **1**;
- blocked: **14**;
- blocked by existing `source_resolution`: **13**;
- blocked because not source-backed: **1**.

Promoted restaurant:

- **つじ田** — Place ID `ChIJJ8_bnU6NGGARsXyvg0mnXI0`;
- maintained production sources already include `OpenStreetMap` + `official`;
- persisted exact branch page: `https://tsukemen-tsujita.com/shop/?id=0010019`;
- reviewed official menu source: `https://tsukemen-tsujita.com/menu/noukoutsukemen/`;
- propagated dish: `濃厚つけ麺` / `浓厚蘸面`;
- semantic kind: `signature`.

The remaining surface candidates were generic/insufficiently sourced brand records such as Starbucks, Doutor, Tully's, Royal Host, Café Veloce and Café de Crié identities. They were intentionally not promoted.

## Result

After promotion:

- production: **648**;
- source-backed: **397**;
- featured dishes: **124 -> 125**;
- source-backed featured-dish gap: **275 -> 274**;
- source-backed legacy dish rows: **111 -> 112**;
- strict recommendations: **27** unchanged;
- opening hours: **282** unchanged;
- address: **261** unchanged;
- budget: **192** unchanged.

Repository audit, source-binding audit, normalized-field audit and dish-gap audit all passed.

## Cost

**Zero new Google Places API calls and zero new website fetches.** This pass reuses already reviewed/committed menu semantics and existing source identities.

## Design conclusion

Reviewed chain-menu semantics are already close to saturated among independently source-backed same-brand production rows. The current 15 surface gaps contained only one safely reusable identity.

Future gains in `featuredDishes` should therefore come mainly from:

1. extracting new explicit representative/signature evidence from current official menu pages;
2. grouping repeated host/menu patterns before review;
3. adding a new brand template only after the dish semantics and Chinese label are reviewed once;
4. letting the registry propagate that approved template automatically to any later exact source-backed same-brand identity.

Do not use brand-name similarity to bypass branch identity/source requirements.
