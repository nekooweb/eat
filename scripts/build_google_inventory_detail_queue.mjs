#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(DATA, 'google_inventory_detail_queue.json');

function loadRuntime() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, 'google_inventory_runtime.js'), 'utf8'), sandbox, { filename: 'google_inventory_runtime.js' });
  return {
    rows: sandbox.window.GOOGLE_INVENTORY_RESTAURANTS || [],
    stats: sandbox.window.GOOGLE_INVENTORY_STATS || {}
  };
}

function loadProvenance() {
  if (!fs.existsSync(path.join(DATA, 'source_provenance.js'))) return { rows: [] };
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, 'source_provenance.js'), 'utf8'), sandbox, { filename: 'source_provenance.js' });
  return sandbox.window.SOURCE_PROVENANCE || { rows: [] };
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

const { rows, stats } = loadRuntime();
if (rows.length !== 2804 || new Set(rows.map((row) => row.googlePlaceId)).size !== 2804) {
  throw new Error('Expected exact 2,804 Google inventory runtime before building detail queue');
}
const provenance = loadProvenance();
const provenanceById = new Map((provenance.rows || []).map((row) => [row.googlePlaceId, row]));
const evidence = loadEvidence();
const evidenceById = new Map((evidence.rows || []).map((row) => [row.googlePlaceId, row]));

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
  const nameKnown = row.nameKnown !== false && row.basicInfoState !== 'google_place_id_only' && Boolean(row.name);
  const gaps = [];
  if (!nameKnown) gaps.push('basicIdentity');
  if (!recommendedCount) gaps.push('recommendedDishes');
  if (!featuredCount) gaps.push('featuredDishes');
  if (!row.openingHours?.days && !row.hoursReference) gaps.push('openingHours');
  if (!knownPrice(row.lunch)) gaps.push('lunchBudget');
  if (!knownPrice(row.dinner)) gaps.push('dinnerBudget');
  if (!row.address) gaps.push('address');
  if (!row.cuisine) gaps.push('cuisine');

  let nextAction;
  let priorityScore;
  if (nameKnown && !recommendedCount) {
    nextAction = 'collect_strict_recommended_dishes';
    priorityScore = 1000 + Math.min(sourceUrls, 10) * 15 + (row.basicInfoState === 'canonical' ? 20 : 0);
  } else if (!nameKnown) {
    nextAction = 'resolve_basic_source_identity';
    priorityScore = 900;
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
    name: nameKnown ? row.name : null,
    basicInfoState: row.basicInfoState,
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
  schemaVersion: 1,
  scope: stats.scope || 'TOKYO/地区1️⃣',
  radiusMeters: 1200,
  inventoryTotal: rows.length,
  namedBasic: rows.filter((row) => row.nameKnown !== false && row.basicInfoState !== 'google_place_id_only').length,
  placeIdOnly: rows.filter((row) => row.basicInfoState === 'google_place_id_only').length,
  recommendedDishesKnown: rows.filter((row) => Array.isArray(row.recommendedDishes) && row.recommendedDishes.length).length,
  featuredDishesKnown: rows.filter((row) => Array.isArray(row.featuredDishes) && row.featuredDishes.length).length,
  actionCounts,
  priorityRule: 'named missing strict recommendations > unresolved basic identity > featured dishes > hours > budgets > address/cuisine'
};

fs.writeFileSync(OUTPUT, JSON.stringify({ summary, rows: queue }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary));
