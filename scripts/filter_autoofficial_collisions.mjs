#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const AUTO_PATH = path.join(DATA, 'source_enrichment_autoofficial.js');

function readShard(file, sandbox) {
  vm.runInContext(fs.readFileSync(path.join(DATA, file), 'utf8'), sandbox, { filename: file });
}

function loadRows(file) {
  const sandbox = { window: { RESTAURANTS: [], FEATURED_DISHES: [] } };
  vm.createContext(sandbox);
  readShard(file, sandbox);
  return sandbox.window.RESTAURANTS || [];
}

if (!fs.existsSync(AUTO_PATH)) throw new Error('source_enrichment_autoofficial.js is missing');
const autoRows = loadRows('source_enrichment_autoofficial.js');

const otherFiles = fs.readdirSync(DATA)
  .filter((file) => /^source_enrichment(?:_[a-z0-9-]+)?\.js$/i.test(file))
  .filter((file) => file !== 'source_enrichment_autoofficial.js')
  .sort();
const otherSandbox = { window: { RESTAURANTS: [], FEATURED_DISHES: [] } };
vm.createContext(otherSandbox);
for (const file of otherFiles) readShard(file, otherSandbox);
const otherOfficialIds = new Set((otherSandbox.window.RESTAURANTS || [])
  .filter((row) => row?.source === 'official' && row?.googlePlaceId)
  .map((row) => row.googlePlaceId));

const meaningfulKeys = [
  'address', 'openingHoursRaw', 'cuisine', 'budget', 'dishes', 'closure', 'hyakumeiten'
];
const safe = [];
const dropped = [];
for (const row of autoRows) {
  if (!otherOfficialIds.has(row.googlePlaceId)) {
    safe.push(row);
    continue;
  }
  const meaningful = meaningfulKeys.filter((key) => {
    const value = row[key];
    return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== '';
  });
  const nonNameFields = (row.sourceRefs || [])
    .flatMap((ref) => ref?.provider === 'official' ? (ref.fields || []) : [])
    .filter((field) => field !== 'name');
  if (meaningful.length || nonNameFields.length) {
    throw new Error(`auto-official collision carries fields for ${row.googlePlaceId}: ${[...meaningful, ...nonNameFields].join(',')}`);
  }
  dropped.push({ googlePlaceId: row.googlePlaceId, name: row.name });
}

const lines = [
  '// Stable high-confidence official-source enrichments generated from independently fetched official pages.',
  '// Name-only rows are removed when another official provider row already exists for the same Place ID.',
  'window.RESTAURANTS.push(',
  ...safe.map((row, index) => `  ${JSON.stringify(row)}${index === safe.length - 1 ? '' : ','}`),
  ');',
  ''
];
fs.writeFileSync(AUTO_PATH, lines.join('\n'), 'utf8');
console.log(JSON.stringify({
  before: autoRows.length,
  after: safe.length,
  droppedNameOnlyCollisions: dropped.length,
  dropped
}));
