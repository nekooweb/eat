# Public Restaurant Pool and Featured-Dish Completion — 2026-09-07

## Objective

Expand the live `TOKYO / 地区1️⃣` recommendation pool from the 662-row high-confidence canonical set to well above 2,000 named/geocoded restaurants immediately, while keeping the original identity/QC guarantees intact and making featured-dish completion the highest-priority enrichment task.

## Why the 2,804 historical Google inventory IDs are not directly rendered

`data/area1_google_ids.json` intentionally retains the exact historical Google Place ID inventory but not Google display payloads. The repository policy keeps Place IDs as compatibility/identity keys and does not persist transient Google names, addresses, types or other paid-API response content.

Therefore an inventory-only Place ID cannot honestly be converted into a normal restaurant card unless an independent retained source supplies a display identity.

The live expansion consequently uses named/geocoded public-source records instead of fabricating names for ID-only slots.

## Two-tier live architecture

### Tier 1 — canonical core

`data/production_area1.js`

- 662 restaurants;
- unchanged admission rules;
- legacy independent-QC identities plus explicit reviewed catalog admissions;
- existing source precedence, price provenance, schedule normalization and audits remain authoritative.

### Tier 2 — public/open expansion

Generated at deploy time as:

`data/public_pool_area1.js`

Builder:

`scripts/build_public_open_pool.mjs`

The builder consumes only retained/free data already present in the repository:

1. inventory-only Hot Pepper source-native facts that have name + coordinates;
2. Overture Maps public Places candidates inside the precise 1.2 km radius;
3. OpenStreetMap restaurant candidates inside the same radius.

The builder removes exact-name/near-location duplicates against the canonical core and against earlier public rows. Public/open rows use `identityAdmission: open_public_catalog` and are never counted as canonical Google-verified identities.

The first CI generation produced:

- canonical core: 662;
- public/open rows: 4,571;
- combined online pool: 5,233;
- Hot Pepper inventory-bound expansion: 388;
- Overture Maps expansion: 3,573;
- OpenStreetMap expansion: 610;
- public rows with address: 4,021;
- public rows with hours: 482;
- public rows with finite budget: 385;
- public rows with dish-reference coverage: 4,571 / 4,571.

The build has a hard minimum of 2,000 combined online rows. It fails instead of deploying if the generated pool drops below that threshold.

## Google Maps behavior

Rows with a retained historical Google Place ID keep the precise `query_place_id` navigation path.

Rows sourced only from Overture/OpenStreetMap do not receive a fake Google Place ID. Their Google Maps link is a normal name/address search. Leaflet/OpenStreetMap remains available for all rows with coordinates.

## Featured dishes: verified vs reference

Featured-dish information is now explicitly split into two states.

### `特色菜`

Used only when an existing restaurant/provider source supports the dish, through canonical `featuredDishes` or `recommendedDishes`.

### `参考菜品`

Used when source-backed store-specific signature dishes are not complete yet. It is derived conservatively from known cuisine/brand/chain category and is marked internally as:

`featuredDishConfidence: reference_hint`

Examples include ramen for a ramen shop, curry for a curry shop, or chain-level product families such as beef bowls for Yoshinoya. These hints improve the immediate usefulness of the 2,000+ expansion but do **not** count as verified featured-dish completion.

The UI and footer explicitly disclose this distinction.

## Source-backed featured-dish completion queue

Added:

`scripts/build_public_dish_queue.mjs`

This produces a full work queue for upgrading reference hints into actual source-backed featured dishes. Priority order is:

1. canonical restaurants still missing source-backed dishes;
2. Hot Pepper inventory-bound public rows;
3. public rows with a retained provider/official website;
4. Overture identities requiring official-menu discovery;
5. OSM identities requiring official/Tabelog/menu-source discovery.

Reference hints never satisfy the queue's definition of completion.

## Runtime changes

`app.js` now merges:

`PRODUCTION_RESTAURANTS + PUBLIC_OPEN_RESTAURANTS`

for recommendation/filtering while preserving the tier on each row.

Cards display:

- `来源绑定` for independently source-bound public records;
- `开放数据` for open-source expansion rows;
- `特色菜` for source-backed dishes;
- `参考菜品` for unverified dish hints.

## Deployment and QA

GitHub Pages generates the public pool after canonical production and before repository audits. The generated file is validated and copied into the public Pages artifact.

`audit_repository.mjs` keeps all original canonical checks and additionally verifies that:

- the public pool is loaded in the intended runtime order;
- combined online rows are at least 2,000;
- every public row has a unique public identity key;
- every public row has name, coordinates and a <=1.2 km distance;
- every public row has a reference dish hint;
- reference hints are explicitly marked reference-only;
- forbidden Google response-content fields are not persisted.

## Data-cost policy

This expansion uses zero paid Google Places/Text Search/Place Details calls. Overture Maps and OpenStreetMap are open/public sources; Hot Pepper data is reused from already-retained source artifacts.

## Next enrichment focus

Restaurant identity count is no longer the bottleneck. Future development should prioritize upgrading dish state in the generated queue from `参考菜品` to source-backed `特色菜`, followed by hours, lunch/dinner budgets and addresses.
