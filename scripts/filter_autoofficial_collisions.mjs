#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const AUTO_FILE = 'source_enrichment_autoofficial.js';
const MERGE_FILE = 'source_enrichment_zzzzzzautoofficialmerge.js';
const AUTO_PATH = path.join(DATA, AUTO_FILE);
const MERGE_PATH = path.join(DATA, MERGE_FILE);

function readShard(file, sandbox) {
  vm.runInContext(fs.readFileSync(path.join(DATA, file), 'utf8'), sandbox, { filename: file });
}

function loadRows(file) {
  const sandbox = { window: { RESTAURANTS: [], FEATURED_DISHES: [] } };
  vm.createContext(sandbox);
  readShard(file, sandbox);
  return sandbox.window.RESTAURANTS || [];
}

function meaningfulFields(row) {
  const fields = [];
  if (row.address) fields.push('address');
  if (row.openingHoursRaw) fields.push('hours');
  if (row.cuisine) fields.push('cuisine');
  if (row.budget) fields.push('budget');
  if (Array.isArray(row.dishes) && row.dishes.length) fields.push('dishes');
  if (row.closure) fields.push('closure');
  if (row.hyakumeiten) fields.push('hyakumeiten');
  return [...new Set(fields)];
}

function sourceUrlForFields(row, fields) {
  for (const ref of row.sourceRefs || []) {
    if (ref?.provider !== 'official' || !ref.url) continue;
    if ((ref.fields || []).some((field) => fields.includes(field))) return ref.url;
  }
  return (row.sourceRefs || []).find((ref) => ref?.provider === 'official' && ref.url)?.url || null;
}

if (!fs.existsSync(AUTO_PATH)) throw new Error(`${AUTO_FILE} is missing`);
const autoRows = loadRows(AUTO_FILE);

const otherFiles = fs.readdirSync(DATA)
  .filter((file) => /^source_enrichment(?:_[a-z0-9-]+)?\.js$/i.test(file))
  .filter((file) => file !== AUTO_FILE && file !== MERGE_FILE)
  .sort();
const otherSandbox = { window: { RESTAURANTS: [], FEATURED_DISHES: [] } };
vm.createContext(otherSandbox);
for (const file of otherFiles) readShard(file, otherSandbox);
const otherOfficialIds = new Set((otherSandbox.window.RESTAURANTS || [])
  .filter((row) => row?.source === 'official' && row?.sourceOnly && row?.googlePlaceId)
  .map((row) => row.googlePlaceId));

const safe = [];
const dropped = [];
const mergePatches = [];
for (const row of autoRows) {
  if (!otherOfficialIds.has(row.googlePlaceId)) {
    safe.push(row);
    continue;
  }

  const fields = meaningfulFields(row);
  if (!fields.length) {
    dropped.push({ googlePlaceId: row.googlePlaceId, name: row.name });
    continue;
  }

  const sourceUrl = sourceUrlForFields(row, fields);
  if (!sourceUrl) throw new Error(`meaningful auto-official collision lacks source URL: ${row.googlePlaceId}`);
  mergePatches.push({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    sourceUrl,
    checkedAt: (row.sourceRefs || []).find((ref) => ref?.url === sourceUrl)?.checkedAt || '2026-09-06',
    fields,
    address: row.address || null,
    openingHoursRaw: row.openingHoursRaw || null,
    cuisine: row.cuisine || null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    budget: row.budget || null,
    dishes: Array.isArray(row.dishes) ? row.dishes : [],
    closure: row.closure || null,
    hyakumeiten: row.hyakumeiten || null,
  });
}

const autoLines = [
  '// Stable high-confidence official-source enrichments generated from independently fetched official pages.',
  '// Collisions with pre-existing official rows are removed here and merged later by zzzzzzautoofficialmerge.',
  'window.RESTAURANTS.push(',
  ...safe.map((row, index) => `  ${JSON.stringify(row)}${index === safe.length - 1 ? '' : ','}`),
  ');',
  ''
];
fs.writeFileSync(AUTO_PATH, autoLines.join('\n'), 'utf8');

const mergeLines = [
  '// Generated late official-field merges for Place IDs that already own another official enrichment row.',
  '// In combined loading this mutates the existing official row. Standalone report loaders receive an equivalent synthetic row.',
  `const AUTO_OFFICIAL_MERGE_PATCHES = ${JSON.stringify(mergePatches, null, 2)};`,
  'for (const patch of AUTO_OFFICIAL_MERGE_PATCHES) {',
  "  let row = [...window.RESTAURANTS].reverse().find((item) => item && item.googlePlaceId === patch.googlePlaceId && item.source === 'official' && item.sourceOnly);",
  "  if (!row) {",
  "    row = { id: `src-autoofficial-merge-${patch.googlePlaceId.slice(-12).replace(/[^A-Za-z0-9_-]/g, '')}`, profile: 'TOKYO', area: '地区1️⃣', name: patch.name, googlePlaceId: patch.googlePlaceId, source: 'official', sourceOnly: true, sourceRefs: [] };",
  "    window.RESTAURANTS.push(row);",
  "  }",
  "  if (patch.address) row.address = patch.address;",
  "  if (patch.openingHoursRaw) { row.openingHoursRaw = patch.openingHoursRaw; row.closedDays = []; row.closedNote = null; }",
  "  if (patch.cuisine) { row.cuisine = patch.cuisine; row.tags = Array.isArray(patch.tags) ? [...patch.tags] : [patch.cuisine]; }",
  "  if (patch.budget) row.budget = patch.budget;",
  "  if (Array.isArray(patch.dishes) && patch.dishes.length) row.dishes = [...new Set([...(Array.isArray(row.dishes) ? row.dishes : []), ...patch.dishes])].slice(0, 4);",
  "  if (patch.closure) row.closure = patch.closure;",
  "  if (patch.hyakumeiten) row.hyakumeiten = patch.hyakumeiten;",
  "  row.sourceRefs = Array.isArray(row.sourceRefs) ? row.sourceRefs : [];",
  "  const owned = new Set(patch.fields);",
  "  row.sourceRefs = row.sourceRefs.map((ref) => {",
  "    if (!ref || ref.provider !== 'official') return ref;",
  "    return { ...ref, fields: (ref.fields || []).filter((field) => !owned.has(field)) };",
  "  }).filter((ref) => ref && Array.isArray(ref.fields) && ref.fields.length);",
  "  row.sourceRefs.push({ provider: 'official', url: patch.sourceUrl, checkedAt: patch.checkedAt, fields: [...patch.fields] });",
  '}',
  ''
];
fs.writeFileSync(MERGE_PATH, mergeLines.join('\n'), 'utf8');

console.log(JSON.stringify({
  before: autoRows.length,
  after: safe.length,
  droppedNameOnlyCollisions: dropped.length,
  mergedMeaningfulCollisions: mergePatches.length,
  dropped,
  mergePatches: mergePatches.map((row) => ({ googlePlaceId: row.googlePlaceId, name: row.name, fields: row.fields }))
}));
