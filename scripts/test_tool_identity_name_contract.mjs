#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';

const RUNTIME = 'data/google_inventory_runtime.js';
const MAIDREAMIN_PLACE_ID = 'ChIJAQA0URyMGGARcHdnj-vbe6s';
const EXPECTED_CATALOG_NAME = 'Maidreamin Akihabara Himitsukichi';
const SOURCE_ALIAS_REGRESSION = 'めいどりーみん 秋葉原 AKIBA';

function loadRuntime() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(RUNTIME, 'utf8'), sandbox, { filename: RUNTIME });
  const rows = sandbox.window.GOOGLE_INVENTORY_RESTAURANTS || [];
  const stats = sandbox.window.GOOGLE_INVENTORY_STATS || {};
  if (stats.catalogTotal !== 2804) throw new Error('runtime catalogTotal must remain 2804');
  return new Map(rows.map((row) => [row.googlePlaceId, row]));
}

function toolIdentity(runtimeById, googlePlaceId, sourceAlias = '') {
  const runtime = runtimeById.get(googlePlaceId);
  const name = String(runtime?.name || '').trim();
  if (!runtime || runtime.nameKnown !== true || !name) return null;
  return {
    googlePlaceId,
    name,
    sourceAlias: String(sourceAlias || '').trim() || null
  };
}

const runtimeById = loadRuntime();
const maidreamin = runtimeById.get(MAIDREAMIN_PLACE_ID);
if (!maidreamin) throw new Error('Maidreamin regression Place ID is missing from public runtime');
if (maidreamin.name !== EXPECTED_CATALOG_NAME) {
  throw new Error(`catalog identity drifted: expected ${EXPECTED_CATALOG_NAME}, got ${maidreamin.name}`);
}

const task = toolIdentity(runtimeById, MAIDREAMIN_PLACE_ID, SOURCE_ALIAS_REGRESSION);
if (!task) throw new Error('Maidreamin tool identity unexpectedly unavailable');
if (task.name !== EXPECTED_CATALOG_NAME) throw new Error('source alias replaced the catalog tool identity name');
if (task.sourceAlias !== SOURCE_ALIAS_REGRESSION) throw new Error('source alias was not preserved separately');
if (task.name === task.sourceAlias) throw new Error('tool identity and source alias were conflated');

const imageCollector = fs.readFileSync('scripts/collect_official_menu_image_text_evidence.mjs', 'utf8');
const embeddedAudit = fs.readFileSync('scripts/audit_official_embedded_menu_json.mjs', 'utf8');
for (const [label, source] of [['image collector', imageCollector], ['embedded JSON audit', embeddedAudit]]) {
  if (!source.includes("toolIdentityNameSource")) throw new Error(`${label} is missing the tool identity-name policy`);
  if (!source.includes("sourceOfficialNameMayReplaceToolIdentity")) throw new Error(`${label} is missing the source-alias non-replacement policy`);
}
if (/name\s*:\s*row\.officialName/.test(imageCollector)) throw new Error('image collector still promotes officialName into task.name');
if (/\?\.name\s*\|\|\s*r\.officialName/.test(embeddedAudit)) throw new Error('embedded JSON audit still falls back from runtime name to officialName');

console.log(JSON.stringify({
  status: 'pass',
  googlePlaceId: MAIDREAMIN_PLACE_ID,
  catalogName: task.name,
  sourceAlias: task.sourceAlias,
  invariant: 'runtime/catalog name is tool identity; source official names are aliases only'
}));
