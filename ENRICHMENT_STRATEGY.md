# Area1 Bulk Content Enrichment Strategy

Updated: 2026-09-06

## Decision

**Area1 candidate discovery is complete enough for the current phase. The main problem is content enrichment of the known list.**

The historical 2,804-identity capture succeeded. The successful full-collection and retry artifacts provide a one-time matching seed for the identities that were not already in production. No new paid Google request is required.

The primary engineering objective is:

> Bind the already-known Area1 identities to high-yield structured/official sources and complete the fields that improve recommendation quality and filtering, using as few requests and review minutes as possible.

`HOTPEPPER_ENRICHMENT.md` is the detailed design for the first structured enrichment layer.

## 1. Field priorities

### P0 — identity and basic usefulness

Complete first:

- current existence/source evidence;
- durable name and aliases;
- coordinates and address;
- cuisine / restaurant type;
- source-native IDs and provenance;
- official/Hot Pepper URL where permitted.

### P1 — filtering value

- dinner budget;
- lunch budget;
- transparent price evidence class.

### P2 — useful display context

- normalized weekly opening hours;
- regular closing days;
- phone;
- menu URL(s).

### P3 — optional enrichment

- featured/signature dishes;
- strict recommendation evidence;
- descriptive fields.

Progress should be optimized for P0/P1 before spending large effort on P3.

## 2. Existing full-list capture is a transient matching bridge

The previous paid sweep must not be repeated.

The still-available private Actions artifacts may be used only inside a short-lived bridge job for matching features such as:

- historical Place ID;
- transient name/alias;
- transient address;
- transient coordinates;
- operational/type signals.

Do not commit those Google display fields.

Use them to create persistent bindings to allowed sources, for example:

```text
legacy Place ID
  -> Hot Pepper shop ID
  -> official/brand locator URL
  -> OSM element ID
  -> Foursquare OS ID
  -> Overture/GERS ID
  -> AllThePlaces/official chain ref
```

After the bridge, canonical fields should be resolved from the permitted source claims rather than from transient Google display payload.

## 3. Primary structured source: Hot Pepper Gourmet API

Project-owner guidance states that the project is non-commercial and that the intended Hot Pepper API use has been separately authorized/confirmed. The enrichment architecture therefore treats Hot Pepper as a first-class source under that project-specific authorization assumption.

The public general Recruit API terms contain stricter default cache/database provisions. Non-commercial status alone should not be documented as automatically overriding those provisions. If the separate authorization scope is different from the current project assumption, persistence/refresh behavior must be adjusted accordingly.

### Why Hot Pepper is high-yield

A full Gourmet Search response can provide in one structured record:

- Hot Pepper shop ID;
- Japanese name and kana;
- address;
- coordinates;
- genre/sub-genre and catch;
- dinner budget code/range/average;
- budget memo;
- opening-hours text;
- regular closed days;
- lunch availability;
- shop URL;
- useful secondary restaurant attributes.

This directly targets several of the project's weakest fields: address, cuisine, dinner budget and opening hours.

### Batch pattern

Do not query the 2,804 identities one-by-one.

Initial binding:

1. geographically query a safe Area1 superset with `type=lite`;
2. request up to 100 rows per page;
3. paginate;
4. crop locally to the exact 1.2 km radius;
5. match locally to the known identity seed.

After Hot Pepper IDs are bound:

- request full detail using up to 20 shop IDs per API request;
- refresh only bound IDs in batches;
- compare normalized field hashes so unchanged rows do not trigger unnecessary rebuild work.

### Public credit

If Hot Pepper API information is displayed publicly, include the required service credit:

`Powered by ホットペッパーグルメ Webサービス`

Do not use Hot Pepper images in the current phase.

## 4. Secondary source roles

No single source should be universal truth for every field.

### Official restaurant pages / chain locators

Use primarily for:

- lunch price/budget;
- exact branch conflicts;
- menu/signature dishes;
- strict recommendation evidence;
- restaurants not covered by Hot Pepper;
- higher-authority branch schedules when available.

### AllThePlaces + official locator logic

Use as a high-efficiency chain layer.

AllThePlaces maintains Japanese store-locator spiders and releases generated data under CC0. Reuse relevant mature locator logic where possible rather than rebuilding every chain integration from scratch.

### OpenStreetMap

Use for:

- independent coordinates;
- cuisine/type tags;
- `opening_hours`;
- address;
- website/contact tags;
- conflict checks.

For large refreshes prefer a local/cached extract rather than systematic public query traffic.

### Foursquare Open Source Places

Use primarily for unmatched identities and currentness/cross-checking:

- name;
- coordinates;
- address;
- category;
- phone;
- website;
- refresh/closure signals;
- FSQ identity.

### Overture Maps Places

Use primarily for unmatched identities and source cross-checks:

- multilingual names;
- taxonomy;
- address/coordinates;
- website/phone/brand;
- confidence;
- source lineage;
- GERS identity.

Because Overture is itself a conflated multi-provider dataset, agreement with one of its own upstream providers is not automatically independent evidence.

## 5. Matching strategy

The completed Google sweep frequently returned romanized/English names for Japanese restaurants. Exact Japanese-name matching is therefore insufficient.

Use blocked multi-signal matching:

- geodesic distance;
- Japanese/Latin aliases;
- address/postal/building tokens;
- name kana when available;
- phone;
- official domain;
- brand + branch;
- category compatibility;
- previously reviewed source bindings.

### Confidence principles

Strong evidence examples:

- exact phone match;
- exact official domain + compatible address/name;
- <=20 m + strong address/building + compatible name;
- very close unique candidate in a building;
- strong name + strong address agreement.

Weak evidence examples:

- same building with generic/low-similarity names;
- category-only agreement;
- two aggregate records that ultimately share the same upstream source.

Use a calibrated probabilistic/weighted record-linkage model for ambiguous cases rather than one universal threshold. Enforce one-to-one/source-uniqueness constraints after scoring.

For Area1 scale, DuckDB/Splink-style linkage is practical.

## 6. Hot Pepper field mapping

### Name/address/coordinates

Treat Hot Pepper fields as field claims, not direct canonical overwrites:

- `id` -> source alias;
- `name` / `name_kana` -> name claims/aliases;
- `address` -> address claim;
- `lat` / `lng` -> coordinate claim.

The resolver can prefer a stronger official/geospatial source when conflicts exist.

### Cuisine

Use:

- `genre.code` / `genre.name`;
- `genre.catch`;
- `sub_genre`;
- shop catch only as supporting evidence.

Map into the existing Chinese display taxonomy through a versioned mapping table while retaining source codes/names.

### Dinner budget

Use:

- `budget.code`;
- `budget.name`;
- `budget.average`;
- `budget_memo`.

This is a major structured P1 source.

Do not treat cover charges or isolated course prices as the restaurant spend band.

### Lunch

`lunch=あり` means lunch service exists. It does not provide a lunch budget.

Use lunch availability to prioritize official menu/branch-page enrichment.

### Hours

Use:

- `open` as raw opening-hours text;
- `close` as regular closed-day text.

Keep raw text, normalized schedule, parser confidence, source and checked date.

## 7. Host-first official completion

After the structured Hot Pepper pass, process remaining gaps by host/template, not restaurant-by-restaurant.

```text
known identities
 -> Hot Pepper/open-data bindings
 -> official URLs
 -> group by brand/domain/template
 -> fetch each unique URL once
 -> parse each host family once
 -> emit field claims
 -> resolve canonical values
```

Prioritize hosts covering many unmatched or P1-incomplete identities.

## 8. One official fetch should extract every useful field

For each verified official page, collect in the same pass:

- exact branch identity;
- name/address/phone;
- cuisine;
- weekly hours and closed days;
- explicit budget/average-spend statements;
- lunch/dinner menu prices;
- menu URLs;
- featured/signature dishes;
- strict recommendation signals.

Parse in this order:

1. JSON-LD / Schema.org;
2. stable official locator JSON/API payload;
3. embedded application state;
4. semantic HTML sections;
5. bounded menu/detail links;
6. text-based PDF menus when useful.

Image-only OCR is a lower-priority fallback.

## 9. Price model

Do not weaken the meaning of budget silently.

Use an evidence-classed `priceProfile`:

- **A** — explicit average/budget/spend range from an authorized structured exact source or official source;
- **B** — official lunch/dinner menu with enough comparable main/set items to derive an observed band;
- **C** — sparse item/course evidence; review/display only, not hard filtering.

Hot Pepper can provide a large A/B-quality dinner layer depending on resolver policy. Lunch remains mainly official-menu driven.

## 10. Opening-hours normalization

Keep:

- source raw text;
- normalized weekly schedule;
- parser confidence;
- source URL/ID;
- checked date.

Parsing order:

1. structured Hot Pepper or Schema.org hours;
2. known host adapter;
3. OSM `opening_hours` syntax;
4. conservative Japanese free-text parser;
5. manual review for conflicts/irregular schedules.

Temporary/holiday notes are not forced into weekly schedules.

## 11. Recommended/featured dishes

### Strict recommendation

Require a concrete dish near explicit evidence such as:

- おすすめ;
- 人気;
- 名物;
- 看板;
- 自慢.

### Featured dish

May use broader official signals such as:

- prominent menu headings;
- signature sections;
- `こだわり` sections;
- explicit specialty descriptions.

Hot Pepper catch text can help prioritize review but should not automatically fabricate a concrete recommended dish when none is named.

## 12. Field-claim architecture

Bulk collectors should emit field-level claims rather than mutate canonical rows directly.

Each claim should contain:

```text
entity/alias key
field
value
source provider
source-native ID or URL
checked_at
extraction method
confidence
lineage
```

The resolver then chooses canonical values.

Existing `source_enrichment_*.js` can remain the generated compatibility layer while a compact claim ledger is introduced behind it.

## 13. Immediate execution order

### Phase A — bridge the existing paid sweep

1. download/merge the successful full-collection and retry artifacts;
2. combine with current production identities;
3. keep Google display fields transient;
4. use them only for matching source aliases.

### Phase B — Hot Pepper structured pass

1. geographic Hot Pepper `lite` pagination over Area1 superset;
2. exact 1.2 km local crop;
3. match Hot Pepper IDs to known identities;
4. review only collisions/ambiguous cases;
5. persist permitted bindings;
6. full detail requests in 20-ID batches;
7. emit address/cuisine/dinner-budget/hours/close/name field claims.

### Phase C — measure remaining gaps

Build a coverage matrix for every known identity:

- Hot Pepper binding;
- independent source binding;
- cuisine;
- dinner budget;
- lunch budget;
- hours;
- official URL;
- dishes/recommendations.

### Phase D — targeted completion

1. official/AllThePlaces chain adapters;
2. official generic pages;
3. FSQ OS / Overture / OSM for unmatched identities/conflicts;
4. menu extraction for lunch and dishes.

### Phase E — human review

Manual review only for:

- identity collisions;
- same-building ambiguity;
- source conflicts;
- price/hour promotion uncertainty;
- strict recommendation evidence.

Do not manually inspect thousands of straightforward high-confidence matches.

## 14. Progress metrics

Stop using candidate discovery count as the main KPI.

Report:

- total known Area1 identities;
- Hot Pepper matched identities;
- identities with >=1 permitted durable source binding;
- identities with >=2 genuinely independent source signals;
- P0-complete identities;
- cuisine coverage;
- Hot Pepper dinner-budget coverage;
- official lunch-price coverage;
- normalized-hours coverage;
- official-site/locator coverage;
- featured/recommended dish coverage;
- unresolved identity/source conflicts;
- unique hosts/templates remaining;
- network requests per newly completed field;
- review minutes per resolved ambiguous identity.

The useful optimization target is **fields completed per network request / per review minute**, not raw POI count.
