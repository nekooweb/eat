#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildClassificationBoundSourcePlan,
  fnv1a
} from './build_classification_bound_source_plan.mjs';

const inputPaths = [
  'data/google_inventory_runtime.js',
  'data/source_provenance.js',
  'data/source_facts.js',
  'data/google_inventory_detail_queue.json',
  'classification.js'
];
const before = new Map(inputPaths.map((path) => [path, fs.readFileSync(path)]));

const now = new Date('2026-09-18T00:00:00+09:00');
const first = buildClassificationBoundSourcePlan({ now, shards: 8 });
const second = buildClassificationBoundSourcePlan({ now, shards: 8 });

assert.deepEqual(second, first, 'bound-source plan must be deterministic for identical maintained inputs');
assert.equal(first.schemaVersion, 1);
assert.equal(first.mode, 'proposal-only-plan');
assert.equal(first.marker, 'CLASSIFICATION-ENTITY-BOUND');
assert.equal(first.policy.frozenIdentityKey, 'googlePlaceId');
assert.equal(first.policy.catalogNameImmutable, true);
assert.equal(first.policy.workerCanonicalWrites, false);
assert.equal(first.policy.alreadyBoundSourcesOnly, true);
assert.equal(first.policy.newSourceDiscoveryAllowed, false);
assert.equal(first.policy.restaurantNameInferenceAllowed, false);
assert.equal(first.policy.menuDishInferenceAllowed, false);
assert.equal(first.policy.paidGoogleDataApiCalls, 0);
assert.equal(first.policy.acceptedRequiresExplicitCategoryEvidence, true);
assert.equal(first.policy.aggregateSourceCountWithoutUrlIsNotDiscovery, true);

assert.equal(first.summary.publicRuntimeTotal, 1422);
assert.equal(first.summary.acceptedClassificationRows, 1261);
assert.equal(first.summary.unknownClassificationRows, 161);
assert.equal(first.summary.totalRows, 100,
  'navigation-only source references must not enter the maintained bound-source unknown partition');
assert.equal(first.summary.sourceReferenceRepairRows, 0,
  'bound-source plan must contain only rows with an explicit reviewable source URL');
assert.deepEqual(first.summary.sourceReferenceRepairPlaceIds, []);
assert.equal(first.summary.reviewReadyRows + first.summary.sourceReferenceRepairRows, first.summary.totalRows);
assert.equal(first.summary.shards, 8);
assert.equal(first.summary.shardCounts.reduce((sum, bucket) => sum + bucket.total, 0), first.summary.totalRows);

const ids = first.rows.map((row) => row.googlePlaceId);
assert.equal(new Set(ids).size, ids.length, 'Place IDs must be unique in the bound-source review plan');

const fingerprints = new Set();
for (const row of first.rows) {
  assert.equal(row.taskType, 'classification_entity_bound_source_review');
  assert.equal(row.marker, 'CLASSIFICATION-ENTITY-BOUND');
  assert.ok(row.googlePlaceId);
  assert.ok(row.name);
  assert.equal(row.shard, fnv1a(row.googlePlaceId) % first.summary.shards);
  assert.match(row.sourceFingerprint, /^sha256:[0-9a-f]{64}$/u);
  assert.match(row.completionSourceFingerprint, /^sha256:[0-9a-f]{64}$/u);
  assert.ok(!fingerprints.has(row.sourceFingerprint), 'source fingerprints must be Place-ID scoped');
  fingerprints.add(row.sourceFingerprint);
  assert.equal(row.newSourceDiscoveryRequired, false);
  assert.equal(row.restaurantNameInferenceAllowed, false);
  assert.deepEqual(row.allowedStatuses, ['accepted_evidence', 'candidate', 'no_evidence', 'blocked']);

  if (row.reviewReady) {
    assert.equal(row.sourceReferenceState, 'explicit_bound_urls');
    assert.equal(row.sourceReferenceRepairRequired, false);
    assert.equal(row.networkRequired, true);
    assert.ok(row.sourceLinks.length > 0);
  } else {
    assert.equal(row.sourceReferenceState, 'aggregate_count_without_explicit_url');
    assert.equal(row.sourceReferenceRepairRequired, true);
    assert.equal(row.networkRequired, false);
    assert.equal(row.sourceLinks.length, 0);
    assert.ok(row.sourceUrlCount > 0,
      'reference-repair rows must preserve evidence that a bound source count existed');
  }

  for (const link of row.sourceLinks) {
    const url = new URL(link.url);
    assert.ok(['http:', 'https:'].includes(url.protocol));
    const host = url.hostname.toLowerCase().replace(/^www\./u, '');
    assert.ok(!/(^|\.)google\./u.test(host), 'Google URLs are navigation-only and cannot become review evidence');
    assert.ok(!/googleusercontent\.com$/u.test(host));
    assert.ok(!/maps\.app\.goo\.gl$/u.test(host));
    assert.ok(link.provider);
    assert.ok(['official_or_reviewed_independent', 'retained_third_party', 'bound_runtime_source'].includes(link.sourceKind));
    assert.deepEqual([...link.fields].sort((a, b) => a.localeCompare(b, 'en')), link.fields,
      'claimed fields must be stable-sorted');
  }
}

const template = JSON.parse(fs.readFileSync('data/classification_entity_bound_proposal_template.json', 'utf8'));
assert.equal(template.schemaVersion, 1);
assert.equal(template.proposalOnly, true);
assert.equal(template.marker, 'CLASSIFICATION-ENTITY-BOUND');
assert.equal(template.policyAttestation.onlyAssignedBoundSourcesReviewed, true);
assert.equal(template.policyAttestation.newSourceDiscoveryPerformed, false);
assert.equal(template.policyAttestation.restaurantNameInferenceUsedForAcceptedClassification, false);
assert.equal(template.policyAttestation.menuDishInferenceUsedForAcceptedClassification, false);
assert.equal(template.policyAttestation.paidGoogleDataApiCalls, 0);
assert.equal(template.policyAttestation.canonicalWritesPerformed, false);
assert.match(template.records[0].sourceFingerprint, /^sha256:/u);

for (const path of inputPaths) {
  assert.ok(before.get(path).equals(fs.readFileSync(path)),
    `report-only bound-source planner mutated maintained input: ${path}`);
}

console.log(JSON.stringify({
  status: 'pass',
  totalRows: first.summary.totalRows,
  reviewReadyRows: first.summary.reviewReadyRows,
  sourceReferenceRepairRows: first.summary.sourceReferenceRepairRows,
  sourceReferenceRepairPlaceIds: first.summary.sourceReferenceRepairPlaceIds,
  rowsWithCuisineClaimedLink: first.summary.rowsWithCuisineClaimedLink,
  rowsWithOfficialOrReviewedIndependent: first.summary.rowsWithOfficialOrReviewedIndependent,
  rowsWithThirdPartyOnly: first.summary.rowsWithThirdPartyOnly,
  totalExplicitLinks: first.summary.totalExplicitLinks,
  providerCounts: first.summary.providerCounts,
  checks: 'reviewable bound-source partition, deterministic sharding, explicit non-Google URLs, proposal-only policy, zero input mutation'
}));
