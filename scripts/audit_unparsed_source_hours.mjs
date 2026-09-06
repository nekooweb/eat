#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';

function loadJs(path, seed = {}) {
  const sandbox = { window: seed, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path, 'utf8'), sandbox, { filename: path });
  return sandbox.window;
}

const prod = loadJs('data/production_area1.js').PRODUCTION_RESTAURANTS || [];
const factsPayload = loadJs('data/source_facts.js').SOURCE_FACTS || { rows: [] };
const factsById = new Map((factsPayload.rows || []).map((row) => [row.googlePlaceId, row.sourceFacts || []]));

function shape(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/\d{1,2}:\d{2}/g, 'TIME')
    .replace(/\d+/g, 'N')
    .replace(/\s+/g, ' ')
    .trim();
}

const rows = [];
for (const row of prod) {
  if (row.openingHours) continue;
  const sourceFacts = factsById.get(row.googlePlaceId) || [];
  const candidates = sourceFacts
    .filter((fact) => typeof fact.openingHoursRaw === 'string' && fact.openingHoursRaw.trim())
    .map((fact) => ({
      provider: fact.provider,
      openingHoursRaw: fact.openingHoursRaw.trim(),
      closedDays: Array.isArray(fact.closedDays) ? fact.closedDays : [],
      closedNote: fact.closedNote || null,
      pattern: shape(fact.openingHoursRaw)
    }));
  if (!candidates.length) continue;
  rows.push({
    googlePlaceId: row.googlePlaceId,
    name: row.name,
    sourceCandidates: candidates
  });
}

const providerCounts = {};
const patternCounts = new Map();
for (const row of rows) {
  for (const candidate of row.sourceCandidates) {
    providerCounts[candidate.provider] = (providerCounts[candidate.provider] || 0) + 1;
    const key = candidate.pattern;
    patternCounts.set(key, (patternCounts.get(key) || 0) + 1);
  }
}
const topPatterns = [...patternCounts.entries()]
  .map(([pattern, count]) => ({ pattern, count }))
  .sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern))
  .slice(0, 40);

console.log(JSON.stringify({
  canonicalRowsWithoutNormalizedHours: prod.filter((row) => !row.openingHours).length,
  missingHoursRowsWithMaintainedRawEvidence: rows.length,
  providerRawHourRecords: providerCounts,
  topPatterns,
  rows
}, null, 2));
