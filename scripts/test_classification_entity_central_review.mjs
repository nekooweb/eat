#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildClassificationEntityReviewed,
  serializeClassificationEntityReviewed
} from './build_classification_entity_reviewed.mjs';
import { materializeClassificationEntityOverlay } from './build_classification_entity_overlay.mjs';

const reviewDir = 'data/classification_entity_bound_reviews';
const reviewFiles = fs.readdirSync(reviewDir)
  .filter((name) => /^S\d+\.json$/u.test(name))
  .sort();

const expected = {
  reviewFiles: reviewFiles.length,
  reviewedRows: 0,
  acceptedRows: 0,
  candidateRows: 0,
  noEvidenceRows: 0,
  blockedRows: 0
};
const acceptedIds = new Set();
const decisionById = new Map();

for (const filename of reviewFiles) {
  const review = JSON.parse(fs.readFileSync(path.join(reviewDir, filename), 'utf8'));
  assert.equal(review.schemaVersion, 1);
  assert.equal(review.centralReview, true);
  assert.equal(review.marker, 'CLASSIFICATION-ENTITY-BOUND-REVIEW');
  assert.equal(review.policy.newSourceDiscoveryPerformed, false);
  assert.equal(review.policy.paidGoogleDataApiCalls, 0);

  expected.reviewedRows += review.records.length;
  for (const row of review.records) {
    assert.ok(!decisionById.has(row.googlePlaceId), 'duplicate central review Place ID: ' + row.googlePlaceId);
    decisionById.set(row.googlePlaceId, row);
    if (row.decision === 'accepted_evidence') {
      expected.acceptedRows += 1;
      acceptedIds.add(row.googlePlaceId);
      assert.ok((row.acceptedConceptIds || []).length > 0, 'accepted decision requires concept IDs');
    } else if (row.decision === 'candidate') {
      expected.candidateRows += 1;
      assert.deepEqual(row.acceptedConceptIds || [], []);
    } else if (row.decision === 'no_evidence') {
      expected.noEvidenceRows += 1;
      assert.deepEqual(row.acceptedConceptIds || [], []);
    } else if (row.decision === 'blocked') {
      expected.blockedRows += 1;
      assert.deepEqual(row.acceptedConceptIds || [], []);
    } else {
      assert.fail('unexpected central decision: ' + row.decision);
    }
  }

  assert.equal(review.summary.reviewedRows, review.records.length);
  assert.equal(review.summary.acceptedRows,
    review.records.filter((row) => row.decision === 'accepted_evidence').length);
  assert.equal(review.summary.candidateRows,
    review.records.filter((row) => row.decision === 'candidate').length);
  assert.equal(review.summary.noEvidenceRows,
    review.records.filter((row) => row.decision === 'no_evidence').length);
  assert.equal(review.summary.blockedRows,
    review.records.filter((row) => row.decision === 'blocked').length);
}

const built = buildClassificationEntityReviewed();
assert.deepEqual(built.summary, expected,
  'reviewed-truth summary must equal the aggregate central-review decisions');
assert.equal(fs.readFileSync('data/classification_entity_reviewed.json', 'utf8'),
  serializeClassificationEntityReviewed(built),
  'committed reviewed artifact must equal deterministic central-review build');

const builtById = new Map(built.records.map((row) => [row.googlePlaceId, row]));
assert.equal(builtById.size, decisionById.size);
for (const [googlePlaceId, decision] of decisionById) {
  const row = builtById.get(googlePlaceId);
  assert.ok(row, 'central-reviewed row missing from reviewed truth: ' + googlePlaceId);
  assert.equal(row.status, decision.decision);
  assert.equal(row.sourceFingerprint, decision.sourceFingerprint);
  assert.equal(row.centralReview?.proposalStatus, decision.proposalStatus);
  if (decision.decision === 'accepted_evidence') {
    assert.deepEqual(row.proposedConceptIds, decision.acceptedConceptIds,
      'accepted reviewed truth must use exactly the central accepted concept IDs');
    assert.ok(row.categoryEvidence.length > 0);
  } else if (decision.decision === 'candidate') {
    assert.deepEqual(row.proposedConceptIds,
      decision.retainedCandidateConceptIds || row.proposedConceptIds || []);
  } else {
    assert.deepEqual(row.proposedConceptIds, []);
    assert.deepEqual(row.categoryEvidence, []);
  }
}

const overlay = materializeClassificationEntityOverlay();
assert.equal(overlay.rows.length, expected.acceptedRows);
const overlayIds = new Set(overlay.rows.map((row) => row.googlePlaceId));
assert.deepEqual([...overlayIds].sort(), [...acceptedIds].sort(),
  'public overlay must contain exactly central-reviewed accepted Place IDs');

console.log(JSON.stringify({
  status: 'pass',
  reviewFiles,
  ...expected,
  overlayRows: overlay.rows.length,
  checks: 'aggregate central decisions, deterministic reviewed truth, accepted concept exactness, non-accepted exclusion, accepted-only overlay'
}));
