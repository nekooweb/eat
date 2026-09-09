#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const RUNTIME = path.join(DATA, 'google_inventory_runtime.js');
const QUARANTINE = path.join(DATA, 'source_field_quarantine.json');

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
function hostOf(value) {
  try { return new URL(String(value || '').trim()).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}
function hostMatches(host, blocked) {
  return host === blocked || host.endsWith(`.${blocked}`);
}

const quarantine = JSON.parse(fs.readFileSync(QUARANTINE, 'utf8'));
if (
  quarantine.schemaVersion !== 1
  || quarantine.policy?.fieldLevelOnly !== true
  || quarantine.policy?.identityMutationAllowed !== false
  || quarantine.policy?.catalogNameMutationAllowed !== false
  || quarantine.policy?.coordinateMutationAllowed !== false
  || quarantine.policy?.networkRequests !== 0
  || quarantine.policy?.paidGoogleDataApiCalls !== 0
) throw new Error('Invalid source-field quarantine policy');

const { rows, stats } = parseRuntime();
const beforeIdentity = rows.map((row) => [row.googlePlaceId, row.name, row.lat, row.lng, row.basicInfoState, row.sourceProvider, row.sourceProviderId]);
const byId = new Map(rows.map((row) => [row.googlePlaceId, row]));
let appliedRows = 0;
let removedWebsiteValues = 0;
let removedProviderTelephones = 0;
let missingTargets = 0;
const applied = [];

for (const rule of quarantine.rows || []) {
  const row = byId.get(rule.googlePlaceId);
  if (!row) {
    missingTargets += 1;
    continue;
  }
  if (rule.catalogName && String(row.name || '').trim() !== String(rule.catalogName).trim()) {
    throw new Error(`Source-field quarantine target name drift: ${rule.googlePlaceId}: ${row.name}`);
  }
  if (rule.provider && row.sourceProvider && row.sourceProvider !== rule.provider) {
    throw new Error(`Source-field quarantine provider drift: ${rule.googlePlaceId}: ${row.sourceProvider}`);
  }
  if (rule.providerId && row.sourceProviderId && row.sourceProviderId !== rule.providerId) {
    throw new Error(`Source-field quarantine providerId drift: ${rule.googlePlaceId}: ${row.sourceProviderId}`);
  }

  let changed = false;
  const blockedHosts = (rule.blockedWebsiteHosts || []).map((value) => String(value || '').toLowerCase().replace(/^www\./, '')).filter(Boolean);
  if (blockedHosts.length && Array.isArray(row.sourceWebsites)) {
    const before = row.sourceWebsites.length;
    row.sourceWebsites = row.sourceWebsites.filter((value) => {
      const host = hostOf(value);
      return !blockedHosts.some((blocked) => hostMatches(host, blocked));
    });
    const removed = before - row.sourceWebsites.length;
    if (removed) {
      removedWebsiteValues += removed;
      changed = true;
    }
    if (!row.sourceWebsites.length) delete row.sourceWebsites;
  }

  if (
    rule.blockProviderTelephone === true
    && String(row.telephoneProvider || '') === String(rule.provider || '')
  ) {
    for (const field of ['telephone', 'telephoneSourceUrl', 'telephoneCheckedAt', 'telephoneProvider', 'telephoneRuleVersion']) {
      if (Object.hasOwn(row, field)) delete row[field];
    }
    removedProviderTelephones += 1;
    changed = true;
  }

  if (changed) {
    appliedRows += 1;
    row.sourceFieldQuarantineApplied = true;
    row.sourceFieldQuarantineCheckedAt = quarantine.checkedAt || null;
    applied.push({
      googlePlaceId: rule.googlePlaceId,
      provider: rule.provider || null,
      providerId: rule.providerId || null,
      blockedWebsiteHosts: blockedHosts,
      providerTelephoneBlocked: rule.blockProviderTelephone === true
    });
  }
}

const afterIdentity = rows.map((row) => [row.googlePlaceId, row.name, row.lat, row.lng, row.basicInfoState, row.sourceProvider, row.sourceProviderId]);
if (JSON.stringify(beforeIdentity) !== JSON.stringify(afterIdentity)) throw new Error('Source-field quarantine mutated identity/core geometry');
if (rows.length !== stats.inventoryTotal || new Set(rows.map((row) => row.googlePlaceId)).size !== rows.length) throw new Error('Source-field quarantine changed runtime cardinality');

for (const rule of quarantine.rows || []) {
  const row = byId.get(rule.googlePlaceId);
  if (!row) continue;
  for (const blocked of rule.blockedWebsiteHosts || []) {
    if ((row.sourceWebsites || []).some((value) => hostMatches(hostOf(value), String(blocked).toLowerCase().replace(/^www\./, '')))) {
      throw new Error(`Quarantined website survived runtime materialization: ${rule.googlePlaceId}: ${blocked}`);
    }
  }
  if (rule.blockProviderTelephone === true && String(row.telephoneProvider || '') === String(rule.provider || '')) {
    throw new Error(`Quarantined provider telephone survived runtime materialization: ${rule.googlePlaceId}`);
  }
}

stats.telephoneKnown = rows.filter((row) => String(row.telephone || '').trim()).length;
stats.sourceFieldQuarantineRows = (quarantine.rows || []).length;
stats.sourceFieldQuarantineAppliedRows = appliedRows;
stats.sourceFieldQuarantineRemovedWebsiteValues = removedWebsiteValues;
stats.sourceFieldQuarantineRemovedProviderTelephones = removedProviderTelephones;
stats.sourceFieldQuarantineMissingTargets = missingTargets;

fs.writeFileSync(
  RUNTIME,
  `// Generated from the frozen Google Place ID catalog. ID-only entries stay internal until a real source-backed name is available.\n` +
  `window.GOOGLE_INVENTORY_RESTAURANTS=${JSON.stringify(rows)};\n` +
  `window.GOOGLE_INVENTORY_STATS=${JSON.stringify(stats)};\n`,
  'utf8'
);

console.log(JSON.stringify({
  status: 'pass',
  quarantineRows: (quarantine.rows || []).length,
  appliedRows,
  removedWebsiteValues,
  removedProviderTelephones,
  missingTargets,
  telephoneKnown: stats.telephoneKnown,
  identityChanges: 0,
  paidGoogleDataApiCalls: 0,
  applied
}));
