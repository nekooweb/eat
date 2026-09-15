#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const moduleUrl = new URL('./build_reviewed_agent_dish_evidence.mjs', import.meta.url);
assert.ok(fs.existsSync(fileURLToPath(moduleUrl)), 'A fail-closed reviewed proposal adapter must exist');
const { buildReviewedEvidence, auditReviewCoverage, translateExactDish } = await import(moduleUrl);
const stdinImport = spawnSync(process.execPath, ['--input-type=module', '-'], {
  input: `await import(${JSON.stringify(moduleUrl.href)});`, encoding: 'utf8'
});
assert.equal(stdinImport.status, 0, `Adapter helpers must be importable from stdin: ${stdinImport.stderr}`);
const date = '2026-09-14';
const assignment = { googlePlaceId: 'test-place', name: 'Frozen catalog name', lane: 'official_crawl', shard: 0 };
const dish = {
  classification: 'R', targetField: 'recommendedDishes', nameOriginal: 'ビーフカレー',
  provider: 'official_web', sourceUrl: 'https://example.com/branch/menu', checkedAt: date,
  sourceScope: 'branch', recommendationSemantics: '名物', evidenceText: '当店の名物 ビーフカレー', confidence: 'high'
};
const row = {
  googlePlaceId: assignment.googlePlaceId, restaurantName: assignment.name, status: 'accepted_evidence',
  identity: { state: 'verified', sourceAliases: ['Source alias'], evidence: [
    { provider: 'official', sourceUrl: 'https://example.com/branch', checkedAt: date,
      evidenceType: 'branch_page', note: 'Exact branch name, address and telephone verified.' }
  ] }, dishProposals: [dish], attemptedSources: [dish.sourceUrl], blocker: null, notes: ''
};
const document = {
  marker: 'DISH-R-OFFICIAL', shard: 'S0', sourceQueue: 'data/dish_batch_plan.json',
  sourceQueueCommit: 'a'.repeat(40), generatedAt: date,
  policyAttestation: { paidGoogleDataApiCalls: 0, canonicalMasterEditedDirectly: false,
    proximityOnlyIdentityBindingUsed: false, recommendationWithoutExplicitSemanticsAdded: false,
    accessRestrictionBypassUsed: false }, records: [row],
  summary: { assignedRows: 1, reviewedRows: 1, acceptedEvidenceRows: 1, candidateRows: 0,
    noEvidenceRows: 0, blockedRows: 0, skippedAlreadyCompleteRows: 0 }
};
const options = (doc = document, extra = {}) => ({
  documents: [{ path: 'data/agent_reviews/DISH-R-OFFICIAL/S0.json', document: doc }],
  assignments: [assignment], catalogNames: new Map([[assignment.googlePlaceId, assignment.name]]),
  checkedAt: date, sourceQueueCommit: 'a'.repeat(40),
  translations: { 'ビーフカレー': { nameZh: '牛肉咖喱', rationale: 'Literal translation: beef + curry.' } }, ...extra
});
const changed = (mutate) => { const doc = structuredClone(document); mutate(doc); return doc; };

const accepted = buildReviewedEvidence(options());
assert.equal(accepted.evidence.rows.length, 1);
assert.equal(accepted.evidence.rows[0].name, assignment.name, 'Aliases must not replace frozen identity');
assert.equal(accepted.evidence.rows[0].recommendedDishes[0].nameZh, '牛肉咖喱');
assert.equal(accepted.evidence.rows[0].featuredDishes.length, 0, 'R/F counts are separate');
assert.equal(accepted.evidence.rows[0].recommendedDishes[0].provider, 'sourceWebsite');
assert.equal(accepted.evidence.policy.paidGoogleDataApiCalls, 0);
assert.equal(accepted.coverage.reviewedRows, 1);
const confidenceDoc = changed(d => Object.assign(d.records[0].dishProposals[0], {
  recommendationSemantics: '自信の一品', evidenceText: 'ビーフカレー 自信の一品'
}));
assert.equal(buildReviewedEvidence(options(confidenceDoc)).evidence.rows[0].recommendedDishes.length, 1,
  'Explicit house-confidence attached to a dish is equivalent recommendation wording');

assert.throws(() => auditReviewCoverage([assignment], []), /missing/i);
assert.throws(() => auditReviewCoverage([assignment], [...options().documents, ...options().documents]), /duplicate/i);
assert.throws(() => buildReviewedEvidence(options(changed(d => d.records[0].googlePlaceId = 'other'))), /assignment|outside/i);
assert.throws(() => buildReviewedEvidence(options(changed(d => d.records[0].restaurantName = 'Source alias'))), /identity|catalog|name/i);
assert.throws(() => buildReviewedEvidence(options(changed(d => d.shard = 'S1'))), /shard|assignment/i);
assert.throws(() => buildReviewedEvidence(options(changed(d => d.sourceQueueCommit = 'b'.repeat(40)))), /queue.*commit|provenance/i);
assert.throws(() => buildReviewedEvidence(options(changed(d => d.summary.reviewedRows = 2))), /summary/i);
assert.throws(() => buildReviewedEvidence(options(changed(d => d.policyAttestation.paidGoogleDataApiCalls = 1))), /policy|paid/i);
assert.throws(() => buildReviewedEvidence(options(changed(d => d.records[0].identity.evidence = []))), /identity/i);
assert.throws(() => buildReviewedEvidence(options(changed(d => d.records[0].dishProposals[0].sourceScope = 'brand'))), /scope|branch/i);
assert.throws(() => buildReviewedEvidence(options(changed(d => d.records[0].dishProposals[0].recommendationSemantics = ''))), /semantics/i);
assert.throws(() => buildReviewedEvidence(options(changed(d => d.records[0].dishProposals[0].evidenceText = 'ビーフカレー'))), /semantics/i);
assert.throws(() => buildReviewedEvidence(options(changed(d => d.records[0].dishProposals[0].evidenceText = '名物 ラーメン'))), /source.native|dish name/i);
assert.throws(() => buildReviewedEvidence(options(changed(d => d.records[0].dishProposals[0].evidenceClass = 'customer_review'))), /review/i);
assert.throws(() => buildReviewedEvidence(options(changed(d => d.records[0].dishProposals[0].sourceUrl = 'https://tabelog.com/tokyo/123/dtlrvwlst/'))), /review/i);
assert.throws(() => buildReviewedEvidence(options(changed(d => d.records[0].dishProposals[0].targetField = 'featuredDishes'))), /classification|target/i);
assert.throws(() => buildReviewedEvidence(options(changed(d => d.records[0].dishProposals[0].provider = 'unknown'))), /provider/i);
assert.throws(() => buildReviewedEvidence(options(changed(d => d.records[0].dishProposals[0].checkedAt = '2026-02-30'))), /date/i);

const featuredDoc = changed(d => Object.assign(d.records[0].dishProposals[0], {
  classification: 'F', targetField: 'featuredDishes', recommendationSemantics: '', evidenceText: 'ビーフカレー'
}));
const featured = buildReviewedEvidence(options(featuredDoc));
assert.equal(featured.evidence.rows[0].recommendedDishes.length, 0);
assert.equal(featured.evidence.rows[0].featuredDishes[0].evidenceClass, 'source_menu_text');

for (const status of ['candidate', 'no_evidence', 'blocked', 'skipped_already_complete']) {
  const doc = changed(d => {
    d.records[0].status = status;
    d.records[0].notes = 'A specific documented review outcome.';
    d.summary.acceptedEvidenceRows = 0;
    d.summary[{ candidate: 'candidateRows', no_evidence: 'noEvidenceRows', blocked: 'blockedRows',
      skipped_already_complete: 'skippedAlreadyCompleteRows' }[status]] = 1;
  });
  assert.equal(buildReviewedEvidence(options(doc)).evidence.rows.length, 0, `${status} must never enter canonical evidence`);
}

assert.equal(translateExactDish('ブランド謎のカレー'), null, 'A broad substring match must not erase dish specificity');
assert.equal(translateExactDish('えびず焼き'), null, 'Existing translation holds are untouched');
assert.equal(translateExactDish('ソルベージュ®エスプレッソ'), null);
const pendingDoc = changed(d => Object.assign(d.records[0].dishProposals[0], {
  nameOriginal: 'ブランド謎のカレー', evidenceText: '名物 ブランド謎のカレー'
}));
const pending = buildReviewedEvidence(options(pendingDoc));
assert.equal(pending.evidence.rows.length, 0);
assert.equal(pending.pending.rows.length, 1);
assert.equal(pending.pending.rows[0].dishProposal.nameOriginal, 'ブランド謎のカレー');

const longDoc = changed(d => d.records[0].dishProposals[0].evidenceText += ' 原文保存'.repeat(80));
const longItem = buildReviewedEvidence(options(longDoc)).evidence.rows[0].recommendedDishes[0];
assert.ok(longItem.evidenceSnippet.length <= 90);
assert.equal(longItem.reviewedSourceEvidence[0].dishProposal.evidenceText, longDoc.records[0].dishProposals[0].evidenceText);
assert.deepEqual(longItem.reviewedSourceEvidence[0].identity, row.identity);

const duplicateDishDoc = changed(d => d.records[0].dishProposals.push(structuredClone(d.records[0].dishProposals[0])));
assert.equal(buildReviewedEvidence(options(duplicateDishDoc)).evidence.rows[0].recommendedDishes.length, 1);
const secondSourceDoc = changed(d => d.records[0].dishProposals.push({ ...d.records[0].dishProposals[0],
  sourceUrl: 'https://example.com/branch/signatures' }));
const secondSource = buildReviewedEvidence(options(secondSourceDoc));
assert.equal(secondSource.coverage.acceptedRItems, 2, 'Two sources are two evidence items');
assert.equal(secondSource.coverage.acceptedRDistinctDishes, 1, 'Multiple sources must not inflate the logical dish count');
console.log(JSON.stringify({ status: 'pass', checks: 'coverage, fail-closed identity/policy/semantics, R/F/C separation, exact translation, full provenance, deduplication' }));

const reviewedIndependentProviderPolicyS7 = await import('./dish_evidence_provider_policy.mjs');
assert.ok(reviewedIndependentProviderPolicyS7.allowedDishEvidenceProviderSet().has('Reviewed independent'),
  'Centrally reviewed independent evidence must use the proven closed provider label');
