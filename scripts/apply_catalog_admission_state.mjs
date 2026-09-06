#!/usr/bin/env node
import fs from 'node:fs';

const catalogPath = 'data/area1_catalog.json';
const admissionsPath = 'data/catalog_admissions.json';
const hotpepperFactsPath = 'data/hotpepper_catalog_facts.json';

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const admissions = JSON.parse(fs.readFileSync(admissionsPath, 'utf8'));
const hpPayload = JSON.parse(fs.readFileSync(hotpepperFactsPath, 'utf8'));
const hpById = new Map((hpPayload.rows || []).map((row) => [row.googlePlaceId, row]));
const admittedById = new Map((admissions.rows || []).map((row) => [row.googlePlaceId, row]));
const rejectedById = new Map((admissions.rejectedReviewPairs || []).map((row) => [row.googlePlaceId, row]));

const providerBudgetRange = (budget) => {
  const raw = String(budget?.name || '').replaceAll(',', '').replaceAll('〜', '～').replaceAll('~', '～');
  const nums = [...raw.matchAll(/\d+/g)].map((m) => Number(m[0]));
  if (nums.length >= 2 && nums[0] >= 0 && nums[1] >= nums[0]) return [nums[0], nums[1]];
  if (nums.length === 1 && /^\s*[～<≤]/.test(raw)) return [0, nums[0]];
  return null;
};

for (const row of catalog.rows || []) {
  const admitted = admittedById.get(row.googlePlaceId);
  const rejected = rejectedById.get(row.googlePlaceId);
  if (admitted && rejected) throw new Error(`identity is both admitted and rejected: ${row.googlePlaceId}`);

  if (admitted) {
    const hp = hpById.get(row.googlePlaceId);
    if (!hp) throw new Error(`reviewed admission lacks Hot Pepper facts: ${row.googlePlaceId}`);
    row.admission = {
      status: row.currentProduction ? 'admitted_production' : 'reviewed_ready',
      mode: admitted.admissionMode,
      reviewedAt: admitted.reviewedAt,
      currentnessProvider: admitted.evidence?.currentnessProvider || null,
      currentnessUrl: admitted.evidence?.currentnessUrl || null,
      identityEvidence: {
        hotpepperId: admitted.evidence?.hotpepperId || null,
        osmCandidateId: admitted.evidence?.osmCandidateId || null,
        overtureId: admitted.evidence?.overtureId || null
      }
    };
    row.reviewedCatalogFacts = {
      name: admitted.name,
      address: admitted.address,
      lat: admitted.lat,
      lng: admitted.lng,
      cuisine: admitted.cuisine,
      hotpepperBudget: providerBudgetRange(hp.facts?.budget),
      hotpepperBudgetRaw: hp.facts?.budget || null,
      openingHoursText: hp.facts?.openingHoursText || null,
      closedText: hp.facts?.closedText || null,
      stationName: hp.facts?.stationName || null,
      access: hp.facts?.access || null,
      hotpepperUrl: hp.facts?.urls?.pc || hp.facts?.urls?.mobile || null
    };
    if (row.currentProduction) {
      row.nextActions = (row.nextActions || []).filter((action) =>
        action !== 'identityAdmissionReview' && action !== 'productionSchemaAdmission');
    } else {
      row.nextActions = [...new Set([
        ...(row.nextActions || []).filter((action) => action !== 'identityAdmissionReview'),
        'productionSchemaAdmission'
      ])];
    }
  } else if (rejected) {
    row.admission = {
      status: 'rejected_pair',
      reviewedAt: admissions.checkedAt,
      reason: rejected.reason,
      hotpepperName: rejected.hotpepperName,
      openCandidateName: rejected.openCandidateName
    };
    row.nextActions = (row.nextActions || []).filter((action) => action !== 'identityAdmissionReview');
  }
}

const rows = catalog.rows || [];
const hasCanonical = (row, field) => {
  if (!row.canonical) return false;
  if (field === 'name') return Boolean(row.canonical.name);
  if (field === 'address') return Boolean(row.canonical.address);
  if (field === 'coordinates') return Number.isFinite(row.canonical.lat) && Number.isFinite(row.canonical.lng);
  if (field === 'cuisine') return Boolean(row.canonical.cuisine && row.canonical.cuisine !== '餐厅');
  if (field === 'budget') return Array.isArray(row.canonical.lunch) || Array.isArray(row.canonical.dinner);
  if (field === 'openingHours') return Boolean(row.canonical.openingHoursKnown);
  return false;
};
const hpFactsFor = (row) => hpById.get(row.googlePlaceId)?.facts || null;
const hasLoadedFact = (row, field) => {
  if (hasCanonical(row, field)) return true;
  if (row.reviewedCatalogFacts) {
    if (field === 'name' && row.reviewedCatalogFacts.name) return true;
    if (field === 'address' && row.reviewedCatalogFacts.address) return true;
    if (field === 'coordinates' && Number.isFinite(row.reviewedCatalogFacts.lat) && Number.isFinite(row.reviewedCatalogFacts.lng)) return true;
    if (field === 'cuisine' && row.reviewedCatalogFacts.cuisine) return true;
    if (field === 'budget' && row.reviewedCatalogFacts.hotpepperBudget) return true;
    if (field === 'openingHours' && row.reviewedCatalogFacts.openingHoursText) return true;
  }
  const hp = hpFactsFor(row);
  if (!hp) return false;
  if (field === 'name') return Boolean(hp.name);
  if (field === 'address') return Boolean(hp.address);
  if (field === 'coordinates') return Number.isFinite(hp.lat) && Number.isFinite(hp.lng);
  if (field === 'cuisine') return Boolean(hp.genre || hp.subGenre);
  if (field === 'budget') return Boolean(hp.budget);
  if (field === 'openingHours') return Boolean(hp.openingHoursText);
  return false;
};

catalog.schemaVersion = Math.max(Number(catalog.schemaVersion || 0), 6);
catalog.summary = {
  ...(catalog.summary || {}),
  schemaVersion: 6,
  reviewedAdmissionReady: rows.filter((row) => row.admission?.status === 'reviewed_ready').length,
  admittedProduction: rows.filter((row) => row.admission?.status === 'admitted_production').length,
  rejectedAdmissionPairs: rows.filter((row) => row.admission?.status === 'rejected_pair').length,
  loadedFactCoverage: {
    name: rows.filter((row) => hasLoadedFact(row, 'name')).length,
    address: rows.filter((row) => hasLoadedFact(row, 'address')).length,
    coordinates: rows.filter((row) => hasLoadedFact(row, 'coordinates')).length,
    sourceClassification: rows.filter((row) => hasLoadedFact(row, 'cuisine')).length,
    budgetOrProviderBudget: rows.filter((row) => hasLoadedFact(row, 'budget')).length,
    normalizedOrRawOpeningHours: rows.filter((row) => hasLoadedFact(row, 'openingHours')).length
  },
  candidateCoverage: {
    historicalOpenCandidate: rows.filter((row) => row.openIdentityCandidate?.candidate).length,
    overtureCrossSupport: rows.filter((row) => row.openIdentityCandidate?.overtureSupport).length
  }
};

fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(JSON.stringify({
  reviewedAdmissionReady: catalog.summary.reviewedAdmissionReady,
  admittedProduction: catalog.summary.admittedProduction,
  rejectedAdmissionPairs: catalog.summary.rejectedAdmissionPairs,
  loadedFactCoverage: catalog.summary.loadedFactCoverage,
  candidateCoverage: catalog.summary.candidateCoverage
}));
