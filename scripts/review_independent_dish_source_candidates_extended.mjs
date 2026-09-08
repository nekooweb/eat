#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const INPUT = process.argv[2] || path.join(DATA, 'independent_dish_source_candidates.json');
const OUTPUT = process.argv[3] || path.join(DATA, 'reviewed_independent_dish_sources.json');
const HIGH = 'review_high_confidence_overture_website_candidate';
const MEDIUM = 'review_overture_website_candidate';

const candidates = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const originalState = new Map((candidates.rows || []).map((row) => [row.googlePlaceId, row.proposalState]));
const reviewable = (candidates.rows || []).filter((row) =>
  row.candidateProvider === 'Overture Maps' && [HIGH, MEDIUM].includes(row.proposalState)
);
const promoted = JSON.parse(JSON.stringify(candidates));
let mediumRowsPromotedForReview = 0;
for (const row of promoted.rows || []) {
  if (row.candidateProvider !== 'Overture Maps' || row.proposalState !== MEDIUM) continue;
  row.originalProposalState = MEDIUM;
  row.proposalState = HIGH;
  mediumRowsPromotedForReview += 1;
}
promoted.summary = {
  ...(promoted.summary || {}),
  extendedReviewInputRows: reviewable.length,
  extendedReviewHighConfidenceRows: reviewable.filter((row) => row.proposalState === HIGH).length,
  extendedReviewMediumConfidenceRows: reviewable.filter((row) => row.proposalState === MEDIUM).length
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eat-independent-extended-'));
const tempInput = path.join(dir, 'candidates.json');
const tempOutput = path.join(dir, 'reviewed.json');
try {
  fs.writeFileSync(tempInput, JSON.stringify(promoted, null, 2) + '\n');
  if (fs.existsSync(OUTPUT)) fs.copyFileSync(OUTPUT, tempOutput);
  const result = spawnSync(process.execPath, [
    path.join(HERE, 'review_independent_dish_source_candidates_v3.mjs'),
    tempInput,
    tempOutput
  ], {
    cwd: ROOT,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 180_000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${result.stdout || ''}\n${result.stderr || ''}`.trim());
  const reviewed = JSON.parse(fs.readFileSync(tempOutput, 'utf8'));
  for (const row of reviewed.audit || []) {
    row.proposalState = originalState.get(row.googlePlaceId) || row.proposalState;
  }
  const highInputRows = reviewable.filter((row) => row.proposalState === HIGH).length;
  const mediumInputRows = reviewable.filter((row) => row.proposalState === MEDIUM).length;
  reviewed.schemaVersion = 4;
  reviewed.policy = {
    ...(reviewed.policy || {}),
    onlyHighConfidenceProposalStateReviewed: false,
    reviewedProposalStates: [HIGH, MEDIUM],
    mediumConfidenceRowsTemporarilyRoutedThroughSameStrictReviewer: true,
    candidateInputPromotionChangesIdentityThreshold: false,
    finalStrictPageNameAndLocationCriteriaUnchangedFromV3: true,
    proximityOnlyBindingAllowed: false,
    dishEvidencePromotionBeforeIdentityReviewAllowed: false
  };
  reviewed.summary = {
    ...(reviewed.summary || {}),
    extendedReviewInputRows: reviewable.length,
    extendedReviewHighConfidenceRows: highInputRows,
    extendedReviewMediumConfidenceRows: mediumInputRows,
    mediumRowsPromotedForReview,
    originalProposalRows: Number(candidates.summary?.proposalRows || (candidates.rows || []).length)
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(reviewed, null, 2) + '\n');
  console.log(JSON.stringify(reviewed.summary));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
