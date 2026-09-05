#!/usr/bin/env node
import assert from 'node:assert/strict';
import { normalizeOpeningHours, formatOpeningHoursZh, validateOpeningHours } from './opening_hours.mjs';

function hours(raw, closed = []) {
  const value = normalizeOpeningHours(raw, closed);
  if (value) assert.equal(validateOpeningHours(value), true);
  return value;
}

{
  const value = hours('月–金 07:30–19:50; 土・祝 10:00–17:50', ['日']);
  assert.deepEqual(value.days.mon, [['07:30', '19:50']]);
  assert.deepEqual(value.days.fri, [['07:30', '19:50']]);
  assert.deepEqual(value.days.sat, [['10:00', '17:50']]);
  assert.deepEqual(value.days.sun, []);
  assert.deepEqual(value.days.holiday, [['10:00', '17:50']]);
  assert.match(formatOpeningHoursZh(value), /周一/);
}

{
  const value = hours('月–金 11:30–14:00, 17:00–23:00（L.O.22:00）', ['土', '日', '祝']);
  assert.deepEqual(value.days.mon, [['11:30', '14:00'], ['17:00', '23:00']]);
  assert.deepEqual(value.days.sat, []);
  assert.deepEqual(value.days.sun, []);
  assert.deepEqual(value.days.holiday, []);
}

{
  const value = hours('毎日 08:00–20:00');
  for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'holiday']) {
    assert.deepEqual(value.days[day], [['08:00', '20:00']]);
  }
}

{
  const value = hours('月–土 11:30–14:30, 17:00–22:30', ['日', '祝']);
  assert.deepEqual(value.days.sat, [['11:30', '14:30'], ['17:00', '22:30']]);
  assert.deepEqual(value.days.sun, []);
  assert.deepEqual(value.days.holiday, []);
}

{
  const value = hours('Monday, Tuesday, Wednesday, Thursday, Friday 07:00-21:00; Saturday, Sunday 08:00-20:00');
  assert.deepEqual(value.days.mon, [['07:00', '21:00']]);
  assert.deepEqual(value.days.sun, [['08:00', '20:00']]);
  assert.equal(Object.hasOwn(value.days, 'holiday'), false);
}

{
  const value = hours('完全予約制・不定休。最新営業日は公式カレンダー/SNS参照');
  assert.equal(value, null);
}

console.log(JSON.stringify({ status: 'pass', cases: 6 }));
