# Area1 Runtime Data Schema

Updated: 2026-09-06

This document describes the normalized fields emitted into `data/production_area1.js`. Source-maintenance shards may keep richer/raw evidence, but browser filtering and display use only the normalized runtime fields below.

## Price / budget

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

This metadata remains in source-maintenance shards and is not required in browser runtime rows. It exists so the range can be reproduced and audited.

### Current strict coverage

Latest successful Pages audit, 656 restaurants:

- lunch known: **157**;
- dinner known: **254**;
- both meals known: **137**;
- either meal known: **274**;
- lunch missing: **499**;
- dinner missing: **402**;
- unprovenanced stored meal-price fields: **0**.

## Opening hours

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

Raw maintenance fields such as `openingHoursRaw`, `closedDays`, and `closedNote` must not leak into canonical production.

### Future open/closed filtering

Runtime filtering should evaluate Japan-local weekday/time against `openingHours.days` only. A missing day is unknown, not closed and not open.

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

Optional dish-price fields are reserved for directly supported menu prices:

```js
{
  nameJa: '...',
  nameZh: '...',
  kind: 'representative',
  priceYen: 1200,
  priceText: '¥1,200'
}
```

Do not infer a dish price from a restaurant-level budget.

`data/featured_dishes.js` is exact-Place-ID keyed. Every representative entry must point to a source URL already registered as a `dishes` field claim for the same production identity.

## Audit rule

Final coverage numbers must come from the latest successful Pages audit. Conservative normalization/provenance rules may intentionally reduce an older descriptive-field count when the older value is not sufficiently supported for canonical filtering.
