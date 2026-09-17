#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadClassification() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('classification.js', 'utf8'), context);
  return context.window.EAT_CLASSIFICATION;
}

const taxonomy = loadClassification();
assert.ok(taxonomy, 'classification.js must expose EAT_CLASSIFICATION');
assert.deepEqual([...taxonomy.dimensions].map((d) => d.id), ['cuisineStyle', 'foodType', 'venueType']);

const clone = (value) => JSON.parse(JSON.stringify(value));
const classify = (restaurant) => taxonomy.classifyRestaurant(restaurant);

const chineseA = { cuisine: '中華', tags: ['中華'] };
const chineseB = { cuisine: '中餐', tags: [] };
const originalA = clone(chineseA);
assert.deepEqual([...classify(chineseA).directIds], ['style-chinese']);
assert.deepEqual([...classify(chineseB).directIds], ['style-chinese']);
assert.deepEqual(chineseA, originalA, 'classification must never mutate source rows');

const ramen = classify({ cuisine: 'ラーメン', tags: [] });
assert.ok(ramen.directIds.includes('food-ramen'));
assert.ok(ramen.effectiveIds.includes('food-noodles'), 'ramen must inherit only its same-dimension noodle parent');
const udon = classify({ cuisine: 'うどん', tags: [] });
assert.ok(udon.effectiveIds.includes('food-noodles'));
assert.ok(!udon.effectiveIds.includes('food-ramen'), 'excluding ramen must not imply all noodles');

const sushi = classify({ cuisine: '寿司', tags: [] });
assert.ok(sushi.directIds.includes('food-sushi'));
assert.ok(!sushi.effectiveIds.includes('style-japanese'), 'food type must not infer cuisine style');

const curry = classify({ cuisine: '咖喱', tags: [] });
assert.ok(curry.directIds.includes('food-curry'));
assert.ok(!curry.effectiveIds.includes('style-indian'), 'curry must not infer Indian cuisine');

const italianFrench = classify({ cuisine: 'イタリアン・フレンチ', tags: [] });
assert.deepEqual([...italianFrench.directIds], ['style-italian-french-unsplit']);
assert.ok(!italianFrench.effectiveIds.includes('style-italian'));
assert.ok(!italianFrench.effectiveIds.includes('style-french'));

const cafeSweets = classify({ cuisine: 'カフェ・スイーツ', tags: [] });
assert.deepEqual([...cafeSweets.directIds], ['venue-cafe-sweets-unsplit']);
assert.ok(!cafeSweets.effectiveIds.includes('venue-cafe'));
assert.ok(!cafeSweets.effectiveIds.includes('food-dessert'));

const multi = classify({ cuisine: '日式', tags: ['寿司', '居酒屋', '日式'] });
assert.ok(multi.directIds.includes('style-japanese'));
assert.ok(multi.directIds.includes('food-sushi'));
assert.ok(multi.directIds.includes('venue-izakaya'));
assert.equal(multi.directIds.filter((id) => id === 'style-japanese').length, 1, 'duplicate source labels must deduplicate');

for (const generic of ['', '餐厅', 'restaurant', 'その他グルメ']) {
  assert.equal(classify({ cuisine: generic, tags: [] }).directIds.length, 0, `${generic || 'blank'} must remain unknown`);
}

assert.equal(taxonomy.resolveConceptToken('中華'), 'style-chinese');
assert.equal(taxonomy.resolveConceptToken('style-chinese'), 'style-chinese');
assert.equal(taxonomy.resolveConceptToken('未知类别'), null);

const counts = taxonomy.conceptCounts([
  { cuisine: 'ラーメン' },
  { cuisine: 'うどん' },
  { cuisine: '寿司' }
]);
assert.equal(counts.get('food-noodles'), 2, 'parent count must include child restaurants exactly once');
assert.equal(counts.get('food-ramen'), 1);
assert.equal(counts.get('food-udon'), 1);

console.log(JSON.stringify({
  status: 'pass',
  checks: 'exact aliases, same-dimension ancestry, no cross-dimension inference, composite preservation, unknown preservation, source immutability'
}));
