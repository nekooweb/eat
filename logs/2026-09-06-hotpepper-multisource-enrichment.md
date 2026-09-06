# 2026-09-06 Hot Pepper benchmark and multi-source price transition

## Objective

Continue Area1 enrichment after disabling billable Google data APIs, while testing whether one structured free/authorized provider can materially improve the existing 656-restaurant production set.

The conclusion is that Hot Pepper is highly efficient as a structured batch layer but is **not sufficient as a sole source**. The production strategy is now explicitly multi-source.

## Real Hot Pepper benchmark

Actions run: `34030943605`

Result:

- API-key preflight: pass;
- no-paid-data-API policy: pass;
- 2 km geographic Hot Pepper superset: 2,743 shops;
- exact <=1.2 km Area1 crop: 870 shops;
- matching seeds from frozen 2,804 historical identities: 2,801;
- high matches: 499;
- medium: 36;
- review: 2,019;
- collision review: 65;
- low: 176;
- none: 6;
- high/medium detail IDs: 535;
- 20-ID-batched detail requests: 27;
- returned details: 535 / 535.

A stricter second safety gate retained 128 existing-production candidates.

## Candidate quality

For the strict-safe 128 current-production candidates:

- median coordinate distance: ~5.7 m;
- median name similarity: 0.96;
- farthest retained candidate: 43 m with exact normalized-name match.

The purpose of this gate is to protect dense-building cases where coordinate proximity alone is insufficient.

## Net-new and conflict audit

Actions run: `34031211407`

Potential net-new fields among the 128 candidates:

- address +55;
- cuisine +22;
- dinner budget +84;
- hours raw +73.

Existing dinner-budget comparison:

- same: 1;
- strong overlap: 19;
- partial overlap: 14;
- disjoint: 8.

All 22 partial/disjoint conflicts already had current official/Tabelog strong evidence. Hot Pepper was therefore not allowed to overwrite them.

Three missing-dinner rows already had a known lunch price. They were deferred because the current canonical builder still resolves lunch+dinner from one budget claim row. A dinner-only source row could otherwise erase an existing lunch value.

## Additive-only promotion

Promotion workflow: `Promote additive-only Hot Pepper enrichment`

Successful run: `34031474082`

Data commit: `34d2a95e74330346123ff4a84f7b2f607f80a058`

Committed:

- `data/hotpepper_bindings.json`;
- `data/source_enrichment_hotpepper.js`.

Promotion contains 92 source rows and only claims fields that were missing at promotion time:

- address 55;
- cuisine 22;
- dinner budget 81;
- hours raw 73;
- closure 73.

Additive production invariant audit:

- production identity count changed: no;
- existing address changed: no;
- existing cuisine changed: no;
- existing lunch price changed: no;
- existing dinner price changed: no;
- existing normalized hours changed: no;
- protected identity/coordinate/status fields changed: no;
- violations: 0.

Canonical metrics after rebuild:

- production: 656;
- cuisine known: 579 -> 601;
- address known: 268 -> 323;
- budget known: 192 -> 273;
- normalized opening hours: 287 -> 359;
- featured dishes: 129 unchanged;
- strict recommended dishes: 30 unchanged.

## Source-state update

Hot Pepper introduced a useful state-transition case: several identities previously had a valid historical `source_resolution` record but now have a newer exact usable source.

Instead of deleting the old evidence, source-state logic now treats it as superseded history when a same-day/newer usable source exists.

After promotion:

- usable source indexed: 446 / 656 (68.0%);
- current explicit resolutions: 38;
- superseded historical resolutions: 6;
- current source outcomes accounted for: 484 / 656 (73.8%);
- unresolved source queue: 208 -> 172.

If a resolution is newer than attached usable-source evidence, the binding audit still fails.

## Multi-source price decision

New design document: `PRICE_ENRICHMENT.md`.

Price enrichment will not be provider-exclusive.

### Source roles

1. **Official branch/menu page** — highest priority for exact current branch prices and lunch menus.
2. **Tabelog** — strong secondary exact budget evidence where already maintained/reviewed and permitted.
3. **Hot Pepper** — efficient structured dinner-budget layer and useful identity/address/cuisine/hours evidence.
4. **Official-menu-derived observed band** — allowed only when a sufficiently representative menu supports the derivation and the evidence class is recorded.
5. **Direct web/Google search** — discovery mechanism for the underlying official/permitted page, not canonical evidence by itself.

### Google policy

Google Places price fields are not used because doing so would reintroduce billable Google Places execution. Historical Google Place IDs remain compatibility aliases.

Ordinary Google/web search may be used selectively to locate official menus, booking pages or branch locators. Search-result snippets are not persisted as authoritative price claims and there is no bulk Google-search scraping pipeline.

## Next implementation

- split canonical budget resolution into independent lunch and dinner claim selection;
- then recover the 3 currently deferred Hot Pepper dinner claims without touching their existing lunch prices;
- reuse current Tabelog/official claims first;
- measure remaining lunch and dinner gaps separately;
- group official-page extraction by host/brand/template;
- use selective direct search only for the residual difficult identities;
- preserve conflicts rather than averaging incompatible strong-source price ranges.

## Cost/API result

No billable Google data API was executed during this work.

The first real Hot Pepper enrichment pass used 28 geographic pages plus 27 detail batches to obtain the structured data needed for the benchmark. Subsequent bound-ID refreshes can skip geographic identity discovery and operate directly on batched Hot Pepper IDs according to the applicable authorization/refresh policy.
