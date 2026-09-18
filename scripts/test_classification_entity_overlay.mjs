#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  materializeClassificationEntityOverlay
} from './build_classification_entity_overlay.mjs';

const committed = materializeClassificationEntityOverlay();
assert.equal(committed.schemaVersion, 1);
assert.equal(committed.marker, 'CLASSIFICATION-ENTITY-OVERLAY');
assert.equal(committed.generatedFrom, 'data/classification_entity_reviewed.json');
assert.deepEqual(committed.rows, [], 'initial reviewed artifact must be a zero-impact overlay');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eat-classification-overlay-'));
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.copyFileSync('classification.js', path.join(root, 'classification.js'));

const accepted = {
  schemaVersion: 1,
  marker: 'CLASSIFICATION-ENTITY-REVIEWED',
  centralReviewCompleted: true,
  records: [{
    googlePlaceId: 'place-accepted',
    restaurantName: 'example',
    sourceFingerprint: 'sha256:' + 'a'.repeat(64),
    reviewedAt: '2026-09-18',
    status: 'accepted_evidence',
    identity: { state: 'verified' },
    proposedConceptIds: ['food-sushi'],
    categoryEvidence: [{
      provider: 'official',
      sourceUrl: 'https://example.com/store',
      checkedAt: '2026-09-18',
      sourceText: '寿司専門店',
      proposedConceptIds: ['food-sushi'],
      evidenceScope: 'exact_branch'
    }]
  }, {
    googlePlaceId: 'place-candidate',
    status: 'candidate',
    identity: { state: 'verified' },
    proposedConceptIds: ['style-japanese'],
    categoryEvidence: []
  }]
};
fs.writeFileSync(path.join(root, 'data/classification_entity_reviewed.json'), JSON.stringify(accepted));
const materialized = materializeClassificationEntityOverlay({ root });
assert.equal(materialized.rows.length, 1);
assert.equal(materialized.rows[0].googlePlaceId, 'place-accepted');
assert.deepEqual(materialized.rows[0].conceptIds, ['food-sushi']);

const invalid = structuredClone(accepted);
invalid.records[0].identity.state = 'candidate';
fs.writeFileSync(path.join(root, 'data/classification_entity_reviewed.json'), JSON.stringify(invalid));
assert.throws(() => materializeClassificationEntityOverlay({ root }), /verified branch identity/);

const googleEvidence = structuredClone(accepted);
googleEvidence.records[0].categoryEvidence[0].sourceUrl = 'https://www.google.com/maps/place/example';
fs.writeFileSync(path.join(root, 'data/classification_entity_reviewed.json'), JSON.stringify(googleEvidence));
assert.throws(() => materializeClassificationEntityOverlay({ root }), /Google\/navigation URL/);

console.log(JSON.stringify({
  status: 'pass',
  checks: 'accepted-only materialization, candidate exclusion, verified branch identity, exact-branch non-Google evidence, known concept IDs'
}));
