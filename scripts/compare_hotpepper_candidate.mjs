#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';

const [candidatePath, outputPath] = process.argv.slice(2);
if (!candidatePath || !outputPath) {
  console.error('usage: compare_hotpepper_candidate.mjs CANDIDATE.js OUTPUT.json');
  process.exit(2);
}

const productionCode = fs.readFileSync('data/production_area1.js', 'utf8');
const productionSandbox = { window: {} };
vm.createContext(productionSandbox);
vm.runInContext(productionCode, productionSandbox, { filename: 'data/production_area1.js' });
const production = Array.isArray(productionSandbox.window.PRODUCTION_RESTAURANTS)
  ? productionSandbox.window.PRODUCTION_RESTAURANTS
  : [];

const candidateSandbox = { window: { RESTAURANTS: [] } };
vm.createContext(candidateSandbox);
vm.runInContext(fs.readFileSync(candidatePath, 'utf8'), candidateSandbox, { filename: candidatePath });
const candidates = Array.isArray(candidateSandbox.window.RESTAURANTS)
  ? candidateSandbox.window.RESTAURANTS
  : [];

const byId = new Map(production.map((row) => [row.googlePlaceId, row]));
const isPrice = (value) => Array.isArray(value)
  && value.length >= 2
  && Number.isFinite(value[0])
  && Number.isFinite(value[1]);
const missingCuisine = (value) => !value || value === '餐厅';
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const norm = (value) => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆]+/g, '');

function priceRelation(a, b) {
  if (!isPrice(a) || !isPrice(b)) return 'missing';
  if (a[0] === b[0] && a[1] === b[1]) return 'same';
  const overlap = Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]) + 1);
  const union = Math.max(a[1], b[1]) - Math.min(a[0], b[0]) + 1;
  if (overlap <= 0) return 'disjoint';
  return overlap / union >= 0.5 ? 'strong_overlap' : 'partial_overlap';
}

const summary = {
  productionEntities: production.length,
  candidateRows: candidates.length,
  matchedProductionRows: 0,
  netNew: { address: 0, cuisine: 0, dinnerBudget: 0, hours: 0, closure: 0 },
  alreadyKnown: { address: 0, cuisine: 0, dinnerBudget: 0, hours: 0 },
  dinnerComparison: { same: 0, strong_overlap: 0, partial_overlap: 0, disjoint: 0, current_missing: 0, candidate_missing: 0 },
  strongCurrentPriceSource: { official: 0, tabelog: 0, both: 0 },
  cuisineComparison: { same: 0, different: 0, current_missing: 0, candidate_missing: 0 },
  nameComparison: { sameNormalized: 0, differentNormalized: 0 },
};

const rows = [];
for (const hp of candidates) {
  const current = byId.get(hp.googlePlaceId);
  if (!current) {
    rows.push({ googlePlaceId: hp.googlePlaceId, hotpepperId: hp.hotpepperId, status: 'candidate_not_in_current_production' });
    continue;
  }
  summary.matchedProductionRows += 1;
  const sources = Array.isArray(current.sources) ? current.sources : [];
  const hasOfficial = sources.some((x) => String(x).toLowerCase() === 'official');
  const hasTabelog = sources.some((x) => String(x).toLowerCase() === 'tabelog');
  if (isPrice(current.dinner) && (hasOfficial || hasTabelog)) {
    if (hasOfficial && hasTabelog) summary.strongCurrentPriceSource.both += 1;
    else if (hasOfficial) summary.strongCurrentPriceSource.official += 1;
    else summary.strongCurrentPriceSource.tabelog += 1;
  }

  const addressNew = !hasText(current.address) && hasText(hp.address);
  const cuisineNew = missingCuisine(current.cuisine) && !missingCuisine(hp.cuisine);
  const dinnerNew = !isPrice(current.dinner) && isPrice(hp.dinner);
  const hoursNew = !current.openingHours && hasText(hp.openingHoursRaw);
  const closureNew = !current.openingHours && (Array.isArray(hp.closedDays) ? hp.closedDays.length > 0 : hasText(hp.closedNote));

  if (addressNew) summary.netNew.address += 1;
  else if (hasText(current.address) && hasText(hp.address)) summary.alreadyKnown.address += 1;
  if (cuisineNew) summary.netNew.cuisine += 1;
  else if (!missingCuisine(current.cuisine) && !missingCuisine(hp.cuisine)) summary.alreadyKnown.cuisine += 1;
  if (dinnerNew) summary.netNew.dinnerBudget += 1;
  else if (isPrice(current.dinner) && isPrice(hp.dinner)) summary.alreadyKnown.dinnerBudget += 1;
  if (hoursNew) summary.netNew.hours += 1;
  else if (current.openingHours && hasText(hp.openingHoursRaw)) summary.alreadyKnown.hours += 1;
  if (closureNew) summary.netNew.closure += 1;

  let dinnerRelation;
  if (!isPrice(current.dinner) && isPrice(hp.dinner)) {
    dinnerRelation = 'current_missing';
  } else if (isPrice(current.dinner) && !isPrice(hp.dinner)) {
    dinnerRelation = 'candidate_missing';
  } else if (isPrice(current.dinner) && isPrice(hp.dinner)) {
    dinnerRelation = priceRelation(current.dinner, hp.dinner);
  } else {
    dinnerRelation = 'candidate_missing';
  }
  summary.dinnerComparison[dinnerRelation] += 1;

  let cuisineRelation;
  if (missingCuisine(current.cuisine) && !missingCuisine(hp.cuisine)) cuisineRelation = 'current_missing';
  else if (!missingCuisine(current.cuisine) && missingCuisine(hp.cuisine)) cuisineRelation = 'candidate_missing';
  else if (!missingCuisine(current.cuisine) && !missingCuisine(hp.cuisine)) cuisineRelation = current.cuisine === hp.cuisine ? 'same' : 'different';
  else cuisineRelation = 'candidate_missing';
  summary.cuisineComparison[cuisineRelation] += 1;

  const sameName = norm(current.name) === norm(hp.name);
  summary.nameComparison[sameName ? 'sameNormalized' : 'differentNormalized'] += 1;

  rows.push({
    googlePlaceId: hp.googlePlaceId,
    hotpepperId: hp.hotpepperId,
    currentName: current.name,
    hotpepperName: hp.name,
    sources,
    current: {
      address: current.address || null,
      cuisine: current.cuisine || null,
      lunch: isPrice(current.lunch) ? current.lunch : null,
      dinner: isPrice(current.dinner) ? current.dinner : null,
      hasNormalizedHours: Boolean(current.openingHours),
    },
    hotpepper: {
      address: hp.address || null,
      cuisine: hp.cuisine || null,
      dinner: isPrice(hp.dinner) ? hp.dinner : null,
      hasHoursRaw: hasText(hp.openingHoursRaw),
    },
    netNew: { address: addressNew, cuisine: cuisineNew, dinnerBudget: dinnerNew, hours: hoursNew, closure: closureNew },
    dinnerRelation,
    cuisineRelation,
    sameNormalizedName: sameName,
    protectCurrentDinner: isPrice(current.dinner) && (hasOfficial || hasTabelog),
  });
}

const report = {
  schemaVersion: 1,
  policy: {
    hotpepperDoesNotOverwriteExistingStrongPrice: true,
    lunchAndDinnerMustResolveIndependently: true,
    googlePlacesPriceApiUsed: false,
    searchSnippetIsCanonicalEvidence: false,
  },
  summary,
  conflictReview: {
    disjointDinner: rows.filter((row) => row.dinnerRelation === 'disjoint'),
    partialOverlapDinner: rows.filter((row) => row.dinnerRelation === 'partial_overlap'),
    differentCuisine: rows.filter((row) => row.cuisineRelation === 'different'),
    differentName: rows.filter((row) => row.sameNormalizedName === false),
  },
  rows,
};

fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(summary, null, 2));
