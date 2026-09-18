#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {
  materializeClassificationEntityOverlay
} from './build_classification_entity_overlay.mjs';

const committed = materializeClassificationEntityOverlay();
const committedReviewed = JSON.parse(fs.readFileSync('data/classification_entity_reviewed.json', 'utf8'));
assert.equal(committed.schemaVersion, 1);
assert.equal(committed.marker, 'CLASSIFICATION-ENTITY-OVERLAY');
assert.equal(committed.generatedFrom, 'data/classification_entity_reviewed.json');
assert.equal(committed.rows.length, committedReviewed.summary?.acceptedRows ?? 0,
  'public overlay must contain exactly the central-reviewed accepted rows');
const committedOverlayIds = new Set(committed.rows.map((row) => row.googlePlaceId));
for (const row of committedReviewed.records || []) {
  assert.equal(committedOverlayIds.has(row.googlePlaceId), row.status === 'accepted_evidence',
    'candidate/no_evidence/blocked rows must never materialize into the public overlay');
}

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

const runtimeContext = {
  window: {
    EAT_CLASSIFICATION_ENTITY_OVERLAY: materialized
  }
};
vm.createContext(runtimeContext);
vm.runInContext(fs.readFileSync('classification.js', 'utf8'), runtimeContext, { filename: 'classification.js' });
const classification = runtimeContext.window.EAT_CLASSIFICATION;
const merged = classification.classifyRestaurant({
  googlePlaceId: 'place-accepted',
  cuisine: '日式',
  tags: []
});
assert.deepEqual([...merged.taxonomyDirectIds], ['style-japanese']);
assert.deepEqual([...merged.entityDirectIds], ['food-sushi']);
assert.ok(merged.directIds.includes('style-japanese'));
assert.ok(merged.directIds.includes('food-sushi'));
assert.equal(classification.classifyRestaurant({
  googlePlaceId: 'place-candidate',
  cuisine: '餐厅',
  tags: []
}).directIds.length, 0, 'candidate rows must never enter runtime classification');

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
