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

function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function directOfficialEligible(value) {
  const url = safeUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (/openstreetmap\.org$/.test(host)) return false;
  if (/hotpepper\.jp$/.test(host)) return false;
  if (/tabelog\.com$/.test(host)) return false;
  if (/(^|\.)google\./.test(host) || /googleusercontent\.com$/.test(host)) return false;
  if (/facebook\.com$|instagram\.com$|x\.com$|twitter\.com$|youtube\.com$|tiktok\.com$/.test(host)) return false;
  return true;
}

function thirdPartyDishSource(value, provider = '') {
  const url = safeUrl(value);
  const host = url?.hostname?.toLowerCase().replace(/^www\./, '') || '';
  const source = String(provider || '').toLowerCase();
  return /tabelog/.test(source) || /hot pepper/.test(source) || /tabelog\.com$/.test(host) || /hotpepper\.jp$/.test(host);
}

function sourceProfile(row, provenance) {
  const all = new Set();
  const directOfficial = new Set();
  const retainedThirdParty = new Set();

  for (const raw of row.sourceWebsites || []) {
    const url = safeUrl(raw);
    if (!url) continue;
    all.add(url.toString());
    if (directOfficialEligible(url.toString())) directOfficial.add(url.toString());
    else if (thirdPartyDishSource(url.toString())) retainedThirdParty.add(url.toString());
  }

  for (const link of provenance?.sourceLinks || []) {
    const url = safeUrl(link?.url);
    if (!url) continue;
    const href = url.toString();
    all.add(href);
    const provider = String(link?.provider || '');
    if (provider.toLowerCase() === 'official' && directOfficialEligible(href)) directOfficial.add(href);
    else if (thirdPartyDishSource(href, provider)) retainedThirdParty.add(href);
  }

  return {
    sourceUrlCount: all.size,
    crawlableOfficialUrlCount: directOfficial.size,
    retainedThirdPartyUrlCount: retainedThirdParty.size
  };
}

const runtime = loadWindowFile('google_inventory_runtime.js');
const rows = runtime.GOOGLE_INVENTORY_RESTAURANTS || [];
const stats = runtime.GOOGLE_INVENTORY_STATS || {};
if (stats.catalogTotal !== 2804) throw new Error(`Frozen catalog mismatch: ${stats.catalogTotal}`);
if (stats.inventoryTotal !== rows.length) throw new Error('Published runtime/stat count mismatch');
if (rows.length + Number(stats.unpublishedPlaceIdOnly || 0) !== 2804) throw new Error('Published/unpublished catalog counts do not reconcile');
if (new Set(rows.map((row) => row.googlePlaceId)).size !== rows.length) throw new Error('Duplicate public Place ID');
if (rows.some((row) => row.nameKnown === false || !String(row.name || '').trim())) throw new Error('Dish queue must contain named public rows only');

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
  const sources = sourceProfile(row, prov);

  // Product backlog is dish-only. Other metadata is informational and never produces
  // a nextAction. Google Place ID remains the frozen identity/navigation anchor.
  const dishGaps = [];
  if (!recommendedCount) dishGaps.push('recommendedDishes');
  if (!featuredCount) dishGaps.push('featuredDishes');
  const secondaryMetadata = {
    openingHoursKnown: Boolean(row.hoursReference),
    lunchBudgetKnown: knownPrice(row.lunch),
    dinnerBudgetKnown: knownPrice(row.dinner),
    addressKnown: Boolean(row.address),
    cuisineKnown: Boolean(row.cuisine)
  };

  let nextAction;
  let priorityScore;
  if (!recommendedCount) {
    // Highest product value: fill a strict recommendation when explicit semantics exist.
    // If the source only proves menu presence, the collector may add F but never invent R.
    if (sources.crawlableOfficialUrlCount > 0) {
      nextAction = 'collect_strict_recommended_dishes';
      priorityScore = 1080 + Math.min(sources.crawlableOfficialUrlCount, 10) * 20 + (featuredCount ? 15 : 40);
    } else if (sources.retainedThirdPartyUrlCount > 0) {
      nextAction = 'extract_retained_dish_source';
      priorityScore = 1040 + Math.min(sources.retainedThirdPartyUrlCount, 10) * 15 + (featuredCount ? 15 : 40);
    } else {
      nextAction = 'find_independent_dish_source';
      priorityScore = 1000 + (featuredCount ? 15 : 40);
    }
    if (row.basicInfoState === 'canonical') priorityScore += 10;
  } else if (!featuredCount) {
    nextAction = 'collect_source_backed_featured_dishes';
    priorityScore = 700 + Math.min(sources.sourceUrlCount, 10) * 10;
  } else {
    nextAction = 'dish_complete';
    priorityScore = 0;
  }

  return {
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    basicInfoState: row.basicInfoState,
    cuisine: row.cuisine || null,
    distanceMeters: Number.isFinite(row.distanceMeters) ? row.distanceMeters : null,
    ...sources,
    recommendedDishesKnown: recommendedCount,
    featuredDishesKnown: featuredCount,
    dishGaps,
    secondaryMetadata,
    nextAction,
    priorityScore
  };
}).sort((a, b) => b.priorityScore - a.priorityScore || (a.distanceMeters ?? 9999) - (b.distanceMeters ?? 9999) || a.googlePlaceId.localeCompare(b.googlePlaceId));

const actionCounts = {};
for (const row of queue) actionCounts[row.nextAction] = (actionCounts[row.nextAction] || 0) + 1;
const recommendationGapRows = queue.filter((row) => row.recommendedDishesKnown === 0);
const noDishRows = queue.filter((row) => row.recommendedDishesKnown === 0 && row.featuredDishesKnown === 0);
const displayDishRows = queue.filter((row) => row.recommendedDishesKnown > 0 || row.featuredDishesKnown > 0);
const summary = {
  schemaVersion: 6,
  scope: stats.scope || 'TOKYO/地区1️⃣',
  radiusMeters: 1200,
  catalogTotal: 2804,
  publicRuntimeTotal: rows.length,
  unpublishedPlaceIdOnly: Number(stats.unpublishedPlaceIdOnly || 0),
  runtimeBaselineComplete,
  recommendedDishesKnown: rows.filter((row) => Array.isArray(row.recommendedDishes) && row.recommendedDishes.length).length,
  featuredDishesKnown: rows.filter((row) => Array.isArray(row.featuredDishes) && row.featuredDishes.length).length,
  displayDishKnown: displayDishRows.length,
  noDishGap: noDishRows.length,
  recommendationGap: recommendationGapRows.length,
  recommendationGapWithAnyKnownSourceUrl: recommendationGapRows.filter((row) => row.sourceUrlCount > 0).length,
  recommendationGapWithCrawlableOfficialUrl: recommendationGapRows.filter((row) => row.crawlableOfficialUrlCount > 0).length,
  recommendationGapWithRetainedThirdPartyOnly: recommendationGapRows.filter((row) => row.crawlableOfficialUrlCount === 0 && row.retainedThirdPartyUrlCount > 0).length,
  recommendationGapNeedingNewDishSource: recommendationGapRows.filter((row) => row.crawlableOfficialUrlCount === 0 && row.retainedThirdPartyUrlCount === 0).length,
  actionCounts,
  primaryGoal: 'source-backed dish coverage',
  nonDishMetadataCreatesTasks: false,
  priorityRule: 'strict recommendation > retained dish source > new independent dish source > source-backed featured menu; hours/budget/address/cuisine are informational only'
};

fs.writeFileSync(OUTPUT, JSON.stringify({ summary, rows: queue }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary));
