#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';

const [beforePath, afterPath, reportPath] = process.argv.slice(2);
if (!beforePath || !afterPath || !reportPath) {
  console.error('usage: audit_additive_production.mjs BEFORE.js AFTER.js REPORT.json');
  process.exit(2);
}

function load(path) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path, 'utf8'), sandbox, { filename: path });
  return {
    rows: Array.isArray(sandbox.window.PRODUCTION_RESTAURANTS) ? sandbox.window.PRODUCTION_RESTAURANTS : [],
    stats: sandbox.window.PRODUCTION_STATS || {},
  };
}

const before = load(beforePath);
const after = load(afterPath);
const beforeById = new Map(before.rows.map((row) => [row.googlePlaceId, row]));
const afterById = new Map(after.rows.map((row) => [row.googlePlaceId, row]));
const isPrice = (value) => Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const missingCuisine = (value) => !value || value === '餐厅';
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const violations = [];
const gains = { address: 0, cuisine: 0, lunch: 0, dinner: 0, anyBudget: 0, openingHours: 0 };

if (beforeById.size !== afterById.size) {
  violations.push({ type: 'entity_count_changed', before: beforeById.size, after: afterById.size });
}

for (const [id, oldRow] of beforeById) {
  const newRow = afterById.get(id);
  if (!newRow) {
    violations.push({ type: 'identity_removed', googlePlaceId: id });
    continue;
  }

  for (const field of ['name', 'lat', 'lng', 'distanceMeters', 'googleStatus', 'hyakumeiten', 'hyakumeitenYear', 'hyakumeitenCategory', 'randomWeight']) {
    if (!same(oldRow[field], newRow[field])) violations.push({ type: 'protected_field_changed', googlePlaceId: id, field, before: oldRow[field], after: newRow[field] });
  }

  if (hasText(oldRow.address) && !same(oldRow.address, newRow.address)) {
    violations.push({ type: 'existing_address_changed', googlePlaceId: id, before: oldRow.address, after: newRow.address });
  }
  if (!missingCuisine(oldRow.cuisine) && !same(oldRow.cuisine, newRow.cuisine)) {
    violations.push({ type: 'existing_cuisine_changed', googlePlaceId: id, before: oldRow.cuisine, after: newRow.cuisine });
  }
  if (isPrice(oldRow.lunch) && !same(oldRow.lunch, newRow.lunch)) {
    violations.push({ type: 'existing_lunch_changed', googlePlaceId: id, before: oldRow.lunch, after: newRow.lunch });
  }
  if (isPrice(oldRow.dinner) && !same(oldRow.dinner, newRow.dinner)) {
    violations.push({ type: 'existing_dinner_changed', googlePlaceId: id, before: oldRow.dinner, after: newRow.dinner });
  }
  if (oldRow.openingHours && !same(oldRow.openingHours, newRow.openingHours)) {
    violations.push({ type: 'existing_hours_changed', googlePlaceId: id });
  }

  if (!hasText(oldRow.address) && hasText(newRow.address)) gains.address += 1;
  if (missingCuisine(oldRow.cuisine) && !missingCuisine(newRow.cuisine)) gains.cuisine += 1;
  if (!isPrice(oldRow.lunch) && isPrice(newRow.lunch)) gains.lunch += 1;
  if (!isPrice(oldRow.dinner) && isPrice(newRow.dinner)) gains.dinner += 1;
  if (!isPrice(oldRow.lunch) && !isPrice(oldRow.dinner) && (isPrice(newRow.lunch) || isPrice(newRow.dinner))) gains.anyBudget += 1;
  if (!oldRow.openingHours && newRow.openingHours) gains.openingHours += 1;
}

for (const id of afterById.keys()) {
  if (!beforeById.has(id)) violations.push({ type: 'identity_added', googlePlaceId: id });
}

const report = {
  schemaVersion: 1,
  beforeStats: before.stats,
  afterStats: after.stats,
  gains,
  violations,
  pass: violations.length === 0,
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (violations.length) process.exit(1);
