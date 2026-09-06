# Area1 Runtime Data Schema

Updated: 2026-09-06

This document describes the normalized fields emitted into `data/production_area1.js`. Source-maintenance shards may keep richer/raw evidence, but browser filtering and display should use only the normalized runtime fields below.

## Price / budget

### Runtime fields

```js
lunch: [1000, 1999],
dinner: [3001, 4000]
```

`lunch` and `dinner` are independent finite yen ranges. Either field may be `null`.

They are resolved independently by `scripts/price_resolver.mjs`; one provider no longer owns the restaurant's entire budget profile. A restaurant may therefore safely resolve, for example:

```text
lunch  -> exact Tabelog claim
dinner -> authorized Hot Pepper claim
```

without either claim deleting the other meal period.

### Price provenance

A source-only row may contribute a canonical meal price only when one of its `sourceRefs` explicitly claims:

- `budget` — legacy/both-meal price provenance;
- `lunchBudget` — lunch only;
- `dinnerBudget` — dinner only.

A stored `lunch` or `dinner` array without one of those claims is ignored. Pages runs `scripts/audit_price_resolution.mjs` with `STRICT_PRICE_PROVENANCE=1`, so an unprovenanced stored meal-price field fails the build.

### Evidence classes

Price source refs may additionally declare:

```js
priceEvidenceClass: 'explicit_range' // A
priceEvidenceClass: 'menu_derived'   // B
priceEvidenceClass: 'sparse'         // C
```

Aliases `A`, `B`, and `C` are accepted by the resolver.

Semantics:

- `explicit_range` — explicit branch-specific lunch/dinner budget or average-spend band. This is the default for legacy maintained budget claims and is eligible for hard filtering.
- `menu_derived` — a reviewed representative range derived from a sufficiently complete official menu. It is eligible only when no explicit range is available.
- `sparse` — one item, one course, one promotion, or similarly weak price evidence. It is audit/display evidence only and never enters the hard canonical budget filter.

Selection order is **evidence strength first**, then provider priority, then freshness. Thus an explicit exact Tabelog or authorized Hot Pepper range outranks an official-menu-derived band; an explicit official branch budget outranks other explicit providers.

Strong-source conflicts are never averaged silently.

### Current strict coverage

The current 656-restaurant production pool has:

- lunch known: **155**;
- dinner known: **253**;
- both meals known: **136**;
- either meal known: **272**;
- lunch missing: **501**;
- dinner missing: **403**.

The strict provenance audit currently reports **0** unprovenanced stored meal-price fields.

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

Semantics are deliberately strict:

- missing day key = **unknown for that day**;
- `[]` = **explicitly closed on that day**;
- one or more `[open, close]` pairs = known opening periods;
- close times may extend after midnight, up to `29:59`;
- timezone is always `Asia/Tokyo` for Area1.

`hoursReference` remains a browser-compatible Chinese display string, but it is generated from `openingHours`. It is never copied directly from a raw source string.

### Omission rule

If a reliable weekly schedule cannot be normalized, the canonical restaurant record contains neither `openingHours` nor `hoursReference`.

In particular:

- prose-only notes such as reservation-only / irregular closure are not schedules;
- a bare interval such as `11:00–20:00` is not assumed to mean seven days a week;
- a bare interval can be expanded only when the source separately gives exact regular closed days or explicitly states no regular closure;
- `不定休`, temporary schedules, source-calendar/SNS-dependent schedules, and otherwise ambiguous closure patterns are not promoted into filterable weekly hours.

Raw maintenance fields such as `openingHoursRaw`, `closedDays`, and `closedNote` must not leak into canonical production.

### Future open/closed filtering

Future runtime filtering should evaluate the user's current Japan-local weekday/time against `openingHours.days` only. A missing day must be treated as unknown, not as closed and not as open. This prevents restaurants with incomplete schedules from being incorrectly excluded or incorrectly presented as open.

## Featured dishes

### Strict recommendations

`recommendedDishes` remains the strict reviewed subset: 0–2 Chinese dish names where a maintained source explicitly identifies the item as recommended, popular, signature, famous, specialty, 看板, 名物, 自慢, or equivalent.

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
- `representative` — a reviewed source-backed representative dish, without implying an explicit recommendation claim.

Optional price fields are reserved for directly supported menu prices:

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

`data/featured_dishes.js` is exact-Place-ID keyed. Every representative entry must point to a source URL that is already registered as a `dishes` field claim for the same production Place ID. The canonical builder rejects unattached or unsupported featured-dish records.

## Audit rule

Final coverage numbers must be taken from the latest successful Pages audit. Conservative normalization/provenance rules may intentionally reduce an older descriptive-field count when the older value cannot be supported strongly enough for canonical filtering.
