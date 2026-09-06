import assert from 'node:assert/strict';
import {
  classifyPriceRangeRelation,
  collectMealPriceClaims,
  resolveMealPrice,
  selectMealPriceClaim
} from './price_resolver.mjs';

const ref = (provider, checkedAt = '2026-09-06', fields = ['budget']) => ({
  provider,
  url: `https://example.test/${provider}`,
  checkedAt,
  fields
});

const sourceRow = (source, values, checkedAt = '2026-09-06', fields = ['budget']) => ({
  source,
  sourceOnly: true,
  sourceRefs: [ref(source, checkedAt, fields)],
  ...values
});

{
  const rows = [
    sourceRow('Tabelog', { lunch: [1000, 1999] }),
    sourceRow('official', { lunch: [1200, 1800] })
  ];
  assert.deepEqual(resolveMealPrice(rows, 'lunch'), [1200, 1800]);
  assert.equal(selectMealPriceClaim(rows, 'lunch').provider, 'official');
}

{
  const rows = [
    sourceRow('Tabelog', { lunch: [1000, 1999] }),
    sourceRow('Hot Pepper', { dinner: [3001, 4000] })
  ];
  assert.deepEqual(resolveMealPrice(rows, 'lunch'), [1000, 1999]);
  assert.deepEqual(resolveMealPrice(rows, 'dinner'), [3001, 4000]);
}

{
  const rows = [
    sourceRow('Hot Pepper', { dinner: [2001, 3000] }, '2026-09-06', ['cuisine'])
  ];
  assert.equal(resolveMealPrice(rows, 'dinner'), null);
}

{
  const rows = [
    sourceRow('Tabelog', { dinner: [3000, 3999] }, '2026-08-01'),
    sourceRow('Tabelog', { dinner: [4000, 4999] }, '2026-09-01')
  ];
  assert.deepEqual(resolveMealPrice(rows, 'dinner'), [4000, 4999]);
}

{
  const rows = [
    sourceRow('Tabelog', { lunch: [1000, 1999] }),
    sourceRow('Hot Pepper', { dinner: [3001, 4000] }),
    { source: 'curated', sourceOnly: true, suppressFields: ['dinnerBudget'], sourceRefs: [ref('curated', '2026-09-06', ['dinnerBudget'])] }
  ];
  assert.deepEqual(resolveMealPrice(rows, 'lunch'), [1000, 1999]);
  assert.equal(resolveMealPrice(rows, 'dinner'), null);
}

{
  const rows = [
    sourceRow('Tabelog', { lunch: [1000, 1999], dinner: [3000, 3999] }),
    { source: 'curated', sourceOnly: true, suppressFields: ['budget'], sourceRefs: [ref('curated')] }
  ];
  assert.equal(resolveMealPrice(rows, 'lunch'), null);
  assert.equal(resolveMealPrice(rows, 'dinner'), null);
}

{
  const claims = collectMealPriceClaims([
    sourceRow('Hot Pepper', { dinner: [3001, 4000] }),
    sourceRow('Tabelog', { dinner: [3000, 3999] }),
    sourceRow('official', { dinner: [3200, 3800] })
  ], 'dinner');
  assert.deepEqual(claims.map((claim) => claim.provider), ['official', 'Tabelog', 'Hot Pepper']);
}

assert.equal(classifyPriceRangeRelation([1000, 1999], [1000, 1999]), 'exact');
assert.equal(classifyPriceRangeRelation([1000, 1999], [1500, 2499]), 'strong_overlap');
assert.equal(classifyPriceRangeRelation([1000, 1999], [1900, 2899]), 'partial_overlap');
assert.equal(classifyPriceRangeRelation([1000, 1999], [2000, 2999]), 'disjoint');

console.log(JSON.stringify({ status: 'pass', cases: 9 }));
