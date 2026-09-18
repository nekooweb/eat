#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildClassificationEntityReviewed,
  serializeClassificationEntityReviewed
} from './build_classification_entity_reviewed.mjs';
import { materializeClassificationEntityOverlay } from './build_classification_entity_overlay.mjs';

const built = buildClassificationEntityReviewed();
assert.equal(built.summary.reviewFiles, 1);
assert.equal(built.summary.reviewedRows, 8);
assert.equal(built.summary.acceptedRows, 4);
assert.equal(built.summary.candidateRows, 1);
assert.equal(built.summary.noEvidenceRows, 0);
assert.equal(built.summary.blockedRows, 3);
assert.equal(fs.readFileSync('data/classification_entity_reviewed.json', 'utf8'),
  serializeClassificationEntityReviewed(built),
  'committed reviewed artifact must equal deterministic central-review build');

const byId = new Map(built.records.map((row) => [row.googlePlaceId, row]));
assert.deepEqual(byId.get('ChIJ4Rl_oxqMGGARrfMHk00Q43A').proposedConceptIds,
  ['venue-shokudo', 'food-ramen']);
assert.deepEqual(byId.get('ChIJOYjSZgOMGGARgpKN-7Nxyog').proposedConceptIds,
  ['food-curry', 'venue-bar']);
assert.deepEqual(byId.get('ChIJ2beQAhmMGGARZcWdx1PBwuo').proposedConceptIds,
  ['venue-cafe']);
assert.deepEqual(byId.get('ChIJTSMMw0eMGGARUh1lFCWlDbg').proposedConceptIds,
  ['style-american', 'venue-bar']);
assert.equal(byId.get('ChIJ_dlidcCNGGARaps03scrCg0').status, 'candidate');
assert.deepEqual(byId.get('ChIJ_dlidcCNGGARaps03scrCg0').proposedConceptIds, ['food-hamburger']);

const overlay = materializeClassificationEntityOverlay();
assert.equal(overlay.rows.length, 4);
assert.deepEqual(overlay.rows.map((row) => row.googlePlaceId).sort(), [
  'ChIJ2beQAhmMGGARZcWdx1PBwuo',
  'ChIJ4Rl_oxqMGGARrfMHk00Q43A',
  'ChIJOYjSZgOMGGARgpKN-7Nxyog',
  'ChIJTSMMw0eMGGARUh1lFCWlDbg'
].sort());

console.log(JSON.stringify({
  status: 'pass',
  reviewedRows: built.summary.reviewedRows,
  acceptedRows: built.summary.acceptedRows,
  overlayRows: overlay.rows.length,
  checks: 'proposal-backed central decisions, no candidate promotion, deterministic reviewed artifact, accepted-only overlay'
}));
