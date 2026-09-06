# Area1 Runtime Data Schema

Updated: 2026-09-06

The browser now loads three data layers:

```text
production_area1.js          conservative canonical filtering/recommendation data
source_provenance.js         public source URLs and field lineage
hotpepper_rich_metadata.js   reviewed practical/source-native rich metadata
```

The overlays attach additional fields to exact existing production identities after `production_area1.js` loads. They do not create identities and they do not replace conservative canonical core fields.

## Canonical price / budget

### Runtime fields

```js
lunch: [1000, 1999],
dinner: [3001, 4000]
```

`lunch` and `dinner` are independent finite yen ranges. Either field may be `null`.

They are resolved independently by `scripts/price_resolver.mjs`; one provider no longer owns the restaurant's complete budget profile.

Example:

```text
lunch  -> exact Tabelog claim
dinner -> authorized Hot Pepper claim
```

### Price provenance

A source-only row may contribute a canonical meal price only when one of its `sourceRefs` explicitly claims:

- `budget` — legacy/both-meal price provenance;
- `lunchBudget` — lunch only;
- `dinnerBudget` — dinner only.

A stored `lunch` or `dinner` array without one of those claims is ignored. Pages runs `scripts/audit_price_resolution.mjs` with `STRICT_PRICE_PROVENANCE=1`, so an unprovenanced stored meal-price field fails the build.

### Evidence classes

Price source refs may declare:

```js
priceEvidenceClass: 'explicit_range' // A
priceEvidenceClass: 'menu_derived'   // B
priceEvidenceClass: 'sparse'         // C
```

Aliases `A`, `B`, and `C` are accepted.

Semantics:

- `explicit_range` — explicit branch-specific lunch/dinner budget or average-spend range. Hard-filter eligible and highest evidence class.
- `menu_derived` — reviewed representative range derived from a sufficiently complete official menu. Hard-filter eligible only when no explicit range is available.
- `sparse` — one item, one course, one charge, one promotion, search snippet or similarly weak evidence. Review/display evidence only; never enters the canonical hard budget filter.

Selection order is **evidence strength first**, then provider priority, then freshness.

Strong-source conflicts are never averaged silently.

### Menu-derived maintenance metadata

Reviewed B-class patches may retain maintenance-only derivation data such as:

```js
priceDerivations: [{
  sourceUrl: 'https://...',
  checkedAt: '2026-09-06',
  evidenceClass: 'menu_derived',
  method: 'complete-lunch-set-range',
  observedYen: [800, 900, 1400],
  note: '...'
}]
```

This metadata remains in source-maintenance shards so the range can be reproduced and audited.

### Current strict coverage

Current 656-restaurant canonical pool:

- lunch known: **157**;
- dinner known: **254**;
- both meals known: **137**;
- either meal known: **274**;
- lunch missing: **499**;
- dinner missing: **402**;
- unprovenanced stored meal-price fields: **0**.

## Canonical opening hours

### Runtime field

```js
openingHours: {
  timezone: 'Asia/Tokyo',
  days: {
    mon: [['11:30', '14:00'], ['17:00', '23:00']],
    tue: [['11:30', '14:00'], ['17:00', '23:00']],
    wed: [],
    thu: [['11:30', '14:00'], ['17:00', '23:00']]
  }
}
```

Day keys are `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`, and `holiday`.

Semantics:

- missing day key = **unknown for that day**;
- `[]` = **explicitly closed on that day**;
- one or more `[open, close]` pairs = known opening periods;
- close times may extend after midnight, up to `29:59`;
- timezone is always `Asia/Tokyo` for Area1.

`hoursReference` is a browser-compatible Chinese display string generated from `openingHours`; it is never copied directly from raw source prose.

### Omission rule

If a reliable weekly schedule cannot be normalized, the canonical row contains neither `openingHours` nor `hoursReference`.

In particular:

- prose-only notes such as reservation-only / irregular closure are not schedules;
- a bare interval such as `11:00–20:00` is not assumed to mean seven days a week;
- a bare interval can be expanded only when the source separately gives exact regular closed days or explicitly states no regular closure;
- `不定休`, temporary schedules, source-calendar/SNS-dependent schedules, and otherwise ambiguous closure patterns are not promoted into filterable weekly hours.

The Hot Pepper rich overlay may retain `hotpepperOpeningHoursText` and `hotpepperClosedText` as raw source evidence even when they cannot be normalized. These fields must not be used as canonical open/closed filters directly.

## Featured dishes

### Strict recommendations

`recommendedDishes` is the strict reviewed subset: 0–2 Chinese dish names where a maintained source explicitly identifies the item as recommended, popular, signature, famous, specialty, 看板, 名物, 自慢, or equivalent.

### Broader featured/representative dishes

`featuredDishes` is the public display field:

```js
featuredDishes: [
  {
    nameJa: 'マトンビリヤニ',
    nameZh: '羊肉比尔亚尼',
    kind: 'representative'
  }
]
```

Supported `kind` values:

- `recommended` — derived from the strict recommendation set;
- `signature` — explicitly supported as a signature/specialty;
- `representative` — a reviewed source-backed representative dish without implying an explicit recommendation claim.

Optional dish-price fields are reserved for directly supported menu prices. Do not infer a dish price from a restaurant-level budget.

## Public source provenance overlay

`data/source_provenance.js` is generated by `scripts/build_source_provenance.mjs` from existing maintained `sourceRefs`.

Current coverage:

- **446 / 656** production identities with public source evidence;
- **606** concrete public HTTPS source URLs;
- **446** rows with explicit field claims and source check dates.

Per restaurant, optional runtime fields are:

```js
sourceLinks: [{
  provider: 'official',
  url: 'https://...',
  fields: ['name', 'hours'],
  checkedAt: '2026-09-06',
  priceEvidenceClass: 'explicit_range', // optional
  derivationMethod: '...'               // optional
}],
sourceClaimedFields: ['hours', 'name'],
sourceLastCheckedAt: '2026-09-06'
```

Rules:

- only public HTTPS refs are emitted;
- Google source refs are excluded;
- provider/URL duplicates are merged;
- claimed fields are unioned without changing canonical field selection;
- latest valid check date becomes `sourceLastCheckedAt`;
- the overlay makes no external requests.

## Hot Pepper rich metadata overlay

`data/hotpepper_rich_metadata.js` is generated from reviewed Hot Pepper current-production bindings. Current reviewed population is **135** rows: 128 strict automatic + 7 explicit manual exact pairs.

Every rich row retains `hotpepperReviewMode` (`strict_auto` or `manual_exact`).

Optional runtime fields include:

```js
hotpepperId: 'J001...',
hotpepperReviewMode: 'strict_auto',
hotpepperUrl: 'https://...',
couponUrl: 'https://...',
hotpepperName: '...',
nameKana: '...',
hotpepperAddress: '...',
hotpepperLocation: { lat: 35.0, lng: 139.0 },
hotpepperGenre: {
  code: 'G001',
  name: '居酒屋',
  catch: '...',
  subGenre: { code: 'G001', name: '...' }
},
hotpepperBudget: {
  code: 'B003',
  name: '3001～4000円',
  average: '...'
},
nearestStation: '神保町',
accessText: '...',
mobileAccessText: '...',
budgetMemo: '...',
sourceCatch: '...',
lunchAvailable: true,
capacity: 40,
partyCapacity: 50,
hotpepperOpeningHoursText: '...',
hotpepperClosedText: '...',
amenities: { ... },
sourceServiceText: { ... }
```

### Amenities

Normalized amenity keys may include:

```text
courseAvailable
allYouCanDrink
allYouCanEat
privateRoom
cardAccepted
parkingAvailable
wifiAvailable
horigotatsu
tatami
charterAvailable
barrierFree
childrenWelcome
smokingPolicy
liveShow
karaoke
bandPerformance
tvProjector
englishMenu
petAllowed
lateNightAfter23
```

`sourceServiceText` preserves the original provider string for service fields so conditions/caveats are not lost when a boolean is normalized.

Unknown/ambiguous values stay unknown. For example, raw Wi-Fi text exists for all 135 reviewed rows but `wifiAvailable` is only emitted for **107** unambiguous rows.

### Rich-layer isolation rules

The rich overlay:

- never creates a production identity;
- never overwrites canonical `name`, `address`, `cuisine`, `lunch`, `dinner` or `openingHours`;
- never stores Hot Pepper photos;
- attaches only to exact reviewed production IDs;
- may preserve source-native variants and raw source text for display/audit/future filters.

## Overlay audit

`scripts/audit_runtime_overlays.mjs` loads all three runtime layers together and fails if:

- a rich/provenance row is unattached;
- a rich/provenance identity is duplicated;
- the expected 135 rich rows / 7 manual rows are not present;
- public provenance contains a Google provider ref;
- runtime attachment counts disagree with overlay row counts.

Final canonical coverage numbers still come from the Pages canonical audits; overlay counts are tracked separately so richer metadata is not confused with filterable canonical completeness.
