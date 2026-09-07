#!/usr/bin/env node
import fs from 'node:fs';

const [previousPath, currentPath, outputPath = currentPath] = process.argv.slice(2);
if (!previousPath || !currentPath) {
  throw new Error('usage: merge_google_inventory_detail_evidence.mjs <previous.json> <current.json> [output.json]');
}

const previous = fs.existsSync(previousPath) ? JSON.parse(fs.readFileSync(previousPath, 'utf8')) : { rows: [], summary: {} };
const current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));

function itemKey(item) {
  return [
    item?.nameZh || '',
    item?.nameJa || '',
    item?.provider || '',
    item?.sourceUrl || '',
    item?.evidenceClass || ''
  ].join('|');
}

function mergeItems(oldItems = [], newItems = []) {
  const map = new Map();
  for (const item of [...oldItems, ...newItems]) {
    if (!item?.nameZh || !item?.sourceUrl) continue;
    const key = itemKey(item);
    const existing = map.get(key);
    if (!existing || String(item.checkedAt || '') >= String(existing.checkedAt || '')) map.set(key, item);
  }
  return [...map.values()].sort((a, b) => String(b.checkedAt || '').localeCompare(String(a.checkedAt || '')) || itemKey(a).localeCompare(itemKey(b))).slice(0, 6);
}

const byId = new Map();
for (const row of previous.rows || []) {
  if (!row?.googlePlaceId) continue;
  byId.set(row.googlePlaceId, {
    googlePlaceId: row.googlePlaceId,
    name: row.name || null,
    recommendedDishes: [...(row.recommendedDishes || [])],
    featuredDishes: [...(row.featuredDishes || [])]
  });
}
for (const row of current.rows || []) {
  if (!row?.googlePlaceId) continue;
  const old = byId.get(row.googlePlaceId) || { googlePlaceId: row.googlePlaceId, name: null, recommendedDishes: [], featuredDishes: [] };
  byId.set(row.googlePlaceId, {
    googlePlaceId: row.googlePlaceId,
    name: row.name || old.name || null,
    recommendedDishes: mergeItems(old.recommendedDishes, row.recommendedDishes),
    featuredDishes: mergeItems(old.featuredDishes, row.featuredDishes)
  });
}

const rows = [...byId.values()]
  .map((row) => ({ ...row, recommendedDishes: mergeItems(row.recommendedDishes), featuredDishes: mergeItems(row.featuredDishes) }))
  .filter((row) => row.recommendedDishes.length || row.featuredDishes.length)
  .sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));

const counts = (payload) => ({
  recommendationRestaurants: (payload.rows || []).filter((r) => r.recommendedDishes?.length).length,
  featuredRestaurants: (payload.rows || []).filter((r) => r.featuredDishes?.length).length,
  evidenceRestaurants: (payload.rows || []).filter((r) => r.recommendedDishes?.length || r.featuredDishes?.length).length,
  recommendationItems: (payload.rows || []).reduce((n, r) => n + (r.recommendedDishes?.length || 0), 0),
  featuredItems: (payload.rows || []).reduce((n, r) => n + (r.featuredDishes?.length || 0), 0)
});
const before = counts(previous);
const fresh = counts(current);
const mergedCounts = counts({ rows });
if (mergedCounts.recommendationRestaurants < before.recommendationRestaurants || mergedCounts.featuredRestaurants < before.featuredRestaurants) {
  throw new Error(`monotonic evidence regression: before=${JSON.stringify(before)} merged=${JSON.stringify(mergedCounts)}`);
}

const payload = {
  schemaVersion: Math.max(Number(previous.schemaVersion || 1), Number(current.schemaVersion || 1), 2),
  checkedAt: [previous.checkedAt, current.checkedAt].filter(Boolean).sort().at(-1) || new Date().toISOString().slice(0, 10),
  policy: {
    ...(previous.policy || {}),
    ...(current.policy || {}),
    evidenceRetention: 'monotonic union; previously verified source-backed evidence is retained when later crawls fail or return no match'
  },
  summary: {
    ...(current.summary || {}),
    previousEvidence: before,
    freshCrawlEvidence: fresh,
    mergedEvidence: mergedCounts
  },
  rows
};
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ status: 'pass', before, fresh, merged: mergedCounts }));
