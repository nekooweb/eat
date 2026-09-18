#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { materializeClassificationBoundAssignments } from './materialize_classification_bound_assignments.mjs';

const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'eat-classification-bound-'));
const now = new Date('2026-09-18T00:00:00+09:00');
const first = materializeClassificationBoundAssignments({ outdir, now, shards: 8 });
const manifestPath = path.join(outdir, 'manifest.json');
assert.ok(fs.existsSync(manifestPath));
assert.equal(first.plan.marker, 'CLASSIFICATION-ENTITY-BOUND');
assert.equal(first.plan.summary.shards, 8);
assert.equal(first.plan.summary.reviewReadyRows, first.plan.summary.totalRows,
  'every current bound-source task must remain review-ready');
assert.equal(first.manifest.assignments.length, 8);
assert.equal(first.manifest.assignments.reduce((sum, row) => sum + row.rows, 0), first.plan.summary.totalRows);
assert.equal(first.manifest.assignments.reduce((sum, row) => sum + row.reviewReadyRows, 0),
  first.plan.summary.reviewReadyRows);

const all = [];
for (let shard = 0; shard < 8; shard += 1) {
  const file = path.join(outdir, `S${shard}.json`);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(doc.marker, 'CLASSIFICATION-ENTITY-BOUND');
  assert.equal(doc.mode, 'review-assignment');
  assert.equal(doc.shard, `S${shard}`);
  assert.equal(doc.summary.totalRows, doc.rows.length);
  for (const row of doc.rows) {
    assert.equal(row.shard, shard);
    assert.equal(row.reviewReady, true);
    assert.match(row.sourceFingerprint, /^sha256:[0-9a-f]{64}$/u);
    assert.ok(row.sourceLinks.length > 0);
    for (const link of row.sourceLinks) {
      const host = new URL(link.url).hostname.toLowerCase().replace(/^www\./u, '');
      assert.ok(!/(^|\.)google\./u.test(host));
      assert.ok(!/googleusercontent\.com$/u.test(host));
      assert.ok(!/maps\.app\.goo\.gl$/u.test(host));
    }
    all.push(row);
  }
}
assert.equal(all.length, first.plan.summary.totalRows);
assert.equal(new Set(all.map((row) => row.googlePlaceId)).size, first.plan.summary.totalRows);

const secondDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eat-classification-bound-'));
const second = materializeClassificationBoundAssignments({ outdir: secondDir, now, shards: 8 });
assert.deepEqual(second.plan, first.plan, 'identical maintained inputs must generate identical assignment plan');

console.log(JSON.stringify({
  status: 'pass',
  totalRows: first.plan.summary.totalRows,
  reviewReadyRows: first.plan.summary.reviewReadyRows,
  shardCounts: first.plan.summary.shardCounts,
  totalExplicitLinks: first.plan.summary.totalExplicitLinks
}));
