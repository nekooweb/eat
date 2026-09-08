import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const RUNTIME = path.join(DATA, 'google_inventory_runtime.js');
const OVERLAY = path.join(DATA, 'reviewed_official_practical_runtime_overlay.json');

function parseRuntime() {
  const text = fs.readFileSync(RUNTIME, 'utf8');
  const rp = 'window.GOOGLE_INVENTORY_RESTAURANTS=';
  const sp = 'window.GOOGLE_INVENTORY_STATS=';
  const rs = text.indexOf(rp), ss = text.indexOf(sp);
  if (rs < 0 || ss < 0 || ss <= rs) throw new Error('Cannot parse google_inventory_runtime.js');
  const rows = JSON.parse(text.slice(rs + rp.length, ss).replace(/^\s*/, '').replace(/;\s*$/s, '').trim());
  const stats = JSON.parse(text.slice(ss + sp.length).replace(/;\s*$/s, '').trim());
  return { rows, stats };
}

const overlay = JSON.parse(fs.readFileSync(OVERLAY, 'utf8'));
const policy = overlay.policy || {};
if (
  overlay.ruleVersion !== 'reviewed-official-practical-runtime-v1'
  || policy.sourceBackedOnly !== true
  || policy.reviewedOfficialIdentityRequired !== true
  || policy.retainedConflictPlacesDeferred !== true
  || policy.explicitBooleanClaimsOnly !== true
  || policy.absenceNeverMeansFalse !== true
  || policy.sameEvidencePolicyAsSQLiteImporter !== true
  || policy.networkRequests !== 0
  || policy.paidGoogleDataApiCalls !== 0
  || policy.googleDisplayPayloadPersisted !== false
  || policy.identityChanges !== 0
  || policy.missingOnlyAtRuntime !== true
) throw new Error('Invalid reviewed official practical overlay policy');

const FIELD_MAP = {
  'practical.card_available': 'cardPaymentAvailable',
  'practical.parking_available': 'parkingAvailable',
  'practical.wifi_available': 'wifiAvailable',
  'practical.private_room_available': 'privateRoomAvailable',
  'practical.barrier_free': 'barrierFree',
  'practical.children_welcome': 'childrenWelcome',
  'practical.english_menu': 'englishMenuAvailable'
};

const { rows, stats } = parseRuntime();
const beforeIdentity = rows.map((r) => [r.googlePlaceId, r.name, r.lat, r.lng, r.basicInfoState]);
const byId = new Map(rows.map((r) => [r.googlePlaceId, r]));
const fieldApplied = {};
let appliedRows = 0;
let skippedUnpublished = 0;
let skippedExisting = 0;

for (const item of overlay.rows || []) {
  const row = byId.get(item.googlePlaceId);
  if (!row || row.nameKnown !== true || !String(row.name || '').trim()) {
    skippedUnpublished += 1;
    continue;
  }
  if (item.provider !== 'official' || item.identityCheck?.accepted !== true || item.identityCheck?.identityRule !== 'retained_verified_official_page') {
    throw new Error(`Invalid reviewed official practical row ${item.googlePlaceId || '<missing>'}`);
  }
  let changed = false;
  for (const [fieldKey, value] of Object.entries(item.practicalClaims || {})) {
    const runtimeKey = FIELD_MAP[fieldKey];
    if (!runtimeKey || typeof value !== 'boolean') throw new Error(`Unsupported official practical runtime claim ${fieldKey}`);
    if (typeof row[runtimeKey] === 'boolean') {
      skippedExisting += 1;
      continue;
    }
    row[runtimeKey] = value;
    fieldApplied[fieldKey] = (fieldApplied[fieldKey] || 0) + 1;
    row.practicalFieldSources ||= {};
    row.practicalFieldSources[runtimeKey] = {
      provider: 'official',
      sourceUrl: item.finalUrl || item.sourceUrl || null,
      checkedAt: item.checkedAt || overlay.checkedAt || null,
      ruleVersion: item.ruleVersion,
      evidenceSnippet: item.evidenceSnippets?.[fieldKey] || null
    };
    if (runtimeKey === 'privateRoomAvailable' && !row.privateRoomStatus) {
      row.privateRoomStatus = value ? 'available' : 'not_available';
    }
    if (runtimeKey === 'parkingAvailable' && !row.parkingStatus) {
      row.parkingStatus = value ? 'available_unspecified' : 'none';
    }
    changed = true;
  }
  if (changed) appliedRows += 1;
}

const afterIdentity = rows.map((r) => [r.googlePlaceId, r.name, r.lat, r.lng, r.basicInfoState]);
if (JSON.stringify(beforeIdentity) !== JSON.stringify(afterIdentity)) throw new Error('Official practical materialization changed runtime identity/core geometry');
if (rows.length !== stats.inventoryTotal || new Set(rows.map((r) => r.googlePlaceId)).size !== rows.length) throw new Error('Runtime cardinality changed during official practical materialization');

stats.reviewedOfficialPracticalOverlaySummary = overlay.summary || {};
stats.officialPracticalAppliedRows = appliedRows;
stats.officialPracticalFieldCounts = fieldApplied;
stats.cardPaymentKnown = rows.filter((r) => typeof r.cardPaymentAvailable === 'boolean').length;
stats.parkingBooleanKnown = rows.filter((r) => typeof r.parkingAvailable === 'boolean').length;
stats.parkingPolicyKnown = rows.filter((r) => ['on_site_or_building','available_unspecified','nearby_paid','none'].includes(r.parkingStatus)).length;
stats.wifiKnown = rows.filter((r) => typeof r.wifiAvailable === 'boolean').length;
stats.privateRoomBooleanKnown = rows.filter((r) => typeof r.privateRoomAvailable === 'boolean').length;
stats.privateRoomPolicyKnown = rows.filter((r) => ['available','semi_private','not_available'].includes(r.privateRoomStatus)).length;
stats.barrierFreeKnown = rows.filter((r) => typeof r.barrierFree === 'boolean').length;
stats.childrenWelcomeKnown = rows.filter((r) => typeof r.childrenWelcome === 'boolean').length;
stats.englishMenuKnown = rows.filter((r) => typeof r.englishMenuAvailable === 'boolean').length;

fs.writeFileSync(
  RUNTIME,
  `// Generated from the frozen Google Place ID catalog. ID-only entries stay internal until a real source-backed name is available.\n` +
  `window.GOOGLE_INVENTORY_RESTAURANTS=${JSON.stringify(rows)};\n` +
  `window.GOOGLE_INVENTORY_STATS=${JSON.stringify(stats)};\n`,
  'utf8'
);
console.log(JSON.stringify({
  sourceRows: (overlay.rows || []).length,
  appliedRows,
  skippedExisting,
  skippedUnpublished,
  fieldApplied,
  cardPaymentKnown: stats.cardPaymentKnown,
  parkingBooleanKnown: stats.parkingBooleanKnown,
  wifiKnown: stats.wifiKnown,
  privateRoomBooleanKnown: stats.privateRoomBooleanKnown,
  barrierFreeKnown: stats.barrierFreeKnown,
  childrenWelcomeKnown: stats.childrenWelcomeKnown,
  englishMenuKnown: stats.englishMenuKnown
}));
