#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const reviewPaths = fs.readdirSync('data')
  .filter((name) => /^classification_taxonomy_review_20260918_batch\d+\.json$/u.test(name))
  .sort((a, b) => a.localeCompare(b, 'en'))
  .map((name) => `data/${name}`);
assert.deepEqual(reviewPaths, [
  'data/classification_taxonomy_review_20260918_batch1.json',
  'data/classification_taxonomy_review_20260918_batch2.json'
]);

const reviews = reviewPaths.map((path) => ({ path, document: JSON.parse(fs.readFileSync(path, 'utf8')) }));
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync('classification.js', 'utf8'), context, { filename: 'classification.js' });
const taxonomy = context.window.EAT_CLASSIFICATION;

assert.ok(taxonomy, 'classification.js must expose EAT_CLASSIFICATION');
assert.equal(taxonomy.version, 'classification-v3-20260918');

const conceptById = new Map([...taxonomy.concepts].map((concept) => [concept.id, concept]));
const seenTokens = new Set();
let reviewedTokens = 0;
let acceptedTokens = 0;
let affectedHits = 0;
let unknownHits = 0;

for (const { path, document: review } of reviews) {
  assert.equal(review.schemaVersion, 1);
  assert.equal(review.reviewedAt, '2026-09-18');
  assert.equal(review.policy.networkRequests, 0);
  assert.equal(review.policy.paidGoogleDataApiCalls, 0);
  assert.equal(review.policy.exactSourceTokenOnly, true);
  assert.equal(review.policy.restaurantNameInferenceAllowed, false);
  assert.equal(review.policy.menuDishInferenceAllowed, false);
  assert.equal(review.policy.crossDimensionInferenceAllowed, false);
  assert.equal(review.policy.genericSourceValuePromotionAllowed, false);
  assert.equal(review.records.length, review.summary.reviewedTokens, `${path}: reviewed-token summary mismatch`);
  assert.equal(review.records.filter((row) => row.status === 'accepted').length,
    review.summary.acceptedTokens, `${path}: accepted-token summary mismatch`);

  let batchAffected = 0;
  let batchUnknown = 0;
  for (const row of review.records) {
    assert.equal(row.status, 'accepted', `${path}: only centrally accepted mappings are materialized`);
    assert.ok(row.reason, `${path}: review reason required for ${row.normalizedToken}`);
    assert.ok(!seenTokens.has(row.normalizedToken), `token reviewed twice across batches: ${row.normalizedToken}`);
    seenTokens.add(row.normalizedToken);
    assert.ok(conceptById.has(row.conceptId), `review points to missing concept: ${row.conceptId}`);
    assert.equal(taxonomy.resolveConceptToken(row.normalizedToken), row.conceptId,
      `accepted token must resolve exactly to reviewed concept: ${row.normalizedToken}`);
    for (const variant of row.rawVariants || []) {
      assert.equal(taxonomy.resolveConceptToken(variant), row.conceptId,
        `raw variant must resolve to reviewed concept: ${variant}`);
    }
    const concept = conceptById.get(row.conceptId);
    if (concept.parentId) {
      const parent = conceptById.get(concept.parentId);
      assert.ok(parent, `missing parent concept: ${concept.parentId}`);
      assert.equal(parent.dimension, concept.dimension, `cross-dimension parent forbidden: ${concept.id}`);
    }
    batchAffected += Number(row.affectedRestaurantCount || 0);
    batchUnknown += Number(row.unknownRestaurantCount || 0);
  }
  assert.equal(batchAffected, review.summary.summedAffectedRestaurantTokenHitsAtReview);
  assert.equal(batchUnknown, review.summary.summedUnknownRestaurantTokenHitsAtReview);
  reviewedTokens += review.summary.reviewedTokens;
  acceptedTokens += review.summary.acceptedTokens;
  affectedHits += batchAffected;
  unknownHits += batchUnknown;
}

assert.equal(reviewedTokens, 20);
assert.equal(acceptedTokens, 20);
assert.equal(affectedHits, 100);
assert.equal(unknownHits, 70);

const indianCurry = taxonomy.classifyRestaurant({ cuisine: '印度咖喱', tags: [] });
assert.deepEqual([...indianCurry.directIds], ['food-indian-curry']);
assert.ok(indianCurry.effectiveIds.includes('food-curry'));
assert.ok(!indianCurry.effectiveIds.includes('style-indian'),
  'Indian curry must not cross-infer cuisine style');

const breadBaking = taxonomy.classifyRestaurant({ cuisine: '面包・烘焙', tags: [] });
assert.deepEqual([...breadBaking.directIds], ['food-bread-bakery-unsplit']);
assert.ok(!breadBaking.effectiveIds.includes('venue-bakery'),
  'bread/baking source category must not infer bakery venue type');

const okonomiyaki = taxonomy.classifyRestaurant({ cuisine: '御好烧', tags: [] });
assert.deepEqual([...okonomiyaki.directIds], ['food-okonomiyaki']);
assert.ok(!okonomiyaki.effectiveIds.includes('food-okonomiyaki-monja'),
  'specific okonomiyaki must not be folded into the composite okonomiyaki/monja source concept');

assert.equal(taxonomy.resolveConceptToken('スープ'), 'food-soup');
assert.equal(taxonomy.resolveConceptToken('汤品'), 'food-soup');
assert.equal(taxonomy.resolveConceptToken('烧烤'), 'food-barbecue');
assert.notEqual(taxonomy.resolveConceptToken('烧烤'), 'food-yakiniku');
assert.equal(taxonomy.resolveConceptToken('摩洛哥菜'), 'style-moroccan');
assert.equal(taxonomy.resolveConceptToken('餐厅'), null);
assert.equal(taxonomy.resolveConceptToken('restaurant'), null);

console.log(JSON.stringify({
  status: 'pass',
  reviewFiles: reviewPaths.length,
  reviewedTokens,
  acceptedTokens,
  summedAffectedRestaurantTokenHitsAtReview: affectedHits,
  summedUnknownRestaurantTokenHitsAtReview: unknownHits,
  checks: 'all reviewed taxonomy batches align with exact aliases; generic and cross-dimension inference remain blocked'
}));
