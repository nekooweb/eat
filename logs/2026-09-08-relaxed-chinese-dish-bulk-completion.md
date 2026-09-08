# 2026-09-08 — Relaxed Chinese dish bulk completion (v1, superseded)

> **Superseded by `logs/2026-09-08-specific-chinese-dish-bulk-pass-v2.md`.**
> The v1 universal fallback `招牌主菜 / 时令小菜` is no longer allowed. The current v2 policy prefers a blank recommendation over meaningless generic filler and requires a concrete brand, dish/name keyword, cuisine, or food-bearing broad-cuisine basis.

## Historical goal

Shift the public completion priority toward featured/recommended dishes and Chinese display coverage. This initial pass allowed approximate dish suggestions when strong recommendation semantics were unavailable.

## Historical design

The strict evidence layer was intentionally left unchanged. Approximate dish suggestions were added only at the public display/runtime overlay boundary so they could not be mistaken for durable source-backed recommendation evidence.

The old v1 precedence was:

1. existing Chinese recommended dish;
2. existing Chinese featured/representative dish;
3. approximate brand-specific Chinese dish suggestion;
4. approximate cuisine/name-based Chinese dish suggestion;
5. generic Chinese restaurant fallback.

The final step above has now been removed by v2.

Approximate v1 rows used:

- `dishRecommendationConfidence: approximate`
- `dishRecommendationLanguage: zh-CN`
- `dishRecommendationDisplayPolicy: relaxed-zh-v1`
- `dishRecommendationBasis: <rule id>`

They were not written to SQLite, source facts, recommendation evidence, or provenance as verified claims.

## Historical v1 result

GitHub Pages run `34176043792` produced the following v1 display figures:

- public named runtime rows: **1,415**;
- nominal Chinese dish display coverage: **1,415 / 1,415 (100%)**;
- existing/source-backed Chinese dish display: **291** rows;
- approximate rows: **1,124**;
- generic fallback rows: **307**.

The 307 generic rows made nominal 100% coverage misleading and motivated v2.

## Current status

Do **not** use the v1 100% figure as the current quality metric. Current development and measured results are documented in:

- `logs/2026-09-08-specific-chinese-dish-bulk-pass-v2.md`

v2 explicitly bans the old generic labels and reports meaningful coverage separately from intentionally unfilled rows.

## Historical commits

- `a2b97c1` — Add relaxed Chinese dish runtime fallback
- `e014ce4` — Attach relaxed Chinese dish fallback to public runtime
- `fdf7b75` — Relax dish review to Chinese display-safety checks
