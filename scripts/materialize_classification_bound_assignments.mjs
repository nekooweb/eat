#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildClassificationBoundSourcePlan } from './build_classification_bound_source_plan.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..');

function shardDocument(plan, shard) {
  const rows = plan.rows.filter((row) => row.shard === shard);
  return {
    schemaVersion: 1,
    generatedAt: plan.generatedAt,
    marker: plan.marker,
    mode: 'review-assignment',
    shard: `S${shard}`,
    sourcePlan: 'plan.json',
    policy: plan.policy,
    summary: {
      totalRows: rows.length,
      reviewReadyRows: rows.filter((row) => row.reviewReady).length,
      explicitLinks: rows.reduce((sum, row) => sum + row.sourceLinks.length, 0)
    },
    rows
  };
}

export function materializeClassificationBoundAssignments(options = {}) {
  const root = options.root || DEFAULT_ROOT;
  const outdir = path.resolve(root, options.outdir || '_audit/classification-bound');
  const now = options.now instanceof Date
    ? options.now
    : new Date(options.now || process.env.CLASSIFICATION_BOUND_NOW || Date.now());
  const shards = Number(options.shards || process.env.CLASSIFICATION_BOUND_SHARDS || 8);
  const plan = buildClassificationBoundSourcePlan({ root, now, shards });

  fs.mkdirSync(outdir, { recursive: true });
  fs.writeFileSync(path.join(outdir, 'plan.json'), JSON.stringify(plan, null, 2) + '\n', 'utf8');

  const assignmentFiles = [];
  for (let shard = 0; shard < plan.summary.shards; shard += 1) {
    const doc = shardDocument(plan, shard);
    const filename = `S${shard}.json`;
    fs.writeFileSync(path.join(outdir, filename), JSON.stringify(doc, null, 2) + '\n', 'utf8');
    assignmentFiles.push({
      shard: `S${shard}`,
      file: filename,
      rows: doc.summary.totalRows,
      reviewReadyRows: doc.summary.reviewReadyRows,
      explicitLinks: doc.summary.explicitLinks
    });
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: plan.generatedAt,
    marker: plan.marker,
    planSummary: plan.summary,
    assignments: assignmentFiles
  };
  fs.writeFileSync(path.join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  return { plan, manifest, outdir };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const outdir = process.argv[2] || '_audit/classification-bound';
  const { manifest } = materializeClassificationBoundAssignments({ outdir });
  console.log(JSON.stringify(manifest));
}
