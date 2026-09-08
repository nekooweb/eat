import { formatOpeningHoursZh, validateOpeningHours } from './opening_hours.mjs';

export const PUBLIC_HOURS_POLICY = 'single-field-zh-v2';
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

const DAY_ORDER = ['月', '火', '水', '木', '金', '土', '日'];
const DAY_KEYS = { 月: 'mon', 火: 'tue', 水: 'wed', 木: 'thu', 金: 'fri', 土: 'sat', 日: 'sun' };
const DAY_TOKEN = '(?:[月火水木金土日](?:曜(?:日)?)?|祝日|祝前日|祝|平日|毎日)';
const COLON_DAY_GROUP_RE = new RegExp(`(?<label>${DAY_TOKEN}(?:\\s*[～〜~\\-–—・、,／/]?\\s*${DAY_TOKEN})*)\\s*:`, 'gu');
const TIME_RANGE_RE = /(?<startNext>翌)?(?<startHour>\d{1,2}):(?<startMinute>\d{2})\s*[～〜~\-–—]\s*(?<endNext>翌)?(?<endHour>\d{1,2}):(?<endMinute>\d{2})/gu;
const PAREN_RE = /（[^）]*）|\([^)]*\)/gu;
const VAGUE_HOURS_RE = /不定|臨時|変則|変更|カレンダー|SNS|予約制|要確認|要問合|問い合わせ|お問い合わせ|公式.*確認|営業時間は急遽|今後営業時間|感染症|コロナ/iu;
const VAGUE_CLOSURE_RE = /不定|都度変更|変動|施設に準ずる|臨時|営業.*変更|カレンダー|SNS/iu;

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

function expandDayExpression(value) {
  let text = String(value || '').trim();
  text = text.replaceAll('曜日', '').replaceAll('曜', '');
  text = text.replace(/平\s*日/gu, '平日').replace(/毎\s*日/gu, '毎日');
  text = text.replaceAll('平日', '月、火、水、木、金');
  text = text.replaceAll('毎日', '月、火、水、木、金、土、日、祝日');
  // A holiday eve is not a stable weekday. It may be ignored only when the
  // same group also names concrete weekdays/holidays; a standalone 祝前日
  // group is rejected below because it cannot be represented safely.
  text = text.replaceAll('祝前日', '');
  text = text.replaceAll('祝日', 'H').replaceAll('祝', 'H');
  text = text.replace(/\s+/gu, '');
  text = text.replace(/[〜~\-–—]/gu, '～');

  for (let guard = 0; guard < 8; guard += 1) {
    const match = text.match(/([月火水木金土日])～([月火水木金土日])/u);
    if (!match) break;
    const from = DAY_ORDER.indexOf(match[1]);
    const to = DAY_ORDER.indexOf(match[2]);
    if (from < 0 || to < 0 || from > to) return null;
    const expanded = DAY_ORDER.slice(from, to + 1).join('、');
    text = text.replace(match[0], expanded);
  }

  if (text.replace(/[月火水木金土日H、・,／/]/gu, '')) return null;
  const days = [];
  for (const token of text) {
    const key = DAY_KEYS[token] || (token === 'H' ? 'holiday' : null);
    if (key && !days.includes(key)) days.push(key);
  }
  return days.length ? days : null;
}

function normalizeClock(hourText, minuteText) {
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
  if (hour === 24 && minute !== 0) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function extractIntervals(segment) {
  const clean = String(segment || '').replace(PAREN_RE, '');
  const intervals = [];
  TIME_RANGE_RE.lastIndex = 0;
  for (const match of clean.matchAll(TIME_RANGE_RE)) {
    const start = normalizeClock(match.groups.startHour, match.groups.startMinute);
    const end = normalizeClock(match.groups.endHour, match.groups.endMinute);
    if (!start || !end || start === '24:00') return null;
    const pair = [start, end];
    if (!intervals.some((item) => item[0] === pair[0] && item[1] === pair[1])) intervals.push(pair);
  }
  return intervals.length ? intervals : null;
}

function addIntervals(days, labels, intervals) {
  for (const key of labels) {
    if (!Array.isArray(days[key])) days[key] = [];
    for (const interval of intervals) {
      if (!days[key].some((item) => item[0] === interval[0] && item[1] === interval[1])) {
        days[key].push(interval);
      }
    }
  }
}

function pureClosedDays(values) {
  const closed = [];
  for (const value of values || []) {
    const text = String(value || '').trim();
    if (!text || /^(なし|無休|定休日なし)$/u.test(text)) continue;
    if (VAGUE_CLOSURE_RE.test(text)) continue;
    const stripped = text.replace(/^(定休日[:：]?\s*)/u, '').trim();
    const expanded = expandDayExpression(stripped);
    if (!expanded) continue;
    for (const key of expanded) if (!closed.includes(key)) closed.push(key);
  }
  return closed;
}

function parseStrictRawHours(raw, closures = []) {
  const text = String(raw || '').trim();
  if (!text || VAGUE_HOURS_RE.test(text)) return null;
  if ((closures || []).some((value) => VAGUE_CLOSURE_RE.test(String(value || '')))) return null;

  const days = {};
  COLON_DAY_GROUP_RE.lastIndex = 0;
  const groups = [...text.matchAll(COLON_DAY_GROUP_RE)];

  if (groups.length) {
    const before = text.slice(0, groups[0].index).replace(PAREN_RE, '');
    TIME_RANGE_RE.lastIndex = 0;
    if (TIME_RANGE_RE.test(before)) return null;

    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      const labels = expandDayExpression(group.groups.label);
      if (!labels) return null;
      const start = group.index + group[0].length;
      const end = index + 1 < groups.length ? groups[index + 1].index : text.length;
      const intervals = extractIntervals(text.slice(start, end));
      if (!intervals) return null;
      addIntervals(days, labels, intervals);
    }
  } else {
    const segments = text.split(/[;；]/u).map((value) => value.trim()).filter(Boolean);
    for (let segment of segments) {
      segment = segment.replace(/^営業時間\s*/u, '');
      const clean = segment.replace(PAREN_RE, '');
      TIME_RANGE_RE.lastIndex = 0;
      const firstTime = TIME_RANGE_RE.exec(clean);
      if (!firstTime) return null;
      let prefix = clean.slice(0, firstTime.index).trim();
      prefix = prefix.replace(/(?:ランチ|ディナー|居酒屋タイム|昼|夜)\s*$/u, '').trim();
      const labels = expandDayExpression(prefix);
      if (!labels) return null;
      const intervals = extractIntervals(segment);
      if (!intervals) return null;
      addIntervals(days, labels, intervals);
    }
  }

  for (const key of pureClosedDays(closures)) {
    if (!Object.hasOwn(days, key)) days[key] = [];
  }

  const schedule = { timezone: 'Asia/Tokyo', days };
  return isSemanticallySaneSchedule(schedule) && validateOpeningHours(schedule) ? schedule : null;
}

function clockMinutes(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/u);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isSemanticallySaneSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object' || !schedule.days || typeof schedule.days !== 'object') return false;
  for (const intervals of Object.values(schedule.days)) {
    if (!Array.isArray(intervals)) return false;
    const spans = [];
    for (const interval of intervals) {
      if (!Array.isArray(interval) || interval.length !== 2) return false;
      const start = clockMinutes(interval[0]);
      let end = clockMinutes(interval[1]);
      if (start == null || end == null || start >= 1440 || end > 1440) return false;
      if (end <= start) end += 1440;
      if (end - start <= 0 || end - start > 1440) return false;
      spans.push([start, end]);
    }
    spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (let index = 1; index < spans.length; index += 1) {
      if (spans[index][0] < spans[index - 1][1]) return false;
    }
  }
  return true;
}

function formatStrictRaw(raw, closures) {
  const normalized = parseStrictRawHours(raw, closures);
  return normalized ? formatOpeningHoursZh(normalized) : null;
}

function canonicalFromEvidence(sourceFacts) {
  const rawFacts = (sourceFacts || []).filter((fact) => typeof fact?.openingHoursRaw === 'string' && fact.openingHoursRaw.trim());
  if (!rawFacts.length) return { kind: 'none', value: null };

  const values = new Set();
  for (const fact of rawFacts) {
    const formatted = formatStrictRaw(fact.openingHoursRaw, closureValues(fact));
    if (formatted) values.add(formatted);
  }
  if (values.size > 1) return { kind: 'conflict', value: null };
  if (values.size === 1) return { kind: 'evidence', value: [...values][0] };
  return { kind: 'unparseable', value: null };
}

function publicHoursDecision(row, sourceFacts) {
  if (row?.basicInfoState === 'canonical') {
    const evidence = canonicalFromEvidence(sourceFacts);
    if (evidence.kind !== 'none') return evidence;

    if (row?.openingHours) {
      if (validateOpeningHours(row.openingHours) && isSemanticallySaneSchedule(row.openingHours)) {
        return { kind: 'schedule', value: formatOpeningHoursZh(row.openingHours) };
      }
      return { kind: 'semantic', value: null };
    }

    // Canonical rows with only scraped prose are deliberately hidden. We do
    // not re-interpret long official-page text at the public boundary.
    if (rawCandidates(row).length) return { kind: 'unparseable', value: null };
    return { kind: 'none', value: null };
  }

  const candidates = rawCandidates(row);
  if (!candidates.length) return { kind: 'none', value: null };
  const values = new Set();
  for (const raw of candidates) {
    const formatted = formatStrictRaw(raw, closureValues(row));
    if (formatted) values.add(formatted);
  }
  if (values.size > 1) return { kind: 'conflict', value: null };
  if (values.size === 1) return { kind: 'raw', value: [...values][0] };
  return { kind: 'unparseable', value: null };
}

export function materializePublicHours(rows, sourceFactsById = new Map()) {
  const stats = {
    total: Array.isArray(rows) ? rows.length : 0,
    normalized: 0,
    normalizedFromEvidence: 0,
    normalizedFromExistingSchedule: 0,
    normalizedFromStrictRaw: 0,
    hiddenUnparseable: 0,
    hiddenConflict: 0,
    hiddenSemantic: 0,
    noScheduleSource: 0,
    strippedLegacyFields: 0
  };
  if (!Array.isArray(rows)) return stats;

  for (const row of rows) {
    const decision = publicHoursDecision(row, sourceFactsById.get(row.googlePlaceId) || []);

    for (const field of LEGACY_PUBLIC_HOUR_FIELDS) {
      if (Object.hasOwn(row, field)) {
        delete row[field];
        stats.strippedLegacyFields += 1;
      }
    }
    delete row.hoursReference;

    if (decision.value) {
      row.hoursReference = decision.value;
      stats.normalized += 1;
      if (decision.kind === 'evidence') stats.normalizedFromEvidence += 1;
      else if (decision.kind === 'schedule') stats.normalizedFromExistingSchedule += 1;
      else stats.normalizedFromStrictRaw += 1;
    } else if (decision.kind === 'conflict') {
      stats.hiddenConflict += 1;
    } else if (decision.kind === 'semantic') {
      stats.hiddenSemantic += 1;
    } else if (decision.kind === 'unparseable') {
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
