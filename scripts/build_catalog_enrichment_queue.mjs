#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const CATALOG = path.join(DATA, 'area1_catalog.json');
const HP_FACTS = path.join(DATA, 'hotpepper_catalog_facts.json');
const OUT = path.join(DATA, 'area1_enrichment_queue.json');

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const hpPayload = fs.existsSync(HP_FACTS)
  ? JSON.parse(fs.readFileSync(HP_FACTS, 'utf8'))
  : { rows: [] };
const hpById = new Map((hpPayload.rows || []).map((row) => [row.googlePlaceId, row]));

const CORE_FIELDS = [
  'address',
  'cuisine',
  'lunchBudget',
  'dinnerBudget',
  'openingHours',
  'publicSourceEvidence'
];

const OPTIONAL_FIELDS = [
  'featuredDishes',
  'strictRecommendations'
];

function missingCore(row) {
  const missing = row.completeness?.missing || [];
  return CORE_FIELDS.filter((field) => missing.includes(field));
}

function availableHotpepperCandidates(row) {
  const hp = hpById.get(row.googlePlaceId);
  if (!hp) return [];
  const facts = hp.facts || {};
  const missing = new Set(row.completeness?.missing || []);
  const candidates = [];
  if (missing.has('address') && facts.address) candidates.push('address');
  if (missing.has('cuisine') && facts.genre) candidates.push('cuisine');
  if (missing.has('dinnerBudget') && facts.budget) candidates.push('dinnerBudget');
  if (missing.has('openingHours') && facts.openingHoursText) candidates.push('openingHours');
  if (missing.has('featuredDishes') && facts.catch) candidates.push('featuredDishesReview');
  if (facts.lunchAvailabilityText) candidates.push('lunchAvailability');
  return candidates;
}

function priorityFor(row) {
  const core = missingCore(row);
  let score = 0;
  if (row.currentProduction) score += 1000;
  if (row.currentProduction && row.sourceState.publicSourceLinks === 0) score += 300;
  score += core.length * 50;
  if (core.includes('lunchBudget')) score += 90;
  if (core.includes('address')) score += 60;
  if (core.includes('openingHours')) score += 50;
  if (core.includes('dinnerBudget')) score += 40;
  if (core.includes('cuisine')) score += 30;
  if (row.sourceState.providerFactRecords > 0) score += 40;
  if (row.sourceState.hotpepperCatalogFacts) score += 35;
  if (row.hotpepperBinding?.confidence === 'high') score += 20;
  return score;
}

function classify(row) {
  const core = missingCore(row);
  if (row.currentProduction) {
    if (!core.length) return 'production_core_complete';
    if (row.sourceState.publicSourceLinks > 0 || row.sourceState.providerFactRecords > 0 || row.sourceState.hotpepperCatalogFacts) {
      return 'production_existing_source_extract';
    }
    return 'production_source_binding';
  }
  if (row.sourceState.hotpepperCatalogFacts) return 'inventory_hotpepper_loaded_review';
  return 'inventory_source_binding';
}

const items = (catalog.rows || []).map((row) => {
  const coreMissing = missingCore(row);
  const optionalMissing = OPTIONAL_FIELDS.filter((field) => row.completeness?.missing?.includes(field));
  const hp = hpById.get(row.googlePlaceId) || null;
  return {
    googlePlaceId: row.googlePlaceId,
    catalogStatus: row.catalogStatus,
    currentProduction: row.currentProduction,
    name: row.canonical?.name || hp?.facts?.name || null,
    queue: classify(row),
    priorityScore: priorityFor(row),
    coreMissing,
    optionalMissing,
    sourceProviders: row.sourceState.providers || [],
    publicSourceLinks: row.sourceState.publicSourceLinks || 0,
    providerFactRecords: row.sourceState.providerFactRecords || 0,
    hotpepperCatalogFacts: Boolean(row.sourceState.hotpepperCatalogFacts),
    hotpepperConfidence: row.hotpepperBinding?.confidence || null,
    hotpepperAutoEligible: Boolean(row.hotpepperBinding?.autoEligible),
    existingHotpepperFieldCandidates: row.currentProduction ? availableHotpepperCandidates(row) : [],
    nextActions: row.nextActions || []
  };
});

items.sort((a, b) =>
  b.priorityScore - a.priorityScore
  || a.queue.localeCompare(b.queue)
  || (a.name || '').localeCompare(b.name || '')
  || a.googlePlaceId.localeCompare(b.googlePlaceId)
);

const counts = {};
for (const item of items) counts[item.queue] = (counts[item.queue] || 0) + 1;
const productionItems = items.filter((item) => item.currentProduction);
const productionCoreIncomplete = productionItems.filter((item) => item.coreMissing.length);
const zeroRequestHotpepperCandidates = productionItems.filter((item) => item.existingHotpepperFieldCandidates.length);

const coreGapCounts = Object.fromEntries(CORE_FIELDS.map((field) => [
  field,
  productionItems.filter((item) => item.coreMissing.includes(field)).length
]));

const summary = {
  schemaVersion: 1,
  checkedAt: catalog.summary?.checkedAt || new Date().toISOString().slice(0, 10),
  identityUniverse: items.length,
  production: productionItems.length,
  productionCoreIncomplete: productionCoreIncomplete.length,
  productionCoreComplete: productionItems.length - productionCoreIncomplete.length,
  queueCounts: counts,
  productionCoreGapCounts: coreGapCounts,
  productionWithLoadedHotpepperFieldCandidates: zeroRequestHotpepperCandidates.length,
  productionLoadedHotpepperCandidateFieldCounts: {
    address: zeroRequestHotpepperCandidates.filter((item) => item.existingHotpepperFieldCandidates.includes('address')).length,
    cuisine: zeroRequestHotpepperCandidates.filter((item) => item.existingHotpepperFieldCandidates.includes('cuisine')).length,
    dinnerBudget: zeroRequestHotpepperCandidates.filter((item) => item.existingHotpepperFieldCandidates.includes('dinnerBudget')).length,
    openingHours: zeroRequestHotpepperCandidates.filter((item) => item.existingHotpepperFieldCandidates.includes('openingHours')).length,
    featuredDishesReview: zeroRequestHotpepperCandidates.filter((item) => item.existingHotpepperFieldCandidates.includes('featuredDishesReview')).length,
    lunchAvailability: zeroRequestHotpepperCandidates.filter((item) => item.existingHotpepperFieldCandidates.includes('lunchAvailability')).length
  },
  policy: {
    catalogFirst: true,
    sourceExtractionBeforeBroadDiscovery: true,
    inventoryAdmissionSeparatedFromFieldLoading: true,
    noExternalRequests: true
  }
};

fs.writeFileSync(OUT, `${JSON.stringify({ schemaVersion: 1, summary, items }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary));
