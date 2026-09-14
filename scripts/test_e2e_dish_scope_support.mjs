#!/usr/bin/env node
import assert from 'node:assert/strict';
import { LANES, auditReviewCoverage, buildReviewedEvidence } from './build_reviewed_agent_dish_evidence.mjs';

assert.equal(LANES['DISH-R-DISCOVERY'], 'independent_source_discovery');
assert.equal(LANES['DISH-F-SOURCE'], 'official_or_retained_featured');
const sha = 'a'.repeat(40);
const policyAttestation = {
  paidGoogleDataApiCalls: 0,
  canonicalMasterEditedDirectly: false,
  proximityOnlyIdentityBindingUsed: false,
  recommendationWithoutExplicitSemanticsAdded: false,
  accessRestrictionBypassUsed: false
};
const assignments = [
  { googlePlaceId: 'p-discovery', name: 'Discovery', lane: 'independent_source_discovery', shard: 2 },
  { googlePlaceId: 'p-featured', name: 'Featured', lane: 'official_or_retained_featured', shard: 2 }
];
const docs = [
  { path: 'data/agent_reviews/DISH-R-DISCOVERY/S2.json', document: {
      marker: 'DISH-R-DISCOVERY', shard: 'S2', sourceQueue: 'data/dish_batch_plan.json', sourceQueueCommit: sha,
      policyAttestation, summary: { assignedRows: 1, reviewedRows: 1, acceptedEvidenceRows: 0, candidateRows: 0, noEvidenceRows: 1, blockedRows: 0, skippedAlreadyCompleteRows: 0 },
      records: [{ googlePlaceId: 'p-discovery', restaurantName: 'Discovery', status: 'no_evidence', notes: 'none found' }]
  }},
  { path: 'data/agent_reviews/DISH-F-SOURCE/S2.json', document: {
      marker: 'DISH-F-SOURCE', shard: 'S2', sourceQueue: 'data/dish_batch_plan.json', sourceQueueCommit: sha,
      policyAttestation, summary: { assignedRows: 1, reviewedRows: 1, acceptedEvidenceRows: 1, candidateRows: 0, noEvidenceRows: 0, blockedRows: 0, skippedAlreadyCompleteRows: 0 },
      records: [{
        googlePlaceId: 'p-featured', restaurantName: 'Featured', status: 'accepted_evidence',
        identity: { state: 'verified', evidence: [{ sourceUrl: 'https://sites.google.com/view/example/menu', checkedAt: '2026-09-14', note: 'exact branch' }] },
        dishProposals: [{ classification: 'F', targetField: 'featuredDishes', nameOriginal: 'ビーフカレー', evidenceText: 'ビーフカレー 900円',
          provider: 'official_web', sourceUrl: 'https://sites.google.com/view/example/menu', checkedAt: '2026-09-14', sourceScope: 'branch', confidence: 'high' }]
      }]
  }}
];
const coverage = auditReviewCoverage(assignments, docs, { sourceQueueCommit: sha });
assert.equal(coverage.assignedRows, 2);
assert.equal(coverage.reviewedRows, 2);
const built = buildReviewedEvidence({ documents: docs, assignments,
  catalogNames: new Map(assignments.map(r => [r.googlePlaceId, r.name])),
  translations: { 'ビーフカレー': { nameZh: '牛肉咖喱', rationale: 'literal' } }, checkedAt: '2026-09-14', sourceQueueCommit: sha });
assert.equal(built.evidence.rows.length, 1);
assert.equal(built.evidence.rows[0].featuredDishes[0].nameZh, '牛肉咖喱');
assert.equal(built.pending.rows.length, 0);
console.log('e2e dish scope support tests passed');
