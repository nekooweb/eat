import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const RUNTIME = path.join(DATA, 'google_inventory_runtime.js');
const PRACTICAL = path.join(DATA, 'hotpepper_catalog_practical_overlay.json');
const WEB_FIELDS = path.join(DATA, 'source_basic_web_field_evidence.json');

function readJson(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
}

function parseRuntime() {
  const text = fs.readFileSync(RUNTIME, 'utf8');
  const rowPrefix = 'window.GOOGLE_INVENTORY_RESTAURANTS=';
  const statsPrefix = 'window.GOOGLE_INVENTORY_STATS=';
  const rowStart = text.indexOf(rowPrefix);
  const statsStart = text.indexOf(statsPrefix);
  if (rowStart < 0 || statsStart < 0 || statsStart <= rowStart) throw new Error('Cannot parse google_inventory_runtime.js');
  const rowText = text.slice(rowStart + rowPrefix.length, statsStart).replace(/^\s*/, '').replace(/;\s*$/s, '').trim();
  const statsText = text.slice(statsStart + statsPrefix.length).replace(/;\s*$/s, '').trim();
  return { rows: JSON.parse(rowText), stats: JSON.parse(statsText) };
}

function validTelephone(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 80) return '';
  const digits = text.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? text : '';
}

function nonempty(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

const practicalDoc = readJson(PRACTICAL, { rows: [], policy: {}, summary: {} });
const pp = practicalDoc.policy || {};
if (
  practicalDoc.ruleVersion !== 'hotpepper-catalog-practical-v1'
  || pp.sourceBackedOnly !== true
  || pp.reviewedAutoEligibleBindingOnly !== true
  || pp.paidGoogleDataApiCalls !== 0
  || pp.hotPepperWebServiceApiCalls !== 0
  || pp.networkRequests !== 0
  || pp.ambiguousContradictoryValuesResolveToUnknown !== true
) throw new Error('Invalid Hot Pepper practical overlay policy');

const webDoc = readJson(WEB_FIELDS, { rows: [], policy: {}, summary: {} });
const wp = webDoc.policy || {};
if ((wp.paidDataApiCalls ?? 0) !== 0 || wp.googleDisplayPayloadPersisted === true || wp.sourceBackedIdentityRequired !== true) {
  throw new Error('Invalid public web field evidence policy');
}

const { rows, stats } = parseRuntime();
const beforeIdentity = rows.map((row) => [row.googlePlaceId, row.name, row.lat, row.lng, row.basicInfoState]);
const byId = new Map(rows.map((row) => [row.googlePlaceId, row]));
let practicalApplied = 0;
let telephoneApplied = 0;

for (const item of practicalDoc.rows || []) {
  const row = byId.get(item.googlePlaceId);
  if (!row || row.nameKnown !== true || !String(row.name || '').trim()) continue;
  const n = item.normalized || {};
  const raw = item.raw || {};
  let changed = false;
  const set = (key, value) => {
    if (value === null || value === undefined || value === '' || value === 'unknown') return;
    row[key] = value;
    changed = true;
  };
  set('stationName', n.stationName);
  set('accessReference', n.accessReference);
  set('lunchServiceAvailable', n.lunchAvailable);
  set('courseAvailable', n.courseAvailable);
  set('allYouCanDrinkAvailable', n.allYouCanDrinkAvailable);
  set('allYouCanEatAvailable', n.allYouCanEatAvailable);
  set('privateRoomStatus', n.privateRoomStatus);
  if (typeof n.privateRoomAvailable === 'boolean') set('privateRoomAvailable', n.privateRoomAvailable);
  set('cardPaymentAvailable', n.cardPaymentAvailable);
  set('smokingPolicy', n.smokingPolicy);
  set('parkingStatus', n.parkingStatus);
  if (typeof n.parkingAvailable === 'boolean') set('parkingAvailable', n.parkingAvailable);

  if (nonempty(raw.freeDrink)) set('allYouCanDrinkReference', String(raw.freeDrink).trim());
  if (nonempty(raw.freeFood)) set('allYouCanEatReference', String(raw.freeFood).trim());
  if (nonempty(raw.privateRoom)) set('privateRoomReference', String(raw.privateRoom).trim());
  if (nonempty(raw.card)) set('cardPaymentReference', String(raw.card).trim());
  if (nonempty(raw.nonSmoking)) set('smokingReference', String(raw.nonSmoking).trim());
  if (nonempty(raw.parking)) set('parkingReference', String(raw.parking).trim());

  if (changed) {
    row.practicalSource = 'Hot Pepper';
    row.practicalSourceUrl = item.sourceUrl || null;
    row.practicalSourceCheckedAt = item.checkedAt || practicalDoc.checkedAt || null;
    row.practicalNormalizationRule = practicalDoc.ruleVersion;
    practicalApplied += 1;
  }
}

// Mirror the SQLite source-basic-web telephone contract: accepted identity only,
// missing-only, preserve source formatting, validate digit count without inventing a number.
for (const item of webDoc.rows || []) {
  const row = byId.get(item.googlePlaceId);
  if (!row || row.nameKnown !== true || !String(row.name || '').trim() || row.telephone) continue;
  if (item.identityCheck?.accepted !== true) continue;
  const telephone = validTelephone(item.fieldClaims?.telephone);
  if (!telephone) continue;
  row.telephone = telephone;
  row.telephoneSourceUrl = item.webEvidence?.finalUrl || item.webEvidence?.sourceUrl || null;
  row.telephoneCheckedAt = item.checkedAt || item.webEvidence?.retrievedAt || webDoc.checkedAt || null;
  telephoneApplied += 1;
}

const afterIdentity = rows.map((row) => [row.googlePlaceId, row.name, row.lat, row.lng, row.basicInfoState]);
if (JSON.stringify(beforeIdentity) !== JSON.stringify(afterIdentity)) throw new Error('Practical/contact materialization mutated runtime identity/core geometry');
if (rows.length !== stats.inventoryTotal || new Set(rows.map((r) => r.googlePlaceId)).size !== rows.length) throw new Error('Runtime cardinality changed during practical/contact materialization');

Object.assign(stats, {
  practicalOverlayAppliedRows: practicalApplied,
  practicalOverlaySummary: practicalDoc.summary || {},
  stationKnown: rows.filter((r) => nonempty(r.stationName)).length,
  accessReferenceKnown: rows.filter((r) => nonempty(r.accessReference)).length,
  lunchServiceKnown: rows.filter((r) => typeof r.lunchServiceAvailable === 'boolean').length,
  courseAvailabilityKnown: rows.filter((r) => typeof r.courseAvailable === 'boolean').length,
  allYouCanDrinkKnown: rows.filter((r) => typeof r.allYouCanDrinkAvailable === 'boolean').length,
  allYouCanEatKnown: rows.filter((r) => typeof r.allYouCanEatAvailable === 'boolean').length,
  privateRoomPolicyKnown: rows.filter((r) => ['available', 'semi_private', 'not_available'].includes(r.privateRoomStatus)).length,
  privateRoomBooleanKnown: rows.filter((r) => typeof r.privateRoomAvailable === 'boolean').length,
  cardPaymentKnown: rows.filter((r) => typeof r.cardPaymentAvailable === 'boolean').length,
  smokingPolicyKnown: rows.filter((r) => ['non_smoking', 'smoking_allowed', 'partial_non_smoking'].includes(r.smokingPolicy)).length,
  parkingPolicyKnown: rows.filter((r) => ['on_site_or_building', 'available_unspecified', 'nearby_paid', 'none'].includes(r.parkingStatus)).length,
  parkingBooleanKnown: rows.filter((r) => typeof r.parkingAvailable === 'boolean').length,
  telephoneKnown: rows.filter((r) => nonempty(r.telephone)).length,
  telephoneAppliedFromPublicWebEvidence: telephoneApplied
});

fs.writeFileSync(
  RUNTIME,
  `// Generated from the frozen Google Place ID catalog. ID-only entries stay internal until a real source-backed name is available.\n` +
  `window.GOOGLE_INVENTORY_RESTAURANTS=${JSON.stringify(rows)};\n` +
  `window.GOOGLE_INVENTORY_STATS=${JSON.stringify(stats)};\n`,
  'utf8'
);

console.log(JSON.stringify({
  inventoryTotal: rows.length,
  practicalApplied,
  telephoneApplied,
  stationKnown: stats.stationKnown,
  accessReferenceKnown: stats.accessReferenceKnown,
  lunchServiceKnown: stats.lunchServiceKnown,
  courseAvailabilityKnown: stats.courseAvailabilityKnown,
  allYouCanDrinkKnown: stats.allYouCanDrinkKnown,
  allYouCanEatKnown: stats.allYouCanEatKnown,
  privateRoomPolicyKnown: stats.privateRoomPolicyKnown,
  privateRoomBooleanKnown: stats.privateRoomBooleanKnown,
  cardPaymentKnown: stats.cardPaymentKnown,
  smokingPolicyKnown: stats.smokingPolicyKnown,
  parkingPolicyKnown: stats.parkingPolicyKnown,
  parkingBooleanKnown: stats.parkingBooleanKnown,
  telephoneKnown: stats.telephoneKnown
}));
