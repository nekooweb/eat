#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';

const [sourcePath = 'data/source_enrichment_hotpepper.js', reportPath = '/tmp/hotpepper_loaded_lunch_promotion.json'] = process.argv.slice(2);

function loadJs(path, seed = {}) {
  const sandbox = { window: seed };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path, 'utf8'), sandbox, { filename: path });
  return sandbox.window;
}

const queue = JSON.parse(fs.readFileSync('data/area1_enrichment_queue.json', 'utf8'));
const hpPayload = JSON.parse(fs.readFileSync('data/hotpepper_catalog_facts.json', 'utf8'));
const hpById = new Map((hpPayload.rows || []).map((row) => [row.googlePlaceId, row]));
const productionWindow = loadJs('data/production_area1.js');
const production = productionWindow.PRODUCTION_RESTAURANTS || [];
const productionById = new Map(production.map((row) => [row.googlePlaceId, row]));
const sourceWindow = loadJs(sourcePath, { RESTAURANTS: [] });
const rows = Array.isArray(sourceWindow.RESTAURANTS) ? sourceWindow.RESTAURANTS : [];
const sourceById = new Map(rows.map((row) => [row.googlePlaceId, row]));

const isRange = (value) => Array.isArray(value)
  && value.length === 2
  && Number.isFinite(value[0])
  && Number.isFinite(value[1])
  && value[0] >= 0
  && value[1] >= value[0];

const candidates = (queue.items || []).filter((item) =>
  item.currentProduction
  && item.hotpepperAutoEligible
  && item.existingHotpepperFieldCandidates?.includes('lunchBudgetExplicitText')
  && isRange(item.explicitLunchRangeFromLoadedHotpepper)
);

const reportRows = [];
let createdRows = 0;
let updatedRows = 0;

for (const item of candidates) {
  const hp = hpById.get(item.googlePlaceId);
  const current = productionById.get(item.googlePlaceId);
  if (!hp || !current) throw new Error(`missing source/production row: ${item.googlePlaceId}`);
  if (!hp.binding?.autoEligible) throw new Error(`non-auto-eligible binding entered promotion: ${item.googlePlaceId}`);

  const lunch = item.explicitLunchRangeFromLoadedHotpepper;
  const facts = hp.facts || {};
  const sourceUrl = facts.urls?.pc || facts.urls?.mobile;
  if (!sourceUrl || !/^https:\/\//.test(sourceUrl)) throw new Error(`missing source URL: ${item.googlePlaceId}`);
  const evidenceText = [facts.budget?.average, facts.budgetMemo].filter(Boolean).join(' / ');

  let row = sourceById.get(item.googlePlaceId);
  let mode = 'updated-existing-hotpepper-row';
  if (!row) {
    row = {
      id: `src-hotpepper-additive-${hp.hotpepperId || item.googlePlaceId}`,
      profile: 'TOKYO',
      area: '地区1️⃣',
      name: current.name,
      googlePlaceId: item.googlePlaceId,
      source: 'Hot Pepper',
      sourceOnly: true,
      hotpepperId: hp.hotpepperId,
      hotpepperMatchConfidence: hp.binding?.confidence || 'high',
      hotpepperMatchScore: hp.binding?.combinedScore ?? null,
      tags: [],
      lunch: null,
      dishes: [],
      sourceRefs: []
    };
    rows.push(row);
    sourceById.set(item.googlePlaceId, row);
    createdRows += 1;
    mode = 'created-hotpepper-row';
  } else {
    updatedRows += 1;
  }

  if (isRange(row.lunch) && (row.lunch[0] !== lunch[0] || row.lunch[1] !== lunch[1])) {
    throw new Error(`refusing to overwrite existing Hot Pepper lunch: ${item.googlePlaceId}`);
  }
  row.lunch = lunch;

  if (!Array.isArray(row.sourceRefs)) row.sourceRefs = [];
  let ref = row.sourceRefs.find((candidate) =>
    candidate?.provider === 'Hot Pepper'
    && (candidate?.sourceNativeId === hp.hotpepperId || candidate?.url === sourceUrl)
  );
  if (!ref) {
    ref = {
      provider: 'Hot Pepper',
      url: sourceUrl,
      checkedAt: hpPayload.checkedAt || '2026-09-06',
      fields: [],
      sourceNativeId: hp.hotpepperId,
      matchConfidence: hp.binding?.confidence || 'high'
    };
    row.sourceRefs.push(ref);
  }
  const fields = new Set(Array.isArray(ref.fields) ? ref.fields : []);
  fields.add('lunchBudget');
  ref.fields = [...fields];
  ref.priceEvidenceClass = 'explicit_range';
  ref.promotionMode = ref.promotionMode || 'catalog-zero-request';
  ref.evidenceField = 'budget.average';
  ref.evidenceText = evidenceText;

  reportRows.push({
    googlePlaceId: item.googlePlaceId,
    name: current.name,
    hotpepperId: hp.hotpepperId,
    lunch,
    evidenceText,
    sourceUrl,
    mode,
    distanceMeters: hp.binding?.distanceMeters ?? null,
    nameSimilarity: hp.binding?.nameSimilarity ?? null,
    combinedScore: hp.binding?.combinedScore ?? null
  });
}

const duplicateProviderIds = rows.length - new Set(rows.map((row) => row.googlePlaceId)).size;
if (duplicateProviderIds) throw new Error(`duplicate Hot Pepper provider rows after promotion: ${duplicateProviderIds}`);

const js = `// Generated from Hot Pepper benchmark 34030943605 plus catalog-first zero-request field extraction.\n// Additive-only: claims are limited to explicit fields missing from the source-independent baseline.\nwindow.RESTAURANTS.push(...${JSON.stringify(rows)});\n`;
fs.writeFileSync(sourcePath, js);

const report = {
  schemaVersion: 1,
  candidates: candidates.length,
  promotedLunchBudgets: reportRows.length,
  createdRows,
  updatedRows,
  totalHotpepperRows: rows.length,
  policy: {
    strictAutoOnly: true,
    explicitFiniteLunchRangeOnly: true,
    priceEvidenceClass: 'explicit_range',
    overwriteExistingLunch: false,
    noExternalRequests: true
  },
  rows: reportRows
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
