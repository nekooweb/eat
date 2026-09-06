#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const sandbox = { window: {}, console };
vm.createContext(sandbox);

for (const filename of [
  'production_area1.js',
  'source_provenance.js',
  'source_facts.js',
  'hotpepper_rich_metadata.js'
]) {
  const full = path.join(DATA, filename);
  if (!fs.existsSync(full) || fs.statSync(full).size === 0) throw new Error(`missing runtime file: ${filename}`);
  vm.runInContext(fs.readFileSync(full, 'utf8'), sandbox, { filename });
}

const production = sandbox.window.PRODUCTION_RESTAURANTS || [];
const rich = sandbox.window.HOTPEPPER_RICH_METADATA || { rows: [], summary: {} };
const provenance = sandbox.window.SOURCE_PROVENANCE || { rows: [], summary: {} };
const sourceFacts = sandbox.window.SOURCE_FACTS || { rows: [], summary: {} };
const ids = new Set(production.map((row) => row.googlePlaceId));

const missingRich = rich.rows.filter((row) => !ids.has(row.googlePlaceId));
const missingProvenance = provenance.rows.filter((row) => !ids.has(row.googlePlaceId));
const missingFacts = sourceFacts.rows.filter((row) => !ids.has(row.googlePlaceId));
const duplicateRich = rich.rows.length - new Set(rich.rows.map((row) => row.googlePlaceId)).size;
const duplicateProvenance = provenance.rows.length - new Set(provenance.rows.map((row) => row.googlePlaceId)).size;
const duplicateFacts = sourceFacts.rows.length - new Set(sourceFacts.rows.map((row) => row.googlePlaceId)).size;

if (missingRich.length) throw new Error(`rich metadata unattached rows: ${missingRich.length}`);
if (missingProvenance.length) throw new Error(`source provenance unattached rows: ${missingProvenance.length}`);
if (missingFacts.length) throw new Error(`source facts unattached rows: ${missingFacts.length}`);
if (duplicateRich) throw new Error(`duplicate rich metadata IDs: ${duplicateRich}`);
if (duplicateProvenance) throw new Error(`duplicate source provenance IDs: ${duplicateProvenance}`);
if (duplicateFacts) throw new Error(`duplicate source facts identity rows: ${duplicateFacts}`);
if (rich.summary.manualReviewedRows !== 7) {
  throw new Error(`expected 7 manually reviewed rich rows, got ${rich.summary.manualReviewedRows}`);
}
if (rich.rows.length !== 135) throw new Error(`expected 135 rich metadata rows, got ${rich.rows.length}`);
if (provenance.summary.rowsWithPublicSourceLinks !== provenance.rows.length) {
  throw new Error('source provenance summary mismatch');
}
if (sourceFacts.summary.rowsWithSourceFacts !== sourceFacts.rows.length) {
  throw new Error('source facts summary mismatch');
}
if (sourceFacts.summary.providerFactRecords !== sourceFacts.rows.reduce((sum, row) => sum + row.sourceFacts.length, 0)) {
  throw new Error('source facts provider-record summary mismatch');
}
if (provenance.rows.some((row) => row.sourceLinks.some((ref) => /google/i.test(ref.provider || '')))) {
  throw new Error('Google source reference leaked into public provenance overlay');
}
if (sourceFacts.rows.some((row) => row.sourceFacts.some((fact) =>
  /google/i.test(fact.provider || '') || Object.keys(fact).some((key) => /^google/i.test(key))))) {
  throw new Error('Google response content leaked into provider source facts overlay');
}

const attachedRich = production.filter((row) => row.hotpepperId).length;
const attachedProvenance = production.filter((row) => Array.isArray(row.sourceLinks) && row.sourceLinks.length).length;
const attachedFacts = production.filter((row) => Array.isArray(row.sourceFacts) && row.sourceFacts.length).length;
if (attachedRich !== rich.rows.length) throw new Error(`rich runtime attachment mismatch: ${attachedRich}`);
if (attachedProvenance !== provenance.rows.length) throw new Error(`provenance runtime attachment mismatch: ${attachedProvenance}`);
if (attachedFacts !== sourceFacts.rows.length) throw new Error(`source facts runtime attachment mismatch: ${attachedFacts}`);

console.log(JSON.stringify({
  status: 'pass',
  productionRows: production.length,
  richMetadataRows: rich.rows.length,
  richSummary: rich.summary,
  provenanceRows: provenance.rows.length,
  provenanceSummary: provenance.summary,
  sourceFactRows: sourceFacts.rows.length,
  sourceFactSummary: sourceFacts.summary
}));
