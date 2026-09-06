# 2026-09-06 Hot Pepper enrichment pipeline

## Goal

Shift Area1 development from restaurant discovery to **content enrichment of the already-captured 2,804-identity list** without re-running paid Google APIs.

Project-owner guidance states that the project is non-commercial and that the intended Hot Pepper API use is separately authorized/confirmed. The implementation therefore treats Hot Pepper Gourmet Web Service as a first-class structured enrichment source while keeping the API key in GitHub Actions secrets.

## Implemented

### 1. Hot Pepper collector

Added/updated `scripts/collect_hotpepper_area1.py`.

Current discovery behavior:

- Area1 center geographic query;
- `range=4` (2 km superset);
- `count=100` pagination;
- full structured rows rather than `type=lite` so address/kana evidence is available during identity matching;
- exact local <=1,200 m Haversine crop;
- deduplicate by Hot Pepper shop ID;
- no images;
- no paid Google call.

Current detail behavior:

- read matched Hot Pepper IDs;
- request <=20 IDs per API call;
- retain structured name/kana/address/coordinates/genre/sub-genre/budget/open/close/lunch/source URL fields in short-lived audit output.

### 2. Local identity matching

Added `scripts/match_hotpepper_inventory.py`.

Inputs:

- successful full-list private audit from run `34018919233`;
- retry private audit from run `34019078280`;
- current production dataset;
- Hot Pepper geographic snapshot.

Signals:

- spatial blocking;
- precise distance;
- normalized names;
- Japanese-to-Hepburn romanization (`pykakasi`);
- address similarity;
- postal-code agreement;
- best-vs-second score margin;
- one Hot Pepper ID -> one known identity collision protection.

The transient Google display payload is not written into the durable binding output.

### 3. Safe enrichment builder

Added `scripts/build_hotpepper_enrichment.py`.

Outputs:

- `hotpepper_bindings.json` — high/medium known-list bindings;
- `source_enrichment_hotpepper.js` — strict-safe existing-production field claims only;
- `hotpepper_promotion_report.json` — binding/field/safety metrics.

Safety rules:

- medium matches are review-only;
- collisions are review-only;
- a second stricter high-confidence gate protects dense same-building cases;
- inventory-only identities do not enter production automatically;
- no lunch budget is inferred from lunch availability;
- no open-ended budget bound is invented;
- only explicit two-sided dinner ranges are promoted;
- raw hours/closure text is passed to the existing conservative schedule normalizer.

### 4. Workflow

Implemented `.github/workflows/hotpepper-enrichment.yml` as a manual-only workflow.

Flow:

```text
secret preflight
 -> no-paid-data-API audit
 -> current production build
 -> download existing transient full-list artifacts
 -> Hot Pepper geographic collection
 -> local matching
 -> <=20-ID details
 -> binding ledger + production-safe candidate shard
 -> yield/safety reports
 -> validate outputs
 -> upload review artifact
```

All piped commands now use `set -euo pipefail`. Required outputs are checked before artifact upload.

### 5. CI and attribution

- Pages CI now compiles all three Hot Pepper Python scripts.
- Public footer now contains `Powered by ホットペッパーグルメ Webサービス` attribution.
- The no-paid-data-API guard remains active.

## Execution attempts

### Run 34030289095

The first real implementation test exposed two problems:

1. the Hot Pepper API secret resolved to an empty value;
2. Python commands piped through `tee` were not using `pipefail`, so failures were incorrectly reported as successful steps.

No Hot Pepper dataset was produced.

### Run 34030342882

After adding fail-fast behavior and secret aliases, the workflow correctly stopped at **Require Hot Pepper API key**.

Checked secret names:

- `HOTPEPPER_API_KEY`;
- `HOTPEPPER_API`;
- `HOTPEPPER_KEY`;
- `RECRUIT_API_KEY`.

None is currently configured/available to the workflow.

Therefore:

- no valid Hot Pepper Area1 benchmark exists yet;
- no Hot Pepper-derived production field has been committed;
- no additional Google API request was executed.

## Current blocker

Repository owner must configure the authorized Hot Pepper key under GitHub repository **Settings -> Secrets and variables -> Actions**, preferably as:

`HOTPEPPER_API_KEY`

The connected GitHub development tool cannot create or reveal repository Actions secrets.

## Next run acceptance criteria

A valid benchmark run must produce all of:

- `hotpepper_area1_discovery.json`;
- `hotpepper_inventory_match.json`;
- `hotpepper_bound_details.json`;
- `hotpepper_bindings.json`;
- `source_enrichment_hotpepper.js`;
- `hotpepper_promotion_report.json`;
- `hotpepper_enrichment_summary.json`.

Before committing generated Hot Pepper enrichment into `data/`, review:

- Hot Pepper shops inside Area1;
- high/medium/review/collision counts;
- strict-safe production bindings;
- same-building ambiguity;
- address/cuisine/dinner-budget/hours yield;
- inventory-only bindings as a separate future identity-expansion queue.

## Current architectural conclusion

The correct short-term path is now:

**known list -> Hot Pepper bulk structured enrichment -> official/menu completion -> open-data conflict/unmatched completion**.

Do not return to candidate-universe discovery as the main development task unless a later measured coverage audit proves the captured list is insufficient.
