# Development Log — 2026-09-07

This log records the shift from field-by-field enrichment to full-production field completion for `TOKYO / 地区1️⃣`.

## 1. Why the enrichment strategy changed

The earlier enrichment work substantially improved individual dimensions — Hot Pepper dinner budget, source provenance, provider facts, rich metadata, and official-menu-derived prices — but the production pool was still incomplete when evaluated restaurant by restaurant.

The key conclusion is:

> Restaurant identity discovery is largely solved; **record completeness is now the main problem**.

Continuing to process one field family at a time would repeatedly revisit the same restaurants and hide how incomplete an individual restaurant remained.

The development strategy therefore changed to:

```text
full current production load
-> complete per-restaurant field matrix
-> multi-field extraction per restaurant/source visit
-> rebuild matrix
-> repeat
```

## 2. Production pool changed from 656 to 662

During the first full-matrix build, the canonical production builder reported:

- legacy verified entities: **656**;
- catalog-reviewed entities: **6**;
- production entities: **662**;
- unique production Place-ID compatibility keys: **662**.

Latest rebuild metrics from Actions run `34041362830`:

- cuisine known: **607**;
- any meal budget known: **280**;
- lunch budget known: **167**;
- dinner budget known: **260**;
- both meal budgets known: **147**;
- normalized opening hours: **366**;
- featured dishes: **129**;
- strict recommended dishes: **30**;
- usable maintained source attached: **452**;
- 百名店: **22**.

This exposed an important maintenance rule: **production size must never be hard-coded in future enrichment workflows**.

## 3. Full enrichment matrix implemented

Added:

- `scripts/build_full_enrichment_matrix.mjs`;
- `.github/workflows/build-full-enrichment-matrix.yml`;
- generated maintenance artifact `data/area1_enrichment_matrix.json`.

The matrix combines:

- `data/production_area1.js`;
- `data/source_provenance.js`;
- `data/source_facts.js`;
- `data/hotpepper_rich_metadata.js`.

Unlike the previous enrichment queue, it does **not** stop at the first 200 high-priority records. It contains the entire current production set.

Every matrix row tracks:

- canonical field values;
- source providers and public source links;
- provider-level source facts;
- reviewed Hot Pepper rich metadata;
- core fields present/missing;
- practical fields present/missing;
- core/practical/overall completion score;
- next recommended enrichment action.

## 4. First run exposed a stale hard-coded denominator

Initial full-matrix Actions run `34041330418` successfully built the canonical production and generated a complete 662-row matrix, but the workflow validation still required exactly 656 records.

The matrix summary from that failed validation was already valid; only the stale denominator check failed.

The workflow was corrected to validate dynamically:

```text
productionEntities >= current expected floor
records.length === productionEntities
```

instead of requiring `656`.

## 5. Successful full 662-row matrix

Actions run `34041362830` completed successfully.

The workflow:

1. enforced the no-paid-data-API policy;
2. rebuilt canonical production;
3. rebuilt source provenance;
4. rebuilt provider source facts;
5. generated the full enrichment matrix;
6. validated matrix size against current production size;
7. committed the matrix.

Generated matrix commit:

`4510c99` — `Build full Area1 enrichment matrix`

The generated JSON contains all **662 / 662** production restaurants.

## 6. Full-matrix completeness baseline

### Core missing fields

- name: **0**;
- address: **333**;
- cuisine: **55**;
- lunch budget: **495**;
- dinner budget: **402**;
- normalized opening hours: **296**;
- featured dishes: **533**;
- strict recommended dishes: **632**.

Only **14 restaurants** currently have all fields in the provisional core-completeness set populated.

Completion averages:

- core score: **48%**;
- practical score: **31%**;
- overall score: **40%**.

### Practical/source-native missing fields

- source links: **210**;
- provider source facts: **210**;
- nearest station: **527**;
- access text: **527**;
- capacity: **527**;
- party capacity: **553**;
- lunch-availability signal: **527**;
- payment methods: **543**;
- amenities: **527**;
- source-native area hierarchy: **527**;
- raw source budget: **527**;
- raw source hours: **351**;
- raw source closure: **395**.

### Provisional next-action distribution

- fill identity fields: **340**;
- fill meal budget: **209**;
- fill featured dishes: **52**;
- fill practical fields: **33**;
- complete review: **19**;
- fill normalized hours: **9**.

This baseline confirms that the current bottleneck is **field completeness**, not restaurant discovery.

## 7. Evidence overlays after the 662-row rebuild

The rebuild also updated evidence-layer coverage.

### Public provenance

- production rows with public source links: **452**;
- total concrete public source URLs: **619**;
- Tabelog-linked rows: **322**;
- Hot Pepper-linked rows: **100**;
- official-linked rows: **149**;
- additional small exact-source groups include TableCheck and recent operational listings.

### Provider source facts

- rows with source facts: **452**;
- provider fact records: **543**;
- Tabelog: **303**;
- official: **140**;
- Hot Pepper: **100**;
- unattached maintained rows: **0**.

Retained source-fact counts now include:

- source names: **543**;
- cuisine: **280**;
- tags: **273**;
- lunch ranges: **167**;
- dinner ranges: **260**;
- dishes: **112**;
- raw opening hours: **299**;
- closed-day arrays: **206**;
- closure notes: **156**;
- addresses: **241**.

These facts are especially valuable for the new matrix because some canonical gaps may already have usable provider evidence that has not yet been safely promoted.

## 8. New field-state model

The first matrix uses simple present/missing checks, but long-term completion cannot remain binary.

The development logic now defines these target states:

- `known`;
- `source_available_unextracted`;
- `unknown`;
- `reviewed_none`;
- `conflict`;
- `not_applicable`.

This prevents incorrect incentives such as forcing every restaurant to have a non-empty `recommendedDishes` list. A strict recommendation may legitimately be absent after review because no maintained source explicitly calls any dish recommended, signature, popular, famous or equivalent.

Future matrix versions should count **evaluation completeness**, not only non-empty values.

## 9. New enrichment unit: one restaurant, many fields

The next enrichment phase will no longer visit a restaurant only to extract one requested field.

When an exact source is reviewed, the worker should try to capture all trustworthy available fields in one pass:

- identity/name/kana/address/coordinates;
- cuisine and source-native genre;
- lunch and dinner budgets;
- lunch availability;
- raw/normalized hours and closure;
- representative dishes;
- strict recommendations only with explicit evidence;
- station/access;
- capacity/party capacity;
- payment methods;
- Wi-Fi/private room/smoking/parking/barrier-free;
- children/pets/late-night/all-you-can-eat/drink;
- other source-supported amenities and branch metadata.

The optimization target is now:

> **trusted fields gained per restaurant/source visit**

rather than “number of rows processed for one column.”

## 10. Batch order from the matrix

The next data work should select batches in this order:

1. exact maintained source + many missing fields;
2. repeated official brand/domain groups;
3. exact Tabelog/official bindings;
4. reviewed Hot Pepper bindings and retained artifacts;
5. provider source facts that can safely resolve current canonical gaps;
6. conflicts requiring review;
7. only then rows with no usable source, using targeted ordinary web/search discovery;
8. open datasets primarily for identity/address/category/currentness.

Restaurant-count expansion is not the priority while the existing 662-row pool remains only about **48% core-complete on average**.

## 11. No-paid API policy remains intact

The successful full-matrix run passed `scripts/audit_no_paid_apis.mjs` with **0 hits**.

The matrix build itself makes no external API requests. It is derived from current repository canonical data and maintained overlays.

Paid Google Places / Text Search / Place Details remain prohibited.

## 12. Development documentation updated

`DEVELOPMENT.md` was rewritten to make the full-matrix strategy authoritative.

The updated document now records:

- current 662-row production pool;
- full-load-first enrichment architecture;
- complete matrix baseline;
- field-state model;
- restaurant-bundle extraction rule;
- production-size dynamic validation;
- new progress metrics;
- evidence-layer roles;
- no-paid API constraints.

This file is the starting point for the next bulk field-completion phase.
