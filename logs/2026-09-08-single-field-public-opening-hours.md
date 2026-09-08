# 2026-09-08 — Single-field public opening-hours normalization

## Goal

Public restaurant opening hours must use exactly one field. If a schedule cannot be normalized without guessing, it is hidden rather than exposed as raw source text.

## Public policy

Policy: `single-field-zh-v2`

The active GitHub Pages restaurant runtime exposes only:

- `hoursReference`

The following legacy/multiple schedule fields are stripped from every public restaurant row:

- `openingHours`
- `openingHoursRaw`
- `openingHoursText`
- `closedDays`
- `closedNote`
- `schedule`
- `scheduleText`
- `businessHours`

Maintenance/source-evidence files may retain raw provider facts for provenance and future repair, but those facts are not the public restaurant schedule field and are not read by `app.js` for opening-hours display.

## Normalization logic

1. Re-derive maintained canonical rows from strict provider-level `openingHoursRaw` evidence when available.
2. Split explicit weekday groups before assigning time intervals. This fixes the previous failure where a Saturday interval could be merged into Monday-Friday.
3. If multiple independently retained schedule facts normalize to different schedules, hide the public schedule instead of choosing one silently.
4. Reject overlapping intervals within a day as a semantic-normalization error.
5. Reject long/vague/changeable schedule prose (`不定`, `臨時`, changing calendars/SNS, facility-dependent hours, etc.).
6. Source-matched Hot Pepper-style compact schedules are accepted only when explicit weekday groups and concrete time ranges can be parsed unambiguously.
7. Public output is formatted in Chinese only, e.g. `周一、周二 11:00–15:00；周日 休息`.
8. If no safe normalization is available, `hoursReference` is omitted and the result card hides the opening-hours line.

## Validation result

GitHub Pages run: `34177906356`

- Build: **success**
- Deploy: **success**
- Pages artifact: `10037880653`
- Artifact SHA-256: `3d656dc119c71d6862d07b035b27af87718c23f39a1a8c3ca2faa92feccabe30`

Final public runtime (`1,415` named rows):

- visible normalized schedules: **622**
- normalized from maintained provider evidence: **241**
- normalized from already-valid non-conflicting schedule objects: **74**
- normalized from strict raw runtime text: **307**
- hidden because raw text could not be safely normalized: **122**
- hidden because retained sources conflicted: **14**
- hidden because an existing normalized object failed semantic validation: **1**
- rows without a schedule source: **656**
- legacy schedule field instances stripped: **717**

The counts reconcile exactly: `622 + 122 + 14 + 1 + 656 = 1,415`.

## Artifact-level checks

The final Pages artifact was downloaded and inspected directly.

Across all `1,415` rows in `window.GOOGLE_INVENTORY_RESTAURANTS`:

- `hoursReference` present: **622**
- `openingHours`: **0** row fields
- `openingHoursRaw`: **0** row fields
- `openingHoursText`: **0** row fields
- `closedDays`: **0** row fields
- `closedNote`: **0** row fields
- `schedule`: **0** row fields
- `scheduleText`: **0** row fields
- `businessHours`: **0** row fields
- visible schedules containing Japanese kana: **0**
- visible schedules containing ASCII prose: **0**
- visible schedules containing newlines/raw page text: **0**

`app.js` reads only `restaurant.hoursReference`; when it is absent, the result card does not render the opening-hours paragraph.

## Regression examples

Previous wrong normalization:

- `アパ社長カレー` incorrectly merged the Saturday `11:00–18:00` interval into Monday-Friday.

Final public value:

- `周一、周二、周三、周四、周五 11:00–15:00、18:00–22:00；周六 11:00–18:00；周日、节假日 休息`

Uncertain schedule intentionally hidden:

- `Bar野澤` has a closure note indicating closure days change case-by-case, so no public `hoursReference` is emitted.

Another strict multi-group example:

- `築地食堂 源ちゃん 神保町店` -> `周一、周二、周三、周四 11:30–15:00、17:00–22:30；周五 11:30–15:00、17:00–23:00；周六 11:30–22:00；周日、节假日 11:30–21:00`

## Cost / map safety

The same validation path keeps the existing zero-paid-data-API policy unchanged. The no-paid-data-API gate passed before the Pages build; map rendering remains Leaflet/OpenStreetMap and Google Maps remains external navigation only.

## Commits

- `4ccdf681` — Add strict single-field public hours policy
- `3d3ab342` — Normalize public hours before runtime materialization
- `345b9e5d` — Audit single-field public opening hours
- `48ee544e` — Make public hours normalization semantically strict
- `9335c2c2` — Revalidate hours against strict source evidence
- `00c2b22d` — Gate ambiguous public hours at artifact level
- `3d03b50a` — Assert corrected hours instead of hiding them
