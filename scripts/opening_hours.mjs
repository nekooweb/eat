const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'holiday'];
const WEEKDAYS = DAY_ORDER.slice(0, 7);

const DAY_LABELS_ZH = {
  mon: '周一', tue: '周二', wed: '周三', thu: '周四', fri: '周五', sat: '周六', sun: '周日', holiday: '节假日'
};

const JP_DAY = { 月: 'mon', 火: 'tue', 水: 'wed', 木: 'thu', 金: 'fri', 土: 'sat', 日: 'sun', 祝: 'holiday' };
const EN_DAY = {
  monday: 'mon', mon: 'mon', mo: 'mon',
  tuesday: 'tue', tue: 'tue', tu: 'tue',
  wednesday: 'wed', wed: 'wed', we: 'wed',
  thursday: 'thu', thu: 'thu', th: 'thu',
  friday: 'fri', fri: 'fri', fr: 'fri',
  saturday: 'sat', sat: 'sat', sa: 'sat',
  sunday: 'sun', sun: 'sun', su: 'sun',
  holiday: 'holiday', holidays: 'holiday'
};

function uniq(values) {
  return [...new Set(values)];
}

function expandRange(start, end) {
  const a = WEEKDAYS.indexOf(start);
  const b = WEEKDAYS.indexOf(end);
  if (a < 0 || b < 0) return [];
  if (a <= b) return WEEKDAYS.slice(a, b + 1);
  return [...WEEKDAYS.slice(a), ...WEEKDAYS.slice(0, b + 1)];
}

function normalizeDayText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/https?:\/\/schema\.org\//gi, '')
    .replace(/曜日/g, '')
    .replace(/曜/g, '')
    .replace(/祝日/g, '祝')
    .trim();
}

function parseDayToken(token) {
  const raw = normalizeDayText(token);
  if (!raw) return [];
  if (/^(毎日|全日)$/u.test(raw)) return [...WEEKDAYS, 'holiday'];
  if (/^(平日)$/u.test(raw)) return WEEKDAYS.slice(0, 5);

  const english = EN_DAY[raw.toLowerCase()];
  if (english) return [english];
  if (JP_DAY[raw]) return [JP_DAY[raw]];

  const range = raw.match(/^([月火水木金土日])\s*[-–—―−~〜～]\s*([月火水木金土日])$/u);
  if (range) return expandRange(JP_DAY[range[1]], JP_DAY[range[2]]);

  const englishRange = raw.match(/^([A-Za-z]+)\s*[-–—―−~〜～]\s*([A-Za-z]+)$/);
  if (englishRange) {
    const start = EN_DAY[englishRange[1].toLowerCase()];
    const end = EN_DAY[englishRange[2].toLowerCase()];
    if (start && end) return expandRange(start, end);
  }

  if (/^[月火水木金土日祝]+$/u.test(raw)) return uniq([...raw].map((x) => JP_DAY[x]).filter(Boolean));
  return [];
}

function parseDays(value) {
  const raw = normalizeDayText(value)
    .replace(/営業/g, '')
    .replace(/open/gi, '')
    .replace(/^[:：\s]+|[:：\s]+$/g, '');
  if (!raw) return [];
  if (raw.includes('毎日') || raw.includes('全日')) return [...WEEKDAYS, 'holiday'];
  if (raw.includes('平日') && !/[月火水木金土日]/u.test(raw)) return WEEKDAYS.slice(0, 5);

  const chunks = raw.split(/[\s,，、・･/]+/u).filter(Boolean);
  const parsed = chunks.flatMap(parseDayToken);
  if (parsed.length) return uniq(parsed);

  // Compact forms such as 日祝 / 土日祝.
  if (/^[月火水木金土日祝]+$/u.test(raw)) return uniq([...raw].map((x) => JP_DAY[x]).filter(Boolean));
  return [];
}

function validClock(hour, minute, isClose = false) {
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return false;
  if (isClose) return hour >= 0 && hour <= 29;
  return hour >= 0 && hour <= 23;
}

function clock(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseIntervals(value) {
  const cleaned = String(value || '')
    .normalize('NFKC')
    .replace(/[（(]\s*(?:L\.?O\.?|ラストオーダー)[^）)]*[）)]/gi, ' ')
    .replace(/(?:L\.?O\.?|ラストオーダー)\s*\d{1,2}:\d{2}/gi, ' ');
  const out = [];
  const re = /(\d{1,2}):(\d{2})\s*[-–—―−~〜～]\s*(?:翌\s*)?(\d{1,2}):(\d{2})/g;
  for (const match of cleaned.matchAll(re)) {
    const sh = Number(match[1]);
    const sm = Number(match[2]);
    const eh = Number(match[3]);
    const em = Number(match[4]);
    if (!validClock(sh, sm, false) || !validClock(eh, em, true)) continue;
    out.push([clock(sh, sm), clock(eh, em)]);
  }
  return uniq(out.map((x) => x.join('|'))).map((x) => x.split('|'));
}

function parseClosedDays(values) {
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const s = String(value || '').normalize('NFKC').trim();
    if (!s || /不定|無休|なし|無し/u.test(s)) continue;
    result.push(...parseDays(s));
  }
  return uniq(result);
}

function normalizeSegments(raw) {
  return String(raw || '')
    .normalize('NFKC')
    .replace(/\r/g, '\n')
    .replace(/；/g, ';')
    .replace(/[。]\s*/g, ';')
    .split(/[;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function normalizeOpeningHours(raw, closedDays = []) {
  const text = String(raw || '').trim();
  if (!text || !/\d{1,2}:\d{2}/.test(text)) return null;

  const explicitClosed = parseClosedDays(closedDays);
  const days = {};
  let openPeriodCount = 0;
  const segments = normalizeSegments(text);

  for (const segment of segments) {
    const intervals = parseIntervals(segment);
    if (!intervals.length) continue;
    const firstTime = segment.search(/\d{1,2}:\d{2}/);
    const prefix = firstTime >= 0 ? segment.slice(0, firstTime) : '';
    let targetDays = parseDays(prefix);
    if (!targetDays.length) {
      // A day-less schedule is interpreted only for ordinary weekdays/weekends;
      // holidays remain unknown unless explicitly stated by the source.
      targetDays = WEEKDAYS.filter((day) => !explicitClosed.includes(day));
    }
    for (const day of targetDays) {
      if (!days[day]) days[day] = [];
      days[day].push(...intervals.map((period) => [...period]));
      days[day] = uniq(days[day].map((period) => period.join('|'))).map((period) => period.split('|'));
      openPeriodCount += intervals.length;
    }
  }

  if (!openPeriodCount) return null;

  for (const day of explicitClosed) {
    if (!Object.hasOwn(days, day)) days[day] = [];
  }

  const orderedDays = {};
  for (const day of DAY_ORDER) if (Object.hasOwn(days, day)) orderedDays[day] = days[day];
  return { timezone: 'Asia/Tokyo', days: orderedDays };
}

export function validateOpeningHours(schedule) {
  if (!schedule || typeof schedule !== 'object' || schedule.timezone !== 'Asia/Tokyo') return false;
  if (!schedule.days || typeof schedule.days !== 'object' || Array.isArray(schedule.days)) return false;
  let openPeriods = 0;
  for (const [day, periods] of Object.entries(schedule.days)) {
    if (!DAY_ORDER.includes(day) || !Array.isArray(periods)) return false;
    for (const period of periods) {
      if (!Array.isArray(period) || period.length !== 2) return false;
      const m = period.map((value) => String(value).match(/^(\d{2}):(\d{2})$/));
      if (m.some((x) => !x)) return false;
      const sh = Number(m[0][1]); const sm = Number(m[0][2]);
      const eh = Number(m[1][1]); const em = Number(m[1][2]);
      if (!validClock(sh, sm, false) || !validClock(eh, em, true)) return false;
      openPeriods += 1;
    }
  }
  return openPeriods > 0;
}

function periodText(periods) {
  return periods.map(([open, close]) => `${open}–${close}`).join('、');
}

export function formatOpeningHoursZh(schedule) {
  if (!validateOpeningHours(schedule)) return null;
  const groups = [];
  const seen = new Set();
  for (const day of DAY_ORDER) {
    if (!Object.hasOwn(schedule.days, day) || seen.has(day)) continue;
    const signature = JSON.stringify(schedule.days[day]);
    const same = DAY_ORDER.filter((candidate) =>
      Object.hasOwn(schedule.days, candidate)
      && !seen.has(candidate)
      && JSON.stringify(schedule.days[candidate]) === signature);
    same.forEach((candidate) => seen.add(candidate));
    const label = same.map((candidate) => DAY_LABELS_ZH[candidate]).join('、');
    groups.push(schedule.days[day].length ? `${label} ${periodText(schedule.days[day])}` : `${label} 休息`);
  }
  return groups.join('；') || null;
}

export const OPENING_HOURS_DAY_ORDER = [...DAY_ORDER];
