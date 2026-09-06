# Fast Production Data Completion — 2026-09-07

## Goal

Rapidly improve the useful field completeness of the existing `TOKYO / 地区1️⃣` production pool without reopening paid geographic discovery or weakening identity/QC rules.

The production inventory is already mature at 662 restaurants. The dominant problem is missing restaurant fields, not missing restaurant identities.

## Key observation

The repository already retains a reviewed Hot Pepper rich-metadata layer for 135 exact current-production bindings. That layer contains many useful source-native fields such as address, genre, budget band, opening hours and closure text, but those fields were intentionally attached only as rich metadata and therefore did not necessarily participate in canonical production resolution.

This created a safe, high-yield completion opportunity: reuse already-reviewed retained facts before performing any new external collection.

## New completion path

Added:

- `scripts/build_hotpepper_rich_core_fallback.mjs`

The generator reads the already-reviewed `data/hotpepper_rich_metadata.js` and creates an ephemeral source-enrichment shard:

- `data/source_enrichment_hotpepper-richcore.js`

The shard is generated during CI and is not a new discovery source. It converts existing reviewed rich metadata into the source-row format already understood by `scripts/build_production_dataset.mjs`.

The hyphenated suffix is intentional: production enrichment discovery accepts `source_enrichment_<suffix>.js` where `<suffix>` is alphanumeric/hyphen. A second underscore would cause a generated shard to be ignored.

### Fields eligible for fallback promotion

Only stable, directly source-supported core fields are converted:

- `address`;
- mapped canonical `cuisine`;
- explicit finite Hot Pepper budget band as `dinner`;
- raw opening hours;
- closure text.

### Safety rules

The fallback generator:

- never creates a production identity;
- accepts only rich rows already marked `strict_auto` or `manual_exact`;
- skips any production identity that already has a maintained Hot Pepper source row;
- retains the original reviewed Hot Pepper URL, ID and checked date as provenance;
- labels generated claims with `promotionMode: reviewed-rich-core-fallback`;
- marks price claims as `explicit_range` only when the provider exposes a finite explicit band;
- does not fabricate lower/upper bounds for open-ended budget tiers;
- leaves official/Tabelog precedence unchanged because the canonical resolver already ranks official > Tabelog > Hot Pepper.

This design makes the pass additive and idempotent.

## Production integration

`.github/workflows/pages.yml` now runs the fallback generator before `build_production_dataset.mjs`.

The Pages sequence is therefore:

```text
no-paid-API audit
-> generate reviewed Hot Pepper core fallback
-> canonical production build
-> provenance/source-fact rebuild
-> repository audits
-> coverage reports
-> static Pages assembly
-> deploy
```

The generated fallback shard is used only as an intermediate build input. The deployed public site still contains the normal runtime files:

- `production_area1.js`;
- `source_provenance.js`;
- `source_facts.js`;
- `hotpepper_rich_metadata.js`.

No new API key or live paid-data dependency is introduced.

## Matrix integration

`.github/workflows/build-full-enrichment-matrix.yml` also generates the same fallback before rebuilding canonical production and the matrix. Future completeness reports therefore measure the same canonical data that Pages actually deploys.

## Browser cache handling

`index.html` data asset versions were advanced to:

`20260907-bulk1`

for production, provenance, source facts and Hot Pepper rich metadata. This prevents an already-open browser from continuing to use the previous cached dataset after deployment.

## Development rule going forward

Before adding more web collection or restaurant-discovery machinery, always exhaust already-reviewed retained evidence in this order:

1. canonical source-enrichment rows;
2. official/Tabelog retained facts;
3. reviewed Hot Pepper rich metadata;
4. open-data reconciliation artifacts;
5. only then targeted new public-source discovery.

The optimization target remains trusted field gain per restaurant/source review, not restaurant count.

## No-paid-data-API policy

This work performs zero paid Google Places/Text Search/Place Details calls. Historical Google IDs remain compatibility identity keys only. The existing `scripts/audit_no_paid_apis.mjs` check remains mandatory in deployment.
