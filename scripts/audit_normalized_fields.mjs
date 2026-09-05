#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('data/production_area1.js', 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'production_area1.js' });

const rows = sandbox.window.PRODUCTION_RESTAURANTS || [];
const failures = [];
let recommendedKnown = 0;
let hoursKnown = 0;

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

  if (!Object.hasOwn(row, 'hoursReference')) {
    failures.push(`${row.name}: hoursReference field is missing`);
  } else if (row.hoursReference !== null && typeof row.hoursReference !== 'string') {
    failures.push(`${row.name}: hoursReference must be string or null`);
  } else if (row.hoursReference) {
    hoursKnown += 1;
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
  hoursReferenceKnown: hoursKnown
}));
