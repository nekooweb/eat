import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const RUNTIME = path.join(DATA, 'google_inventory_runtime.js');
const OVERLAY = path.join(DATA, 'reviewed_native_contact_runtime_overlay.json');
const PHASE = String(process.argv[2] || '').trim().toLowerCase();
if (!['overture', 'osm-basic-practical', 'osm'].includes(PHASE)) {
  throw new Error('usage: node scripts/materialize_runtime_native_contact_fields.mjs overture|osm-basic-practical|osm');
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

function smokingPolicy(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'no') return 'non_smoking';
  if (text === 'yes') return 'smoking_allowed';
  if (text === 'separated' || text === 'isolated') return 'partial_non_smoking';
  if (text === 'outside') return 'outside_only';
  if (text === 'dedicated') return 'dedicated_smoking_area';
  return null;
}

const overlay = JSON.parse(fs.readFileSync(OVERLAY, 'utf8'));
const policy = overlay.policy || {};
if (
  overlay.ruleVersion !== 'reviewed-native-contact-runtime-v2'
  || policy.sourceBackedOnly !== true
  || policy.reviewedBindingsOnly !== true
  || policy.exactRetainedProviderIdOnly !== true
  || policy.sameCrossLayerCollisionLogicAsSQLiteMaster !== true
  || policy.explicitOsmPracticalTagsOnly !== true
  || policy.contradictoryCardTagsDeferred !== true
  || policy.networkRequests !== 0
  || policy.paidGoogleDataApiCalls !== 0
  || policy.googleDisplayPayloadPersisted !== false
  || policy.identityChanges !== 0
) throw new Error('Invalid reviewed native metadata overlay policy');

const { rows, stats } = parseRuntime();
const beforeIdentity = rows.map((row) => [row.googlePlaceId, row.name, row.lat, row.lng, row.basicInfoState]);
const byId = new Map(rows.map((row) => [row.googlePlaceId, row]));
let applied = 0;
let practicalAppliedRows = 0;
let skippedExisting = 0;
let skippedUnpublished = 0;
let invalid = 0;
const practicalFieldApplied = {};

function applyPractical(sourceRows, expectedRule, label) {
  let changedRows = 0;
  for (const item of sourceRows) {
    if (item.provider !== 'OpenStreetMap' || item.binding?.state !== 'reviewed' || item.ruleVersion !== expectedRule) {
      invalid += 1;
      continue;
    }
    const row = byId.get(item.googlePlaceId);
    if (!row || row.nameKnown !== true || !String(row.name || '').trim()) {
      skippedUnpublished += 1;
      continue;
    }
    let changed = false;
    for (const [fieldKey, value] of Object.entries(item.practicalClaims || {})) {
      let runtimeKey = null;
      let runtimeValue = value;
      if (fieldKey === 'practical.card_available') runtimeKey = 'cardPaymentAvailable';
      else if (fieldKey === 'practical.wifi_available') runtimeKey = 'wifiAvailable';
      else if (fieldKey === 'practical.barrier_free') runtimeKey = 'barrierFree';
      else if (fieldKey === 'practical.smoking_policy') {
        runtimeKey = 'smokingPolicy';
        runtimeValue = smokingPolicy(value);
      }
      if (!runtimeKey || runtimeValue === null || runtimeValue === undefined) {
        invalid += 1;
        continue;
      }
      if (runtimeKey === 'smokingPolicy') {
        if (String(row[runtimeKey] || '').trim()) {
          skippedExisting += 1;
          continue;
        }
      } else if (typeof row[runtimeKey] === 'boolean') {
        skippedExisting += 1;
        continue;
      }
      row[runtimeKey] = runtimeValue;
      row.practicalFieldSources ||= {};
      row.practicalFieldSources[runtimeKey] = {
        provider: 'OpenStreetMap',
        layer: label,
        sourceUrl: item.sourceUrl || null,
        checkedAt: item.checkedAt || overlay.checkedAt || null,
        ruleVersion: item.ruleVersion,
        nativeSourceId: item.nativeSourceId || null,
        sourceValue: value,
        sourcePracticalTags: item.sourcePracticalTags || {}
      };
      practicalFieldApplied[fieldKey] = (practicalFieldApplied[fieldKey] || 0) + 1;
      changed = true;
    }
    if (changed) changedRows += 1;
  }
  practicalAppliedRows += changedRows;
}

if (PHASE === 'osm-basic-practical') {
  applyPractical(overlay.osmBasicPracticalRows || [], policy.basicOsmPracticalRule, 'reviewed_basic_osm');
} else if (PHASE === 'overture') {
  for (const item of overlay.overtureRows || []) {
    if (item.provider !== 'Overture Maps' || item.binding?.state !== 'reviewed' || item.ruleVersion !== policy.overturePhoneRule) {
      invalid += 1;
      continue;
    }
    const row = byId.get(item.googlePlaceId);
    if (!row || row.nameKnown !== true || !String(row.name || '').trim()) {
      skippedUnpublished += 1;
      continue;
    }
    if (row.telephone) {
      skippedExisting += 1;
      continue;
    }
    const telephone = validTelephone(item.telephone);
    if (!telephone) {
      invalid += 1;
      continue;
    }
    row.telephone = telephone;
    row.telephoneSourceUrl = item.sourceUrl || null;
    row.telephoneCheckedAt = item.checkedAt || overlay.checkedAt || null;
    row.telephoneProvider = 'Overture Maps';
    row.telephoneRuleVersion = item.ruleVersion;
    applied += 1;
  }
} else {
  applyPractical(overlay.osmPracticalRows || [], policy.osmPracticalRule, 'reviewed_historical_osm');
  for (const item of overlay.osmRows || []) {
    if (item.provider !== 'OpenStreetMap' || item.binding?.state !== 'reviewed' || item.ruleVersion !== policy.osmPhoneRule) {
      invalid += 1;
      continue;
    }
    const row = byId.get(item.googlePlaceId);
    if (!row || row.nameKnown !== true || !String(row.name || '').trim()) {
      skippedUnpublished += 1;
      continue;
    }
    if (row.telephone) {
      skippedExisting += 1;
      continue;
    }
    const telephone = validTelephone(item.telephone);
    if (!telephone) {
      invalid += 1;
      continue;
    }
    row.telephone = telephone;
    row.telephoneSourceUrl = item.sourceUrl || null;
    row.telephoneCheckedAt = item.checkedAt || overlay.checkedAt || null;
    row.telephoneProvider = 'OpenStreetMap';
    row.telephoneRuleVersion = item.ruleVersion;
    applied += 1;
  }
}

if (invalid) throw new Error(`Invalid ${PHASE} native metadata rows/claims=${invalid}`);
const afterIdentity = rows.map((row) => [row.googlePlaceId, row.name, row.lat, row.lng, row.basicInfoState]);
if (JSON.stringify(beforeIdentity) !== JSON.stringify(afterIdentity)) throw new Error('Native metadata materialization mutated runtime identity/core geometry');
if (rows.length !== stats.inventoryTotal || new Set(rows.map((r) => r.googlePlaceId)).size !== rows.length) throw new Error('Runtime cardinality changed during native metadata materialization');

stats.telephoneKnown = rows.filter((r) => String(r.telephone || '').trim()).length;
stats.cardPaymentKnown = rows.filter((r) => typeof r.cardPaymentAvailable === 'boolean').length;
stats.wifiKnown = rows.filter((r) => typeof r.wifiAvailable === 'boolean').length;
stats.barrierFreeKnown = rows.filter((r) => typeof r.barrierFree === 'boolean').length;
stats.smokingPolicyKnown = rows.filter((r) => ['non_smoking','smoking_allowed','partial_non_smoking','outside_only','dedicated_smoking_area'].includes(r.smokingPolicy)).length;
stats.reviewedNativeContactOverlaySummary = overlay.summary || {};
if (PHASE === 'overture') {
  stats.telephoneAppliedFromReviewedOverture = applied;
  stats.telephoneReviewedOvertureSkippedExisting = skippedExisting;
  stats.telephoneReviewedOvertureSkippedUnpublished = skippedUnpublished;
} else if (PHASE === 'osm-basic-practical') {
  stats.practicalAppliedFromReviewedBasicOsmRows = practicalAppliedRows;
  stats.practicalAppliedFromReviewedBasicOsmFields = practicalFieldApplied;
} else {
  stats.telephoneAppliedFromReviewedOsm = applied;
  stats.telephoneReviewedOsmSkippedExisting = skippedExisting;
  stats.telephoneReviewedOsmSkippedUnpublished = skippedUnpublished;
  stats.practicalAppliedFromReviewedHistoricalOsmRows = practicalAppliedRows;
  stats.practicalAppliedFromReviewedHistoricalOsmFields = practicalFieldApplied;
}

fs.writeFileSync(
  RUNTIME,
  `// Generated from the frozen Google Place ID catalog. ID-only entries stay internal until a real source-backed name is available.\n` +
  `window.GOOGLE_INVENTORY_RESTAURANTS=${JSON.stringify(rows)};\n` +
  `window.GOOGLE_INVENTORY_STATS=${JSON.stringify(stats)};\n`,
  'utf8'
);

console.log(JSON.stringify({
  phase: PHASE,
  appliedTelephone: applied,
  practicalAppliedRows,
  practicalFieldApplied,
  skippedExisting,
  skippedUnpublished,
  telephoneKnown: stats.telephoneKnown,
  cardPaymentKnown: stats.cardPaymentKnown,
  wifiKnown: stats.wifiKnown,
  barrierFreeKnown: stats.barrierFreeKnown,
  smokingPolicyKnown: stats.smokingPolicyKnown,
  inventoryTotal: rows.length
}));
