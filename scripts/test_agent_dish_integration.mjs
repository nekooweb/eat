#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const moduleUrl = new URL('./audit_agent_dish_integration.mjs', import.meta.url);
assert.ok(fs.existsSync(fileURLToPath(moduleUrl)), 'An item-level integration delta audit must exist');
const { snapshotState, auditIntegration } = await import(moduleUrl);
const r = { nameZh: '牛肉咖喱', nameJa: 'ビーフカレー', provider: 'sourceWebsite',
  sourceUrl: 'https://example.com/menu', evidenceClass: 'source_recommendation_text' };
const f = { ...r, nameZh: '蛋包饭', nameJa: 'オムライス', evidenceClass: 'source_menu_text' };
const runtime = [ { googlePlaceId: 'p1', name: 'Frozen One', recommendedDishes: [], featuredDishes: [] },
  { googlePlaceId: 'p2', name: 'Frozen Two', recommendedDishes: [], featuredDishes: [f] } ];
const evidence = { rows: [{ googlePlaceId: 'p2', name: 'Frozen Two', recommendedDishes: [], featuredDishes: [f] }] };
const before = snapshotState(runtime, evidence, ['p1', 'p2', 'p3']);
const afterRuntime = structuredClone(runtime);
afterRuntime[0].recommendedDishes = [r];
const accepted = { rows: [{ googlePlaceId: 'p1', name: 'Frozen One', recommendedDishes: [r], featuredDishes: [] }] };
const afterEvidence = { rows: [...evidence.rows, ...accepted.rows] };
const after = snapshotState(afterRuntime, afterEvidence, ['p1', 'p2', 'p3']);
assert.equal(auditIntegration(before, after, accepted).delta.recommendedRestaurants, 1);
assert.equal(auditIntegration(before, after, accepted).delta.displayRestaurants, 1);
assert.equal(auditIntegration(before, after, accepted).delta.featuredRestaurants, 0);
assert.equal(auditIntegration(before, after, accepted).newRecommendationEvidenceItems, 1);
assert.equal(auditIntegration(after, after, accepted).newRecommendationEvidenceItems, 0, 'Replay must be idempotent');
assert.throws(() => auditIntegration(before, after, { rows: [] }), /unapproved/i);
const lost = snapshotState(afterRuntime, accepted, ['p1', 'p2', 'p3']);
assert.throws(() => auditIntegration(before, lost, accepted), /lost|retention/i);
const renamed = structuredClone(afterRuntime); renamed[0].name = 'Source Alias';
assert.throws(() => auditIntegration(before, snapshotState(renamed, afterEvidence, ['p1', 'p2', 'p3']), accepted), /identity/i);
const missing = snapshotState(afterRuntime.slice(0, 1), afterEvidence, ['p1', 'p2', 'p3']);
assert.throws(() => auditIntegration(before, missing, accepted), /identity/i);
assert.throws(() => auditIntegration(before, snapshotState(afterRuntime, afterEvidence, ['p1', 'p2']), accepted), /catalog/i);
assert.throws(() => snapshotState([...runtime, runtime[0]], evidence, ['p1', 'p2', 'p3']), /duplicate/i);
const invalid = structuredClone(runtime); invalid[0].name = 'None';
assert.throws(() => snapshotState(invalid, evidence, ['p1', 'p2', 'p3']), /name/i);
const downgraded = { rows: [{ ...accepted.rows[0], recommendedDishes: [], featuredDishes: [r] }] };
assert.throws(() => auditIntegration(before, after, downgraded), /unapproved/i);
const badDisplay = structuredClone(afterRuntime); badDisplay[0].featuredDishes = [{ ...f, nameZh: '凭空菜' }];
assert.throws(() => auditIntegration(before, snapshotState(badDisplay, afterEvidence, ['p1', 'p2', 'p3']), accepted), /unapproved/i);
const oldProvenance={proposalPath:'data/agent_reviews/DISH-R-OFFICIAL/S0.json',dishProposal:{nameOriginal:'オムライス',evidenceText:'Original full quote'}};
const provenanceEvidence=structuredClone(evidence);
provenanceEvidence.rows[0].featuredDishes[0].reviewedSourceEvidence=[oldProvenance];
const beforeWithProvenance=snapshotState(runtime,provenanceEvidence,['p1','p2','p3']);
assert.throws(() => auditIntegration(beforeWithProvenance,after,accepted), /provenance|snapshot/i,
  'Key retention alone is not enough if original review evidence was dropped');
console.log(JSON.stringify({ status: 'pass', checks: 'frozen identity, old evidence retention, approved-only R/F deltas, exact counts, replay' }));
