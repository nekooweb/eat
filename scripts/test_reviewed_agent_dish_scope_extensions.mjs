#!/usr/bin/env node
import assert from 'node:assert/strict';
import { LANES, auditReviewCoverage, buildReviewedEvidence } from './build_reviewed_agent_dish_evidence.mjs';

assert.equal(LANES['DISH-R-DISCOVERY'], 'independent_source_discovery');
assert.equal(LANES['DISH-F-SOURCE'], 'official_or_retained_featured');

const commit = 'a'.repeat(40);
const date = '2026-09-15';
const assignments = [
  { googlePlaceId: 'discovery-id', name: 'Discovery Shop', lane: 'independent_source_discovery', shard: 4 },
  { googlePlaceId: 'featured-id', name: 'Featured Shop', lane: 'official_or_retained_featured', shard: 4 }
];
const policyAttestation = {
  paidGoogleDataApiCalls: 0,
  canonicalMasterEditedDirectly: false,
  proximityOnlyIdentityBindingUsed: false,
  recommendationWithoutExplicitSemanticsAdded: false,
  accessRestrictionBypassUsed: false
};
const discovery = {
  marker: 'DISH-R-DISCOVERY', shard: 'S4', sourceQueue: 'data/dish_batch_plan.json', sourceQueueCommit: commit,
  generatedAt: date, policyAttestation,
  summary: { assignedRows: 1, reviewedRows: 1, acceptedEvidenceRows: 0, candidateRows: 1, noEvidenceRows: 0, blockedRows: 0, skippedAlreadyCompleteRows: 0 },
  records: [{ googlePlaceId: 'discovery-id', restaurantName: 'Discovery Shop', status: 'candidate', identity: { state: 'partial', sourceAliases: [], evidence: [] }, dishProposals: [], attemptedSources: ['https://example.com/search'], blocker: null, notes: 'Exact branch proof remains incomplete.' }]
};
const featured = {
  marker: 'DISH-F-SOURCE', shard: 'S4', sourceQueue: 'data/dish_batch_plan.json', sourceQueueCommit: commit,
  generatedAt: date, policyAttestation,
  summary: { assignedRows: 1, reviewedRows: 1, acceptedEvidenceRows: 1, candidateRows: 0, noEvidenceRows: 0, blockedRows: 0, skippedAlreadyCompleteRows: 0 },
  records: [{
    googlePlaceId: 'featured-id', restaurantName: 'Featured Shop', status: 'accepted_evidence',
    identity: { state: 'verified', sourceAliases: [], evidence: [{ provider: 'official_web', sourceUrl: 'https://example.com/shop', checkedAt: date, evidenceType: 'branch_page', note: 'Exact branch identity.' }] },
    dishProposals: [{ targetField: 'featuredDishes', classification: 'F', nameOriginal: 'テスト定食', provider: 'official_web', sourceUrl: 'https://example.com/shop/menu', checkedAt: date, sourceScope: 'branch', recommendationSemantics: '', evidenceText: 'テスト定食 1000円', confidence: 'high', evidenceClass: 'official_branch_menu_item', notes: '' }],
    attemptedSources: ['https://example.com/shop/menu'], blocker: null, notes: 'Current ordinary menu item.'
  }]
};
const documents = [
  { path: 'data/agent_reviews/DISH-R-DISCOVERY/S4.json', document: discovery },
  { path: 'data/agent_reviews/DISH-F-SOURCE/S4.json', document: featured }
];
const coverage = auditReviewCoverage(assignments, documents, { sourceQueueCommit: commit });
assert.equal(coverage.assignedRows, 2);
assert.equal(coverage.reviewedRows, 2);
assert.equal(coverage.byMarker['DISH-R-DISCOVERY'].reviewedRows, 1);
assert.equal(coverage.byMarker['DISH-F-SOURCE'].reviewedRows, 1);

const built = buildReviewedEvidence({
  documents, assignments, checkedAt: date, sourceQueueCommit: commit,
  catalogNames: new Map(assignments.map(row => [row.googlePlaceId, row.name])),
  translations: { 'テスト定食': { nameZh: '测试定食', rationale: 'Synthetic exact-name test mapping.' } }
});
assert.equal(built.evidence.rows.length, 1, 'Candidate Discovery evidence must not leak into canonical output');
assert.equal(built.evidence.rows[0].googlePlaceId, 'featured-id');
assert.equal(built.evidence.rows[0].featuredDishes[0].nameZh, '测试定食');
assert.equal(built.coverage.statusCounts.candidate, 1);
assert.equal(built.coverage.statusCounts.accepted_evidence, 1);

console.log(JSON.stringify({ status: 'pass', checks: 'Discovery/F-source lane mapping, exact shard coverage, candidate exclusion, accepted F emission' }));
