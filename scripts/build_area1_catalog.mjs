#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(DATA, 'area1_catalog.json');

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
const readText = (name) => fs.readFileSync(path.join(DATA, name), 'utf8');
const exists = (name) => fs.existsSync(path.join(DATA, name));
const isPrice = (value) => Array.isArray(value)
  && value.length >= 2
  && Number.isFinite(value[0])
  && Number.isFinite(value[1]);
const textKnown = (value) => typeof value === 'string' && value.trim().length > 0;
const cuisineKnown = (value) => textKnown(value) && value !== '餐厅';

const inventory = readJson('area1_google_ids.json');
const hotpepperBindings = exists('hotpepper_bindings.json')
  ? readJson('hotpepper_bindings.json')
  : { bindings: [], summary: {} };
const hotpepperCatalogFacts = exists('hotpepper_catalog_facts.json')
  ? readJson('hotpepper_catalog_facts.json')
  : { rows: [], summary: {} };
const historicalOpenQueue = exists('area1_full_collection_queue.json')
  ? readJson('area1_full_collection_queue.json')
  : { rows: [], summary: {} };

const sandbox = { window: {}, console };
vm.createContext(sandbox);
for (const name of [
  'production_area1.js',
  'source_provenance.js',
  'source_facts.js',
  'hotpepper_rich_metadata.js'
]) {
  if (!exists(name)) continue;
  vm.runInContext(readText(name), sandbox, { filename: name });
}

const production = sandbox.window.PRODUCTION_RESTAURANTS || [];
const provenance = sandbox.window.SOURCE_PROVENANCE || { rows: [], summary: {} };
const sourceFacts = sandbox.window.SOURCE_FACTS || { rows: [], summary: {} };
const rich = sandbox.window.HOTPEPPER_RICH_METADATA || { rows: [], summary: {} };

const frozenIds = new Set(inventory.googlePlaceIds || []);
const productionById = new Map(production.map((row) => [row.googlePlaceId, row]));
const provenanceById = new Map((provenance.rows || []).map((row) => [row.googlePlaceId, row]));
const factsById = new Map((sourceFacts.rows || []).map((row) => [row.googlePlaceId, row]));
const richById = new Map((rich.rows || []).map((row) => [row.googlePlaceId, row]));
const hpById = new Map((hotpepperBindings.bindings || []).map((row) => [row.googlePlaceId, row]));
const hpCatalogFactsById = new Map((hotpepperCatalogFacts.rows || []).map((row) => [row.googlePlaceId, row]));
const openQueueById = new Map((historicalOpenQueue.rows || [])
  .filter((row) => row?.googlePlaceId)
  .map((row) => [row.googlePlaceId, row]));

const allIds = new Set([...frozenIds, ...productionById.keys()]);

const FIELD_KEYS = [
  'name',
  'address',
  'coordinates',
  'cuisine',
  'lunchBudget',
  'dinnerBudget',
  'openingHours',
  'featuredDishes',
  'strictRecommendations',
  'publicSourceEvidence'
];

function completenessFor(row, prov) {
  if (!row) return null;
  const fields = {
    name: textKnown(row.name),
    address: textKnown(row.address),
    coordinates: Number.isFinite(row.lat) && Number.isFinite(row.lng),
    cuisine: cuisineKnown(row.cuisine),
    lunchBudget: isPrice(row.lunch),
    dinnerBudget: isPrice(row.dinner),
    openingHours: Boolean(row.openingHours && row.openingHours.days),
    featuredDishes: Array.isArray(row.featuredDishes) && row.featuredDishes.length > 0,
    strictRecommendations: Array.isArray(row.recommendedDishes) && row.recommendedDishes.length > 0,
    publicSourceEvidence: Array.isArray(prov?.sourceLinks) && prov.sourceLinks.length > 0
  };
  const known = FIELD_KEYS.filter((key) => fields[key]).length;
  return {
    fields,
    known,
    total: FIELD_KEYS.length,
    ratio: Number((known / FIELD_KEYS.length).toFixed(3)),
    missing: FIELD_KEYS.filter((key) => !fields[key])
  };
}

function compactOpenCandidate(openRow) {
  if (!openRow) return null;
  const candidate = openRow.candidate && typeof openRow.candidate === 'object'
    ? openRow.candidate
    : null;
  return {
    checkedAt: openRow.checkedAt || null,
    historicalQcStatus: openRow.googleStatus || null,
    matchConfidence: openRow.matchConfidence || 'none',
    candidate: candidate ? {
      provider: 'OpenStreetMap',
      sourceCandidateId: candidate.sourceCandidateId || null,
      name: candidate.sourceName || null,
      cuisine: candidate.cuisine || null,
      address: candidate.address || null,
      lat: Number.isFinite(candidate.lat) ? candidate.lat : null,
      lng: Number.isFinite(candidate.lng) ? candidate.lng : null,
      historicalMatchDistanceMeters: Number.isFinite(candidate.distanceMeters) ? candidate.distanceMeters : null,
      historicalNameSimilarity: Number.isFinite(candidate.nameSimilarity) ? candidate.nameSimilarity : null
    } : null
  };
}

function nextActions({ isProduction, hp, hpCatalogFact, openCandidate, prov, facts, richRow, completeness }) {
  const actions = [];
  if (isProduction) {
    if (!prov?.sourceLinks?.length) actions.push('sourceBinding');
    if (completeness?.missing?.includes('address')) actions.push('address');
    if (completeness?.missing?.includes('cuisine')) actions.push('cuisine');
    if (completeness?.missing?.includes('lunchBudget')) actions.push('lunchBudget');
    if (completeness?.missing?.includes('dinnerBudget')) actions.push('dinnerBudget');
    if (completeness?.missing?.includes('openingHours')) actions.push('openingHours');
    if (completeness?.missing?.includes('featuredDishes')) actions.push('featuredDishes');
    if (!facts?.sourceFacts?.length) actions.push('providerFacts');
    if (hpCatalogFact) actions.push('hotpepperFieldNormalization');
    if (hp && !richRow) actions.push('hotpepperRichReview');
    if (openCandidate?.candidate && !prov?.sourceLinks?.length) actions.push('openSourceCrossCheck');
  } else if (hpCatalogFact) {
    actions.push('fieldNormalization');
    actions.push('currentness');
    actions.push('identityAdmissionReview');
  } else if (openCandidate?.candidate && ['high', 'medium'].includes(openCandidate.matchConfidence)) {
    actions.push('crossSourceValidation');
    actions.push('currentness');
    actions.push('identityAdmissionReview');
  } else if (openCandidate?.candidate && openCandidate.matchConfidence === 'review') {
    actions.push('crossSourceValidation');
    actions.push('currentness');
  } else if (hp) {
    actions.push('sourceDetail');
    actions.push('currentness');
    actions.push('identityAdmissionReview');
  } else {
    actions.push('sourceBinding');
    actions.push('currentness');
  }
  return [...new Set(actions)];
}

const rows = [...allIds].sort().map((googlePlaceId) => {
  const prod = productionById.get(googlePlaceId) || null;
  const prov = provenanceById.get(googlePlaceId) || null;
  const facts = factsById.get(googlePlaceId) || null;
  const richRow = richById.get(googlePlaceId) || null;
  const hp = hpById.get(googlePlaceId) || null;
  const hpCatalogFact = hpCatalogFactsById.get(googlePlaceId) || null;
  const openCandidate = compactOpenCandidate(openQueueById.get(googlePlaceId) || null);
  const inFrozenInventory = frozenIds.has(googlePlaceId);
  const isProduction = Boolean(prod);
  const completeness = completenessFor(prod, prov);
  const providerSet = new Set();
  for (const source of prod?.sources || []) providerSet.add(source);
  for (const ref of prov?.sourceLinks || []) providerSet.add(ref.provider);
  for (const fact of facts?.sourceFacts || []) providerSet.add(fact.provider);
  if (hp || hpCatalogFact) providerSet.add('Hot Pepper');

  return {
    googlePlaceId,
    catalogStatus: isProduction ? 'production' : 'inventory_only',
    inFrozenInventory,
    productionOutsideFrozenInventory: isProduction && !inFrozenInventory,
    currentProduction: isProduction,
    canonical: prod ? {
      name: prod.name || null,
      address: prod.address || null,
      lat: Number.isFinite(prod.lat) ? prod.lat : null,
      lng: Number.isFinite(prod.lng) ? prod.lng : null,
      distanceMeters: Number.isFinite(prod.distanceMeters) ? prod.distanceMeters : null,
      cuisine: prod.cuisine || null,
      lunch: isPrice(prod.lunch) ? prod.lunch : null,
      dinner: isPrice(prod.dinner) ? prod.dinner : null,
      openingHoursKnown: Boolean(prod.openingHours?.days),
      featuredDishesCount: Array.isArray(prod.featuredDishes) ? prod.featuredDishes.length : 0,
      recommendedDishesCount: Array.isArray(prod.recommendedDishes) ? prod.recommendedDishes.length : 0,
      hyakumeiten: Boolean(prod.hyakumeiten)
    } : null,
    completeness,
    sourceState: {
      providers: [...providerSet].filter(Boolean).sort(),
      publicSourceLinks: prov?.sourceLinks?.length || 0,
      sourceClaimedFields: prov?.sourceClaimedFields || [],
      sourceLastCheckedAt: prov?.sourceLastCheckedAt || null,
      providerFactRecords: facts?.sourceFacts?.length || 0,
      hotpepperCatalogFacts: Boolean(hpCatalogFact),
      hotpepperCatalogFactFields: hpCatalogFact ? Object.keys(hpCatalogFact.facts || {}).sort() : [],
      hotpepperRichMetadata: Boolean(richRow),
      historicalOpenCandidate: Boolean(openCandidate?.candidate),
      historicalOpenCandidateConfidence: openCandidate?.matchConfidence || null
    },
    hotpepperBinding: hp ? {
      hotpepperId: hp.hotpepperId,
      confidence: hp.confidence,
      autoEligible: Boolean(hp.autoEligible),
      currentProduction: Boolean(hp.currentProduction),
      distanceMeters: hp.distanceMeters ?? null,
      nameSimilarity: hp.nameSimilarity ?? null,
      addressSimilarity: hp.addressSimilarity ?? null,
      postalMatch: Boolean(hp.postalMatch),
      combinedScore: hp.combinedScore ?? null,
      seedSource: hp.seedSource || null
    } : null,
    openIdentityCandidate: openCandidate,
    nextActions: nextActions({ isProduction, hp, hpCatalogFact, openCandidate, prov, facts, richRow, completeness })
  };
});

const productionRows = rows.filter((row) => row.currentProduction);
const inventoryOnlyRows = rows.filter((row) => row.catalogStatus === 'inventory_only');
const missingCount = (field) => productionRows.filter((row) => row.completeness?.missing?.includes(field)).length;
const confidenceCounts = (inputRows) => {
  const counts = { high: 0, medium: 0, review: 0, low: 0, none: 0 };
  for (const row of inputRows) {
    const value = row.openIdentityCandidate?.matchConfidence;
    if (!value) continue;
    if (Object.hasOwn(counts, value)) counts[value] += 1;
    else counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
};

const summary = {
  schemaVersion: 3,
  scope: inventory.scope || 'TOKYO/地区1️⃣',
  checkedAt: new Date().toISOString().slice(0, 10),
  identityUniverse: rows.length,
  frozenInventory: frozenIds.size,
  production: productionRows.length,
  productionInFrozenInventory: productionRows.filter((row) => row.inFrozenInventory).length,
  productionOutsideFrozenInventory: productionRows.filter((row) => row.productionOutsideFrozenInventory).length,
  inventoryOnly: inventoryOnlyRows.length,
  hotpepperBindings: rows.filter((row) => row.hotpepperBinding).length,
  hotpepperCatalogFactRows: rows.filter((row) => row.sourceState.hotpepperCatalogFacts).length,
  productionHotpepperBindings: productionRows.filter((row) => row.hotpepperBinding).length,
  productionHotpepperCatalogFacts: productionRows.filter((row) => row.sourceState.hotpepperCatalogFacts).length,
  inventoryOnlyHotpepperBindings: inventoryOnlyRows.filter((row) => row.hotpepperBinding).length,
  inventoryOnlyHotpepperCatalogFacts: inventoryOnlyRows.filter((row) => row.sourceState.hotpepperCatalogFacts).length,
  historicalOpenCandidateRows: rows.filter((row) => row.sourceState.historicalOpenCandidate).length,
  inventoryOnlyHistoricalOpenCandidateRows: inventoryOnlyRows.filter((row) => row.sourceState.historicalOpenCandidate).length,
  historicalOpenCandidateConfidenceCounts: confidenceCounts(rows),
  inventoryOnlyHistoricalOpenCandidateConfidenceCounts: confidenceCounts(inventoryOnlyRows),
  inventoryOnlyHighMediumOpenCandidates: inventoryOnlyRows.filter((row) =>
    row.openIdentityCandidate?.candidate
    && ['high', 'medium'].includes(row.openIdentityCandidate.matchConfidence)).length,
  productionWithPublicSourceEvidence: productionRows.filter((row) => row.sourceState.publicSourceLinks > 0).length,
  productionWithProviderFacts: productionRows.filter((row) => row.sourceState.providerFactRecords > 0).length,
  productionWithRichMetadata: productionRows.filter((row) => row.sourceState.hotpepperRichMetadata).length,
  productionMissing: {
    address: missingCount('address'),
    cuisine: missingCount('cuisine'),
    lunchBudget: missingCount('lunchBudget'),
    dinnerBudget: missingCount('dinnerBudget'),
    openingHours: missingCount('openingHours'),
    featuredDishes: missingCount('featuredDishes'),
    strictRecommendations: missingCount('strictRecommendations'),
    publicSourceEvidence: missingCount('publicSourceEvidence')
  },
  policy: {
    catalogFirst: true,
    allKnownIdentitySlotsLoadedBeforeEnrichment: true,
    inventoryOnlyDoesNotEqualProductionAdmission: true,
    sourceNativeFactsMayExistBeforeAdmission: true,
    openSourceMatchesRemainCandidatesUntilValidated: true,
    lowConfidenceOpenCandidatesNeverBecomeFactsAutomatically: true,
    transientGoogleDisplayPayloadPersisted: false,
    paidGoogleDataApiCalls: 0
  }
};

const payload = { schemaVersion: 3, summary, rows };
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary));
