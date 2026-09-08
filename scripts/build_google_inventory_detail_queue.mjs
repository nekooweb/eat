#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(DATA, 'google_inventory_detail_queue.json');

function loadWindowFile(filename) {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
  return sandbox.window;
}

function loadEvidence() {
  const file = path.join(DATA, 'google_inventory_detail_evidence.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { rows: [] };
}

function knownPrice(value) {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

function sourceUrlCount(row, provenance) {
  const urls = new Set();
  for (const url of row.sourceWebsites || []) if (/^https?:\/\//.test(String(url || ''))) urls.add(url);
  for (const link of provenance?.sourceLinks || []) if (/^https?:\/\//.test(String(link?.url || ''))) urls.add(link.url);
  return urls.size;
}

const runtime = loadWindowFile('google_inventory_runtime.js');
const rows = runtime.GOOGLE_INVENTORY_RESTAURANTS || [];
const stats = runtime.GOOGLE_INVENTORY_STATS || {};
if (stats.catalogTotal !== 2804) throw new Error(`Frozen catalog mismatch: ${stats.catalogTotal}`);
if (stats.inventoryTotal !== rows.length) throw new Error('Published runtime/stat count mismatch');
if (rows.length + Number(stats.unpublishedPlaceIdOnly || 0) !== 2804) throw new Error('Published/unpublished catalog counts do not reconcile');
if (new Set(rows.map((row) => row.googlePlaceId)).size !== rows.length) throw new Error('Duplicate public Place ID');
if (rows.some((row) => row.nameKnown === false || !String(row.name || '').trim())) throw new Error('Detailed enrichment queue must contain named public rows only');

const provenance = fs.existsSync(path.join(DATA, 'source_provenance.js'))
  ? loadWindowFile('source_provenance.js').SOURCE_PROVENANCE || { rows: [] }
  : { rows: [] };
const provenanceById = new Map((provenance.rows || []).map((row) => [row.googlePlaceId, row]));
const evidence = loadEvidence();
const evidenceById = new Map((evidence.rows || []).map((row) => [row.googlePlaceId, row]));
const runtimeBaselineComplete = stats.catalogTotal === 2804
  && stats.inventoryTotal === rows.length
  && rows.length + Number(stats.unpublishedPlaceIdOnly || 0) === 2804;

const queue = rows.map((row) => {
  const prov = provenanceById.get(row.googlePlaceId) || null;
  const ev = evidenceById.get(row.googlePlaceId) || null;
  const recommendedCount = Math.max(
    Array.isArray(row.recommendedDishes) ? row.recommendedDishes.length : 0,
    Array.isArray(ev?.recommendedDishes) ? ev.recommendedDishes.length : 0
  );
  const featuredCount = Math.max(
    Array.isArray(row.featuredDishes) ? row.featuredDishes.length : 0,
    Array.isArray(ev?.featuredDishes) ? ev.featuredDishes.length : 0
  );
  const sourceUrls = sourceUrlCount(row, prov);
  const gaps = [];
  if (!recommendedCount) gaps.push('recommendedDishes');
  if (!featuredCount) gaps.push('featuredDishes');
  if (!row.hoursReference) gaps.push('openingHours');
  if (!knownPrice(row.lunch)) gaps.push('lunchBudget');
  if (!knownPrice(row.dinner)) gaps.push('dinnerBudget');
  if (!row.address) gaps.push('address');
  if (!row.cuisine) gaps.push('cuisine');

  let nextAction;
  let priorityScore;
  if (!recommendedCount) {
    nextAction = sourceUrls > 0 ? 'collect_strict_recommended_dishes' : 'find_independent_dish_source';
    priorityScore = 1000 + Math.min(sourceUrls, 10) * 20 + (featuredCount ? 15 : 0) + (row.basicInfoState === 'canonical' ? 10 : 0);
  } else if (!featuredCount) {
    nextAction = 'collect_source_backed_featured_dishes';
    priorityScore = 700 + Math.min(sourceUrls, 10) * 10;
  } else if (gaps.includes('openingHours')) {
    nextAction = 'collect_opening_hours';
    priorityScore = 400 + Math.min(sourceUrls, 10) * 5;
  } else if (gaps.includes('dinnerBudget')) {
    nextAction = 'collect_dinner_budget';
    priorityScore = 300 + Math.min(sourceUrls, 10) * 4;
  } else if (gaps.includes('lunchBudget')) {
    nextAction = 'collect_lunch_budget';
    priorityScore = 280 + Math.min(sourceUrls, 10) * 4;
  } else if (gaps.includes('address') || gaps.includes('cuisine')) {
    nextAction = 'collect_identity_detail_fields';
    priorityScore = 200 + Math.min(sourceUrls, 10) * 3;
  } else {
    nextAction = 'complete';
    priorityScore = 0;
  }

  return {
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    basicInfoState: row.basicInfoState,
    cuisine: row.cuisine || null,
    distanceMeters: Number.isFinite(row.distanceMeters) ? row.distanceMeters : null,
    sourceUrlCount: sourceUrls,
    recommendedDishesKnown: recommendedCount,
    featuredDishesKnown: featuredCount,
    gaps,
    nextAction,
    priorityScore
  };
}).sort((a, b) => b.priorityScore - a.priorityScore || (a.distanceMeters ?? 9999) - (b.distanceMeters ?? 9999) || a.googlePlaceId.localeCompare(b.googlePlaceId));

const actionCounts = {};
for (const row of queue) actionCounts[row.nextAction] = (actionCounts[row.nextAction] || 0) + 1;
const summary = {
  schemaVersion: 4,
  scope: stats.scope || 'TOKYO/地区1️⃣',
  radiusMeters: 1200,
  catalogTotal: 2804,
  publicRuntimeTotal: rows.length,
  unpublishedPlaceIdOnly: Number(stats.unpublishedPlaceIdOnly || 0),
  runtimeBaselineComplete,
  recommendedDishesKnown: rows.filter((row) => Array.isArray(row.recommendedDishes) && row.recommendedDishes.length).length,
  featuredDishesKnown: rows.filter((row) => Array.isArray(row.featuredDishes) && row.featuredDishes.length).length,
  recommendationGap: queue.filter((row) => row.recommendedDishesKnown === 0).length,
  recommendationGapWithKnownSourceUrl: queue.filter((row) => row.recommendedDishesKnown === 0 && row.sourceUrlCount > 0).length,
  actionCounts,
  priorityRule: 'within named public rows: source-backed recommended dishes > featured dishes > hours > budgets > address/cuisine; identity recovery remains in the separate master planner'
};

fs.writeFileSync(OUTPUT, JSON.stringify({ summary, rows: queue }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary));
