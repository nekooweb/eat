#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(ROOT, '_audit', 'public_dish_queue.json');

function loadJs(name, initialWindow = {}) {
  const sandbox = { window: initialWindow, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, name), 'utf8'), sandbox, { filename: name });
  return sandbox.window;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const canonicalWindow = loadJs('production_area1.js', {});
const publicWindow = loadJs('public_pool_area1.js', {});
const canonical = canonicalWindow.PRODUCTION_RESTAURANTS || [];
const publicRows = publicWindow.PUBLIC_OPEN_RESTAURANTS || [];

function hasSourceBackedDish(row) {
  return (Array.isArray(row.featuredDishes) && row.featuredDishes.length > 0)
    || (Array.isArray(row.recommendedDishes) && row.recommendedDishes.length > 0);
}

function actionFor(row) {
  const sources = new Set(row.sources || []);
  if (row.dataTier === 'inventory_source_bound' || sources.has('Hot Pepper')) {
    return 'extract_hotpepper_menu_or_signature_dish';
  }
  if (text(row.sourceUrl)) return 'extract_official_or_provider_menu';
  if (sources.has('Overture Maps')) return 'discover_official_menu_from_overture_identity';
  if (sources.has('OpenStreetMap')) return 'discover_official_or_tabelog_menu_from_osm_identity';
  return 'discover_menu_source';
}

function priorityFor(row) {
  let score = 0;
  if (row.dataTier === 'inventory_source_bound') score += 100;
  if (text(row.sourceUrl)) score += 50;
  if (row.googlePlaceId) score += 25;
  if (row.cuisine && row.cuisine !== '餐厅') score += 10;
  if (Number.isFinite(row.distanceMeters)) score += Math.max(0, 12 - Math.floor(row.distanceMeters / 100));
  return score;
}

const canonicalComplete = canonical.filter(hasSourceBackedDish).length;
const publicComplete = publicRows.filter(hasSourceBackedDish).length;

const canonicalMissing = canonical
  .filter((row) => !hasSourceBackedDish(row))
  .map((row) => ({
    tier: 'canonical',
    identityKey: row.googlePlaceId,
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    cuisine: row.cuisine,
    distanceMeters: row.distanceMeters,
    currentReference: null,
    sources: row.sources || [],
    sourceUrl: null,
    nextAction: 'extract_menu_or_signature_items_from_existing_sources',
    priorityScore: 200 + Math.max(0, 12 - Math.floor((row.distanceMeters || 1200) / 100))
  }));

const publicMissing = publicRows
  .filter((row) => !hasSourceBackedDish(row))
  .map((row) => ({
    tier: row.dataTier || 'open_catalog',
    identityKey: row.identityKey,
    googlePlaceId: row.googlePlaceId || null,
    openPlaceId: row.openPlaceId || null,
    name: row.name,
    cuisine: row.cuisine,
    distanceMeters: row.distanceMeters,
    currentReference: Array.isArray(row.dishHints) ? row.dishHints.slice(0, 2) : [],
    sources: row.sources || [],
    sourceUrl: text(row.sourceUrl) || null,
    nextAction: actionFor(row),
    priorityScore: priorityFor(row)
  }));

const queue = [...canonicalMissing, ...publicMissing]
  .sort((a, b) => b.priorityScore - a.priorityScore
    || (a.distanceMeters || 9999) - (b.distanceMeters || 9999)
    || String(a.name || '').localeCompare(String(b.name || ''), 'ja'));

const actionCounts = {};
const tierCounts = {};
for (const row of queue) {
  actionCounts[row.nextAction] = (actionCounts[row.nextAction] || 0) + 1;
  tierCounts[row.tier] = (tierCounts[row.tier] || 0) + 1;
}

const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString().slice(0, 10),
  policy: {
    sourceBackedFeaturedDishRequiredForCompletion: true,
    referenceHintsDoNotCountAsVerifiedFeaturedDishes: true,
    paidGoogleDataApiCalls: 0
  },
  summary: {
    canonicalTotal: canonical.length,
    canonicalSourceBackedDishComplete: canonicalComplete,
    canonicalDishQueue: canonicalMissing.length,
    publicTotal: publicRows.length,
    publicReferenceDishCoverage: publicRows.filter((row) => Array.isArray(row.dishHints) && row.dishHints.length).length,
    publicSourceBackedDishComplete: publicComplete,
    publicDishQueue: publicMissing.length,
    sourceBackedDishCompleteTotal: canonicalComplete + publicComplete,
    totalQueue: queue.length,
    tierCounts,
    actionCounts
  },
  queue
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(payload.summary));
