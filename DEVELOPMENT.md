# Eat Development Plan

Updated: 2026-09-06

## Current state

`TOKYO / 地区1️⃣` has completed the expensive candidate/identity capture stage. The confirmed historical Area1 snapshot contains **2,804** identities.

Current audited production baseline:

- frozen historical inventory: **2,804** Place IDs;
- canonical production: **656**;
- production inside frozen inventory: **653**;
- current inventory-only legacy IDs: **2,151**;
- source-backed production: **404 / 656**;
- source outcomes accounted for: **448 / 656**;
- unresolved current-production source queue: **208**;
- official-site index: **194** identities;
- cuisine known: **579**;
- address known: **268**;
- normalized opening hours: **287**;
- budget known: **192**;
- featured dishes: **129**;
- strict recommendations: **30**;
- 百名店: **22**.

The successful 2026-09-06 full-collection Actions artifact plus its retry artifact contain the transient matching inputs for the identities that were inventory-only during the sweep. The retry resolved all transient fetch failures. **Do not repeat that paid collection.**

`DATA_ENRICHMENT_PROGRESS.md` remains the numeric production report. `ENRICHMENT_STRATEGY.md` defines the general enrichment architecture. `HOTPEPPER_ENRICHMENT.md` defines the implemented primary structured enrichment path.

## Primary goal: enrich the known list

Candidate discovery is no longer the bottleneck.

The next development cycle optimizes:

> For the already-known Area1 restaurant list, how many useful fields can be completed per API/network request and per review minute without billable place/search APIs?

Priority:

### P0 — identity and recommendation usefulness

- durable source binding;
- current existence evidence;
- name/aliases;
- coordinates/address;
- cuisine/type;
- source-native IDs and provenance.

### P1 — filtering value

- dinner budget from authorized structured sources;
- lunch price from official menu evidence;
- transparent price evidence class.

### P2 — display context

- normalized weekly hours;
- regular closed days;
- phone/menu/source URLs.

### P3 — optional enrichment

- featured/signature dishes;
- strict recommendation evidence;
- descriptive fields.

Do not spend substantial effort on P3 while P0/P1 gaps remain large.

## Billable API prohibition

Repository maintenance must not execute billable place/search/map data APIs.

Hard constraints:

- no live Google Places / Area Insights / Text Search / Place Details / `websiteUri` calls;
- no paid place/search API fallback;
- no Google Maps/Places secret in maintenance workflows;
- no API key injected into the Pages artifact;
- existing Google Place IDs and historical QC state are frozen compatibility/alias inputs;
- retired paid scripts remain fail-closed;
- CI runs `scripts/audit_no_paid_apis.mjs`.

Free/authorized APIs are allowed when consistent with project authorization and provider requirements. API keys must stay in repository secrets and must never be committed.

## Hot Pepper is now the primary structured enrichment path

Under project-owner guidance, the project is non-commercial and the intended Hot Pepper API use is treated as separately authorized/confirmed.

The implemented flow is:

```text
known 2,804 identity snapshot
 + already-paid transient matching seed
        |
        v
Hot Pepper 2 km geographic superset
(full structured rows, paginated at 100)
        |
        v
local exact 1.2 km crop
        |
        v
spatial + multilingual name + address/postcode record linkage
        |
        +---- high/medium binding ledger for known identities
        |
        v
<=20 Hot Pepper IDs per full-detail request
        |
        v
strict automatic-use gate
        |
        +---- inventory-only bindings remain review-only
        |
        v
existing production source-enrichment candidates
        |
        v
canonical resolver/build
```

### Why full geographic rows, not `type=lite`

The first design used `type=lite`. It was replaced before production use because the reduced response is not ideal for identity reconciliation: address/kana evidence is more valuable than saving response bytes for a small Area1 batch.

`scripts/collect_hotpepper_area1.py` now requests full geographic rows once, then uses 20-ID detail batches for established bindings.

### Matching safety

`scripts/match_hotpepper_inventory.py` uses:

- spatial blocking;
- exact distance;
- normalized Japanese/Latin names;
- Japanese romanization via `pykakasi`;
- address similarity;
- postal-code agreement;
- best-vs-second candidate margin;
- one-to-one Hot Pepper ID collision detection.

`scripts/build_hotpepper_enrichment.py` applies a second, stricter automatic-use gate.

Important separation:

- high/medium Hot Pepper matches can enter the binding ledger;
- only strict-safe high matches may generate automatic source field claims;
- only **existing production identities** may enter `source_enrichment_hotpepper.js`;
- inventory-only identities are not automatically promoted from one Hot Pepper match.

This prevents content enrichment from silently becoming identity expansion.

## Hot Pepper fields

High-value source claims:

- Japanese name;
- address;
- Hot Pepper ID;
- genre/sub-genre -> versioned Chinese cuisine mapping;
- explicit two-sided dinner budget;
- opening-hours raw text;
- regular closing-day text;
- source URL.

Rules:

- `lunch=あり` is not a lunch budget;
- open-ended/single-number budget text does not get an invented bound;
- irregular hours remain unresolved if the schedule normalizer cannot parse them conservatively;
- Hot Pepper images are not ingested in the current phase.

The public page already carries `Powered by ホットペッパーグルメ Webサービス` attribution.

## Hot Pepper workflow status

`.github/workflows/hotpepper-enrichment.yml` is implemented and manual-only.

It performs:

1. Hot Pepper API-key preflight;
2. no-paid-Google-API audit;
3. current production build;
4. download of the already-paid full-list + retry private artifacts;
5. geographic Hot Pepper collection;
6. local identity matching;
7. full details in <=20-ID batches;
8. durable binding ledger generation;
9. production-safe source-enrichment candidate generation;
10. yield/safety report generation;
11. strict output validation;
12. review artifact upload.

All piped commands use `set -euo pipefail` and required files are checked with `test -s` before artifact upload.

### Real execution findings

Two implementation-test runs were performed while building the workflow:

- run `34030289095`: exposed a workflow bug where `tee` masked Python failures; the Hot Pepper secret was actually empty;
- run `34030342882`: after fail-fast fixes, correctly stopped at the API-key preflight.

Therefore **no valid Hot Pepper benchmark has run yet and no Hot Pepper-derived data has been promoted**.

The only current blocker is repository configuration: no supported Hot Pepper Actions secret is present. Supported names are:

- `HOTPEPPER_API_KEY` (preferred);
- `HOTPEPPER_API`;
- `HOTPEPPER_KEY`;
- `RECRUIT_API_KEY`.

The GitHub connector used for development cannot create/read Actions secret values, so secret setup must be performed in GitHub repository settings by an authorized repository owner.

## Secondary enrichment sources

After the Hot Pepper structured pass, use other sources for measured gaps rather than rediscovering the whole restaurant universe.

### Official/brand pages and locators

Highest-value uses:

- lunch prices;
- menu/signature dishes;
- strict recommendation evidence;
- exact branch conflicts;
- restaurants missing from Hot Pepper.

Prefer host/template batching and existing AllThePlaces locator logic where available.

### OSM / Foursquare OS / Overture

Use primarily for:

- unmatched identities;
- independent coordinates/address/category evidence;
- currentness cross-checks;
- conflict resolution.

Do not treat Overture plus one of its upstream providers as two automatically independent votes; preserve source lineage.

## Official-site processing model

Use host-first processing, not restaurant-first crawling:

```text
remaining known identities
 -> source/official URLs
 -> group by brand/domain/template
 -> fetch each unique source once
 -> extract all supported fields
 -> field claims
 -> resolver
```

One source fetch should attempt name/address/phone/cuisine/hours/closed days/menu links/budget evidence/featured dishes together.

## Price model

Use evidence classes rather than silently weakening budget semantics:

- **A** — explicit authorized structured spend range or explicit official spend range;
- **B** — official menu with enough comparable main/set items to derive a transparent observed band;
- **C** — sparse item/course prices, review/display only.

Hot Pepper explicit dinner budget is a strong structured layer. Lunch remains an official-menu completion problem.

## Field-claim architecture

Bulk collectors should not directly mutate canonical restaurant rows.

Each claim should retain:

- compatibility/canonical entity key;
- source provider;
- source-native ID / URL;
- field/value;
- checked date;
- extraction method;
- confidence;
- lineage.

Current `source_enrichment_*.js` files remain the compatibility layer consumed by `build_production_dataset.mjs`; the Hot Pepper workflow now produces a candidate shard in that format.

## Development order

1. Configure the authorized Hot Pepper Actions secret.
2. Run **Hot Pepper Area1 enrichment benchmark**.
3. Inspect measured Area1 counts: discovery, high/medium/review/collision matches, safe production bindings, and field yield.
4. If the safe match precision is acceptable, commit the reviewed Hot Pepper binding ledger and production enrichment shard.
5. Rebuild production and measure changes from the current baseline: budget 192, hours 287, address 268, cuisine 579.
6. Use Hot Pepper-bound inventory-only rows as a separate identity-expansion review set; do not automatically add them.
7. Use official/AllThePlaces/OSM/FSQ/Overture only for the remaining measured gaps/conflicts.
8. Prioritize official lunch/menu/dish extraction after the structured Hot Pepper pass.
9. Continue field-level audits and source refresh rather than re-running paid discovery.

## Headline progress metrics

Report enrichment rather than discovery counts:

- known identities with a Hot Pepper binding;
- strict-safe Hot Pepper bindings;
- production entities enriched by Hot Pepper;
- inventory-only identities with reviewable Hot Pepper binding;
- address coverage;
- cuisine coverage;
- dinner-budget coverage;
- lunch-price coverage;
- normalized-hours coverage;
- official-site coverage;
- featured/recommended dish coverage;
- unresolved collisions/conflicts;
- fields completed per network request / review minute.

The **2,804** count is the known historical list size, not a target for repeated discovery.

## Runtime contract

The public product remains a static GitHub Pages application. Recommendation behavior remains: <=1,200 m scope, current canonical production identities, cuisine/budget/distance filters, three distinct results when possible, cuisine-diversity preference, Web Crypto randomness, 百名店 weight 2.2, and no rating/review popularity ranking.

Embedded maps use Leaflet/OpenStreetMap. Ordinary external Google Maps navigation links may remain because they are normal web navigation rather than API execution.
