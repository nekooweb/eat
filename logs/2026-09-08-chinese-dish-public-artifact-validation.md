# 2026-09-08 — Chinese dish public artifact validation

## Validation scope

This pass did not lower the dish threshold and did not fill the remaining opaque restaurant/bar rows. It validated the actual GitHub Pages artifact rather than trusting only the in-memory audit.

## Issue found during validation

The first validation exposed a deployment wiring mismatch: `audit_google_inventory_runtime.mjs` applied `relaxed-zh-v2` in memory and reported 1,133 meaningful Chinese-dish rows, but the Pages artifact still contained the raw runtime with only 185 rows having `recommendedDishes`. The browser did not load `chinese_dish_runtime_patch.js`, so the audited approximate rows were not actually deployed.

## Fix

- Added `scripts/materialize_chinese_dish_runtime.mjs` to apply `relaxed-zh-v2` at the public runtime boundary and write the transformed rows back to `data/google_inventory_runtime.js` during Pages build.
- Added `scripts/audit_materialized_chinese_dish_runtime.mjs` to audit the exact file that will be copied into the Pages artifact.
- Updated `.github/workflows/pages.yml` so the build sequence is raw build -> in-memory policy audit -> materialize public display layer -> artifact-level dish audit -> assemble site.
- Added a Pages assembly gate requiring `dishRuntimeMaterialized=true` and rejecting `招牌主菜` / `时令小菜` in the final public runtime.
- Approximate dishes remain display-only and are not promoted into SQLite/source evidence/provenance.

## Final deployed result

GitHub Pages run: `34176987246`

Build: success
Deploy: success
Pages artifact: `10037588288`
Artifact SHA-256: `51d21ca3022f923dad6b13a61ae46fac46337177bc499a3cf2c512ce3f9f6316`

Materialized public runtime:

- public named rows: **1,415**
- rows with `recommendedDishes`: **1,027**
- rows with a meaningful Chinese dish display (recommended or featured): **1,133 / 1,415 (80.1%)**
- approximate rows with a specific v2 basis: **842**
- existing/source-backed Chinese-dish rows: **291**
- intentionally unfilled rows: **282**
- generic fallback allowed: **false**
- `dishRuntimeMaterialized`: **true**

Approximate quality tiers:

- brand: **62**
- dish-keyword: **237**
- cuisine: **316**
- broad-cuisine: **227**

Exact legacy filler hits in the final Pages runtime:

- `招牌主菜`: **0**
- `时令小菜`: **0**

The remaining 282 rows are intentionally left blank rather than forcing generic recommendations.

## Manual artifact spot checks

Examples present in the final Pages artifact:

- `横浜家系ラーメン田中` -> `横滨家系拉面 / 叉烧`, basis `dish-iekei`, tier `dish-keyword`.
- `TOKYO麻辣湯` -> `麻辣烫 / 拌面`, basis `dish-malatang`, tier `dish-keyword`.
- `志乃田寿司` -> `寿司 / 金枪鱼握寿司`, basis `dish-sushi`, tier `dish-keyword`.
- `鳥貴族 神保町店` preserves existing/source-backed Chinese dish information rather than replacing it with an approximate rule.
- `ANDY` (`酒吧`) -> blank recommendation.
- `Good View Dining` (`餐厅`) -> blank recommendation.
- `Bar野澤` (`ダイニングバー・バル`) -> blank recommendation.

The deployed `index.html` loads `data/google_inventory_runtime.js` before `app.js`, and `app.js` consumes `window.GOOGLE_INVENTORY_RESTAURANTS` directly, so the materialized dish rows are on the actual browser path.

## Safety

The same run passed the zero-paid-data-API audit:

- paid data API policy: pass
- files scanned: 191
- hits: 0
- map mode: Leaflet/OpenStreetMap
- Google Maps use: external navigation only

## Commits

- `8489ccb4` — Materialize Chinese dish v2 into public runtime
- `c9a57418` — Add artifact-level Chinese dish runtime audit
- `d87c9e73` — Gate Pages on materialized Chinese dish runtime
