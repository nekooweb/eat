#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const INPUT = process.argv[2] || path.join(ROOT, '_audit', 'official_index_field_candidates.json');
const OUTPUT = process.argv[3] || path.join(ROOT, '_audit', 'official_fast_review_queue.json');
const FOOD_TYPES = new Set(['Restaurant','FoodEstablishment','CafeOrCoffeeShop','Bakery','BarOrPub','FastFoodRestaurant','Store','LocalBusiness']);
const ITEM_TYPES = new Set(['Product','MenuItem']);

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function loadProduction() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read('data/production_area1.js'), sandbox, { filename:'production_area1.js' });
  return sandbox.window.PRODUCTION_RESTAURANTS || [];
}

function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆!！?？.,，。:：/\\]+/g, '');
}

function nameMatch(a, b) {
  const x = normalize(a), y = normalize(b);
  return Boolean(x && y && (x.includes(y) || y.includes(x)));
}

function host(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}

function plausibleAreaAddress(value) {
  const s = String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 140) return null;
  if (!(s.includes('千代田区') || s.includes('文京区'))) return null;
  if (!/\d/.test(s) || /[。！？]/u.test(s)) return null;
  if (/(?:おすすめ|受賞|雰囲気|お客様|印象|こだわり|訪れる)/u.test(s)) return null;
  return s;
}

function safeStructured(row) {
  return (row.main?.structuredFacts || []).filter((fact) =>
    (fact.types || []).some((type) => FOOD_TYPES.has(type)) && nameMatch(row.name, fact.name));
}

function structuredSignals(row) {
  const facts = safeStructured(row);
  return {
    address: facts.map((fact) => plausibleAreaAddress(fact.address)).find(Boolean) || null,
    hours: facts.find((fact) => plausibleAreaAddress(fact.address) && Array.isArray(fact.openingHours) && fact.openingHours.length)?.openingHours || [],
    cuisine: facts.map((fact) => fact.cuisine).find(Boolean) || null
  };
}

function collectMenuItems(row) {
  const pages = [row.main, ...(row.menus || [])].filter(Boolean);
  const names = [];
  for (const page of pages) {
    for (const fact of page.structuredFacts || []) {
      if (!(fact.types || []).some((type) => ITEM_TYPES.has(type))) continue;
      const name = String(fact.name || '').replace(/\s+/g, ' ').trim();
      if (!name || name.length < 2 || name.length > 80) continue;
      if (nameMatch(row.name, name)) continue;
      if (!names.includes(name)) names.push(name);
      if (names.length >= 12) return names;
    }
  }
  return names;
}

function combinedPriceSnippets(row) {
  const out = [];
  for (const page of [row.main, ...(row.menus || [])].filter(Boolean)) {
    for (const snippet of page.priceSnippets || []) {
      if (!out.includes(snippet)) out.push(snippet);
      if (out.length >= 12) return out;
    }
  }
  return out;
}

function currentGaps(row) {
  const gaps = [];
  if (!row.address) gaps.push('address');
  if (!row.openingHours) gaps.push('openingHours');
  if (!row.cuisine || row.cuisine === '餐厅') gaps.push('cuisine');
  if (!Array.isArray(row.lunch) && !Array.isArray(row.dinner)) gaps.push('budget');
  if (!Array.isArray(row.featuredDishes) || !row.featuredDishes.length) gaps.push('featuredDishes');
  return gaps;
}

const payload = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const production = loadProduction();
const productionById = new Map(production.map((row) => [row.googlePlaceId, row]));
const queue = [];
let noSignal = 0;
let fetchOrIdentityFailure = 0;
let autoSatisfiedFields = 0;

for (const row of payload.results || []) {
  const current = productionById.get(row.googlePlaceId);
  if (!current) continue;
  const gaps = currentGaps(current);
  if (!gaps.length) continue;

  if (!row.main?.ok || !row.nameMatched) {
    fetchOrIdentityFailure += 1;
    continue;
  }

  const structured = structuredSignals(row);
  const visibleAddress = plausibleAreaAddress(row.main?.visibleAddress);
  const visibleHours = row.main?.visibleHours || null;
  const visibleCuisine = row.main?.visibleCuisine || null;
  const menuItems = collectMenuItems(row);
  const recommendationSnippets = (row.recommendationSnippets || []).slice(0, 12);
  const priceSnippets = combinedPriceSnippets(row);

  const confidence = {};
  if (gaps.includes('address')) confidence.address = structured.address ? 'A-auto' : visibleAddress ? 'B-review' : 'C-none';
  if (gaps.includes('openingHours')) confidence.openingHours = structured.hours.length ? 'A-auto' : visibleHours ? 'B-review' : 'C-none';
  if (gaps.includes('cuisine')) confidence.cuisine = structured.cuisine ? 'A-auto' : visibleCuisine ? 'B-review' : 'C-none';
  if (gaps.includes('budget')) confidence.budget = priceSnippets.length ? 'B-review' : 'C-none';
  if (gaps.includes('featuredDishes')) confidence.featuredDishes = (menuItems.length || recommendationSnippets.length) ? 'B-review' : 'C-none';

  autoSatisfiedFields += Object.values(confidence).filter((value) => value === 'A-auto').length;
  const reviewFields = Object.entries(confidence).filter(([, value]) => value === 'B-review').map(([field]) => field);
  if (!reviewFields.length) {
    noSignal += 1;
    continue;
  }

  queue.push({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    distanceMeters: row.distanceMeters,
    pageUrl: row.pageUrl,
    host: host(row.pageUrl || row.main?.finalUrl),
    gaps,
    reviewFields,
    confidence,
    signals: {
      visibleAddress,
      visibleHours,
      visibleCuisine,
      menuItems,
      recommendationSnippets,
      priceSnippets,
      menuUrls: (row.menuUrls || []).slice(0, 5)
    }
  });
}

queue.sort((a, b) =>
  b.reviewFields.length - a.reviewFields.length
  || b.signals.menuItems.length - a.signals.menuItems.length
  || b.signals.recommendationSnippets.length - a.signals.recommendationSnippets.length
  || a.distanceMeters - b.distanceMeters
  || a.name.localeCompare(b.name, 'ja'));

const hostGroups = {};
for (const row of queue) {
  hostGroups[row.host] ||= { restaurants:0, address:0, openingHours:0, cuisine:0, budget:0, featuredDishes:0 };
  hostGroups[row.host].restaurants += 1;
  for (const field of row.reviewFields) hostGroups[row.host][field] += 1;
}

const summary = {
  sourceRows: (payload.results || []).length,
  reviewRows: queue.length,
  autoSatisfiedFields,
  fetchOrIdentityFailure,
  noReviewSignal: noSignal,
  reviewFieldCounts: queue.reduce((acc, row) => {
    for (const field of row.reviewFields) acc[field] = (acc[field] || 0) + 1;
    return acc;
  }, {}),
  topHosts: Object.entries(hostGroups)
    .sort((a, b) => b[1].restaurants - a[1].restaurants || a[0].localeCompare(b[0]))
    .slice(0, 30)
    .map(([hostName, stats]) => ({ host:hostName, ...stats }))
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive:true });
fs.writeFileSync(OUTPUT, JSON.stringify({ summary, rows:queue }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(summary));
