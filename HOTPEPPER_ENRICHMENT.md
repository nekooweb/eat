# Hot Pepper Area1 Enrichment Design

Updated: 2026-09-06

## Decision

Hot Pepper Gourmet Web Service is a **first-class structured enrichment source** for the already-known Area1 restaurant list.

The expensive list/identity capture stage is already complete. The optimization target is no longer discovering restaurants; it is filling useful fields for the known **2,804-identity** Area1 snapshot with a small number of authorized/free API requests and conservative local matching.

## Authorization assumption

Project-owner guidance on 2026-09-06 states that this project is non-commercial and that authorization for the intended Hot Pepper API use has already been obtained / confirmed.

The repository operates under that project-specific authorization assumption. Do not document non-commercial status by itself as an automatic exception to the public general Recruit terms. If the actual project-specific authorization has narrower persistence/refresh scope, adjust storage/refresh behavior without changing the identity/matching architecture.

The API key must never be committed. The workflow accepts these GitHub Actions secret names, in priority order:

- `HOTPEPPER_API_KEY`
- `HOTPEPPER_API`
- `HOTPEPPER_KEY`
- `RECRUIT_API_KEY`

As of the 2026-09-06 implementation test, **none of those secrets is configured in this repository**, so the live benchmark intentionally fails at a preflight check before making any Hot Pepper request.

## Why Hot Pepper is high-value

A full Gourmet Search response can provide, in one structured record:

- Hot Pepper shop ID;
- Japanese shop name and kana;
- address and coordinates;
- genre/sub-genre;
- dinner budget/range/average text;
- budget memo;
- opening-hours text;
- regular closing-day text;
- lunch availability;
- shop URL;
- optional secondary attributes.

For Eat, the main value is **identity/name/address/cuisine + dinner budget + hours/closed days**.

`lunch` indicates whether lunch exists; it is **not a lunch-price range**. Lunch-price completion remains an official-menu/source task.

## Implemented request strategy

### Phase 1 — one geographic Area1 superset

`scripts/collect_hotpepper_area1.py discover` requests a 2 km geographic superset around the Area1 center using:

- `range=4`;
- `count=100`;
- pagination with `start`;
- full structured shop rows rather than `type=lite`.

The initial implementation used `type=lite`, but that is not optimal for identity reconciliation because the reduced response sacrifices useful address/alias evidence. The current collector deliberately uses the normal full response for the small Area1 superset so local matching can use address, kana and coordinates without a second per-shop lookup.

The collector then:

1. deduplicates by Hot Pepper shop ID;
2. calculates exact Haversine distance locally;
3. retains only rows within the production 1.2 km radius;
4. stores the result as a short-lived audit artifact.

### Phase 2 — local record linkage to the captured list

`scripts/match_hotpepper_inventory.py` consumes:

- the successful 2026-09-06 full-list private Google audit artifact;
- its retry artifact;
- current production rows;
- the Hot Pepper Area1 discovery snapshot.

Google display payload is used only transiently inside the workflow for matching and is **not** copied into the durable Hot Pepper binding output.

Matching uses:

- spatial blocking;
- precise distance;
- normalized names;
- Japanese -> Hepburn romanization via `pykakasi`;
- address similarity;
- postal-code agreement;
- best-vs-second candidate margin;
- one-Hot-Pepper-ID-to-one-identity collision protection.

The matcher emits `high`, `medium`, `review`, `low`, `none` and collision outcomes. Only high/medium matches are eligible for the detail fetch. This is still broader than automatic production use.

### Phase 3 — details in <=20-ID batches

`scripts/collect_hotpepper_area1.py details` reads the matched Hot Pepper IDs and requests full details in batches of at most **20 shop IDs per request**.

Examples:

```text
20 matched shops  -> 1 detail request
400 matched shops -> ~20 detail requests
800 matched shops -> ~40 detail requests
```

This is the preferred refresh model after IDs are established. Do not fall back to one API request per restaurant.

### Phase 4 — safe binding ledger + production enrichment candidates

`scripts/build_hotpepper_enrichment.py` generates three review artifacts:

1. `hotpepper_bindings.json` — high/medium bindings for the historical known list, with match evidence and `autoEligible` state;
2. `source_enrichment_hotpepper.js` — only **existing production identities** that pass a stricter automatic-use gate;
3. `hotpepper_promotion_report.json` — field-yield and safety metrics.

The automatic-use gate is deliberately stricter than `confidence=high`. Dense Tokyo buildings can contain many independent restaurants with near-identical coordinates, so a high match must additionally satisfy strong distance/name/address/postal/combined-score conditions.

Rules:

- `medium` -> review only;
- collision -> review only;
- inventory-only identity -> binding ledger only;
- no single Hot Pepper match may automatically admit a new production identity;
- current 656 production identities may receive source-only field claims if the safe gate passes.

This separates **content enrichment** from **production identity expansion**.

## Field mapping

### Name / address

Safe production bindings may claim Hot Pepper name and address. The Hot Pepper ID remains a source-native alias.

### Cuisine

The builder maps specific Hot Pepper genre/sub-genre labels into the existing Chinese display taxonomy. Specific sub-genre evidence is preferred over broad genre text. Raw Hot Pepper codes/names are retained in the generated source row for auditability.

Examples include ramen, sushi, yakiniku, Chinese, Korean, Indian/Nepalese, Thai, Vietnamese, Italian, French, curry, soba, udon, cafe, sweets, izakaya and bar categories.

### Dinner budget

The builder promotes provider-defined finite budget intervals conservatively:

- an explicit two-sided tier such as `2001～3000円` maps directly to `[2001, 3000]`;
- an official upper-cap tier such as `～2000円` maps to `[0, 2000]` because the provider explicitly defines the maximum;
- a lower-bound-only tier such as `10000円～` is **not** given an invented finite upper bound and therefore is not promoted to the current `[min,max]` filter field.

No lunch budget is inferred from `lunch=あり`.

### Opening hours / closure

`open` is stored as `openingHoursRaw`; `close` is preserved as closure evidence. The existing conservative Japanese schedule normalizer decides whether the raw text is safe enough to become a weekly machine-readable schedule.

Temporary/irregular text is not forced into a weekly schedule.

### URL / attribution

Hot Pepper source URLs are attached to source refs where available.

The public page now includes:

`Powered by ホットペッパーグルメ Webサービス`

Hot Pepper images are intentionally not ingested in this phase.

## Workflow

`.github/workflows/hotpepper-enrichment.yml` is manual-only (`workflow_dispatch`). It performs:

```text
preflight API-key check
 -> no-paid-Google-API policy audit
 -> current production build
 -> download already-paid transient full-list artifacts
 -> Hot Pepper Area1 geographic discovery
 -> local 2,804-list matching
 -> <=20-ID detail batches
 -> durable binding ledger
 -> production-safe source-enrichment candidate shard
 -> yield/safety reports
 -> review artifact upload
```

All piped shell steps use `set -euo pipefail`, and required JSON/JS outputs are explicitly checked before upload. This was added after the first benchmark attempt exposed a CI bug where `tee` masked a failing Python command.

The first implementation test run `34030289095` looked successful at the workflow level but actually had an empty API key; log inspection exposed the masked failure. The corrected run `34030342882` failed correctly at the API-key preflight. Therefore there is currently **no valid Hot Pepper coverage result yet** and no Hot Pepper-derived row has been promoted to production.

## Storage architecture

Do not commit raw API responses directly as canonical production data.

```text
Hot Pepper API
 -> short-lived audit snapshot
 -> exact identity binding
 -> safe field claims
 -> source_enrichment compatibility shard
 -> canonical resolver/build
```

The binding ledger is valuable for all 2,804 known identities. The production shard is intentionally limited to existing production identities until a separate identity-admission policy is approved.

## Source precedence

Hot Pepper is a major structured source, not universal truth.

Recommended precedence:

- identity: official branch source / multiple independent agreement > safe Hot Pepper binding > weak aggregate evidence;
- address: official branch > strong Hot Pepper/independent agreement > single weak source;
- cuisine: official/menu > specific Hot Pepper sub-genre/genre > open POI taxonomy > name inference;
- dinner budget: explicit official or authorized structured Hot Pepper range > derived official menu band > sparse prices;
- hours: official branch > current authorized Hot Pepper / trusted locator > OSM > ambiguous free text.

## Next executable step

Configure one supported Actions secret with the authorized Hot Pepper API key, preferably:

`HOTPEPPER_API_KEY`

Then manually run **Hot Pepper Area1 enrichment benchmark**. The next decision should be based on the resulting measured values:

- Hot Pepper shops inside Area1;
- high / medium / review / collision match counts;
- safe existing-production bindings;
- address/cuisine/dinner-budget/hours field yield;
- unmatched known identities;
- inventory-only Hot Pepper bindings that may later support a separate identity-expansion review.

Do not tune thresholds or expand production from assumptions before that benchmark exists.
