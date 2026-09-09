#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');

function load(filename, seed = {}) {
  const sandbox = { window: seed, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
  return sandbox.window;
}

const productionWindow = load('production_area1.js');
const recommendationWindow = load('recommended_dishes.js', { RECOMMENDED_DISHES: [] });
const featuredWindow = load('featured_dishes.js', { FEATURED_DISHES: [] });
const production = productionWindow.PRODUCTION_RESTAURANTS || [];
const recommendations = recommendationWindow.RECOMMENDED_DISHES || [];
const featured = featuredWindow.FEATURED_DISHES || [];
const productionIds = new Set(production.map((row) => row.googlePlaceId));
const violations = [];

function auditRows(rows, kind) {
  const seen = new Set();
  for (const row of rows) {
    const id = String(row?.googlePlaceId || '').trim();
    if (!id) {
      violations.push({ kind, reason: 'missing_place_id' });
      continue;
    }
    if (seen.has(id)) violations.push({ kind, googlePlaceId: id, reason: 'duplicate_overlay_place_id' });
    seen.add(id);
    if (!productionIds.has(id)) {
      violations.push({ kind, googlePlaceId: id, reason: 'overlay_not_attached_to_final_canonical_production' });
    }
  }
}

auditRows(recommendations, 'recommendation');
auditRows(featured, 'featured');

const summary = {
  status: violations.length ? 'fail' : 'pass',
  productionRows: production.length,
  recommendationRows: recommendations.length,
  featuredRows: featured.length,
  detachedRecommendationRows: violations.filter((row) => row.kind === 'recommendation' && row.reason === 'overlay_not_attached_to_final_canonical_production').length,
  detachedFeaturedRows: violations.filter((row) => row.kind === 'featured' && row.reason === 'overlay_not_attached_to_final_canonical_production').length,
  violations: violations.length
};
console.log(JSON.stringify(summary));
if (violations.length) {
  console.error('DISH_OVERLAY_ATTACHMENT_VIOLATIONS=' + JSON.stringify(violations.slice(0, 30)));
  process.exitCode = 1;
}
