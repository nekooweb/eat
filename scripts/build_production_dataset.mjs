#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(DATA, 'production_area1.js');
const AREA = '地区1️⃣';
const PROFILE = 'TOKYO';
const MAX_DISTANCE = 1200;

const enrichmentInputs = fs.readdirSync(DATA)
  .filter((filename) => /^source_enrichment(?:_[a-z0-9-]+)?\.js$/i.test(filename))
  .sort();

const INPUTS = [
  'restaurants.js',
  'area1_bulk.js',
  'area1_more.js',
  'area1_osm.js',
  // Manual identity hints are lower priority. Generated QC is loaded after them
  // and therefore wins when both touch the same source record.
  'google_entities.js',
  'google_entities.generated.js',
  'hyakumeiten.js',
  // Place-ID keyed, field-level source-backed metadata. These rows are
  // enrichment-only and may not admit a restaurant into production themselves.
  ...enrichmentInputs
];

const sandbox = {
  window: { RESTAURANTS: [] },
  console
};
vm.createContext(sandbox);

for (const filename of INPUTS) {
  const source = fs.readFileSync(path.join(DATA, filename), 'utf8');
  vm.runInContext(source, sandbox, { filename });
}

const rows = sandbox.window.RESTAURANTS;
if (!Array.isArray(rows)) throw new Error('window.RESTAURANTS was not created');

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

// One verified Google Place ID is one production identity. Enrichment rows cannot
// create a group; therefore Tabelog/official metadata can never bypass Google QC.
const groupsByPlaceId = new Map();
for (const row of verifiedRows) {
  if (!groupsByPlaceId.has(row.googlePlaceId)) groupsByPlaceId.set(row.googlePlaceId, []);
  groupsByPlaceId.get(row.googlePlaceId).push(row);
}

// Attach exact Place-ID keyed enrichment only to an identity that already passed
// Google QC. This is the preferred cross-source path.
for (const row of areaRows) {
  if (!row.googlePlaceId || row.googleStatus === 'verified') continue;
  const group = groupsByPlaceId.get(row.googlePlaceId);
  if (group) group.push(row);
}

// Conservative bridge for historical records that do not yet carry a Place ID:
// attach only when their normalized name resolves to exactly one verified
// production identity in Area1.
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

function sourceLabel(row) {
  if (row.source === 'OpenStreetMap') return 'OpenStreetMap';
  if (row.source) return row.source;
  return 'curated';
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
  const hit = [...rowsToSearch].sort((a, b) => detailScore(b) - detailScore(a)).find(predicate);
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

  // Geospatial display data remains independent of Google Places. OSM is
  // preferred even when richer Tabelog/official metadata is available.
  const geo = sourceRows.find((row) =>
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
    ?? firstBy(
      sourceRows.filter((row) => !row.sourceOnly),
      (row) => isFiniteNumber(row.distanceMeters),
      (row) => row.distanceMeters
    )
    ?? firstBy(
      sourceRows.filter((row) => !row.sourceOnly),
      (row) => isFiniteNumber(row.distance),
      (row) => row.distance
    );

  if (!isFiniteNumber(distanceMeters) || distanceMeters > MAX_DISTANCE) return null;

  const cuisineClaim = bestClaimingRow(sourceRows, 'cuisine');
  const cuisine = cuisineClaim
    ? (cuisineClaim.cuisine || '餐厅')
    : firstBy(
      sourceRows,
      (row) => row.cuisine && row.cuisine !== '餐厅',
      (row) => row.cuisine
    ) || base.cuisine || '餐厅';

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

  const dishesClaim = bestClaimingRow(sourceRows, 'dishes');
  const dishes = isSuppressed(sourceRows, 'dishes')
    ? []
    : dishesClaim
      ? unique(dishesClaim.dishes || []).slice(0, 4)
      : unique(sourceRows.flatMap((row) => row.dishes || [])).slice(0, 4);

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
      : firstBy(
        sourceRows,
        (row) => Array.isArray(row.closedDays) && row.closedDays.length,
        (row) => row.closedDays
      ) || [];
  const closedNote = isSuppressed(sourceRows, 'closure')
    ? null
    : closureClaim
      ? (closureClaim.closedNote || null)
      : firstBy(sourceRows, (row) => Boolean(row.closedNote), (row) => row.closedNote);

  const awardClaim = bestClaimingRow(sourceRows, 'hyakumeiten');
  const awardRow = awardClaim || [...sourceRows]
    .sort((a, b) => detailScore(b) - detailScore(a))
    .find((row) => row.hyakumeiten);
  const hyakumeiten = awardClaim ? Boolean(awardClaim.hyakumeiten) : Boolean(awardRow);

  return {
    id: `g-${placeId}`,
    profile: PROFILE,
    area: AREA,
    name: base.name,
    cuisine,
    tags: unique([cuisine, ...sourceRows.flatMap((row) => row.tags || [])]),
    address: firstBy(sourceRows, (row) => Boolean(row.address), (row) => row.address) || '',
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    distanceMeters: Math.round(distanceMeters),
    lunch: lunch || null,
    dinner: dinner || null,
    dishes,
    openingHoursRaw: openingHoursRaw || null,
    closedDays,
    closedNote: closedNote || null,
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

if (duplicatePlaceIds) throw new Error(`duplicate Place IDs: ${duplicatePlaceIds}`);
if (outside.length) throw new Error(`outside ${MAX_DISTANCE}m: ${outside.length}`);
if (invalid.length) throw new Error(`invalid canonical rows: ${invalid.length}`);
if (production.length < 3) throw new Error(`production pool too small: ${production.length}`);

const stats = {
  sourceRows: areaRows.length,
  verifiedSourceRows: verifiedRows.length,
  productionEntities: production.length,
  uniquePlaceIds: new Set(placeIds).size,
  cuisineKnown: production.filter((row) => row.cuisine !== '餐厅').length,
  budgetKnown: production.filter((row) => isPrice(row.lunch) || isPrice(row.dinner)).length,
  dishesKnown: production.filter((row) => row.dishes.length).length,
  scheduleKnown: production.filter((row) =>
    row.openingHoursRaw || row.closedDays.length || row.closedNote).length,
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
