# Hot Pepper Area1 Enrichment Design

Updated: 2026-09-06

## Decision

Hot Pepper Gourmet Web Service is promoted to a **first-class structured enrichment source** for the already-known Area1 restaurant list.

This is not a return to expensive per-restaurant discovery. The list/identity capture stage is already complete. Hot Pepper should be used to add structured content to known identities with a small number of free API calls.

## Authorization assumption

Project owner guidance on 2026-09-06 states that this project is non-commercial and that authorization for the intended Hot Pepper API use has already been obtained / confirmed.

The repository should operate under that project-specific authorization assumption.

The public general Recruit API terms otherwise contain stricter default provisions, including rapid cache refresh and restrictions on copying API information into a third-party database. Non-commercial status alone should not be documented as automatically overriding those provisions. If the project-specific authorization has narrower scope than expected, the persistence/refresh policy must be adjusted to that authorization.

Do not commit the API key. Use a GitHub Actions secret such as `HOTPEPPER_API_KEY`.

## Why Hot Pepper is high-value for this project

The Gourmet Search API provides a unusually useful set of fields in one structured response:

- Hot Pepper shop ID;
- Japanese shop name;
- name kana;
- address;
- latitude/longitude;
- genre and genre catch;
- sub-genre;
- dinner budget code/range;
- average dinner budget text;
- budget memo;
- shop catch;
- opening-hours text;
- regular closing-day text;
- lunch availability;
- shop URL;
- useful secondary attributes such as course/private room/card/non-smoking/parking where desired.

For Eat, the highest-value fields are identity/name/address/coordinates/cuisine, dinner budget, opening hours and closed days.

The API does **not** provide a proper lunch budget range. `lunch` only indicates whether lunch is available. Lunch-price completion should therefore continue from official menus/pages or another permitted source.

## API call strategy

### Do not query 2,804 restaurants individually

The known list is already complete enough for enrichment. Per-name/per-place lookup would waste requests and create matching inconsistencies.

### Phase 1 — geographic bulk discovery for Hot Pepper IDs

Use Gourmet Search with:

- Area1 center latitude/longitude;
- `range=4` (2 km) as a safe superset of the 1.2 km production radius;
- `count=100`;
- `type=lite`;
- JSON format;
- paginate with `start` until the reported result set has been collected.

Then:

1. compute exact distance locally;
2. discard rows outside the 1.2 km Area1 radius;
3. deduplicate by Hot Pepper shop ID;
4. match locally against the already-captured Area1 identity seed.

If the 2 km query is unexpectedly very large, the collector may switch to overlapping smaller-radius tiles and deduplicate locally. This is an optimization, not a change of data semantics.

### Phase 2 — full detail in 20-ID batches

After stable Hot Pepper IDs are bound, refresh/full-detail requests should use the API's multi-value `id` parameter.

The API accepts up to **20 shop IDs per request**.

For example:

```text
20 matched shops -> 1 detail request
400 matched shops -> ~20 detail requests
800 matched shops -> ~40 detail requests
```

This is the preferred recurring refresh model.

### Phase 3 — targeted exception lookup only when useful

Do not perform name searches for every unmatched known restaurant.

The geographic listing already represents the Hot Pepper universe for the scope. Targeted name/tel lookup should be limited to exceptional cases such as:

- a likely listing just outside the coarse geographic query because of coordinate disagreement;
- a known Hot Pepper URL/ID needing recovery;
- a high-value ambiguous branch where phone evidence can resolve the match.

## Matching against the successful Area1 sweep

Use the already-completed private full-collection/retry artifacts only as transient matching evidence.

Candidate features:

- historical Place ID;
- transient name/alias;
- transient address;
- transient coordinates;
- existing reviewed OSM/source candidate evidence.

Hot Pepper matching features:

- Hot Pepper ID;
- Japanese name;
- kana;
- address;
- coordinates;
- genre/sub-genre;
- later: official/Hot Pepper URL and other source evidence.

### Blocking

Only compare Hot Pepper rows to known identities inside a reasonable spatial neighborhood, for example 150-250 m, with a much tighter high-confidence region.

### Strong evidence

Examples:

- <=20 m + compatible address/building + compatible name/alias;
- very close coordinates + unique restaurant candidate in that building;
- strong name match + strong address match;
- exact phone match when available from another independent source;
- existing official-domain/branch evidence agreeing with the Hot Pepper row.

### Ambiguous evidence

Same-building restaurants and food courts must not auto-match from coordinates alone.

A low Japanese-name score is not automatically a rejection because the completed Google sweep frequently returned English/romanized display names. Use address, coordinates, brand and aliases together.

### One-to-one constraint

A Hot Pepper shop ID should bind to at most one canonical Area1 identity. A canonical identity should normally bind to at most one current Hot Pepper shop ID.

Collisions go to review rather than choosing the top score silently.

## Field mapping

### Identity/name/address

Hot Pepper may supply:

- `id` -> durable Hot Pepper alias/source ID;
- `name` -> source-backed Japanese name/alias;
- `name_kana` -> useful normalization/matching alias;
- `address` -> address claim;
- `lat`/`lng` -> geospatial claim.

Canonical coordinates should still be resolved across sources rather than blindly overwriting a better independent source.

### Cuisine

Use:

- `genre.code` / `genre.name`;
- `genre.catch`;
- `sub_genre`;
- shop `catch` only as supporting text.

Map Hot Pepper genre/sub-genre into Eat's versioned Chinese cuisine taxonomy. Preserve original Hot Pepper codes/names in field claims so mappings can be changed without re-querying.

### Dinner budget

Hot Pepper is particularly valuable here.

Use:

- `budget.code`;
- `budget.name`;
- `budget.average`;
- `budget_memo`.

Suggested evidence treatment:

- structured Hot Pepper dinner budget band -> `priceProfile.dinner` A/B depending on project resolver policy;
- explicit average text -> supporting high-value evidence;
- `budget_memo` -> display/review evidence, not necessarily the restaurant spend band.

Do not convert cover charge or isolated course prices into the budget band.

### Lunch

`lunch=あり` proves lunch availability only.

Do **not** convert it into a lunch price.

Use it to prioritize official-menu extraction for lunch-budget completion.

### Opening hours and closed days

Use:

- `open` as source raw opening-hours text;
- `close` as regular closed-day source text.

Feed these into the existing conservative Japanese hours normalizer. Keep raw text + parsed schedule + parser confidence + checked date.

Conflicting or irregular schedules remain review/unknown.

### Shop URL and attribution

Store the Hot Pepper shop URL/source reference when permitted by the project authorization and source policy.

If Hot Pepper API information is shown in the public application, include the required service credit:

`Powered by ホットペッパーグルメ Webサービス`

Do not ingest Hot Pepper images in this phase. This avoids unnecessary image licensing/credit complexity.

## Storage architecture

Do not dump full raw API responses directly into the public production JavaScript.

Preferred layers:

```text
Hot Pepper API response
 -> short-lived raw audit artifact
 -> exact identity binding
 -> field-level claims
 -> resolver
 -> generated source_enrichment compatibility shard
 -> canonical production
```

Recommended claim fields:

```text
entity key
hotpepper shop ID
field
value
source=HotPepper
checkedAt
extraction=api
confidence
raw field name
```

This makes refresh, conflict resolution and source removal manageable.

## Refresh model

Once IDs are bound, recurring refresh is cheap because 20 shop IDs can be requested together.

Recommended implementation:

1. daily or otherwise authorization-compliant snapshot refresh for bound Hot Pepper IDs;
2. use 20-ID batches;
3. compare normalized field hashes against the previous snapshot;
4. only rebuild/promote rows whose source data changed;
5. preserve previous data only according to the applicable authorization/refresh rules;
6. log disappeared Hot Pepper IDs as `listing_missing` rather than automatically `closed`.

API absence is not sufficient proof of permanent closure.

## Source precedence

Hot Pepper should be a major structured source, but not universal truth.

Suggested resolver precedence by field:

### Current branch identity

official branch locator/page > multiple agreeing independent sources > Hot Pepper alone > aggregate-only weak evidence

### Address

official branch source > exact high-confidence Hot Pepper/OSM/open-POI agreement > single source

### Cuisine

official/menu evidence > precise Hot Pepper sub-genre/genre > OSM/open-POI taxonomy > name inference

### Dinner budget

explicit official spend range or authorized structured Hot Pepper budget > derived official-menu observed band > sparse price evidence

### Hours

official branch schedule > current authorized Hot Pepper schedule / trusted locator > OSM hours > ambiguous free text

The exact precedence can be tuned empirically from Area1 conflicts.

## Immediate implementation order

1. keep the successful full-list private artifacts available for matching;
2. add a Hot Pepper geographic bulk collector using one paginated Area1 query;
3. generate `hotpepperId <-> known identity` match candidates locally;
4. review only ambiguous/collision matches;
5. persist authorized exact bindings;
6. request full Hot Pepper details in 20-ID batches;
7. generate field claims for cuisine, dinner budget, hours/close, address and aliases;
8. rebuild coverage metrics;
9. use official/AllThePlaces/OSM/Overture mainly for unmatched restaurants, lunch budget, menu/dish enrichment and conflict resolution;
10. add required Hot Pepper credit before public Hot Pepper-derived data is displayed.

## Expected impact

Hot Pepper changes the enrichment economics significantly:

- address coverage should rise quickly for matched listings;
- cuisine coverage becomes much easier to normalize;
- dinner-budget coverage can increase sharply without menu crawling;
- hours/closed-day coverage can be obtained in the same detail pass;
- the number of official-site fetches can be reduced and concentrated on lunch prices, dishes, unmatched restaurants and conflict resolution.

That makes the optimal pipeline **Hot Pepper structured bulk enrichment first, official/open-source completion second**, rather than attempting to crawl every restaurant website from scratch.
