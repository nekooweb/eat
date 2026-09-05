# Area1 Runtime Data Schema

Updated: 2026-09-06

This document describes the normalized fields emitted into `data/production_area1.js`. Source-maintenance shards may keep richer/raw evidence, but browser filtering and display should use only the normalized runtime fields below.

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

## Current audited coverage

The normalized-hours/featured-dish migration is validated in PR #6. The final numbers must be taken from the latest successful Pages/PR audit because conservative schedule rules can intentionally reduce the old descriptive-hours count.
