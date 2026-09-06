#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';

const [candidatePath, outputPath, reportPath] = process.argv.slice(2);
if (!candidatePath || !outputPath || !reportPath) {
  console.error('usage: filter_hotpepper_additive.mjs CANDIDATE.js OUTPUT.js REPORT.json');
  process.exit(2);
}

function loadProduction() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('data/production_area1.js', 'utf8'), sandbox, { filename: 'data/production_area1.js' });
  return Array.isArray(sandbox.window.PRODUCTION_RESTAURANTS) ? sandbox.window.PRODUCTION_RESTAURANTS : [];
}

function loadCandidate(path) {
  const sandbox = { window: { RESTAURANTS: [] } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path, 'utf8'), sandbox, { filename: path });
  return Array.isArray(sandbox.window.RESTAURANTS) ? sandbox.window.RESTAURANTS : [];
}

const isPrice = (value) => Array.isArray(value)
  && value.length >= 2
  && Number.isFinite(value[0])
  && Number.isFinite(value[1]);
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const missingCuisine = (value) => !value || value === '餐厅';

const production = loadProduction();
const candidates = loadCandidate(candidatePath);
const byId = new Map(production.map((row) => [row.googlePlaceId, row]));

const output = [];
const counts = { rows: 0, address: 0, cuisine: 0, dinnerBudget: 0, hours: 0, closure: 0 };
const skipped = { noProductionIdentity: 0, noNetNewField: 0, dinnerDeferredToIndependentMealResolver: 0 };

for (const hp of candidates) {
  const current = byId.get(hp.googlePlaceId);
  if (!current) {
    skipped.noProductionIdentity += 1;
    continue;
  }

  const fields = [];
  const row = {
    id: `src-hotpepper-additive-${hp.hotpepperId || hp.googlePlaceId}`,
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: current.name,
    googlePlaceId: hp.googlePlaceId,
    source: 'Hot Pepper',
    sourceOnly: true,
    hotpepperId: hp.hotpepperId,
    hotpepperMatchConfidence: hp.hotpepperMatchConfidence,
    hotpepperMatchScore: hp.hotpepperMatchScore,
    tags: [],
    lunch: null,
    dishes: [],
  };

  if (!hasText(current.address) && hasText(hp.address)) {
    row.address = hp.address;
    fields.push('address');
    counts.address += 1;
  }

  if (missingCuisine(current.cuisine) && !missingCuisine(hp.cuisine)) {
    row.cuisine = hp.cuisine;
    row.tags = [hp.cuisine];
    fields.push('cuisine');
    counts.cuisine += 1;
  }

  // The current canonical builder still resolves lunch+dinner from one budget
  // claim row. Until meal-period resolution is split, do not add a dinner-only
  // claim to a restaurant whose existing lunch price is already known, because
  // doing so could erase the lunch price. Those few rows are deferred.
  if (!isPrice(current.dinner) && isPrice(hp.dinner)) {
    if (!isPrice(current.lunch)) {
      row.dinner = hp.dinner;
      fields.push('budget');
      counts.dinnerBudget += 1;
    } else {
      skipped.dinnerDeferredToIndependentMealResolver += 1;
    }
  }

  if (!current.openingHours && hasText(hp.openingHoursRaw)) {
    row.openingHoursRaw = hp.openingHoursRaw;
    fields.push('hours');
    counts.hours += 1;
    if ((Array.isArray(hp.closedDays) && hp.closedDays.length) || hasText(hp.closedNote)) {
      row.closedDays = Array.isArray(hp.closedDays) ? hp.closedDays : [];
      row.closedNote = hp.closedNote || null;
      fields.push('closure');
      counts.closure += 1;
    }
  }

  if (!fields.length) {
    skipped.noNetNewField += 1;
    continue;
  }

  const originalRef = Array.isArray(hp.sourceRefs) ? hp.sourceRefs[0] : null;
  row.sourceRefs = [{
    provider: 'Hot Pepper',
    url: originalRef?.url || 'https://www.hotpepper.jp/',
    checkedAt: originalRef?.checkedAt || '2026-09-06',
    fields,
    sourceNativeId: hp.hotpepperId,
    matchConfidence: hp.hotpepperMatchConfidence || 'high',
    promotionMode: 'additive-only',
  }];

  output.push(row);
}

counts.rows = output.length;
const js = `// Generated from Hot Pepper benchmark 34030943605.\n// Additive-only: this shard claims only fields missing from production at promotion time.\nwindow.RESTAURANTS.push(...${JSON.stringify(output)});\n`;
fs.writeFileSync(outputPath, js);
const report = {
  schemaVersion: 1,
  benchmarkRun: 34030943605,
  policy: {
    additiveOnly: true,
    overwriteExistingAddress: false,
    overwriteExistingCuisine: false,
    overwriteExistingDinnerBudget: false,
    overwriteExistingHours: false,
    inferLunchBudget: false,
    preserveKnownLunchUntilIndependentMealResolver: true,
  },
  candidateRows: candidates.length,
  promoted: counts,
  skipped,
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
