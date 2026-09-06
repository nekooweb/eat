#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');

function loadJs(name) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, name), 'utf8'), sandbox, { filename: name });
  return sandbox.window;
}

function fail(message) {
  console.error(`PUBLIC FEATURED DISH AUDIT FAIL: ${message}`);
  process.exitCode = 1;
}

const productionWindow = loadJs('production_area1.js');
const publicWindow = loadJs('public_pool_area1.js');
const canonical = productionWindow.PRODUCTION_RESTAURANTS || [];
const rows = publicWindow.PUBLIC_OPEN_RESTAURANTS || [];
const stats = publicWindow.PUBLIC_POOL_STATS || {};

if (!Array.isArray(rows)) fail('PUBLIC_OPEN_RESTAURANTS is not an array');
if (canonical.length + rows.length < 2000) fail('combined public pool fell below 2000 restaurants');
if (stats.publicRows !== rows.length) fail(`publicRows statistic mismatch: ${stats.publicRows} != ${rows.length}`);

const keys = new Set();
let sourceBackedRestaurants = 0;
let sourceBackedItems = 0;
let hotPepperRestaurants = 0;
let websiteRestaurants = 0;
let referenceRows = 0;

function validateBaseDish(dish, row) {
  if (!dish || typeof dish !== 'object') {
    fail(`non-object featured dish: ${row.identityKey}`);
    return false;
  }
  if (!String(dish.nameZh || '').trim() || !String(dish.nameJa || '').trim()) {
    fail(`featured dish lacks names: ${row.identityKey}`);
  }
  if (!/^https:\/\//.test(String(dish.sourceUrl || ''))) {
    fail(`featured dish lacks HTTPS source URL: ${row.identityKey}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dish.checkedAt || ''))) {
    fail(`featured dish lacks ISO checkedAt: ${row.identityKey}`);
  }
  if (!String(dish.evidenceText || '').trim()) {
    fail(`featured dish lacks bounded evidence text: ${row.identityKey}`);
  }
  if (String(dish.evidenceText || '').length > 240) {
    fail(`featured dish evidence text is unexpectedly long: ${row.identityKey}`);
  }
  return true;
}

for (const row of rows) {
  if (!row.identityKey) fail(`public row lacks identityKey: ${row.name || row.id}`);
  if (keys.has(row.identityKey)) fail(`duplicate public identityKey: ${row.identityKey}`);
  keys.add(row.identityKey);
  if (row.identityAdmission !== 'open_public_catalog') fail(`invalid public admission: ${row.identityKey}`);
  if (!row.name || !Number.isFinite(row.lat) || !Number.isFinite(row.lng)) fail(`invalid public display identity: ${row.identityKey}`);
  if (!Number.isFinite(row.distanceMeters) || row.distanceMeters < 0 || row.distanceMeters > 1200) {
    fail(`public row outside Area1 radius: ${row.identityKey}`);
  }
  if (!Array.isArray(row.dishHints) || !row.dishHints.length) fail(`public row lacks dish hint fallback: ${row.identityKey}`);

  const dishes = Array.isArray(row.featuredDishes) ? row.featuredDishes : [];
  if (row.featuredDishConfidence === 'reference_hint') {
    referenceRows += 1;
    if (dishes.length) fail(`reference-only row carries source-backed dishes: ${row.identityKey}`);
    continue;
  }

  if (!dishes.length) {
    fail(`source-backed confidence without featured dishes: ${row.identityKey}`);
    continue;
  }
  sourceBackedRestaurants += 1;
  sourceBackedItems += dishes.length;

  if (row.featuredDishConfidence === 'provider_signature_text') {
    hotPepperRestaurants += 1;
    for (const dish of dishes) {
      validateBaseDish(dish, row);
      if (dish.provider !== 'Hot Pepper') fail(`Hot Pepper dish provider mismatch: ${row.identityKey}`);
      if (dish.evidenceClass !== 'provider_signature_description') {
        fail(`Hot Pepper dish evidence class mismatch: ${row.identityKey}`);
      }
    }
    continue;
  }

  if (row.featuredDishConfidence === 'source_recommendation_text') {
    websiteRestaurants += 1;
    for (const dish of dishes) {
      validateBaseDish(dish, row);
      if (dish.provider !== 'sourceWebsite') fail(`website dish provider mismatch: ${row.identityKey}`);
      if (dish.evidenceClass !== 'source_recommendation_text') {
        fail(`website dish evidence class mismatch: ${row.identityKey}`);
      }
    }
    continue;
  }

  fail(`unsupported featuredDishConfidence: ${row.identityKey} -> ${row.featuredDishConfidence}`);
}

if (stats.publicWithSourceBackedFeaturedDishes !== sourceBackedRestaurants) {
  fail(`source-backed restaurant statistic mismatch: ${stats.publicWithSourceBackedFeaturedDishes} != ${sourceBackedRestaurants}`);
}
if (stats.publicFeaturedDishItems !== sourceBackedItems) {
  fail(`source-backed dish-item statistic mismatch: ${stats.publicFeaturedDishItems} != ${sourceBackedItems}`);
}

const summary = {
  status: process.exitCode ? 'fail' : 'pass',
  canonicalRows: canonical.length,
  publicRows: rows.length,
  totalOnline: canonical.length + rows.length,
  sourceBackedFeaturedDishRestaurants: sourceBackedRestaurants,
  sourceBackedFeaturedDishItems: sourceBackedItems,
  hotPepperRestaurants,
  websiteRestaurants,
  referenceRows
};
console.log(JSON.stringify(summary));
