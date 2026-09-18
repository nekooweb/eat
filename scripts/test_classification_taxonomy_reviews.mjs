#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const review = JSON.parse(fs.readFileSync('data/classification_taxonomy_review_20260918_batch1.json', 'utf8'));
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync('classification.js', 'utf8'), context, { filename: 'classification.js' });
const taxonomy = context.window.EAT_CLASSIFICATION;

assert.ok(taxonomy, 'classification.js must expose EAT_CLASSIFICATION');
assert.equal(taxonomy.version, 'classification-v2-20260918');
assert.equal(review.schemaVersion, 1);
assert.equal(review.reviewedAt, '2026-09-18');
assert.equal(review.policy.networkRequests, 0);
assert.equal(review.policy.paidGoogleDataApiCalls, 0);
assert.equal(review.policy.exactSourceTokenOnly, true);
assert.equal(review.policy.restaurantNameInferenceAllowed, false);
assert.equal(review.policy.menuDishInferenceAllowed, false);
assert.equal(review.policy.crossDimensionInferenceAllowed, false);
assert.equal(review.policy.genericSourceValuePromotionAllowed, false);
assert.equal(review.records.length, review.summary.reviewedTokens);
assert.equal(review.records.filter((row) => row.status === 'accepted').length, review.summary.acceptedTokens);

const conceptById = new Map([...taxonomy.concepts].map((concept) => [concept.id, concept]));
let affected = 0;
let unknownHits = 0;
const seen = new Set();

for (const row of review.records) {
  assert.equal(row.status, 'accepted', `batch 1 contains only centrally accepted mappings: ${row.normalizedToken}`);
  assert.ok(row.reason, `review reason required: ${row.normalizedToken}`);
  assert.ok(!seen.has(row.normalizedToken), `duplicate reviewed token: ${row.normalizedToken}`);
  seen.add(row.normalizedToken);
  assert.ok(conceptById.has(row.conceptId), `review points to missing concept: ${row.conceptId}`);
  assert.equal(taxonomy.resolveConceptToken(row.normalizedToken), row.conceptId,
    `accepted token must resolve exactly to reviewed concept: ${row.normalizedToken}`);
  for (const variant of row.rawVariants || []) {
    assert.equal(taxonomy.resolveConceptToken(variant), row.conceptId,
      `raw variant must resolve to reviewed concept: ${variant}`);
  }
  affected += Number(row.affectedRestaurantCount || 0);
  unknownHits += Number(row.unknownRestaurantCount || 0);
}

assert.equal(affected, review.summary.summedAffectedRestaurantTokenHitsAtReview);
assert.equal(unknownHits, review.summary.summedUnknownRestaurantTokenHitsAtReview);
assert.equal(affected, 94);
assert.equal(unknownHits, 65);
assert.equal(review.summary.baselineUniqueTaxonomyTokenFirstRows, 63,
  'unique taxonomy-first rows are a separate planner metric because token hits can overlap');

const indianCurry = taxonomy.classifyRestaurant({ cuisine: '印度咖喱', tags: [] });
assert.deepEqual([...indianCurry.directIds], ['food-indian-curry']);
assert.ok(indianCurry.effectiveIds.includes('food-curry'), 'Indian curry may inherit the food-type curry parent');
assert.ok(!indianCurry.effectiveIds.includes('style-indian'), 'Indian curry token must not cross-infer cuisine style');

const breadBaking = taxonomy.classifyRestaurant({ cuisine: '面包・烘焙', tags: [] });
assert.deepEqual([...breadBaking.directIds], ['food-bread-bakery-unsplit']);
assert.ok(!breadBaking.effectiveIds.includes('venue-bakery'),
  'bread/baking source category must not infer bakery venue type');

assert.equal(taxonomy.resolveConceptToken('ダイニングバー'), 'venue-dining-bar');
assert.equal(taxonomy.resolveConceptToken('印度菜'), 'style-indian');
assert.equal(taxonomy.resolveConceptToken('餐厅'), null, 'generic restaurant must remain unresolved');
assert.equal(taxonomy.resolveConceptToken('restaurant'), null, 'generic restaurant must remain unresolved');

for (const row of review.records) {
  const concept = conceptById.get(row.conceptId);
  if (!concept.parentId) continue;
  const parent = conceptById.get(concept.parentId);
  assert.ok(parent, `missing parent concept: ${concept.parentId}`);
  assert.equal(parent.dimension, concept.dimension, `cross-dimension parent forbidden: ${concept.id}`);
}

console.log(JSON.stringify({
  status: 'pass',
  reviewedTokens: review.records.length,
  summedAffectedRestaurantTokenHitsAtReview: affected,
  summedUnknownRestaurantTokenHitsAtReview: unknownHits,
  baselineUniqueTaxonomyTokenFirstRows: review.summary.baselineUniqueTaxonomyTokenFirstRows,
  checks: 'review artifact alignment, exact aliases, generic preservation, same-dimension ancestry, no cross-dimension inference'
}));
