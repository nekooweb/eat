#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { FEATURED_TEMPLATES } from './featured_template_registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productionPath = path.join(ROOT, 'data', 'production_area1.js');

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(productionPath, 'utf8'), sandbox, { filename: 'production_area1.js' });
const rows = sandbox.window.PRODUCTION_RESTAURANTS || [];

const groups = [];
let totalBrandRows = 0;
let totalMissing = 0;
let sourceBackedMissing = 0;
for (const template of FEATURED_TEMPLATES) {
  const matched = rows.filter((row) => template.re.test(String(row.name || '')));
  const missing = matched.filter((row) => !(Array.isArray(row.featuredDishes) && row.featuredDishes.length));
  totalBrandRows += matched.length;
  totalMissing += missing.length;
  sourceBackedMissing += missing.filter((row) => (row.sources || []).some((source) => source !== 'OpenStreetMap')).length;
  groups.push({
    brand: template.key,
    reviewedItem: template.featured[0]?.nameJa || null,
    reviewedZh: template.featured[0]?.nameZh || null,
    source: template.source,
    productionRows: matched.length,
    withFeatured: matched.length - missing.length,
    missingFeatured: missing.length,
    sourceBackedMissing: missing.filter((row) => (row.sources || []).some((source) => source !== 'OpenStreetMap')).length,
    rows: missing.map((row) => ({
      googlePlaceId: row.googlePlaceId,
      name: row.name,
      distanceMeters: row.distanceMeters,
      sources: row.sources || [],
      sourceBacked: (row.sources || []).some((source) => source !== 'OpenStreetMap'),
      hasRecommended: Array.isArray(row.recommendedDishes) && row.recommendedDishes.length > 0
    }))
  });
}

console.log(JSON.stringify({
  productionEntities: rows.length,
  templateBrands: FEATURED_TEMPLATES.length,
  templateBrandRows: totalBrandRows,
  missingFeaturedAcrossTemplateBrands: totalMissing,
  sourceBackedMissingFeaturedAcrossTemplateBrands: sourceBackedMissing,
  groups: groups.filter((group) => group.productionRows > 0)
}, null, 2));
