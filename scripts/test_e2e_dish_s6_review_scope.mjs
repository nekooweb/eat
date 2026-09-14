#!/usr/bin/env node
import assert from 'node:assert/strict';
import { LANES, auditReviewCoverage } from './build_reviewed_agent_dish_evidence.mjs';
assert.equal(LANES['DISH-R-DISCOVERY'], 'independent_source_discovery');
assert.equal(LANES['DISH-F-SOURCE'], 'official_or_retained_featured');
const commit = 'a'.repeat(40);
const policyAttestation = { paidGoogleDataApiCalls: 0, canonicalMasterEditedDirectly: false,
  proximityOnlyIdentityBindingUsed: false, recommendationWithoutExplicitSemanticsAdded: false,
  accessRestrictionBypassUsed: false };
const assignments = [
  { googlePlaceId: 'disc', name: 'Discovery', lane: 'independent_source_discovery', shard: 6 },
  { googlePlaceId: 'feat', name: 'Featured', lane: 'official_or_retained_featured', shard: 6 }
];
const makeDoc = (marker, id, name) => ({ path: `data/agent_reviews/${marker}/S6.json`, document: {
  schemaVersion: 1, marker, shard: 'S6', sourceQueue: 'data/dish_batch_plan.json', sourceQueueCommit: commit,
  summary: { assignedRows: 1, reviewedRows: 1, acceptedEvidenceRows: 0, candidateRows: 0,
    noEvidenceRows: 1, blockedRows: 0, skippedAlreadyCompleteRows: 0 }, policyAttestation,
  records: [{ googlePlaceId: id, restaurantName: name, status: 'no_evidence', identity: { state: 'partial', sourceAliases: [], evidence: [] },
    dishProposals: [], attemptedSources: ['bounded test'], blocker: null, notes: 'No current evidence.' }] } });
const result = auditReviewCoverage(assignments, [makeDoc('DISH-R-DISCOVERY','disc','Discovery'), makeDoc('DISH-F-SOURCE','feat','Featured')], { sourceQueueCommit: commit });
assert.equal(result.assignedRows, 2);
assert.equal(result.reviewedRows, 2);
assert.equal(result.byMarker['DISH-R-DISCOVERY'].reviewedRows, 1);
assert.equal(result.byMarker['DISH-F-SOURCE'].reviewedRows, 1);
console.log(JSON.stringify({ status: 'pass', scope: 'Discovery/F-source S6' }));
