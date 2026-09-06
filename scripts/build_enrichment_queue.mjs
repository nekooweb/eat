#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { isPriceRange } from './price_resolver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const productionSandbox = { window: {} };
vm.createContext(productionSandbox);
vm.runInContext(read('data/production_area1.js'), productionSandbox, { filename: 'production_area1.js' });
const production = productionSandbox.window.PRODUCTION_RESTAURANTS || [];

const enrichmentFiles = fs.readdirSync(DATA)
  .filter((filename) => /^source_enrichment(?:_[a-z0-9-]+)?\.js$/i.test(filename))
  .sort();
const sourceSandbox = { window: { RESTAURANTS: [] } };
vm.createContext(sourceSandbox);
for (const filename of enrichmentFiles) {
  vm.runInContext(read(`data/${filename}`), sourceSandbox, { filename });
}
const enrichments = sourceSandbox.window.RESTAURANTS || [];

const byPlaceId = new Map();
for (const row of enrichments) {
  if (!row.googlePlaceId) continue;
  if (!byPlaceId.has(row.googlePlaceId)) byPlaceId.set(row.googlePlaceId, []);
  byPlaceId.get(row.googlePlaceId).push(row);
}

function sourceHosts(rows) {
  const hosts = new Set();
  for (const row of rows) {
    for (const ref of row.sourceRefs || []) {
      try {
        hosts.add(new URL(ref.url).hostname.replace(/^www\./, ''));
      } catch (_) {
        // Invalid URLs are handled by source-binding audit.
      }
    }
  }
  return [...hosts].sort();
}

function sourceProviders(rows) {
  return [...new Set(rows.map((row) => row.source).filter(Boolean))].sort();
}

function gaps(row) {
  const missing = [];
  if (!Array.isArray(row.recommendedDishes) || !row.recommendedDishes.length) missing.push('recommendedDishes');
  if (!Array.isArray(row.featuredDishes) || !row.featuredDishes.length) missing.push('featuredDishes');
  if (!row.openingHours) missing.push('openingHours');
  if (!isPriceRange(row.lunch)) missing.push('lunchBudget');
  if (!isPriceRange(row.dinner)) missing.push('dinnerBudget');
  if (!row.address) missing.push('address');
  if (!row.cuisine || row.cuisine === '餐厅') missing.push('cuisine');
  return missing;
}

function nextAction(record) {
  const providers = new Set(record.sourceProviders);
  const gaps = new Set(record.gaps);
  if (gaps.has('recommendedDishes')) return 'extract_strict_recommended_menu_item';
  if (gaps.has('featuredDishes')) return 'extract_menu_or_signature_items';
  if (gaps.has('lunchBudget')) {
    if (providers.has('official')) return 'extract_official_lunch_price';
    if (providers.has('Tabelog')) return 'extract_tabelog_lunch_price';
    return 'discover_official_or_tabelog_lunch_source';
  }
  if (gaps.has('dinnerBudget')) {
    if (providers.has('official')) return 'extract_official_dinner_price';
    if (providers.has('Tabelog')) return 'extract_tabelog_dinner_price';
    return 'discover_official_or_tabelog_dinner_source';
  }
  if (gaps.has('openingHours')) return 'extract_current_hours';
  if (gaps.has('address') || gaps.has('cuisine')) return 'extract_identity_fields';
  return 'review';
}

function priorityScore(record) {
  let score = 0;
  if (record.gaps.includes('recommendedDishes')) score += 120;
  if (record.gaps.includes('featuredDishes')) score += 80;
  if (record.gaps.includes('openingHours')) score += 25;
  if (record.gaps.includes('lunchBudget')) score += 20;
  if (record.gaps.includes('dinnerBudget')) score += 15;
  if (record.gaps.includes('address')) score += 10;
  if (record.gaps.includes('cuisine')) score += 10;
  // Prefer already-bound sources and nearer restaurants when field value is equal.
  if (record.sourceHosts.length) score += 10;
  score += Math.max(0, 12 - Math.floor(record.distanceMeters / 100));
  return score;
}

const records = production.map((row) => {
  const sourceRows = byPlaceId.get(row.googlePlaceId) || [];
  const record = {
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    distanceMeters: row.distanceMeters,
    sourceHosts: sourceHosts(sourceRows),
    sourceProviders: sourceProviders(sourceRows),
    gaps: gaps(row)
  };
  return {
    ...record,
    nextAction: nextAction(record),
    priorityScore: priorityScore(record)
  };
});

const withUsableSource = records.filter((row) => row.sourceHosts.length);
const withoutUsableSource = records.filter((row) => !row.sourceHosts.length);
const needingFields = withUsableSource.filter((row) => row.gaps.length);

const grouped = new Map();
for (const row of needingFields) {
  for (const host of row.sourceHosts) {
    if (!grouped.has(host)) grouped.set(host, []);
    grouped.get(host).push(row);
  }
}

const sourceGroups = [...grouped.entries()]
  .map(([host, rows]) => ({
    host,
    restaurants: rows.length,
    gapCounts: rows.reduce((acc, row) => {
      for (const gap of row.gaps) acc[gap] = (acc[gap] || 0) + 1;
      return acc;
    }, {}),
    nextActionCounts: rows.reduce((acc, row) => {
      acc[row.nextAction] = (acc[row.nextAction] || 0) + 1;
      return acc;
    }, {}),
    rows: rows
      .sort((a, b) => b.priorityScore - a.priorityScore || a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name, 'ja'))
      .slice(0, 100)
  }))
  .sort((a, b) =>
    (b.gapCounts.recommendedDishes || 0) - (a.gapCounts.recommendedDishes || 0)
    || (b.gapCounts.featuredDishes || 0) - (a.gapCounts.featuredDishes || 0)
    || b.restaurants - a.restaurants
    || a.host.localeCompare(b.host));

const gapCounts = records.reduce((acc, row) => {
  for (const gap of row.gaps) acc[gap] = (acc[gap] || 0) + 1;
  return acc;
}, {});
const usableGapCounts = needingFields.reduce((acc, row) => {
  for (const gap of row.gaps) acc[gap] = (acc[gap] || 0) + 1;
  return acc;
}, {});

const report = {
  schemaVersion: 2,
  productionEntities: production.length,
  withUsableSource: withUsableSource.length,
  withoutUsableSource: withoutUsableSource.length,
  usableSourceRowsNeedingFields: needingFields.length,
  strictRecommendationCoverage: production.filter((row) => row.recommendedDishes?.length).length,
  featuredDishCoverage: production.filter((row) => row.featuredDishes?.length).length,
  priceCoverage: {
    lunchKnown: production.length - (gapCounts.lunchBudget || 0),
    dinnerKnown: production.length - (gapCounts.dinnerBudget || 0),
    lunchMissing: gapCounts.lunchBudget || 0,
    dinnerMissing: gapCounts.dinnerBudget || 0
  },
  gapCounts,
  usableSourceGapCounts: usableGapCounts,
  priorityQueue: records
    .filter((row) => row.gaps.length)
    .sort((a, b) => b.priorityScore - a.priorityScore || a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name, 'ja'))
    .slice(0, 200),
  sourceGroups
};

console.log(JSON.stringify(report));
