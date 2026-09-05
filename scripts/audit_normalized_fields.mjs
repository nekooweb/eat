#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';
import { validateOpeningHours } from './opening_hours.mjs';

const source = fs.readFileSync('data/production_area1.js', 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'production_area1.js' });

const rows = sandbox.window.PRODUCTION_RESTAURANTS || [];
const failures = [];
let recommendedKnown = 0;
let openingHoursKnown = 0;

for (const row of rows) {
  if (!Object.hasOwn(row, 'recommendedDishes') || !Array.isArray(row.recommendedDishes)) {
    failures.push(`${row.name}: recommendedDishes must always be an array`);
  } else {
    if (row.recommendedDishes.length > 2) failures.push(`${row.name}: recommendedDishes has more than 2 items`);
    if (row.recommendedDishes.some((dish) => typeof dish !== 'string' || !dish.trim())) {
      failures.push(`${row.name}: recommendedDishes contains an invalid value`);
    }
    if (row.recommendedDishes.length) recommendedKnown += 1;
  }

  // Raw/prose schedule fields belong only to maintenance sources. Canonical
  // production must expose a machine-readable schedule or omit schedule data.
  for (const legacyField of ['hoursReference', 'openingHoursRaw', 'closedDays', 'closedNote']) {
    if (Object.hasOwn(row, legacyField)) failures.push(`${row.name}: legacy schedule field leaked into production: ${legacyField}`);
  }

  if (Object.hasOwn(row, 'openingHours')) {
    if (!validateOpeningHours(row.openingHours)) {
      failures.push(`${row.name}: openingHours does not match normalized schema`);
    }
    if (typeof row.hoursText !== 'string' || !row.hoursText.trim()) {
      failures.push(`${row.name}: normalized openingHours requires hoursText`);
    }
    openingHoursKnown += 1;
  } else if (Object.hasOwn(row, 'hoursText')) {
    failures.push(`${row.name}: hoursText exists without openingHours`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  productionEntities: rows.length,
  recommendedDishesKnown: recommendedKnown,
  openingHoursKnown
}));
