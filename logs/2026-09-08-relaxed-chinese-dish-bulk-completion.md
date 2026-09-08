# 2026-09-08 — Relaxed Chinese dish bulk completion

## Goal

Shift the public completion priority toward featured/recommended dishes and Chinese display coverage. The product requirement for this pass explicitly allows approximate dish suggestions when strong recommendation semantics are unavailable, provided the displayed dish text is Chinese and the pipeline does not create avoidable CI failures.

## Design decision

The strict evidence layer was intentionally left unchanged. Approximate dish suggestions are added only at the public display/runtime overlay boundary so they cannot be mistaken for durable source-backed recommendation evidence.

Precedence is:

1. existing Chinese recommended dish;
2. existing Chinese featured/representative dish;
3. approximate brand-specific Chinese dish suggestion;
4. approximate cuisine/name-based Chinese dish suggestion;
5. generic Chinese restaurant fallback.

Approximate rows are marked with:

- `dishRecommendationConfidence: approximate`
- `dishRecommendationLanguage: zh-CN`
- `dishRecommendationDisplayPolicy: relaxed-zh-v1`
- `dishRecommendationBasis: <rule id>`

They are not written to SQLite, source facts, recommendation evidence, or provenance as verified claims.

## Chinese fallback rules

`scripts/chinese_dish_runtime_patch.js` contains broad reusable rules for common brands and cuisines. Examples include Starbucks, Tully's, Doutor, Torikizoku, Hanamaru, Royal Host, CoCo Ichibanya, Tsujita, Saizeriya, Nakau, Cocos, Butayama and Ueshima, plus ramen, tsukemen, curry, sushi, yakitori, yakiniku, udon, soba, tempura, tonkatsu, okonomiyaki, Chinese, Indian, Thai, Korean, Italian, cafe, bakery, steak, French, izakaya and other broad cuisine/name classes.

The final generic fallback is `招牌主菜 / 时令小菜`.

## Review threshold change

The dish gate is deliberately permissive:

- approximate recommendations do not require explicit source wording such as recommended/popular/signature;
- approximate recommendations may use brand, cuisine or restaurant-name context;
- the blocking dish audit checks display safety instead of strong recommendation provenance;
- each approximate row must contain 1–2 non-empty Chinese dish labels;
- kana/Japanese display strings are not accepted by the relaxed Chinese audit;
- approximate rows must carry the `relaxed-zh-v1` metadata.

The change does **not** weaken the frozen catalog, identity-state, radius, forbidden Google payload, or no-paid-data-API gates.

## Deployment validation

GitHub Pages run `34176043792` completed the build stage successfully. The no-paid-data-API audit passed with zero hits.

Strict pre-overlay runtime counts:

- frozen catalog: 2,804 Place IDs;
- public named runtime rows: 1,415;
- strict/runtime recommended-dish rows before relaxed display patch: 185;
- featured-dish rows before relaxed display patch: 178.

Relaxed Chinese display audit after applying the runtime patch in memory:

- Chinese dish display coverage: **1,415 / 1,415 (100%)**;
- existing/source-backed Chinese dish display retained: **291** rows;
- approximate Chinese dish rows added: **1,124** rows;
- generic fallback rows among approximate rows: **307**;
- therefore **817** approximate rows received a more specific brand/cuisine/name-based Chinese suggestion rather than the generic fallback.

The blocking runtime audit passed with `dishReviewPolicy: relaxed-zh-v1`.

## CI behavior

Legacy semantic compatibility checks remain warning-only under the repository's current refactor mode. The new approximate-dish path is separately audited for Chinese display safety, while identity/provenance/no-paid-API controls remain strict. This avoids rejecting useful approximate dish content merely because an upstream page did not explicitly label a dish as a recommendation.

## Commits

- `a2b97c1` — Add relaxed Chinese dish runtime fallback
- `e014ce4` — Attach relaxed Chinese dish fallback to public runtime
- `fdf7b75` — Relax dish review to Chinese display-safety checks
