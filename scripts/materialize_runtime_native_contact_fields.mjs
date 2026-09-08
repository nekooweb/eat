import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const RUNTIME = path.join(DATA, 'google_inventory_runtime.js');
const OVERLAY = path.join(DATA, 'reviewed_native_contact_runtime_overlay.json');
const PHASE = String(process.argv[2] || '').trim().toLowerCase();
if (!['overture', 'osm'].includes(PHASE)) {
  throw new Error('usage: node scripts/materialize_runtime_native_contact_fields.mjs overture|osm');
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

const overlay = JSON.parse(fs.readFileSync(OVERLAY, 'utf8'));
const policy = overlay.policy || {};
if (
  overlay.ruleVersion !== 'reviewed-native-contact-runtime-v1'
  || policy.sourceBackedOnly !== true
  || policy.reviewedBindingsOnly !== true
  || policy.exactRetainedProviderIdOnly !== true
  || policy.sameCrossLayerCollisionLogicAsSQLiteMaster !== true
  || policy.networkRequests !== 0
  || policy.paidGoogleDataApiCalls !== 0
  || policy.googleDisplayPayloadPersisted !== false
  || policy.identityChanges !== 0
) throw new Error('Invalid reviewed native contact overlay policy');

const sourceRows = PHASE === 'overture' ? (overlay.overtureRows || []) : (overlay.osmRows || []);
const expectedProvider = PHASE === 'overture' ? 'Overture Maps' : 'OpenStreetMap';
const expectedRule = PHASE === 'overture' ? policy.overturePhoneRule : policy.osmPhoneRule;
const { rows, stats } = parseRuntime();
const beforeIdentity = rows.map((row) => [row.googlePlaceId, row.name, row.lat, row.lng, row.basicInfoState]);
const byId = new Map(rows.map((row) => [row.googlePlaceId, row]));
let applied = 0;
let skippedExisting = 0;
let skippedUnpublished = 0;
let invalid = 0;

for (const item of sourceRows) {
  if (item.provider !== expectedProvider || item.binding?.state !== 'reviewed' || item.ruleVersion !== expectedRule) {
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
  row.telephoneProvider = expectedProvider;
  row.telephoneRuleVersion = item.ruleVersion;
  applied += 1;
}

if (invalid) throw new Error(`Invalid ${PHASE} native telephone rows=${invalid}`);
const afterIdentity = rows.map((row) => [row.googlePlaceId, row.name, row.lat, row.lng, row.basicInfoState]);
if (JSON.stringify(beforeIdentity) !== JSON.stringify(afterIdentity)) throw new Error('Native contact materialization mutated runtime identity/core geometry');
if (rows.length !== stats.inventoryTotal || new Set(rows.map((r) => r.googlePlaceId)).size !== rows.length) throw new Error('Runtime cardinality changed during native contact materialization');

stats.telephoneKnown = rows.filter((r) => String(r.telephone || '').trim()).length;
stats.reviewedNativeContactOverlaySummary = overlay.summary || {};
if (PHASE === 'overture') {
  stats.telephoneAppliedFromReviewedOverture = applied;
  stats.telephoneReviewedOvertureSkippedExisting = skippedExisting;
  stats.telephoneReviewedOvertureSkippedUnpublished = skippedUnpublished;
} else {
  stats.telephoneAppliedFromReviewedOsm = applied;
  stats.telephoneReviewedOsmSkippedExisting = skippedExisting;
  stats.telephoneReviewedOsmSkippedUnpublished = skippedUnpublished;
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
  sourceRows: sourceRows.length,
  applied,
  skippedExisting,
  skippedUnpublished,
  telephoneKnown: stats.telephoneKnown,
  inventoryTotal: rows.length
}));
