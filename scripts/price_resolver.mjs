const SOURCE_PRIORITY = new Map([
  ['official', 400],
  ['Tabelog', 300],
  ['Hot Pepper', 200],
  ['curated', 100],
  ['OpenStreetMap', 0]
]);

export function isPriceRange(value) {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
    && value[0] >= 0
    && value[1] >= value[0];
}

function sourceLabel(row) {
  return row?.source || 'curated';
}

function claimedFields(row) {
  if (!row?.sourceOnly || !Array.isArray(row.sourceRefs)) return new Set();
  return new Set(row.sourceRefs.flatMap((ref) => Array.isArray(ref?.fields) ? ref.fields : []));
}

function claimsMealBudget(row, meal) {
  if (!row?.sourceOnly) return true;
  const fields = claimedFields(row);
  return fields.has('budget') || fields.has(`${meal}Budget`);
}

function latestClaimDate(row, meal) {
  if (!Array.isArray(row?.sourceRefs)) return '';
  const dates = row.sourceRefs
    .filter((ref) => {
      const fields = new Set(Array.isArray(ref?.fields) ? ref.fields : []);
      return fields.has('budget') || fields.has(`${meal}Budget`);
    })
    .map((ref) => String(ref?.checkedAt || ''))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  return dates.at(-1) || '';
}

function sourcePriority(row) {
  return SOURCE_PRIORITY.get(sourceLabel(row)) ?? 50;
}

export function isMealPriceSuppressed(rows, meal) {
  if (!['lunch', 'dinner'].includes(meal)) throw new Error(`unsupported meal: ${meal}`);
  return rows.some((row) => row?.sourceOnly
    && Array.isArray(row.suppressFields)
    && (row.suppressFields.includes('budget') || row.suppressFields.includes(`${meal}Budget`)));
}

export function collectMealPriceClaims(rows, meal) {
  if (!['lunch', 'dinner'].includes(meal)) throw new Error(`unsupported meal: ${meal}`);
  return rows
    .filter((row) => isPriceRange(row?.[meal]) && claimsMealBudget(row, meal))
    .map((row, index) => ({
      row,
      value: row[meal],
      provider: sourceLabel(row),
      checkedAt: latestClaimDate(row, meal),
      priority: sourcePriority(row),
      index
    }))
    .sort((a, b) =>
      b.priority - a.priority
      || b.checkedAt.localeCompare(a.checkedAt)
      || a.index - b.index);
}

export function selectMealPriceClaim(rows, meal) {
  if (isMealPriceSuppressed(rows, meal)) return null;
  return collectMealPriceClaims(rows, meal)[0] || null;
}

export function resolveMealPrice(rows, meal) {
  return selectMealPriceClaim(rows, meal)?.value || null;
}

export function classifyPriceRangeRelation(a, b) {
  if (!isPriceRange(a) || !isPriceRange(b)) return 'invalid';
  if (a[0] === b[0] && a[1] === b[1]) return 'exact';
  const overlapStart = Math.max(a[0], b[0]);
  const overlapEnd = Math.min(a[1], b[1]);
  if (overlapEnd < overlapStart) return 'disjoint';
  const overlap = overlapEnd - overlapStart + 1;
  const smallerWidth = Math.min(a[1] - a[0] + 1, b[1] - b[0] + 1);
  return overlap / smallerWidth >= 0.5 ? 'strong_overlap' : 'partial_overlap';
}

export function providerPriority(provider) {
  return SOURCE_PRIORITY.get(provider) ?? 50;
}
