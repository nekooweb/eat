#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildCompletionPlan } from './build_completion_plan.mjs';

const watchedFiles = [
  'data/production_area1.js',
  'data/source_facts.js',
  'classification.js'
];
const before = new Map(watchedFiles.map((file) => [file, fs.readFileSync(file, 'utf8')]));
const report = buildCompletionPlan({ now: new Date('2026-09-18T00:00:00Z') });

assert.equal(report.schemaVersion, 1);
assert.equal(report.mode, 'report-only');
assert.equal(report.policy.canonicalWrites, false);
assert.equal(report.policy.networkCollection, false);
assert.equal(report.policy.paidGoogleDataApiCalls, 0);
assert.equal(report.policy.candidateCountsAsAccepted, false);
assert.equal(report.policy.rawCuisineTagsMutationAllowed, false);
assert.equal(report.summary.runtimeRows, 1422, 'completion planner must use the frozen public runtime');

const cls = report.summary.classification;
assert.equal(cls.acceptedRows + cls.unknownRows, report.summary.runtimeRows);
assert.equal(
  report.classification.retainedEntityRecoveries.length + report.classification.unresolvedEntityRows.length,
  cls.unknownRows,
  'every currently unknown classification row must enter exactly one entity bucket'
);

const hours = report.summary.hours;
assert.equal(hours.knownRows + hours.missingRows, report.summary.runtimeRows);
assert.equal(
  hours.retainedParseableRows + hours.retainedUnparsedRows + hours.discoveryRows,
  hours.missingRows,
  'hours buckets must partition missing runtime rows'
);

for (const key of ['lunchBudget', 'dinnerBudget']) {
  const summary = report.summary[key];
  assert.equal(summary.knownRows + summary.missingRows, report.summary.runtimeRows);
  assert.equal(summary.retainedRangeRows + summary.discoveryRows, summary.missingRows);
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

uniqueIds(report.hours.recoverable, 'hours recoverable');
uniqueIds(report.hours.retainedUnparsed, 'hours retained-unparsed');
uniqueIds(report.hours.discovery, 'hours discovery');
disjoint(report.hours.recoverable, report.hours.retainedUnparsed, 'hours recoverable/unparsed');
disjoint(report.hours.recoverable, report.hours.discovery, 'hours recoverable/discovery');
disjoint(report.hours.retainedUnparsed, report.hours.discovery, 'hours unparsed/discovery');

for (const meal of ['lunch', 'dinner']) {
  uniqueIds(report.budget[meal].recoverable, `${meal} recoverable`);
  uniqueIds(report.budget[meal].discovery, `${meal} discovery`);
  disjoint(report.budget[meal].recoverable, report.budget[meal].discovery, `${meal} budget`);
}

const allTasks = [
  ...report.classification.taxonomyTasks,
  ...report.classification.retainedEntityRecoveries,
  ...report.classification.unresolvedEntityRows,
  ...report.hours.recoverable,
  ...report.hours.retainedUnparsed,
  ...report.hours.discovery,
  ...report.budget.lunch.recoverable,
  ...report.budget.lunch.discovery,
  ...report.budget.dinner.recoverable,
  ...report.budget.dinner.discovery
];
for (const task of allTasks) {
  assert.match(task.sourceFingerprint, /^sha256:[0-9a-f]{64}$/);
}

for (const task of [
  ...report.classification.retainedEntityRecoveries,
  ...report.hours.recoverable,
  ...report.hours.retainedUnparsed,
  ...report.budget.lunch.recoverable,
  ...report.budget.dinner.recoverable
]) {
  assert.equal(task.networkRequired, false, `${task.taskType} should consume retained evidence first`);
}
for (const task of [
  ...report.hours.discovery,
  ...report.budget.lunch.discovery,
  ...report.budget.dinner.discovery
]) {
  assert.equal(task.networkRequired, true, `${task.taskType} should be the explicit discovery bucket`);
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
  dinnerBudget: report.summary.dinnerBudget
}));
