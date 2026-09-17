#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { materializePublicHours } from './public_hours_runtime.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = process.argv[2] || path.join(ROOT, '_audit', 'public-hours-runtime-decisions.json');

function parseAssignment(filename, name) {
  const text = fs.readFileSync(path.join(DATA, filename), 'utf8');
  const prefix = `window.${name}=`;
  const start = text.indexOf(prefix);
  if (start < 0) throw new Error(`missing ${name} in ${filename}`);
  const valueStart = start + prefix.length;
  const end = text.indexOf(';\n', valueStart);
  if (end < 0) throw new Error(`cannot parse ${name} in ${filename}`);
  return JSON.parse(text.slice(valueStart, end));
}

function clean(value) { return typeof value === 'string' ? value.trim() : value; }
function shape(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC')
    .replace(/\d{1,2}:\d{2}/g, 'TIME')
    .replace(/\d+/g, 'N')
    .replace(/\s+/g, ' ')
    .trim();
}
function classifyOne(original, sourceFacts) {
  const clone = JSON.parse(JSON.stringify(original));
  const factsMap = new Map([[original.googlePlaceId, sourceFacts || []]]);
  const stats = materializePublicHours([clone], factsMap);
  let decision = 'none';
  if (stats.normalized) decision = 'normalized';
  else if (stats.hiddenConflict) decision = 'conflict';
  else if (stats.hiddenSemantic) decision = 'semantic';
  else if (stats.hiddenUnparseable) decision = 'unparseable';
  else if (stats.noScheduleSource) decision = 'no_source';
  return { decision, hoursReference: clone.hoursReference || null };
}

const rows = parseAssignment('google_inventory_runtime.js', 'GOOGLE_INVENTORY_RESTAURANTS');
const stats = parseAssignment('google_inventory_runtime.js', 'GOOGLE_INVENTORY_STATS');
const sourceFactsDoc = parseAssignment('source_facts.js', 'SOURCE_FACTS');
const sourceFactsById = new Map((sourceFactsDoc.rows || []).map((row) => [row.googlePlaceId, row.sourceFacts || []]));
if (stats.catalogTotal !== 2804 || stats.inventoryTotal !== rows.length || rows.length !== 1422) {
  throw new Error('public hours decision audit requires current complete pre-materialization runtime');
}

const legacyFields = ['openingHours','openingHoursRaw','openingHoursText','closedDays','closedNote','schedule','scheduleText','businessHours','hoursReference'];
const auditRows = [];
const counts = {};
const patternCounts = new Map();
const providerCounts = {};
for (const row of rows) {
  const facts = sourceFactsById.get(row.googlePlaceId) || [];
  const result = classifyOne(row, facts);
  counts[result.decision] = (counts[result.decision] || 0) + 1;
  if (!['unparseable','conflict','semantic'].includes(result.decision)) continue;

  const rawFields = {};
  for (const field of legacyFields) {
    if (Object.hasOwn(row, field) && row[field] != null) rawFields[field] = row[field];
  }
  const factRows = facts
    .filter((fact) => fact && (fact.openingHoursRaw || fact.closedDays || fact.closedNote))
    .map((fact) => ({
      provider: fact.provider || null,
      openingHoursRaw: clean(fact.openingHoursRaw) || null,
      closedDays: Array.isArray(fact.closedDays) ? fact.closedDays : [],
      closedNote: clean(fact.closedNote) || null
    }));
  for (const fact of factRows) if (fact.provider) providerCounts[fact.provider] = (providerCounts[fact.provider] || 0) + 1;

  const rawStrings = [
    row.openingHoursRaw,
    row.openingHoursText,
    row.hoursReference,
    row.scheduleText,
    row.businessHours,
    ...factRows.map((fact) => fact.openingHoursRaw)
  ].filter((value) => typeof value === 'string' && value.trim());
  const patterns = [...new Set(rawStrings.map(shape).filter(Boolean))];
  for (const pattern of patterns) patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);

  auditRows.push({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    basicInfoState: row.basicInfoState || null,
    sourceProvider: row.sourceProvider || row.provider || row.source || null,
    decision: result.decision,
    rawFields,
    sourceFacts: factRows,
    patterns
  });
}

const topPatterns = [...patternCounts.entries()]
  .map(([pattern, count]) => ({ pattern, count }))
  .sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern))
  .slice(0, 80);
const payload = {
  schemaVersion: 1,
  auditedAt: new Date().toISOString(),
  policy: {
    auditOnly: true,
    runtimeMutations: 0,
    parserMutations: 0,
    paidGoogleDataApiCalls: 0,
    usesProductionMaterializerOnPerRowClone: true,
    auditRunsBeforeDestructiveLegacyHoursStripping: true
  },
  summary: {
    catalogTotal: stats.catalogTotal,
    publicRuntimeTotal: rows.length,
    decisionCounts: counts,
    diagnosticRows: auditRows.length,
    unparseableRows: auditRows.filter((row) => row.decision === 'unparseable').length,
    conflictRows: auditRows.filter((row) => row.decision === 'conflict').length,
    semanticRows: auditRows.filter((row) => row.decision === 'semantic').length,
    providerRawFactCounts: providerCounts,
    topPatterns
  },
  rows: auditRows
};
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(payload.summary));
console.log('PUBLIC_HOURS_DIAGNOSTIC_ROWS=' + JSON.stringify(auditRows));
