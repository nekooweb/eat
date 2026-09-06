# Eat Development Plan

Updated: 2026-09-06

## Current state

`TOKYO / 地区1️⃣` has completed the expensive restaurant-list/identity capture stage. The frozen historical Area1 snapshot contains **2,804** identities.

Current audited production baseline:

- historical inventory: **2,804**;
- canonical production: **656**;
- production inside frozen inventory: **653**;
- inventory-only legacy IDs: **2,151**;
- source-backed production: **404 / 656**;
- source outcomes accounted for: **448 / 656**;
- unresolved current-production source queue: **208**;
- official-site index: **194**;
- cuisine known: **579**;
- address known: **268**;
- normalized opening hours: **287**;
- budget known: **192**;
- featured dishes: **129**;
- strict recommendations: **30**;
- 百名店: **22**.

The successful 2026-09-06 full-collection + retry Actions artifacts contain the transient matching inputs needed for identities that were inventory-only during the sweep. The retry resolved all transient fetch failures. **Do not repeat that paid Google collection.**

`DATA_ENRICHMENT_PROGRESS.md` is the numeric production report. `ENRICHMENT_STRATEGY.md` defines the general enrichment architecture. `HOTPEPPER_ENRICHMENT.md` is authoritative for the implemented Hot Pepper path.

## Primary objective

Candidate discovery is no longer the main problem.

Optimize:

> useful fields completed per authorized/free API request, network fetch and review minute for the already-known Area1 list.

Priority:

1. **P0** — durable source binding, current identity evidence, name, address/coordinates, cuisine;
2. **P1** — dinner budget and official lunch-price evidence;
3. **P2** — hours, regular closed days, phone/menu/source URLs;
4. **P3** — featured dishes, strict recommendations and descriptive fields.

Do not return to large-scale restaurant discovery unless a later measured recall audit proves the 2,804-list is insufficient.

## Billable API prohibition

Repository maintenance must not execute billable place/search/map APIs.

- no live Google Places / Area Insights / Text Search / Place Details / `websiteUri`;
- no paid place/search fallback;
- no Google Maps/Places secret in maintenance workflows;
- no Google API key injected into Pages;
- existing Google Place IDs and historical QC are frozen compatibility/alias inputs;
- retired paid scripts remain fail-closed;
- CI runs `scripts/audit_no_paid_apis.mjs`.

Free/authorized APIs may be used according to project authorization/provider requirements. Keys remain in GitHub Actions secrets and are never committed.

## Primary structured enrichment: Hot Pepper

Project-owner guidance states that the project is non-commercial and the intended Hot Pepper API use has been separately authorized/confirmed. The repository uses that project-specific authorization assumption.

Implemented pipeline:

```text
known 2,804 identities
 + already-paid transient matching seed
        |
        v
Hot Pepper 2 km geographic superset
(full rows, count=100 pagination)
        |
        v
exact local <=1.2 km crop
        |
        v
spatial + multilingual name + address/postcode matching
        |
        +--> high/medium known-list binding ledger
        |
        v
<=20 Hot Pepper IDs per detail request
        |
        v
strict automatic-use gate
        |
        +--> inventory-only matches remain review-only
        |
        v
existing-production source-enrichment candidates
        |
        v
canonical resolver/build
```

### Why full discovery rows instead of `type=lite`

The first design used `type=lite`. It was replaced before production use because address/kana evidence is more valuable for dense Tokyo identity matching than reducing response payload size. The current collector requests the full geographic superset once.

### Matching safety

`scripts/match_hotpepper_inventory.py` uses:

- spatial blocking and precise distance;
- normalized Japanese/Latin names;
- Japanese -> Hepburn romanization via `pykakasi`;
- address/postal evidence;
- best-vs-second candidate margin;
- one-Hot-Pepper-ID collision protection.

`scripts/build_hotpepper_enrichment.py` applies a second stricter automatic-use gate.

Rules:

- medium matches are review-only;
- collisions are review-only;
- only strict-safe high matches can generate automatic field claims;
- only **existing production identities** can enter the generated Hot Pepper source-enrichment shard;
- inventory-only identities can receive a binding in the ledger but are not admitted automatically.

Content enrichment and identity expansion therefore remain separate operations.

## Hot Pepper field rules

High-value claims:

- Japanese name;
- address;
- source-native Hot Pepper ID;
- genre/sub-genre -> Chinese cuisine taxonomy;
- dinner budget;
- opening-hours raw text;
- regular closing-day text;
- source URL.

Budget handling:

- `2001～3000円` -> `[2001, 3000]`;
- provider-defined upper-cap `～2000円` -> `[0, 2000]`;
- lower-bound-only `10000円～` -> not promoted into the finite `[min,max]` field because no upper bound is stated;
- `lunch=あり` is not a lunch price.

Hours remain raw evidence unless the conservative Japanese schedule normalizer can produce a valid weekly schedule.

Hot Pepper images are not ingested in this phase. The public page already includes `Powered by ホットペッパーグルメ Webサービス` attribution.

## Implemented workflow

`.github/workflows/hotpepper-enrichment.yml` is manual-only and performs:

1. API-key preflight;
2. no-paid-Google-API audit;
3. current production build;
4. download of the already-paid full-list/retry artifacts;
5. Hot Pepper geographic collection;
6. local known-list matching;
7. <=20-ID detail batches;
8. `hotpepper_bindings.json` generation;
9. `source_enrichment_hotpepper.js` candidate generation;
10. `hotpepper_promotion_report.json` + summary generation;
11. strict output validation;
12. review artifact upload.

All piped shell commands use `set -euo pipefail` and all required outputs are checked before upload.

### Real execution status

Implementation-test runs:

- `34030289095` exposed a CI bug: `tee` masked Python failures and the Hot Pepper secret was empty;
- `34030342882` correctly failed at the API-key preflight after fail-fast fixes.

Therefore **no valid Hot Pepper benchmark has run yet and no Hot Pepper-derived data has been promoted**.

The remaining blocker is repository configuration. No supported Hot Pepper Actions secret is currently available. Accepted names:

- `HOTPEPPER_API_KEY` (preferred);
- `HOTPEPPER_API`;
- `HOTPEPPER_KEY`;
- `RECRUIT_API_KEY`.

The connected GitHub development tool cannot create or reveal Actions secret values, so an authorized repository owner must configure the key in GitHub repository settings.

## Secondary enrichment after Hot Pepper

Use measured gaps rather than rediscovering the universe.

### Official / brand locator / AllThePlaces

Prioritize for:

- lunch prices;
- menu/signature dishes;
- strict recommendation evidence;
- exact branch conflicts;
- restaurants absent from Hot Pepper.

Process repeated domains/brands/templates in batches rather than restaurant-by-restaurant crawling.

### OSM / Foursquare OS / Overture

Use for:

- unmatched identities;
- independent coordinates/address/category evidence;
- currentness cross-checks;
- conflict resolution.

Preserve source lineage: an aggregate plus its own upstream provider is not automatically two independent votes.

## Field-claim architecture

Collectors do not directly mutate canonical restaurant rows.

Each claim should retain:

- entity/compatibility key;
- provider and source-native ID/URL;
- field/value;
- checked date;
- extraction method/confidence;
- lineage.

The existing `source_enrichment_*.js` files remain the compatibility layer consumed by `build_production_dataset.mjs`. The Hot Pepper workflow produces a review-ready candidate shard in that format.

## Next execution order

1. Configure the authorized `HOTPEPPER_API_KEY` Actions secret.
2. Manually run **Hot Pepper Area1 enrichment benchmark**.
3. Review measured discovery, high/medium/review/collision counts and strict-safe production bindings.
4. Review address/cuisine/dinner-budget/hours yield.
5. If precision is acceptable, commit the reviewed Hot Pepper binding ledger and production enrichment shard.
6. Rebuild production and compare against the current baseline: budget **192**, hours **287**, address **268**, cuisine **579**.
7. Keep Hot Pepper-bound inventory-only rows as a separate identity-expansion review queue.
8. Use official/AllThePlaces/OSM/FSQ/Overture for remaining gaps, especially lunch/menu/dishes and conflicts.
9. Continue source refresh/field audits; do not re-run paid discovery.

## Headline metrics going forward

- known identities with Hot Pepper binding;
- strict-safe Hot Pepper bindings;
- current production identities enriched by Hot Pepper;
- inventory-only identities with reviewable Hot Pepper binding;
- address coverage;
- cuisine coverage;
- dinner-budget coverage;
- lunch-price coverage;
- normalized-hours coverage;
- official-site coverage;
- dish coverage;
- unresolved identity collisions/conflicts;
- fields completed per request/review minute.

The **2,804** count remains the known historical list size, not a repeated-discovery target.

## Runtime contract

The public product remains a static GitHub Pages application. Recommendation behavior remains: <=1,200 m scope, current canonical production identities, cuisine/budget/distance filters, three distinct results when possible, cuisine-diversity preference, Web Crypto randomness, 百名店 weight 2.2, and no rating/review popularity ranking.

Embedded maps use Leaflet/OpenStreetMap. Ordinary external Google Maps navigation links may remain because they are normal web navigation rather than API execution.
