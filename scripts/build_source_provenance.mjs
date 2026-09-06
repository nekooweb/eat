#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(DATA, 'source_provenance.js');

const norm = (value) => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s　・･’'"\-—_()（）\[\]【】「」『』&＆]+/g, '');
const unique = (values) => [...new Set(values.filter(Boolean))];
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const validUrl = (value) => /^https:\/\//.test(String(value || ''));
const forbiddenProvider = (value) => /google/i.test(String(value || ''));

const sandbox = { window: { RESTAURANTS: [] }, console };
vm.createContext(sandbox);

const sourceFiles = fs.readdirSync(DATA)
  .filter((filename) => /^source_enrichment(?:_[a-z0-9-]+)?\.js$/i.test(filename))
  .sort();
for (const filename of sourceFiles) {
  vm.runInContext(fs.readFileSync(path.join(DATA, filename), 'utf8'), sandbox, { filename });
}

const productionSandbox = { window: {}, console };
vm.createContext(productionSandbox);
vm.runInContext(fs.readFileSync(path.join(DATA, 'production_area1.js'), 'utf8'), productionSandbox, {
  filename: 'production_area1.js'
});
const production = productionSandbox.window.PRODUCTION_RESTAURANTS || [];
const productionById = new Map(production.map((row) => [row.googlePlaceId, row]));
const productionIdsByName = new Map();
for (const row of production) {
  const key = norm(row.name);
  if (!key) continue;
  if (!productionIdsByName.has(key)) productionIdsByName.set(key, new Set());
  productionIdsByName.get(key).add(row.googlePlaceId);
}

const linksById = new Map();
const rows = sandbox.window.RESTAURANTS || [];
let exactAttachedRows = 0;
let nameAttachedRows = 0;
let skippedRefs = 0;

function resolveProductionId(row) {
  if (row.googlePlaceId && productionById.has(row.googlePlaceId)) {
    exactAttachedRows += 1;
    return row.googlePlaceId;
  }
  if (row.googlePlaceId) return null;
  const ids = productionIdsByName.get(norm(row.name));
  if (ids?.size === 1) {
    nameAttachedRows += 1;
    return [...ids][0];
  }
  return null;
}

function mergeRef(placeId, row, ref) {
  if (!validUrl(ref?.url) || forbiddenProvider(ref?.provider) || forbiddenProvider(row?.source)) {
    skippedRefs += 1;
    return;
  }
  const provider = String(ref.provider || row.source || 'source').trim();
  const url = String(ref.url).trim();
  const key = `${provider}\n${url}`;
  if (!linksById.has(placeId)) linksById.set(placeId, new Map());
  const bucket = linksById.get(placeId);
  const existing = bucket.get(key) || {
    provider,
    url,
    fields: [],
    checkedAt: null
  };
  existing.fields = unique([...existing.fields, ...(ref.fields || []).map(String)]).sort();
  if (validDate(ref.checkedAt) && (!existing.checkedAt || ref.checkedAt > existing.checkedAt)) {
    existing.checkedAt = ref.checkedAt;
  }
  if (ref.priceEvidenceClass) existing.priceEvidenceClass = String(ref.priceEvidenceClass);
  if (ref.derivationMethod) existing.derivationMethod = String(ref.derivationMethod);
  bucket.set(key, existing);
}

for (const row of rows) {
  if (!Array.isArray(row.sourceRefs) || row.sourceRefs.length === 0) continue;
  const placeId = resolveProductionId(row);
  if (!placeId) continue;
  for (const ref of row.sourceRefs) mergeRef(placeId, row, ref);
}

const overlayRows = [...linksById.entries()]
  .map(([googlePlaceId, bucket]) => {
    const sourceLinks = [...bucket.values()]
      .map((ref) => ({
        ...ref,
        ...(ref.checkedAt ? {} : { checkedAt: null })
      }))
      .sort((a, b) => (b.checkedAt || '').localeCompare(a.checkedAt || '') || a.provider.localeCompare(b.provider));
    const sourceClaimedFields = unique(sourceLinks.flatMap((ref) => ref.fields)).sort();
    const dates = sourceLinks.map((ref) => ref.checkedAt).filter(validDate).sort();
    return {
      googlePlaceId,
      sourceLinks,
      sourceClaimedFields,
      sourceLastCheckedAt: dates.at(-1) || null
    };
  })
  .sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));

const providerCounts = {};
for (const row of overlayRows) {
  for (const provider of unique(row.sourceLinks.map((ref) => ref.provider))) {
    providerCounts[provider] = (providerCounts[provider] || 0) + 1;
  }
}

const summary = {
  productionEntities: production.length,
  rowsWithPublicSourceLinks: overlayRows.length,
  totalPublicSourceLinks: overlayRows.reduce((sum, row) => sum + row.sourceLinks.length, 0),
  rowsWithClaimedFields: overlayRows.filter((row) => row.sourceClaimedFields.length).length,
  rowsWithCheckedAt: overlayRows.filter((row) => row.sourceLastCheckedAt).length,
  providerCounts,
  exactAttachedSourceRows: exactAttachedRows,
  uniqueNameAttachedSourceRows: nameAttachedRows,
  skippedGoogleOrInvalidRefs: skippedRefs
};

const payload = {
  schemaVersion: 1,
  policy: {
    publicHttpsOnly: true,
    googleRefsExcluded: true,
    claimsRemainSourceSpecific: true
  },
  summary,
  rows: overlayRows
};

const runtimeKeys = ['sourceLinks', 'sourceClaimedFields', 'sourceLastCheckedAt'];
const output = [
  '// Auto-generated public source provenance overlay. Do not edit directly.',
  `window.SOURCE_PROVENANCE=${JSON.stringify(payload)};`,
  'if (Array.isArray(window.PRODUCTION_RESTAURANTS)) {',
  '  const byId=new Map(window.PRODUCTION_RESTAURANTS.map((row)=>[row.googlePlaceId,row]));',
  `  const keys=${JSON.stringify(runtimeKeys)};`,
  '  for (const meta of window.SOURCE_PROVENANCE.rows) {',
  '    const row=byId.get(meta.googlePlaceId);',
  '    if (!row) continue;',
  '    for (const key of keys) if (meta[key] != null) row[key]=meta[key];',
  '  }',
  '}',
  ''
].join('\n');

fs.writeFileSync(OUT, output, 'utf8');
console.log(JSON.stringify(summary));
