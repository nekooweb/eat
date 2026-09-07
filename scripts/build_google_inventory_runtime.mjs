import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const inventoryPath = path.join(DATA, 'area1_google_ids.json');
const productionPath = path.join(DATA, 'production_area1.js');
const basicPath = path.join(DATA, 'google_basic_source_matches.json');
const detailEvidencePath = path.join(DATA, 'google_inventory_detail_evidence.json');
const hotPepperFactsPath = path.join(DATA, 'hotpepper_catalog_facts.json');
const webFieldEvidencePath = path.join(DATA, 'source_basic_web_field_evidence.json');
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
  // Legacy runtime arrays cannot represent an open upper bound safely.
  // Preserve the raw source for the SQLite importer instead of inventing N+2000.
  if (/(\d+)\s*以上/.test(text)) return null;
  return null;
}

function baseEmpty(pid) {
  return {
    id: `g-${pid}`,
    profile: 'TOKYO',
    area: '地区1️⃣',
    name: '',
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

function hoursReference(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map((x) => String(x || '').trim()).filter(Boolean).join(' / ');
  return '';
}

function mergeWebsite(row, value) {
  const url = String(value || '').trim();
  if (!url.startsWith('https://')) return;
  const current = Array.isArray(row.sourceWebsites) ? row.sourceWebsites : [];
  row.sourceWebsites = [...new Set([...current, url])];
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

const webFieldDoc = fs.existsSync(webFieldEvidencePath)
  ? readJson(webFieldEvidencePath)
  : { rows: [], summary: {} };
if ((webFieldDoc.policy?.paidDataApiCalls ?? 0) !== 0 || webFieldDoc.policy?.googleDisplayPayloadPersisted === true) {
  throw new Error('Public web field evidence violates zero-paid/no-Google-display policy');
}
const webFieldById = new Map((webFieldDoc.rows || []).filter((row) => row.googlePlaceId).map((row) => [row.googlePlaceId, row]));

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
        name: basic.name || '',
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
        if (String(facts.openingHoursText || '').trim()) row.hoursReference = String(facts.openingHoursText).trim();
        if (String(facts.closedText || '').trim()) row.closedNote = String(facts.closedText).trim();
        if (!row.address && facts.address) row.address = String(facts.address).trim();
        row.hotPepperBasicDetail = true;
      }
    } else {
      row = baseEmpty(pid);
    }
  }

  const webEvidence = webFieldById.get(pid);
  if (webEvidence && webEvidence.identityCheck?.accepted === true) {
    const claims = webEvidence.fieldClaims || {};
    if (!row.address && String(claims.address || '').trim()) row.address = String(claims.address).trim();
    const hours = hoursReference(claims.openingHoursRaw);
    if (!row.openingHours?.days && !row.hoursReference && hours) row.hoursReference = hours;
    if (!row.cuisine && String(claims.cuisineNormalized || '').trim()) {
      row.cuisine = String(claims.cuisineNormalized).trim();
      row.tags = [row.cuisine];
    }
    if ((!finite(row.lat) || !finite(row.lng)) && claims.geo && finite(claims.geo.lat) && finite(claims.geo.lng)) {
      row.lat = claims.geo.lat;
      row.lng = claims.geo.lng;
    }
    if (String(claims.priceRange || '').trim()) row.priceReference = String(claims.priceRange).trim();
    mergeWebsite(row, webEvidence.webEvidence?.finalUrl);
    row.publicWebFieldEvidence = true;
    row.publicWebFieldCheckedAt = webEvidence.checkedAt || webFieldDoc.checkedAt || null;
  }

  // v4 identity-recovery rows may carry official evidence directly before the generic
  // source-basic field collector has refreshed. Consume those facts missing-only too.
  const basicEvidence = basicById.get(pid)?.officialEvidence;
  if (basicEvidence && row.basicInfoState === 'source_matched') {
    if (!row.address && String(basicEvidence.address || '').trim()) row.address = String(basicEvidence.address).trim();
    const hours = hoursReference(basicEvidence.openingHoursRaw);
    if (!row.openingHours?.days && !row.hoursReference && hours) row.hoursReference = hours;
    if (!row.cuisine && typeof basicEvidence.cuisine === 'string' && basicEvidence.cuisine.trim()) {
      row.cuisine = basicEvidence.cuisine.trim();
      row.tags = [row.cuisine];
    }
    mergeWebsite(row, basicEvidence.finalUrl);
    row.identityOfficialEvidence = true;
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

// Keep all 2,804 identities in the frozen catalog, but do not publish ID-only
// placeholders to the recommendation runtime. They automatically return once
// a durable source supplies a real name/basic identity.
const publishedRows = rows.filter((row) =>
  row.basicInfoState !== 'google_place_id_only'
  && row.nameKnown === true
  && String(row.name || '').trim().length > 0
);

const runtimeStats = {
  scope: inventory.scope,
  radiusMeters: 1200,
  catalogTotal: rows.length,
  inventoryTotal: publishedRows.length,
  uniquePlaceIds: new Set(publishedRows.map((row) => row.googlePlaceId)).size,
  canonicalRich: publishedRows.filter((row) => row.basicInfoState === 'canonical').length,
  sourceBasic: publishedRows.filter((row) => row.basicInfoState === 'source_matched').length,
  namedBasic: publishedRows.length,
  placeIdOnly: 0,
  catalogPlaceIdOnly: counts.google_place_id_only || 0,
  unpublishedPlaceIdOnly: counts.google_place_id_only || 0,
  withCoordinates: publishedRows.filter((row) => finite(row.lat) && finite(row.lng)).length,
  withDistance: publishedRows.filter((row) => finite(row.distanceMeters)).length,
  recommendedDishesKnown: publishedRows.filter((row) => Array.isArray(row.recommendedDishes) && row.recommendedDishes.length).length,
  featuredDishesKnown: publishedRows.filter((row) => Array.isArray(row.featuredDishes) && row.featuredDishes.length).length,
  cuisineKnown: publishedRows.filter((row) => row.cuisine).length,
  dinnerBudgetKnown: publishedRows.filter((row) => Array.isArray(row.dinner) && row.dinner.length >= 2).length,
  hoursKnown: publishedRows.filter((row) => row.openingHours?.days || row.hoursReference).length,
  hotPepperBasicDetailRows: publishedRows.filter((row) => row.hotPepperBasicDetail).length,
  publicWebFieldEvidenceRows: publishedRows.filter((row) => row.publicWebFieldEvidence).length,
  identityOfficialEvidenceRows: publishedRows.filter((row) => row.identityOfficialEvidence).length,
  sourceBasicProviders: basicDoc.summary?.providers || {},
  detailEvidenceRestaurants: detailById.size,
  detailEvidenceSummary: detailEvidence.summary || {},
  publicWebFieldEvidenceSummary: webFieldDoc.summary || {}
};

if (rows.length !== 2804 || new Set(rows.map((row) => row.googlePlaceId)).size !== 2804) {
  throw new Error('Internal catalog does not contain exactly the frozen 2,804 Place IDs');
}
if (runtimeStats.inventoryTotal + runtimeStats.unpublishedPlaceIdOnly !== 2804) {
  throw new Error('Published + held ID-only rows do not reconcile to the frozen catalog');
}
if (publishedRows.some((row) => !row.nameKnown || !String(row.name || '').trim())) {
  throw new Error('Published runtime contains an unnamed restaurant');
}
if (publishedRows.some((row) => row.basicInfoState === 'google_place_id_only')) {
  throw new Error('Published runtime contains an ID-only placeholder');
}
if (publishedRows.some((row) => finite(row.distanceMeters) && (row.distanceMeters < 0 || row.distanceMeters > 1200))) {
  throw new Error('Runtime contains an out-of-radius durable distance');
}

fs.writeFileSync(
  outputPath,
  `// Generated from the frozen Google Place ID catalog. ID-only entries stay internal until a real source-backed name is available.\n` +
  `window.GOOGLE_INVENTORY_RESTAURANTS=${JSON.stringify(publishedRows)};\n` +
  `window.GOOGLE_INVENTORY_STATS=${JSON.stringify(runtimeStats)};\n`,
  'utf8'
);
console.log(JSON.stringify(runtimeStats));
