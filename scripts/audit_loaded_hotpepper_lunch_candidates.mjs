#!/usr/bin/env node
import fs from 'node:fs';

const queue = JSON.parse(fs.readFileSync('data/area1_enrichment_queue.json', 'utf8'));
const hp = JSON.parse(fs.readFileSync('data/hotpepper_catalog_facts.json', 'utf8'));
const hpById = new Map((hp.rows || []).map((row) => [row.googlePlaceId, row]));

const candidates = [];
for (const item of queue.items || []) {
  if (!item.currentProduction || !item.hotpepperAutoEligible) continue;
  if (!item.existingHotpepperFieldCandidates?.includes('lunchBudgetExplicitText')) continue;
  const source = hpById.get(item.googlePlaceId);
  if (!source) throw new Error(`missing Hot Pepper facts: ${item.googlePlaceId}`);
  const facts = source.facts || {};
  candidates.push({
    googlePlaceId: item.googlePlaceId,
    name: item.name,
    hotpepperId: source.hotpepperId,
    proposedLunch: item.explicitLunchRangeFromLoadedHotpepper,
    budgetTier: facts.budget?.name || null,
    averageText: facts.budget?.average || null,
    budgetMemo: facts.budgetMemo || null,
    matchConfidence: source.binding?.confidence || null,
    autoEligible: Boolean(item.hotpepperAutoEligible),
    distanceMeters: source.binding?.distanceMeters ?? null,
    nameSimilarity: source.binding?.nameSimilarity ?? null,
    combinedScore: source.binding?.combinedScore ?? null,
    sourceUrl: facts.urls?.pc || facts.urls?.mobile || null
  });
}

const invalid = candidates.filter((row) =>
  !Array.isArray(row.proposedLunch)
  || row.proposedLunch.length !== 2
  || !Number.isFinite(row.proposedLunch[0])
  || !Number.isFinite(row.proposedLunch[1])
  || row.proposedLunch[0] > row.proposedLunch[1]
  || !row.sourceUrl
  || !row.autoEligible
);
if (invalid.length) throw new Error(`invalid lunch candidates: ${JSON.stringify(invalid)}`);

console.log(JSON.stringify({
  count: candidates.length,
  policy: {
    strictAutoOnly: true,
    finiteLunchLabelledRangeOnly: true,
    singleItemOrCoursePriceRejected: true,
    noExternalRequests: true
  },
  candidates
}, null, 2));
