import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const inventoryPath = path.join(DATA, 'area1_google_ids.json');
const productionPath = path.join(DATA, 'production_area1.js');
const basicPath = path.join(DATA, 'google_basic_source_matches.json');
const detailEvidencePath = path.join(DATA, 'google_inventory_detail_evidence.json');
const hotPepperFactsPath = path.join(DATA, 'hotpepper_catalog_facts.json');
const outputPath = path.join(DATA, 'google_inventory_runtime.js');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readProduction() {
  const text = fs.readFileSync(productionPath, 'utf8');
  const prefix = 'window.PRODUCTION_RESTAURANTS=';
  const start = text.indexOf(prefix);
  const end = text.indexOf(';\nwindow.PRODUCTION_STATS=', start);
  if (start < 0 || end < 0) throw new Error('Cannot parse production_area1.js');
  return JSON.parse(text.slice(start + prefix.length, end));
}

function finite(value) {
  return Number.isFinite(value);
}

function parseBudgetRange(value) {
  const text = String(value || '').replaceAll(',', '').replace(/円/g, '').trim();
  if (!text) return null;
  let match = text.match(/(\d+)\s*[～〜~\-]\s*(\d+)/);
  if (match) {
    const low = Number(match[1]);
    const high = Number(match[2]);
    return Number.isFinite(low) && Number.isFinite(high) && high >= low ? [low, high] : null;
  }
  match = text.match(/(\d+)\s*以下/);
  if (match) return [0, Number(match[1])];
  match = text.match(/(\d+)\s*以上/);
  if (match) return [Number(match[1]), Number(match[1]) + 2000];
  return null;
}

function baseEmpty(pid) {
  return {
    id: `g-${pid}`,
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: 'Google Maps 餐厅',
    nameKnown: false,
    cuisine: '',
    tags: [],
    address: '',
    lat: null,
    lng: null,
    distanceMeters: null,
    lunch: null,
    dinner: null,
    recommendedDishes: [],
    featuredDishes: [],
    dishes: [],
    googlePlaceId: pid,
    googleStatus: 'inventory',
    inventoryWithinRadius: true,
    basicInfoState: 'google_place_id_only',
    hyakumeiten: false,
    hyakumeitenYear: null,
    hyakumeitenCategory: null,
    randomWeight: 1,
    sources: ['Google Place ID']
  };
}

function recommendationName(item) {
  if (typeof item === 'string') return item.trim();
  if (!item || typeof item !== 'object') return '';
  return String(item.nameZh || item.nameJa || '').trim();
}

function dedupeRecommendationNames(items) {
  const seen = new Set();
  const output = [];
  for (const item of items || []) {
    const value = recommendationName(item);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
    if (output.length >= 3) break;
  }
  return output;
}

function featuredKey(item) {
  if (typeof item === 'string') return item.trim();
  if (!item || typeof item !== 'object') return '';
  return String(item.nameZh || item.nameJa || '').trim();
}

function dedupeFeatured(items) {
  const seen = new Set();
  const output = [];
  for (const item of items || []) {
    const key = featuredKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= 3) break;
  }
  return output;
}

const inventory = readJson(inventoryPath);
const ids = inventory.googlePlaceIds || [];
if (inventory.radiusMeters !== 1200 || inventory.count !== 2804 || ids.length !== 2804) {
  throw new Error('Frozen Google inventory is not the expected exact 2,804 / 1.2km inventory');
}
if (new Set(ids).size !== 2804 || inventory.complete !== true || inventory.coverageVerified !== true) {
  throw new Error('Frozen Google inventory completeness/uniqueness check failed');
}

const idSet = new Set(ids);
const canonical = readProduction();
const canonicalById = new Map(
  canonical
    .filter((row) => idSet.has(row.googlePlaceId))
    .map((row) => [row.googlePlaceId, row])
);

const basicDoc = fs.existsSync(basicPath)
  ? readJson(basicPath)
  : { inventoryCount: 2804, rows: [] };
if (basicDoc.inventoryCount !== 2804) throw new Error('Basic recovery file has wrong inventory count');
const basicById = new Map((basicDoc.rows || []).map((row) => [row.googlePlaceId, row]));

const detailEvidence = fs.existsSync(detailEvidencePath)
  ? readJson(detailEvidencePath)
  : { rows: [], summary: {} };
const detailById = new Map((detailEvidence.rows || []).filter((row) => row.googlePlaceId).map((row) => [row.googlePlaceId, row]));

const hotPepperDoc = fs.existsSync(hotPepperFactsPath)
  ? readJson(hotPepperFactsPath)
  : { rows: [] };
const hotPepperById = new Map((hotPepperDoc.rows || []).filter((row) => row.googlePlaceId).map((row) => [row.googlePlaceId, row]));

const rows = ids.map((pid) => {
  const rich = canonicalById.get(pid);
  let row;
  if (rich) {
    row = {
      ...rich,
      nameKnown: true,
      inventoryWithinRadius: true,
      basicInfoState: 'canonical',
      googleStatus: 'verified'
    };
  } else {
    const basic = basicById.get(pid);
    if (basic) {
      row = {
        id: `g-${pid}`,
        profile: 'TOKYO',
        area: '地区1️⃣',
        name: basic.name || 'Google Maps 餐厅',
        nameKnown: Boolean(basic.name),
        cuisine: basic.cuisine || '',
        tags: basic.cuisine ? [basic.cuisine] : [],
        address: basic.address || '',
        lat: finite(basic.lat) ? basic.lat : null,
        lng: finite(basic.lng) ? basic.lng : null,
        distanceMeters: finite(basic.distanceMeters) ? basic.distanceMeters : null,
        lunch: null,
        dinner: null,
        recommendedDishes: [],
        featuredDishes: [],
        dishes: [],
        googlePlaceId: pid,
        googleStatus: 'inventory',
        inventoryWithinRadius: true,
        basicInfoState: 'source_matched',
        sourceProvider: basic.provider || '',
        sourceProviderId: basic.providerId || null,
        sourceCheckedAt: basic.sourceCheckedAt || null,
        sourceWebsites: Array.isArray(basic.websites) ? basic.websites : [],
        hyakumeiten: false,
        hyakumeitenYear: null,
        hyakumeitenCategory: null,
        randomWeight: 1,
        sources: basic.provider ? [basic.provider] : []
      };

      const hp = hotPepperById.get(pid);
      if (hp && basic.provider === 'Hot Pepper') {
        const facts = hp.facts || {};
        const dinner = parseBudgetRange(facts.budget?.name || facts.budget?.average || facts.budgetMemo);
        if (dinner) row.dinner = dinner;
        if (String(facts.open || '').trim()) row.hoursReference = String(facts.open).trim();
        if (String(facts.close || '').trim()) row.closedNote = String(facts.close).trim();
        if (!row.address && facts.address) row.address = String(facts.address).trim();
        row.hotPepperBasicDetail = true;
      }
    } else {
      row = baseEmpty(pid);
    }
  }

  const evidence = detailById.get(pid);
  if (evidence) {
    row.recommendedDishes = dedupeRecommendationNames([
      ...(Array.isArray(row.recommendedDishes) ? row.recommendedDishes : []),
      ...(Array.isArray(evidence.recommendedDishes) ? evidence.recommendedDishes : [])
    ]);
    row.featuredDishes = dedupeFeatured([
      ...(Array.isArray(row.featuredDishes) ? row.featuredDishes : []),
      ...(Array.isArray(evidence.featuredDishes) ? evidence.featuredDishes : [])
    ]);
    row.detailEvidenceCheckedAt = detailEvidence.checkedAt || null;
  }
  return row;
});

const counts = rows.reduce((acc, row) => {
  acc[row.basicInfoState] = (acc[row.basicInfoState] || 0) + 1;
  return acc;
}, {});
const runtimeStats = {
  scope: inventory.scope,
  radiusMeters: 1200,
  inventoryTotal: rows.length,
  uniquePlaceIds: new Set(rows.map((row) => row.googlePlaceId)).size,
  canonicalRich: counts.canonical || 0,
  sourceBasic: counts.source_matched || 0,
  namedBasic: rows.filter((row) => row.nameKnown).length,
  placeIdOnly: counts.google_place_id_only || 0,
  withCoordinates: rows.filter((row) => finite(row.lat) && finite(row.lng)).length,
  withDistance: rows.filter((row) => finite(row.distanceMeters)).length,
  recommendedDishesKnown: rows.filter((row) => Array.isArray(row.recommendedDishes) && row.recommendedDishes.length).length,
  featuredDishesKnown: rows.filter((row) => Array.isArray(row.featuredDishes) && row.featuredDishes.length).length,
  cuisineKnown: rows.filter((row) => row.cuisine).length,
  dinnerBudgetKnown: rows.filter((row) => Array.isArray(row.dinner) && row.dinner.length >= 2).length,
  hoursKnown: rows.filter((row) => row.openingHours?.days || row.hoursReference).length,
  hotPepperBasicDetailRows: rows.filter((row) => row.hotPepperBasicDetail).length,
  sourceBasicProviders: basicDoc.summary?.providers || {},
  detailEvidenceRestaurants: detailById.size,
  detailEvidenceSummary: detailEvidence.summary || {}
};

if (runtimeStats.inventoryTotal !== 2804 || runtimeStats.uniquePlaceIds !== 2804) {
  throw new Error('Runtime does not contain exactly the frozen 2,804 Place IDs');
}
if (rows.some((row) => finite(row.distanceMeters) && (row.distanceMeters < 0 || row.distanceMeters > 1200))) {
  throw new Error('Runtime contains an out-of-radius durable distance');
}

fs.writeFileSync(
  outputPath,
  `// Generated from the frozen Google Place ID inventory plus durable independent-source basics and detail evidence.\n` +
  `window.GOOGLE_INVENTORY_RESTAURANTS=${JSON.stringify(rows)};\n` +
  `window.GOOGLE_INVENTORY_STATS=${JSON.stringify(runtimeStats)};\n`,
  'utf8'
);
console.log(JSON.stringify(runtimeStats));
