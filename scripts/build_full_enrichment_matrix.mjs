#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const filename of [
  'data/production_area1.js',
  'data/source_provenance.js',
  'data/source_facts.js',
  'data/hotpepper_rich_metadata.js'
]) {
  const full = path.join(ROOT, filename);
  if (!fs.existsSync(full)) continue;
  vm.runInContext(read(filename), sandbox, { filename });
}

const production = sandbox.window.PRODUCTION_RESTAURANTS || [];
const sourceFactsPayload = sandbox.window.SOURCE_FACTS || { rows: [] };
const sourceFactsById = new Map(sourceFactsPayload.rows.map((row) => [row.googlePlaceId, row.sourceFacts || []]));

const coreFieldDefs = [
  ['name', (r) => Boolean(r.name)],
  ['address', (r) => Boolean(r.address)],
  ['cuisine', (r) => Boolean(r.cuisine && r.cuisine !== '餐厅')],
  ['lunchBudget', (r) => Array.isArray(r.lunch) && r.lunch.length === 2],
  ['dinnerBudget', (r) => Array.isArray(r.dinner) && r.dinner.length === 2],
  ['openingHours', (r) => Boolean(r.openingHours)],
  ['featuredDishes', (r) => Array.isArray(r.featuredDishes) && r.featuredDishes.length > 0],
  ['recommendedDishes', (r) => Array.isArray(r.recommendedDishes) && r.recommendedDishes.length > 0]
];

const practicalFieldDefs = [
  ['sourceLinks', (r) => Array.isArray(r.sourceLinks) && r.sourceLinks.length > 0],
  ['sourceFacts', (r) => (sourceFactsById.get(r.googlePlaceId) || []).length > 0],
  ['nearestStation', (r) => Boolean(r.nearestStation)],
  ['accessText', (r) => Boolean(r.accessText)],
  ['capacity', (r) => Number.isFinite(r.capacity)],
  ['partyCapacity', (r) => Number.isFinite(r.partyCapacity)],
  ['lunchAvailable', (r) => typeof r.lunchAvailable === 'boolean'],
  ['paymentMethods', (r) => Array.isArray(r.acceptedCreditCards) && r.acceptedCreditCards.length > 0],
  ['amenities', (r) => r.amenities && typeof r.amenities === 'object' && Object.keys(r.amenities).length > 0],
  ['sourceArea', (r) => Boolean(r.hotpepperArea)],
  ['sourceBudgetRaw', (r) => Boolean(r.hotpepperBudget)],
  ['sourceHoursRaw', (r) => Boolean(r.hotpepperOpeningHoursText) || (sourceFactsById.get(r.googlePlaceId) || []).some((f) => f.openingHoursRaw)],
  ['sourceClosureRaw', (r) => Boolean(r.hotpepperClosedText) || (sourceFactsById.get(r.googlePlaceId) || []).some((f) => f.closedNote || (Array.isArray(f.closedDays) && f.closedDays.length))]
];

function presentFields(row, defs) {
  return defs.filter(([, test]) => test(row)).map(([name]) => name);
}
function missingFields(row, defs) {
  return defs.filter(([, test]) => !test(row)).map(([name]) => name);
}

const records = production.map((row) => {
  const facts = sourceFactsById.get(row.googlePlaceId) || [];
  const corePresent = presentFields(row, coreFieldDefs);
  const coreMissing = missingFields(row, coreFieldDefs);
  const practicalPresent = presentFields(row, practicalFieldDefs);
  const practicalMissing = missingFields(row, practicalFieldDefs);
  const providers = [...new Set([
    ...(row.sources || []),
    ...facts.map((f) => f.provider).filter(Boolean),
    ...(row.sourceLinks || []).map((f) => f.provider).filter(Boolean)
  ])].sort();

  const coreScore = Math.round((corePresent.length / coreFieldDefs.length) * 100);
  const practicalScore = Math.round((practicalPresent.length / practicalFieldDefs.length) * 100);
  const overallScore = Math.round(((corePresent.length * 2 + practicalPresent.length) / (coreFieldDefs.length * 2 + practicalFieldDefs.length)) * 100);

  let nextAction = 'complete_review';
  if (!providers.length) nextAction = 'bind_source';
  else if (coreMissing.includes('address') || coreMissing.includes('cuisine')) nextAction = 'fill_identity_fields';
  else if (coreMissing.includes('lunchBudget') || coreMissing.includes('dinnerBudget')) nextAction = 'fill_meal_budget';
  else if (coreMissing.includes('openingHours')) nextAction = 'fill_normalized_hours';
  else if (coreMissing.includes('featuredDishes')) nextAction = 'fill_featured_dishes';
  else if (practicalMissing.length) nextAction = 'fill_practical_fields';

  return {
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    distanceMeters: row.distanceMeters,
    canonical: {
      address: row.address || null,
      cuisine: row.cuisine || null,
      lunch: row.lunch || null,
      dinner: row.dinner || null,
      openingHours: row.openingHours || null,
      featuredDishes: row.featuredDishes || [],
      recommendedDishes: row.recommendedDishes || []
    },
    providers,
    sourceLinkCount: Array.isArray(row.sourceLinks) ? row.sourceLinks.length : 0,
    providerFactCount: facts.length,
    corePresent,
    coreMissing,
    practicalPresent,
    practicalMissing,
    coreScore,
    practicalScore,
    overallScore,
    nextAction
  };
});

const countMissing = (field, key) => records.filter((r) => r[key].includes(field)).length;
const coreMissingCounts = Object.fromEntries(coreFieldDefs.map(([field]) => [field, countMissing(field, 'coreMissing')]));
const practicalMissingCounts = Object.fromEntries(practicalFieldDefs.map(([field]) => [field, countMissing(field, 'practicalMissing')]));
const nextActionCounts = records.reduce((acc, row) => {
  acc[row.nextAction] = (acc[row.nextAction] || 0) + 1;
  return acc;
}, {});

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  productionEntities: production.length,
  fieldDefinitions: {
    core: coreFieldDefs.map(([name]) => name),
    practical: practicalFieldDefs.map(([name]) => name)
  },
  summary: {
    coreMissingCounts,
    practicalMissingCounts,
    nextActionCounts,
    completelyCoreFilled: records.filter((r) => r.coreMissing.length === 0).length,
    withAnyMaintainedSource: records.filter((r) => r.providers.length > 0).length,
    averageCoreScore: Math.round(records.reduce((s, r) => s + r.coreScore, 0) / Math.max(records.length, 1)),
    averagePracticalScore: Math.round(records.reduce((s, r) => s + r.practicalScore, 0) / Math.max(records.length, 1)),
    averageOverallScore: Math.round(records.reduce((s, r) => s + r.overallScore, 0) / Math.max(records.length, 1))
  },
  records: records.sort((a, b) => a.overallScore - b.overallScore || b.coreMissing.length - a.coreMissing.length || a.distanceMeters - b.distanceMeters)
};

fs.writeFileSync(path.join(DATA, 'area1_enrichment_matrix.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary));
