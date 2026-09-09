#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');

function loadWindowFile(filename, seed = {}) {
  const sandbox = { window: seed, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
  return sandbox.window;
}

const recommendationWindow = loadWindowFile('recommended_dishes.js', { RECOMMENDED_DISHES: [] });
const provenanceWindow = loadWindowFile('source_provenance.js', { SOURCE_PROVENANCE: { rows: [] } });
const recommendations = Array.isArray(recommendationWindow.RECOMMENDED_DISHES) ? recommendationWindow.RECOMMENDED_DISHES : [];
const provenance = provenanceWindow.SOURCE_PROVENANCE || {};
const byId = new Map((provenance.rows || []).map((row) => [row.googlePlaceId, row]));
const violations = [];

for (const row of recommendations) {
  const meta = byId.get(row.googlePlaceId);
  if (!meta) {
    violations.push({ googlePlaceId: row.googlePlaceId, reason: 'missing_provenance_row' });
    continue;
  }
  const link = (meta.sourceLinks || []).find((item) => String(item.url || '').trim() === String(row.sourceUrl || '').trim());
  if (!link) {
    violations.push({ googlePlaceId: row.googlePlaceId, sourceUrl: row.sourceUrl, reason: 'missing_recommendation_source_link' });
    continue;
  }
  if (link.recommendationEvidence !== true) {
    violations.push({ googlePlaceId: row.googlePlaceId, sourceUrl: row.sourceUrl, reason: 'recommendation_evidence_flag_missing' });
  }
  if (!(link.fields || []).includes('dishes')) {
    violations.push({ googlePlaceId: row.googlePlaceId, sourceUrl: row.sourceUrl, reason: 'dish_claim_missing' });
  }
  const evidenceDishes = new Set((link.recommendationDishes || []).map(String));
  for (const dish of row.dishes || []) {
    if (!evidenceDishes.has(String(dish))) {
      violations.push({ googlePlaceId: row.googlePlaceId, sourceUrl: row.sourceUrl, dish, reason: 'recommendation_dish_not_retained_in_provenance' });
    }
  }
}

if (provenance.schemaVersion !== 2
  || provenance.policy?.strictRecommendationEvidenceIncluded !== true
  || provenance.policy?.recommendationEvidenceCannotCreateIdentity !== true
  || provenance.policy?.recommendationEvidenceAddsDishClaimOnly !== true) {
  violations.push({ reason: 'recommendation_provenance_policy_contract_missing' });
}
if (Number(provenance.summary?.recommendationEvidenceRows || 0) !== recommendations.length) {
  violations.push({
    reason: 'recommendation_evidence_count_mismatch',
    expected: recommendations.length,
    actual: Number(provenance.summary?.recommendationEvidenceRows || 0)
  });
}
if (Number(provenance.summary?.recommendationEvidenceRejected || 0) !== 0) {
  violations.push({ reason: 'recommendation_evidence_rejected', count: provenance.summary.recommendationEvidenceRejected });
}

const summary = {
  status: violations.length ? 'fail' : 'pass',
  recommendationRows: recommendations.length,
  recommendationEvidenceRows: Number(provenance.summary?.recommendationEvidenceRows || 0),
  mergedIntoExistingLink: Number(provenance.summary?.recommendationEvidenceMergedIntoExistingLink || 0),
  standaloneRecommendationLinks: Number(provenance.summary?.recommendationEvidenceStandaloneLinks || 0),
  violations: violations.length
};
console.log(JSON.stringify(summary));
if (violations.length) {
  console.error('RECOMMENDATION_PROVENANCE_VIOLATIONS=' + JSON.stringify(violations.slice(0, 30)));
  process.exitCode = 1;
}
