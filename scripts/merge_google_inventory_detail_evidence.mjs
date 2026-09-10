#!/usr/bin/env node
import fs from 'node:fs';

const [previousPath, currentPath, outputPath = currentPath] = process.argv.slice(2);
if (!previousPath || !currentPath) {
  throw new Error('usage: merge_google_inventory_detail_evidence.mjs <previous.json> <current.json> [output.json]');
}

const previous = fs.existsSync(previousPath) ? JSON.parse(fs.readFileSync(previousPath, 'utf8')) : { rows: [], summary: {} };
const current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));

// Public dish identity is the Chinese label + provider + source page + evidence
// class. Source-native spellings remain metadata; they must not create duplicate
// public evidence rows for the same dish on the same source page.
function itemKey(item) {
  return [
    String(item?.nameZh || '').trim(),
    item?.provider || '',
    item?.sourceUrl || '',
    item?.evidenceClass || ''
  ].join('|');
}

function itemRichness(item) {
  return [item?.evidenceRule, item?.evidenceSnippet, item?.nameJa].filter(Boolean).length;
}

function mergeItems(oldItems = [], newItems = []) {
  const map = new Map();
  for (const item of [...oldItems, ...newItems]) {
    if (!item?.nameZh || !item?.sourceUrl) continue;
    const key = itemKey(item);
    const existing = map.get(key);
    const itemDate = String(item.checkedAt || '');
    const existingDate = String(existing?.checkedAt || '');
    if (!existing || itemDate > existingDate || (itemDate === existingDate && itemRichness(item) > itemRichness(existing))) {
      map.set(key, item);
    }
  }
  // The evidence store is a monotonic provenance layer, not a presentation
  // payload. Keep the complete deduplicated union here; bounded display/export
  // layers may select a smaller recent subset without destroying old evidence.
  return [...map.values()]
    .sort((a, b) => String(b.checkedAt || '').localeCompare(String(a.checkedAt || '')) || itemKey(a).localeCompare(itemKey(b)));
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
if (mergedCounts.recommendationItems < before.recommendationItems || mergedCounts.featuredItems < before.featuredItems) {
  throw new Error(`monotonic evidence item regression: before=${JSON.stringify(before)} merged=${JSON.stringify(mergedCounts)}`);
}

const payload = {
  schemaVersion: Math.max(Number(previous.schemaVersion || 1), Number(current.schemaVersion || 1), 4),
  checkedAt: [previous.checkedAt, current.checkedAt].filter(Boolean).sort().at(-1) || new Date().toISOString().slice(0, 10),
  policy: {
    ...(previous.policy || {}),
    ...(current.policy || {}),
    evidenceRetention: 'complete monotonic union; previously verified source-backed evidence is retained when later crawls fail, return no match, or add newer distinct evidence',
    evidenceStorageItemLimit: null,
    presentationItemLimitAppliedHere: false,
    dishEvidenceDedupeKey: 'nameZh + provider + sourceUrl + evidenceClass; source-native spelling is metadata only'
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
