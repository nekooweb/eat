#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const TARGET_PID = 'ChIJ73iZqQeMGGAR1UPN4hA0-bA';
const TARGET_NAME = 'Minatoya';
const TARGET_PROVIDER = 'Overture Maps';
const TARGET_PROVIDER_ID = 'afc0e565-78bf-42da-be0e-33898c9ddd8c';
const BAD_HOST = 'yumeji-minatoya.co.jp';

function hostOf(value) {
  try { return new URL(String(value || '').trim()).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}
function matchesHost(host, blocked) {
  return host === blocked || host.endsWith(`.${blocked}`);
}
function loadRuntime() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DATA, 'google_inventory_runtime.js'), 'utf8'), sandbox, { filename: 'google_inventory_runtime.js' });
  return sandbox.window;
}

const quarantine = JSON.parse(fs.readFileSync(path.join(DATA, 'source_field_quarantine.json'), 'utf8'));
if (
  quarantine.schemaVersion !== 1
  || quarantine.policy?.fieldLevelOnly !== true
  || quarantine.policy?.identityMutationAllowed !== false
  || quarantine.policy?.catalogNameMutationAllowed !== false
  || quarantine.policy?.coordinateMutationAllowed !== false
  || quarantine.policy?.paidGoogleDataApiCalls !== 0
) throw new Error('Invalid source-field quarantine regression policy');

const rule = (quarantine.rows || []).find((row) => row.googlePlaceId === TARGET_PID);
if (!rule) throw new Error('Minatoya quarantine rule missing');
if (rule.catalogName !== TARGET_NAME || rule.provider !== TARGET_PROVIDER || rule.providerId !== TARGET_PROVIDER_ID) {
  throw new Error('Minatoya quarantine identity/provider fingerprint drifted');
}
if (!(rule.blockedWebsiteHosts || []).some((host) => matchesHost(BAD_HOST, String(host || '').toLowerCase().replace(/^www\./, '')))) {
  throw new Error('Minatoya bad gallery host is no longer quarantined');
}
if (rule.blockProviderTelephone !== true) throw new Error('Minatoya contaminated Overture telephone is no longer quarantined');

const runtime = loadRuntime();
const rows = runtime.GOOGLE_INVENTORY_RESTAURANTS || [];
const stats = runtime.GOOGLE_INVENTORY_STATS || {};
if (stats.catalogTotal !== 2804 || rows.length !== 1422) throw new Error(`Unexpected runtime baseline: ${stats.catalogTotal}/${rows.length}`);
const target = rows.find((row) => row.googlePlaceId === TARGET_PID);
if (!target) throw new Error('Minatoya target missing from public runtime');
if (target.name !== TARGET_NAME) throw new Error(`Quarantine mutated catalog identity name: ${target.name}`);
if (target.sourceProvider && target.sourceProvider !== TARGET_PROVIDER) throw new Error(`Quarantine changed source provider identity: ${target.sourceProvider}`);
if (target.sourceProviderId && target.sourceProviderId !== TARGET_PROVIDER_ID) throw new Error(`Quarantine changed source provider ID: ${target.sourceProviderId}`);
if ((target.sourceWebsites || []).some((url) => matchesHost(hostOf(url), BAD_HOST))) {
  throw new Error('Quarantined Yumeji gallery host leaked into public runtime');
}
if (target.telephoneProvider === TARGET_PROVIDER) {
  throw new Error(`Quarantined Overture telephone leaked into public runtime: ${target.telephone || ''}`);
}
if (stats.sourceFieldQuarantineRows < 1 || stats.sourceFieldQuarantineAppliedRows < 1) {
  throw new Error(`Quarantine was not applied during reload: rows=${stats.sourceFieldQuarantineRows}, applied=${stats.sourceFieldQuarantineAppliedRows}`);
}
if (stats.sourceFieldQuarantineRemovedWebsiteValues < 1) throw new Error('Expected contaminated website removal was not recorded');
if (stats.sourceFieldQuarantineRemovedProviderTelephones < 1) throw new Error('Expected contaminated provider telephone removal was not recorded');

console.log(JSON.stringify({
  status: 'pass',
  googlePlaceId: TARGET_PID,
  name: target.name,
  sourceProvider: target.sourceProvider || null,
  sourceProviderId: target.sourceProviderId || null,
  telephoneProvider: target.telephoneProvider || null,
  telephone: target.telephone || null,
  sourceWebsites: target.sourceWebsites || [],
  quarantineRows: stats.sourceFieldQuarantineRows,
  quarantineAppliedRows: stats.sourceFieldQuarantineAppliedRows,
  removedWebsiteValues: stats.sourceFieldQuarantineRemovedWebsiteValues,
  removedProviderTelephones: stats.sourceFieldQuarantineRemovedProviderTelephones,
  paidGoogleDataApiCalls: 0,
  identityChanges: 0
}));
