#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildCompletionPlan } from './build_completion_plan.mjs';

const watchedFiles = [
  'data/google_inventory_runtime.js',
  'data/production_area1.js',
  'data/source_facts.js',
  'data/source_provenance.js',
  'data/google_inventory_detail_queue.json',
  'classification.js'
];
const before = new Map(watchedFiles.map((file) => [file, fs.readFileSync(file, 'utf8')]));
const report = buildCompletionPlan({ now: new Date('2026-09-18T00:00:00Z') });

assert.equal(report.schemaVersion, 2);
assert.equal(report.mode, 'report-only');
assert.equal(report.runtimeSource, 'data/google_inventory_runtime.js');
assert.equal(report.policy.canonicalWrites, false);
assert.equal(report.policy.networkCollection, false);
assert.equal(report.policy.paidGoogleDataApiCalls, 0);
assert.equal(report.policy.candidateCountsAsAccepted, false);
assert.equal(report.policy.rawCuisineTagsMutationAllowed, false);
assert.equal(report.policy.boundSourcesBeforeNewDiscovery, true);
assert.equal(report.summary.runtimeRows, 1422, 'completion planner must use the frozen public runtime');

const cls = report.summary.classification;
assert.equal(cls.acceptedRows + cls.unknownRows, report.summary.runtimeRows);
assert.equal(
  report.classification.retainedEntityRecoveries.length + report.classification.unresolvedEntityRows.length,
  cls.unknownRows,
  'every currently unknown classification row must enter exactly one entity bucket'
);
assert.equal(
  cls.taxonomyTokenFirstRows + cls.boundSourceReviewRows + cls.nameCandidateFirstRows,
  report.classification.unresolvedEntityRows.length,
  'unresolved classification rows must have one deterministic next stage'
);

const hours = report.summary.hours;
assert.equal(hours.knownRows + hours.missingRows, report.summary.runtimeRows);
assert.equal(
  hours.retainedReviewRows + hours.boundSourceReviewRows + hours.discoveryRows,
  hours.missingRows,
  'hours buckets must partition missing runtime rows'
);
if (hours.materializerOutcomes) {
  const materializedTotal = hours.materializerOutcomes.normalizedRows
    + hours.materializerOutcomes.hiddenUnparseableRows
    + hours.materializerOutcomes.hiddenConflictRows
    + hours.materializerOutcomes.hiddenSemanticRows
    + hours.materializerOutcomes.rowsWithoutSource;
  assert.equal(materializedTotal, report.summary.runtimeRows, 'public hours materializer outcomes must cover the runtime');
  assert.equal(hours.materializerOutcomes.normalizedRows, hours.knownRows, 'planner/public materializer known-hours counts must agree');
}

for (const key of ['lunchBudget', 'dinnerBudget']) {
  const summary = report.summary[key];
  assert.equal(summary.knownRows + summary.missingRows, report.summary.runtimeRows);
  assert.equal(
    summary.retainedRangeRows + summary.boundSourceReviewRows + summary.discoveryRows,
    summary.missingRows,
    `${key} buckets must partition missing runtime rows`
  );
}

function uniqueIds(rows, label) {
  const ids = rows.map((row) => row.googlePlaceId);
  assert.equal(new Set(ids).size, ids.length, `${label} must not contain duplicate Place IDs`);
}

function disjoint(a, b, label) {
  const first = new Set(a.map((row) => row.googlePlaceId));
  const overlap = b.filter((row) => first.has(row.googlePlaceId));
  assert.equal(overlap.length, 0, `${label} buckets must be disjoint`);
}

uniqueIds(report.classification.retainedEntityRecoveries, 'classification retained');
uniqueIds(report.classification.unresolvedEntityRows, 'classification unresolved');
disjoint(report.classification.retainedEntityRecoveries, report.classification.unresolvedEntityRows, 'classification');

uniqueIds(report.hours.retainedReview, 'hours retained review');
uniqueIds(report.hours.boundSourceReview, 'hours bound-source review');
uniqueIds(report.hours.discovery, 'hours discovery');
disjoint(report.hours.retainedReview, report.hours.boundSourceReview, 'hours retained/bound');
disjoint(report.hours.retainedReview, report.hours.discovery, 'hours retained/discovery');
disjoint(report.hours.boundSourceReview, report.hours.discovery, 'hours bound/discovery');

for (const meal of ['lunch', 'dinner']) {
  uniqueIds(report.budget[meal].retainedRecoveries, `${meal} retained recoveries`);
  uniqueIds(report.budget[meal].boundSourceReview, `${meal} bound-source review`);
  uniqueIds(report.budget[meal].discovery, `${meal} discovery`);
  disjoint(report.budget[meal].retainedRecoveries, report.budget[meal].boundSourceReview, `${meal} retained/bound`);
  disjoint(report.budget[meal].retainedRecoveries, report.budget[meal].discovery, `${meal} retained/discovery`);
  disjoint(report.budget[meal].boundSourceReview, report.budget[meal].discovery, `${meal} bound/discovery`);
}

const allTasks = [
  ...report.classification.taxonomyTasks,
  ...report.classification.retainedEntityRecoveries,
  ...report.classification.unresolvedEntityRows,
  ...report.hours.retainedReview,
  ...report.hours.boundSourceReview,
  ...report.hours.discovery,
  ...report.budget.lunch.retainedRecoveries,
  ...report.budget.lunch.boundSourceReview,
  ...report.budget.lunch.discovery,
  ...report.budget.dinner.retainedRecoveries,
  ...report.budget.dinner.boundSourceReview,
  ...report.budget.dinner.discovery
];
for (const task of allTasks) {
  assert.match(task.sourceFingerprint, /^sha256:[0-9a-f]{64}$/);
}

for (const task of [
  ...report.classification.taxonomyTasks,
  ...report.classification.retainedEntityRecoveries,
  ...report.hours.retainedReview,
  ...report.budget.lunch.retainedRecoveries,
  ...report.budget.dinner.retainedRecoveries
]) {
  assert.equal(task.networkRequired, false, `${task.taskType} should consume retained inputs first`);
  assert.equal(task.newSourceDiscoveryRequired, false, `${task.taskType} must not create new-source discovery work`);
}
for (const task of [
  ...report.hours.boundSourceReview,
  ...report.budget.lunch.boundSourceReview,
  ...report.budget.dinner.boundSourceReview
]) {
  assert.equal(task.networkRequired, true, `${task.taskType} requires revisiting an already-bound source`);
  assert.equal(task.newSourceDiscoveryRequired, false, `${task.taskType} must stay ahead of new-source discovery`);
}
for (const task of [
  ...report.hours.discovery,
  ...report.budget.lunch.discovery,
  ...report.budget.dinner.discovery
]) {
  assert.equal(task.networkRequired, true, `${task.taskType} should be an explicit network bucket`);
  assert.equal(task.newSourceDiscoveryRequired, true, `${task.taskType} should be the true discovery bucket`);
}

for (const file of watchedFiles) {
  assert.equal(fs.readFileSync(file, 'utf8'), before.get(file), `${file} must not be mutated by report-only planning`);
}

console.log(JSON.stringify({
  status: 'pass',
  runtimeRows: report.summary.runtimeRows,
  classification: report.summary.classification,
  hours: report.summary.hours,
  lunchBudget: report.summary.lunchBudget,
  dinnerBudget: report.summary.dinnerBudget,
  topTaxonomyTokens: report.classification.taxonomyTasks.slice(0, 15).map((task) => ({
    token: task.normalizedToken,
    affectedRestaurantCount: task.affectedRestaurantCount,
    unknownRestaurantCount: task.unknownRestaurantCount
  }))
}));
