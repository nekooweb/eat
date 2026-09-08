import { normalizeOpeningHours, formatOpeningHoursZh, validateOpeningHours } from './opening_hours.mjs';

export const PUBLIC_HOURS_POLICY = 'single-field-zh-v1';
export const PUBLIC_HOURS_FIELD = 'hoursReference';

const LEGACY_PUBLIC_HOUR_FIELDS = [
  'openingHours',
  'openingHoursRaw',
  'openingHoursText',
  'closedDays',
  'closedNote',
  'schedule',
  'scheduleText',
  'businessHours'
];

const VAGUE_HOURS_RE = /不定|臨時|変則|変更|カレンダー|SNS|予約制|要確認|要問合|問い合わせ|お問い合わせ|公式.*確認/iu;

function closureValues(row) {
  const values = [];
  if (Array.isArray(row?.closedDays)) values.push(...row.closedDays);
  else if (row?.closedDays != null) values.push(row.closedDays);
  if (row?.closedNote != null) values.push(row.closedNote);
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

function rawCandidates(row) {
  return [
    row?.openingHoursRaw,
    row?.openingHoursText,
    row?.hoursReference,
    row?.scheduleText,
    row?.schedule,
    row?.businessHours
  ].map((value) => typeof value === 'string' ? value.trim() : '')
    .filter(Boolean);
}

function canonicalFromSchedule(row) {
  if (!validateOpeningHours(row?.openingHours)) return null;
  return formatOpeningHoursZh(row.openingHours);
}

function canonicalFromRaw(row) {
  const closed = closureValues(row);
  for (const raw of rawCandidates(row)) {
    // Vague or explicitly changeable schedules are safer to hide than to
    // normalize partially and present as authoritative.
    if (VAGUE_HOURS_RE.test(raw)) continue;
    const normalized = normalizeOpeningHours(raw, closed);
    if (!normalized || !validateOpeningHours(normalized)) continue;
    const formatted = formatOpeningHoursZh(normalized);
    if (formatted) return formatted;
  }
  return null;
}

export function materializePublicHours(rows) {
  const stats = {
    total: Array.isArray(rows) ? rows.length : 0,
    normalized: 0,
    hiddenUnparseable: 0,
    noScheduleSource: 0,
    strippedLegacyFields: 0
  };
  if (!Array.isArray(rows)) return stats;

  for (const row of rows) {
    const hadScheduleCandidate = validateOpeningHours(row?.openingHours) || rawCandidates(row).length > 0;
    const formatted = canonicalFromSchedule(row) || canonicalFromRaw(row);

    for (const field of LEGACY_PUBLIC_HOUR_FIELDS) {
      if (Object.hasOwn(row, field)) {
        delete row[field];
        stats.strippedLegacyFields += 1;
      }
    }
    delete row.hoursReference;

    if (formatted) {
      row.hoursReference = formatted;
      stats.normalized += 1;
    } else if (hadScheduleCandidate) {
      stats.hiddenUnparseable += 1;
    } else {
      stats.noScheduleSource += 1;
    }
  }
  return stats;
}

export function publicHoursForbiddenFields() {
  return [...LEGACY_PUBLIC_HOUR_FIELDS];
}
