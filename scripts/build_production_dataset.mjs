#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { normalizeOpeningHours, formatOpeningHoursZh, validateOpeningHours } from './opening_hours.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(DATA, 'production_area1.js');
const PROFILE = 'TOKYO';
const AREA = '地区1️⃣';
const MAX_DISTANCE = 1200;

const enrichmentInputs = fs.readdirSync(DATA)
  .filter((filename) => /^source_enrichment(?:_[a-z0-9-]+)?\.js$/i.test(filename))
  .sort();

const INPUTS = [
  'restaurants.js',
  'area1_bulk.js',
  'area1_more.js',
  'area1_osm.js',
  'google_entities.js',
  'google_entities.generated.js',
  'hyakumeiten.js',
  'recommended_dishes.js',
  ...enrichmentInputs
];

const sandbox = {
  window: { RESTAURANTS: [], RECOMMENDED_DISHES: [] },
  console
};
vm.createContext(sandbox);
for (const filename of INPUTS) {
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
}

const rows = sandbox.window.RESTAURANTS;
const recommendationRows = sandbox.window.RECOMMENDED_DISHES || [];
if (!Array.isArray(rows)) throw new Error('window.RESTAURANTS was not created');
if (!Array.isArray(recommendationRows)) throw new Error('window.RECOMMENDED_DISHES must be an array');

const norm = (value) => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆]+/g, '');
const isFiniteNumber = (value) => Number.isFinite(value);
const isPrice = (value) => Array.isArray(value)
  && value.length >= 2
  && isFiniteNumber(value[0])
  && isFiniteNumber(value[1]);
const unique = (values) => [...new Set(values.filter(Boolean))];

const areaRows = rows.filter((row) => row.profile === PROFILE && row.area === AREA);
const verifiedRows = areaRows.filter((row) => row.googleStatus === 'verified' && row.googlePlaceId);

// A verified Google Place ID creates the production identity. Source-only rows
// can enrich an existing group but can never create one.
const groupsByPlaceId = new Map();
for (const row of verifiedRows) {
  if (!groupsByPlaceId.has(row.googlePlaceId)) groupsByPlaceId.set(row.googlePlaceId, []);
  groupsByPlaceId.get(row.googlePlaceId).push(row);
}
for (const row of areaRows) {
  if (!row.googlePlaceId || row.googleStatus === 'verified') continue;
  groupsByPlaceId.get(row.googlePlaceId)?.push(row);
}

// Historical no-ID rows are allowed to enrich only a uniquely resolved name.
const placeIdsByName = new Map();
for (const row of verifiedRows) {
  const key = norm(row.name);
  if (!key) continue;
  if (!placeIdsByName.has(key)) placeIdsByName.set(key, new Set());
  placeIdsByName.get(key).add(row.googlePlaceId);
}
for (const row of areaRows) {
  if (row.googlePlaceId) continue;
  const ids = placeIdsByName.get(norm(row.name));
  if (!ids || ids.size !== 1) continue;
  const [placeId] = ids;
  groupsByPlaceId.get(placeId)?.push(row);
}

// Recommendations are intentionally sparse and exact-identity keyed. Generic
// representative dish data is not automatically promoted to a recommendation.
const recommendationsByPlaceId = new Map();
for (const row of recommendationRows) {
  if (!row.googlePlaceId || !groupsByPlaceId.has(row.googlePlaceId)) {
    throw new Error(`recommendation is not attached to a production identity: ${row.googlePlaceId || 'missing-id'}`);
  }
  if (recommendationsByPlaceId.has(row.googlePlaceId)) {
    throw new Error(`duplicate recommendation row: ${row.googlePlaceId}`);
  }
  if (!Array.isArray(row.dishes) || row.dishes.length < 1 || row.dishes.length > 2
    || row.dishes.some((dish) => typeof dish !== 'string' || !dish.trim())) {
    throw new Error(`invalid recommendation dishes: ${row.googlePlaceId}`);
  }
  if (!row.sourceUrl || !/^https:\/\//.test(row.sourceUrl)) {
    throw new Error(`invalid recommendation source URL: ${row.googlePlaceId}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.checkedAt || '')) {
    throw new Error(`invalid recommendation check date: ${row.googlePlaceId}`);
  }
  recommendationsByPlaceId.set(row.googlePlaceId, unique(row.dishes).slice(0, 2));
}

function sourceLabel(row) {
  if (row.source === 'OpenStreetMap') return 'OpenStreetMap';
  return row.source || 'curated';
}

function detailScore(row) {
  let score = 0;
  const label = sourceLabel(row);
  if (label === 'official') score += 12;
  if (label === 'Tabelog') score += 10;
  if (label === 'curated') score += 4;
  if (row.cuisine && row.cuisine !== '餐厅') score += 2;
  if (isPrice(row.lunch) || isPrice(row.dinner)) score += 2;
  if (Array.isArray(row.dishes) && row.dishes.length) score += 2;
  if (row.address) score += 1;
  return score;
}

function firstBy(rowsToSearch, predicate, selector = (row) => row) {
  const hit = [...rowsToSearch]
    .sort((a, b) => detailScore(b) - detailScore(a))
    .find(predicate);
  return hit ? selector(hit) : null;
}

function claimedFields(row) {
  if (!row.sourceOnly || !Array.isArray(row.sourceRefs)) return new Set();
  return new Set(row.sourceRefs.flatMap((ref) => ref.fields || []));
}

function bestClaimingRow(rowsToSearch, field) {
  return [...rowsToSearch]
    .filter((row) => claimedFields(row).has(field))
    .sort((a, b) => detailScore(b) - detailScore(a))[0] || null;
}

function isSuppressed(rowsToSearch, field) {
  return rowsToSearch.some((row) => row.sourceOnly
    && Array.isArray(row.suppressFields)
    && row.suppressFields.includes(field));
}

function canonicalize(placeId, sourceRows) {
  const sorted = [...sourceRows].sort((a, b) => detailScore(b) - detailScore(a));
  const base = sorted[0];

  // Geospatial data remains independent of Google Places; prefer verified OSM.
  const geo = sourceRows.find((row) =>
    row.source === 'OpenStreetMap'
    && row.googleStatus === 'verified'
    && isFiniteNumber(row.lat)
    && isFiniteNumber(row.lng)
    && isFiniteNumber(row.distanceMeters)
  ) || sourceRows.find((row) =>
    row.source === 'OpenStreetMap'
    && isFiniteNumber(row.lat)
    && isFiniteNumber(row.lng)
    && isFiniteNumber(row.distanceMeters)
  ) || sourceRows.find((row) =>
    !row.sourceOnly
    && isFiniteNumber(row.lat)
    && isFiniteNumber(row.lng)
    && isFiniteNumber(row.distanceMeters)
  );

  const distanceMeters = geo?.distanceMeters
    ?? firstBy(sourceRows.filter((row) => !row.sourceOnly), (row) => isFiniteNumber(row.distanceMeters), (row) => row.distanceMeters)
    ?? firstBy(sourceRows.filter((row) => !row.sourceOnly), (row) => isFiniteNumber(row.distance), (row) => row.distance);
  if (!isFiniteNumber(distanceMeters) || distanceMeters > MAX_DISTANCE) return null;

  const nameClaim = bestClaimingRow(sourceRows, 'name');
  const identityNameRow = sourceRows.find((row) =>
    row.source === 'OpenStreetMap'
    && row.googleStatus === 'verified'
    && row.googlePlaceId === placeId
    && row.name
  ) || geo;
  const canonicalName = nameClaim?.name || identityNameRow?.name || base.name;

  const cuisineClaim = bestClaimingRow(sourceRows, 'cuisine');
  const cuisine = cuisineClaim
    ? (cuisineClaim.cuisine || '餐厅')
    : firstBy(sourceRows, (row) => row.cuisine && row.cuisine !== '餐厅', (row) => row.cuisine)
      || base.cuisine || '餐厅';

  const budgetClaim = bestClaimingRow(sourceRows, 'budget');
  const budgetSuppressed = isSuppressed(sourceRows, 'budget');
  const lunch = budgetSuppressed
    ? null
    : budgetClaim
      ? (isPrice(budgetClaim.lunch) ? budgetClaim.lunch : null)
      : firstBy(sourceRows, (row) => isPrice(row.lunch), (row) => row.lunch);
  const dinner = budgetSuppressed
    ? null
    : budgetClaim
      ? (isPrice(budgetClaim.dinner) ? budgetClaim.dinner : null)
      : firstBy(sourceRows, (row) => isPrice(row.dinner), (row) => row.dinner);

  // Keep legacy representative dishes for maintenance compatibility, but only
  // explicit reviewed recommendations reach the public recommendation field.
  const dishesClaim = bestClaimingRow(sourceRows, 'dishes');
  const dishes = isSuppressed(sourceRows, 'dishes')
    ? []
    : dishesClaim
      ? unique(dishesClaim.dishes || []).slice(0, 4)
      : unique(sourceRows.flatMap((row) => row.dishes || [])).slice(0, 4);
  const recommendedDishes = recommendationsByPlaceId.get(placeId) || [];

  // Source shards may retain human-readable schedule strings for provenance,
  // but canonical production exposes only a normalized machine-readable
  // schedule. If no reliable time interval can be parsed, no schedule field is
  // emitted at all. hoursReference is derived only from that normalized object.
  const hoursClaim = bestClaimingRow(sourceRows, 'hours');
  const openingHoursRaw = isSuppressed(sourceRows, 'hours')
    ? null
    : hoursClaim
      ? (hoursClaim.openingHoursRaw || null)
      : firstBy(sourceRows, (row) => Boolean(row.openingHoursRaw), (row) => row.openingHoursRaw);

  const closureClaim = bestClaimingRow(sourceRows, 'closure');
  const closedDays = isSuppressed(sourceRows, 'closure')
    ? []
    : closureClaim
      ? (Array.isArray(closureClaim.closedDays) ? closureClaim.closedDays : [])
      : firstBy(sourceRows, (row) => Array.isArray(row.closedDays) && row.closedDays.length, (row) => row.closedDays) || [];
  const openingHours = normalizeOpeningHours(openingHoursRaw, closedDays);
  const hoursReference = openingHours ? formatOpeningHoursZh(openingHours) : null;

  const awardClaim = bestClaimingRow(sourceRows, 'hyakumeiten');
  const awardRow = awardClaim || [...sourceRows]
    .sort((a, b) => detailScore(b) - detailScore(a))
    .find((row) => row.hyakumeiten);
  const hyakumeiten = awardClaim ? Boolean(awardClaim.hyakumeiten) : Boolean(awardRow);

  const addressClaim = bestClaimingRow(sourceRows, 'address');
  const address = addressClaim?.address
    || geo?.address
    || firstBy(sourceRows, (row) => Boolean(row.address), (row) => row.address)
    || '';

  return {
    id: `g-${placeId}`,
    profile: PROFILE,
    area: AREA,
    name: canonicalName,
    cuisine,
    tags: unique([cuisine, ...sourceRows.flatMap((row) => row.tags || [])]),
    address,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    distanceMeters: Math.round(distanceMeters),
    lunch: lunch || null,
    dinner: dinner || null,
    recommendedDishes,
    dishes,
    ...(openingHours ? { openingHours, hoursReference } : {}),
    googlePlaceId: placeId,
    googleStatus: 'verified',
    hyakumeiten,
    hyakumeitenYear: hyakumeiten ? (awardRow?.hyakumeitenYear || null) : null,
    hyakumeitenCategory: hyakumeiten ? (awardRow?.hyakumeitenCategory || null) : null,
    randomWeight: hyakumeiten ? 2.2 : 1,
    sources: unique(sourceRows.map(sourceLabel))
  };
}

const production = [...groupsByPlaceId.entries()]
  .map(([placeId, sourceRows]) => canonicalize(placeId, sourceRows))
  .filter(Boolean)
  .sort((a, b) => a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name, 'ja'));

const placeIds = production.map((row) => row.googlePlaceId);
const duplicatePlaceIds = placeIds.length - new Set(placeIds).size;
const outside = production.filter((row) => row.distanceMeters > MAX_DISTANCE);
const invalid = production.filter((row) => !row.name || !row.googlePlaceId || !row.cuisine);
const schemaInvalid = production.filter((row) =>
  !Array.isArray(row.recommendedDishes)
  || row.recommendedDishes.length > 2
  || (row.openingHours && (!validateOpeningHours(row.openingHours) || !row.hoursReference))
  || (!row.openingHours && Object.hasOwn(row, 'hoursReference')));

if (duplicatePlaceIds) throw new Error(`duplicate Place IDs: ${duplicatePlaceIds}`);
if (outside.length) throw new Error(`outside ${MAX_DISTANCE}m: ${outside.length}`);
if (invalid.length) throw new Error(`invalid canonical rows: ${invalid.length}`);
if (schemaInvalid.length) throw new Error(`invalid normalized fields: ${schemaInvalid.length}`);
if (production.length < 3) throw new Error(`production pool too small: ${production.length}`);

const stats = {
  sourceRows: areaRows.length,
  verifiedSourceRows: verifiedRows.length,
  productionEntities: production.length,
  uniquePlaceIds: new Set(placeIds).size,
  cuisineKnown: production.filter((row) => row.cuisine !== '餐厅').length,
  budgetKnown: production.filter((row) => isPrice(row.lunch) || isPrice(row.dinner)).length,
  recommendedDishesKnown: production.filter((row) => row.recommendedDishes.length).length,
  openingHoursKnown: production.filter((row) => Boolean(row.openingHours)).length,
  dishesKnown: production.filter((row) => row.dishes.length).length,
  scheduleKnown: production.filter((row) => Boolean(row.openingHours)).length,
  sourceBacked: production.filter((row) =>
    row.sources.some((source) => source === 'Tabelog' || source === 'official')).length,
  awards: production.filter((row) => row.hyakumeiten).length
};

const output = [
  '// Auto-generated at deploy time. Do not edit directly.',
  `window.PRODUCTION_RESTAURANTS=${JSON.stringify(production)};`,
  `window.PRODUCTION_STATS=${JSON.stringify(stats)};`,
  ''
].join('\n');
fs.writeFileSync(OUT, output, 'utf8');
console.log(JSON.stringify(stats));
