#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';

function loadWindowScript(file, windowObject = {}) {
  const context = { window: windowObject };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  return context.window;
}

const windowObject = loadWindowScript('data/google_inventory_runtime.js', {});
loadWindowScript('classification.js', windowObject);
const rows = Array.isArray(windowObject.GOOGLE_INVENTORY_RESTAURANTS)
  ? windowObject.GOOGLE_INVENTORY_RESTAURANTS
  : [];
const taxonomy = windowObject.EAT_CLASSIFICATION;
if (!taxonomy) throw new Error('classification.js did not expose EAT_CLASSIFICATION');

const original = JSON.stringify(rows);
const byDimension = Object.fromEntries(taxonomy.dimensions.map((dimension) => [dimension.id, 0]));
let anyAccepted = 0;
let multiDimension = 0;
const conceptCounts = Object.fromEntries(taxonomy.concepts.map((concept) => [concept.id, 0]));

for (const row of rows) {
  const result = taxonomy.classifyRestaurant(row);
  const direct = new Set(result.directIds);
  if (direct.size) anyAccepted += 1;
  const dimensions = new Set();
  for (const id of direct) {
    const concept = taxonomy.concepts.find((entry) => entry.id === id);
    if (!concept) continue;
    dimensions.add(concept.dimension);
    conceptCounts[id] += 1;
  }
  for (const dimension of dimensions) byDimension[dimension] += 1;
  if (dimensions.size > 1) multiDimension += 1;
}

if (JSON.stringify(rows) !== original) throw new Error('Classification coverage must not mutate runtime rows');

const topConcepts = Object.entries(conceptCounts)
  .filter(([, count]) => count > 0)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, 20)
  .map(([id, count]) => ({ id, count }));

const report = {
  status: 'pass',
  runtimeRows: rows.length,
  rowsWithAnyAcceptedClassification: anyAccepted,
  coverageRate: rows.length ? Number((anyAccepted / rows.length).toFixed(4)) : 0,
  rowsWithMultipleDimensions: multiDimension,
  rowsByDimension: byDimension,
  topConcepts,
  inferencePolicy: 'exact existing cuisine/tags only; no restaurant-name keyword inference in phase 1'
};

console.log(JSON.stringify(report));
