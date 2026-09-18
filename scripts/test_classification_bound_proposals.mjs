#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { buildClassificationBoundSourcePlan } from './build_classification_bound_source_plan.mjs';

const ROOT = path.resolve('.');
const dir = path.join(ROOT, 'data/classification_entity_bound_proposals');
const files = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((name) => /^S\d+\.json$/u.test(name)).sort()
  : [];

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync('classification.js', 'utf8'), context, { filename: 'classification.js' });
const knownConceptIds = new Set(context.window.EAT_CLASSIFICATION.concepts.map((row) => row.id));
const plan = buildClassificationBoundSourcePlan({
  now: new Date('2026-09-18T00:00:00+09:00'),
  shards: 8
});

let reviewedRecords = 0;
for (const filename of files) {
  const doc = JSON.parse(fs.readFileSync(path.join(dir, filename), 'utf8'));
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
  const assigned = plan.rows.filter((row) => row.shard === shard);
  const assignedById = new Map(assigned.map((row) => [row.googlePlaceId, row]));
  const seen = new Set();

  if (doc.completeShardReview) {
    assert.equal(doc.records.length, assigned.length, filename + ': complete shard review must cover every assigned row');
  }

  const counts = { accepted_evidence: 0, candidate: 0, no_evidence: 0, blocked: 0 };
  for (const record of doc.records) {
    reviewedRecords += 1;
    assert.ok(!seen.has(record.googlePlaceId), filename + ': duplicate Place ID');
    seen.add(record.googlePlaceId);
    const task = assignedById.get(record.googlePlaceId);
    assert.ok(task, filename + ': record not in current shard assignment');
    assert.equal(record.restaurantName, task.name, filename + ': catalog name drift');
    assert.equal(record.sourceFingerprint, task.sourceFingerprint, filename + ': assignment fingerprint drift');
    assert.ok(task.allowedStatuses.includes(record.status), filename + ': invalid terminal status');
    counts[record.status] += 1;

    const assignedSourceKeys = new Set(task.sourceLinks.map((link) => link.provider + '|' + link.url));
    for (const source of record.attemptedSources || []) {
      assert.ok(assignedSourceKeys.has(source.provider + '|' + source.sourceUrl),
        filename + ': attempted unassigned source for ' + record.googlePlaceId);
    }

    const proposed = Array.isArray(record.proposedConceptIds) ? record.proposedConceptIds : [];
    for (const id of proposed) assert.ok(knownConceptIds.has(id), filename + ': unknown proposed concept ' + id);

    const evidenceConceptIds = new Set();
    for (const evidence of record.categoryEvidence || []) {
      assert.ok(assignedSourceKeys.has(evidence.provider + '|' + evidence.sourceUrl),
        filename + ': evidence used unassigned source for ' + record.googlePlaceId);
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
  checks: 'current assignment membership, source fingerprints, assigned-source-only evidence, concept validity, fail-closed statuses'
}));
