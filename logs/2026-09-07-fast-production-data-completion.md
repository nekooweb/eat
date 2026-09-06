# 2026-09-07 — Fast production data completion

## Request

Rapidly complete as much restaurant data as practical, accept partial completeness where unavoidable, load the improved data into the production website, and update development documentation/logs.

## Repository state reviewed

The current production architecture was confirmed as:

- 662 production restaurants in `TOKYO / 地区1️⃣`;
- identity discovery largely complete;
- full enrichment matrix already showing the main remaining bottleneck as missing fields;
- GitHub Pages automatically rebuilding canonical production and deploying on pushes to `main`;
- paid Google data APIs prohibited by repository policy.

The existing 662-row baseline showed large gaps in address, meal budget, normalized hours and dishes, while 135 exact reviewed Hot Pepper rich rows already existed as retained structured evidence.

## Implementation

Added `scripts/build_hotpepper_rich_core_fallback.mjs`.

The generator reuses already-reviewed Hot Pepper rich metadata and creates an additive source-enrichment shard only for identities that do not already have a Hot Pepper source row.

Eligible fallback claims:

- address;
- cuisine;
- explicit finite dinner budget band;
- opening hours;
- closure.

The pass never creates identities, does not use live Google APIs, and preserves existing source priority. Official and Tabelog evidence continue to outrank Hot Pepper in canonical resolution.

## Deployment integration

Updated `.github/workflows/pages.yml` so the new fallback is generated before canonical production is built. Therefore every production Pages deployment can reuse the retained reviewed facts automatically.

Updated `.github/workflows/build-full-enrichment-matrix.yml` so completeness measurement follows the same production input path.

Updated `index.html` asset versions to `20260907-bulk1` for:

- `production_area1.js`;
- `source_provenance.js`;
- `source_facts.js`;
- `hotpepper_rich_metadata.js`.

This forces browsers to request the newest deployed dataset instead of retaining the previous cache.

## CI verification and shard-name correction

The first CI verification proved that the generator itself was producing a high-yield batch:

- reviewed rich rows: 135;
- previously represented Hot Pepper source identities: 100;
- fallback rows generated: 41;
- fallback field claims: address 41, cuisine 40, dinner budget 40, opening hours 41, closure 41.

That verification also caught an integration bug before treating the work as complete: the first intermediate filename was `source_enrichment_hotpepper_richcore.js`, but the canonical discovery regex accepts only alphanumeric/hyphen characters after the single `source_enrichment_` separator. The second underscore caused the generated shard to be ignored even though generation succeeded.

The output and both workflows were corrected to use:

`data/source_enrichment_hotpepper-richcore.js`

This is now discoverable by the same enrichment loader used by canonical production.

## Files changed

- `scripts/build_hotpepper_rich_core_fallback.mjs` — new reviewed-rich-to-core fallback generator.
- `.github/workflows/pages.yml` — production integration and validation.
- `.github/workflows/build-full-enrichment-matrix.yml` — matrix parity with production.
- `index.html` — production data cache-bust version.
- `DEVELOPMENT_FAST_COMPLETION_2026-09-07.md` — development design and maintenance rules.
- `logs/2026-09-07-fast-production-data-completion.md` — this implementation log.

## Policy status

- paid Google Places/Text Search/Place Details: not used;
- new restaurant identities: not created by this pass;
- review-only Hot Pepper metadata: reused only when already accepted as `strict_auto` or `manual_exact`;
- open-ended budget tiers: not fabricated into finite ranges;
- production source precedence: unchanged.
