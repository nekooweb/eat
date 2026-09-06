import assert from 'node:assert/strict';
import {
  classifyPriceRangeRelation,
  collectMealPriceClaims,
  resolveMealPrice,
  selectMealPriceClaim
} from './price_resolver.mjs';

const ref = (provider, checkedAt = '2026-09-06', fields = ['budget'], priceEvidenceClass = undefined) => ({
  provider,
  url: `https://example.test/${provider}`,
  checkedAt,
  fields,
  ...(priceEvidenceClass ? { priceEvidenceClass } : {})
});

const sourceRow = (
  source,
  values,
  checkedAt = '2026-09-06',
  fields = ['budget'],
  priceEvidenceClass = undefined
) => ({
  source,
  sourceOnly: true,
  sourceRefs: [ref(source, checkedAt, fields, priceEvidenceClass)],
  ...values
});

// Explicit official range outranks explicit Tabelog range.
{
  const rows = [
    sourceRow('Tabelog', { lunch: [1000, 1999] }),
    sourceRow('official', { lunch: [1200, 1800] })
  ];
  assert.deepEqual(resolveMealPrice(rows, 'lunch'), [1200, 1800]);
  assert.equal(selectMealPriceClaim(rows, 'lunch').provider, 'official');
}

// Meal periods resolve independently.
{
  const rows = [
    sourceRow('Tabelog', { lunch: [1000, 1999] }),
    sourceRow('Hot Pepper', { dinner: [3001, 4000] }, '2026-09-06', ['dinnerBudget'])
  ];
  assert.deepEqual(resolveMealPrice(rows, 'lunch'), [1000, 1999]);
  assert.deepEqual(resolveMealPrice(rows, 'dinner'), [3001, 4000]);
}

// A stored price without a price claim is ignored.
{
  const rows = [
    sourceRow('Hot Pepper', { dinner: [2001, 3000] }, '2026-09-06', ['cuisine'])
  ];
  assert.equal(resolveMealPrice(rows, 'dinner'), null);
}

// Freshness breaks ties inside the same provider/evidence class.
{
  const rows = [
    sourceRow('Tabelog', { dinner: [3000, 3999] }, '2026-08-01'),
    sourceRow('Tabelog', { dinner: [4000, 4999] }, '2026-09-01')
  ];
  assert.deepEqual(resolveMealPrice(rows, 'dinner'), [4000, 4999]);
}

// Meal-specific suppression does not erase the other meal.
{
  const rows = [
    sourceRow('Tabelog', { lunch: [1000, 1999] }),
    sourceRow('Hot Pepper', { dinner: [3001, 4000] }, '2026-09-06', ['dinnerBudget']),
    { source: 'curated', sourceOnly: true, suppressFields: ['dinnerBudget'], sourceRefs: [ref('curated', '2026-09-06', ['dinnerBudget'])] }
  ];
  assert.deepEqual(resolveMealPrice(rows, 'lunch'), [1000, 1999]);
  assert.equal(resolveMealPrice(rows, 'dinner'), null);
}

// Legacy global budget suppression still suppresses both meal periods.
{
  const rows = [
    sourceRow('Tabelog', { lunch: [1000, 1999], dinner: [3000, 3999] }),
    { source: 'curated', sourceOnly: true, suppressFields: ['budget'], sourceRefs: [ref('curated')] }
  ];
  assert.equal(resolveMealPrice(rows, 'lunch'), null);
  assert.equal(resolveMealPrice(rows, 'dinner'), null);
}

// Same evidence class falls back to provider priority.
{
  const claims = collectMealPriceClaims([
    sourceRow('Hot Pepper', { dinner: [3001, 4000] }, '2026-09-06', ['dinnerBudget']),
    sourceRow('Tabelog', { dinner: [3000, 3999] }),
    sourceRow('official', { dinner: [3200, 3800] })
  ], 'dinner');
  assert.deepEqual(claims.map((claim) => claim.provider), ['official', 'Tabelog', 'Hot Pepper']);
}

// Explicit structured evidence outranks an official menu-derived band.
{
  const rows = [
    sourceRow('official', { dinner: [1800, 3600] }, '2026-09-06', ['dinnerBudget'], 'menu_derived'),
    sourceRow('Tabelog', { dinner: [3000, 3999] }, '2026-09-05', ['dinnerBudget'], 'explicit_range')
  ];
  const selected = selectMealPriceClaim(rows, 'dinner');
  assert.equal(selected.provider, 'Tabelog');
  assert.equal(selected.evidenceClass, 'explicit_range');
}

// Authorized Hot Pepper explicit range also outranks a derived official band.
{
  const rows = [
    sourceRow('official', { dinner: [1500, 3500] }, '2026-09-06', ['dinnerBudget'], 'B'),
    sourceRow('Hot Pepper', { dinner: [3001, 4000] }, '2026-09-05', ['dinnerBudget'], 'A')
  ];
  assert.equal(selectMealPriceClaim(rows, 'dinner').provider, 'Hot Pepper');
}

// A derived official band is usable when no explicit range exists.
{
  const rows = [
    sourceRow('official', { lunch: [900, 1800] }, '2026-09-06', ['lunchBudget'], 'menu_derived')
  ];
  const selected = selectMealPriceClaim(rows, 'lunch');
  assert.deepEqual(selected.value, [900, 1800]);
  assert.equal(selected.evidenceClass, 'menu_derived');
}

// Sparse single-item/search evidence never enters canonical hard filtering.
{
  const rows = [
    sourceRow('official', { lunch: [1200, 1200] }, '2026-09-06', ['lunchBudget'], 'sparse')
  ];
  assert.equal(resolveMealPrice(rows, 'lunch'), null);
}

assert.equal(classifyPriceRangeRelation([1000, 1999], [1000, 1999]), 'exact');
assert.equal(classifyPriceRangeRelation([1000, 1999], [1500, 2499]), 'strong_overlap');
assert.equal(classifyPriceRangeRelation([1000, 1999], [1900, 2899]), 'partial_overlap');
assert.equal(classifyPriceRangeRelation([1000, 1999], [2000, 2999]), 'disjoint');

console.log(JSON.stringify({ status: 'pass', cases: 13 }));
