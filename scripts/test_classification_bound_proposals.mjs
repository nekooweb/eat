#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { buildClassificationBoundSourcePlan } from './build_classification_bound_source_plan.mjs';

const ROOT = path.resolve('.');
const proposalDir = path.join(ROOT, 'data/classification_entity_bound_proposals');
const reviewDir = path.join(ROOT, 'data/classification_entity_bound_reviews');
const files = fs.existsSync(proposalDir)
  ? fs.readdirSync(proposalDir).filter((name) => /^S\d+\.json$/u.test(name)).sort()
  : [];

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync('data/google_inventory_runtime.js', 'utf8'), context, {
  filename: 'data/google_inventory_runtime.js'
});
vm.runInContext(fs.readFileSync('classification.js', 'utf8'), context, { filename: 'classification.js' });
const knownConceptIds = new Set(context.window.EAT_CLASSIFICATION.concepts.map((row) => row.id));
const runtimeById = new Map((context.window.GOOGLE_INVENTORY_RESTAURANTS || [])
  .map((row) => [row.googlePlaceId, row]));

const plan = buildClassificationBoundSourcePlan({
  now: new Date('2026-09-18T00:00:00+09:00'),
  shards: 8
});
const activeById = new Map(plan.rows.map((row) => [row.googlePlaceId, row]));

const centralById = new Map();
if (fs.existsSync(reviewDir)) {
  for (const filename of fs.readdirSync(reviewDir).filter((name) => /^S\d+\.json$/u.test(name)).sort()) {
    const review = JSON.parse(fs.readFileSync(path.join(reviewDir, filename), 'utf8'));
    for (const row of review.records || []) {
      assert.ok(!centralById.has(row.googlePlaceId), 'duplicate central review Place ID: ' + row.googlePlaceId);
      centralById.set(row.googlePlaceId, { ...row, reviewFile: filename });
    }
  }
}

function assertReviewableUrl(value, label) {
  const url = new URL(value);
  assert.ok(['http:', 'https:'].includes(url.protocol), label + ': source URL must be HTTP(S)');
  const host = url.hostname.toLowerCase().replace(/^www\./u, '');
  assert.ok(!/(^|\.)google\./u.test(host), label + ': Google navigation URL cannot be evidence');
  assert.ok(!/googleusercontent\.com$/u.test(host), label + ': Googleusercontent cannot be evidence');
  assert.ok(!/maps\.app\.goo\.gl$/u.test(host), label + ': Google Maps shortlink cannot be evidence');
}

let reviewedRecords = 0;
let historicallyCentralReviewedRecords = 0;
let currentAssignmentCheckedRecords = 0;

for (const filename of files) {
  const doc = JSON.parse(fs.readFileSync(path.join(proposalDir, filename), 'utf8'));
  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.proposalOnly, true);
  assert.equal(doc.marker, 'CLASSIFICATION-ENTITY-BOUND');
  assert.equal(doc.policyAttestation.onlyAssignedBoundSourcesReviewed, true);
  assert.equal(doc.policyAttestation.newSourceDiscoveryPerformed, false);
  assert.equal(doc.policyAttestation.restaurantNameInferenceUsedForAcceptedClassification, false);
  assert.equal(doc.policyAttestation.menuDishInferenceUsedForAcceptedClassification, false);
  assert.equal(doc.policyAttestation.paidGoogleDataApiCalls, 0);
  assert.equal(doc.policyAttestation.canonicalWritesPerformed, false);

  const shard = Number(String(doc.shard || '').replace(/^S/u, ''));
  assert.ok(Number.isInteger(shard) && shard >= 0 && shard < plan.summary.shards);
  const seen = new Set();

  if (doc.completeShardReview) {
    assert.equal(doc.records.length, doc.summary?.assignedRows,
      filename + ': complete historical shard review must retain its original assigned denominator');
  }

  const counts = { accepted_evidence: 0, candidate: 0, no_evidence: 0, blocked: 0 };
  for (const record of doc.records) {
    reviewedRecords += 1;
    assert.ok(!seen.has(record.googlePlaceId), filename + ': duplicate Place ID');
    seen.add(record.googlePlaceId);

    const runtime = runtimeById.get(record.googlePlaceId);
    assert.ok(runtime, filename + ': reviewed Place ID disappeared from public runtime');
    assert.equal(record.restaurantName, runtime.name, filename + ': catalog name drift');

    const central = centralById.get(record.googlePlaceId) || null;
    const currentTask = activeById.get(record.googlePlaceId) || null;
    let assignedSourceKeys;

    if (central) {
      historicallyCentralReviewedRecords += 1;
      assert.equal(central.sourceFingerprint, record.sourceFingerprint,
        filename + ': central review fingerprint must pin the historical proposal assignment');
      assert.equal(central.proposalStatus, record.status,
        filename + ': central review must preserve the reviewed proposal status');
      assignedSourceKeys = new Set((record.attemptedSources || []).map((source) => {
        assertReviewableUrl(source.sourceUrl, filename + ':' + record.googlePlaceId);
        return source.provider + '|' + source.sourceUrl;
      }));
    } else {
      currentAssignmentCheckedRecords += 1;
      assert.ok(currentTask, filename + ': unreviewed proposal row must remain in the current active assignment');
      assert.equal(currentTask.shard, shard, filename + ': current assignment shard drift');
      assert.equal(record.sourceFingerprint, currentTask.sourceFingerprint,
        filename + ': assignment fingerprint drift');
      assert.ok(currentTask.allowedStatuses.includes(record.status), filename + ': invalid terminal status');
      assignedSourceKeys = new Set(currentTask.sourceLinks.map((link) => link.provider + '|' + link.url));
      for (const source of record.attemptedSources || []) {
        assert.ok(assignedSourceKeys.has(source.provider + '|' + source.sourceUrl),
          filename + ': attempted unassigned source for ' + record.googlePlaceId);
      }
    }

    counts[record.status] += 1;
    const proposed = Array.isArray(record.proposedConceptIds) ? record.proposedConceptIds : [];
    for (const id of proposed) assert.ok(knownConceptIds.has(id), filename + ': unknown proposed concept ' + id);

    const evidenceConceptIds = new Set();
    const attemptedKeys = new Set((record.attemptedSources || [])
      .map((source) => source.provider + '|' + source.sourceUrl));
    for (const evidence of record.categoryEvidence || []) {
      const key = evidence.provider + '|' + evidence.sourceUrl;
      if (central) {
        assert.ok(attemptedKeys.has(key),
          filename + ': historical evidence source must have been attempted for ' + record.googlePlaceId);
      } else {
        assert.ok(assignedSourceKeys.has(key),
          filename + ': evidence used unassigned source for ' + record.googlePlaceId);
      }
      assertReviewableUrl(evidence.sourceUrl, filename + ':' + record.googlePlaceId);
      assert.equal(evidence.evidenceScope, 'exact_branch');
      assert.ok(String(evidence.sourceText || '').trim(), filename + ': missing source-native category text');
      for (const id of evidence.proposedConceptIds || []) {
        assert.ok(knownConceptIds.has(id), filename + ': unknown evidence concept ' + id);
        evidenceConceptIds.add(id);
      }
    }
    for (const id of proposed) {
      assert.ok(evidenceConceptIds.has(id), filename + ': proposed concept lacks source evidence ' + id);
    }

    if (record.status === 'accepted_evidence') {
      assert.equal(record.identity?.state, 'verified', filename + ': accepted proposal requires verified branch identity');
      assert.ok((record.categoryEvidence || []).length > 0, filename + ': accepted proposal requires category evidence');
      assert.ok(proposed.length > 0, filename + ': accepted proposal requires proposed concepts');
      assert.equal(record.blocker, null);
    } else if (record.status === 'blocked') {
      assert.ok(record.blocker, filename + ': blocked row requires blocker');
      assert.equal(proposed.length, 0, filename + ': blocked row cannot propose accepted concepts');
      assert.equal((record.categoryEvidence || []).length, 0, filename + ': blocked row cannot carry category evidence');
    } else if (record.status === 'no_evidence') {
      assert.equal(proposed.length, 0, filename + ': no_evidence row cannot propose concepts');
      assert.equal((record.categoryEvidence || []).length, 0, filename + ': no_evidence row cannot carry category evidence');
    }
  }

  if (doc.summary) {
    assert.equal(doc.summary.reviewedRows, doc.records.length);
    assert.equal(doc.summary.acceptedEvidenceProposals, counts.accepted_evidence);
    assert.equal(doc.summary.candidateRows, counts.candidate);
    assert.equal(doc.summary.noEvidenceRows, counts.no_evidence);
    assert.equal(doc.summary.blockedRows, counts.blocked);
  }
}

assert.ok(files.length > 0, 'at least one classification bound-source proposal shard is required');
console.log(JSON.stringify({
  status: 'pass',
  proposalFiles: files,
  reviewedRecords,
  historicallyCentralReviewedRecords,
  currentAssignmentCheckedRecords,
  checks: 'historical central-review pinning, current assignment fingerprints for unreviewed rows, assigned-source-only evidence, concept validity, fail-closed statuses'
}));
