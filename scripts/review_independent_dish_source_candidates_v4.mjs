#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { INDEPENDENT_SOURCE_HOST_POLICY_VERSION } from './independent_source_host_policy.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const INPUT = process.argv[2] || path.join(DATA, 'independent_dish_source_candidates.json');
const OUTPUT = process.argv[3] || path.join(DATA, 'reviewed_independent_dish_sources.json');

function runNode(script, args, { timeout = 180_000 } = {}) {
  const result = spawnSync(process.execPath, [path.join(HERE, script), ...args], {
    cwd: ROOT,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 12 * 1024 * 1024,
    timeout
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${script} failed\n${result.stdout || ''}\n${result.stderr || ''}`.trim());
  }
  return result;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eat-independent-review-v4-'));
const sanitizedInput = path.join(dir, 'candidates.sanitized.json');
const reviewedOutput = path.join(dir, 'reviewed.json');
try {
  const sanitize = runNode('sanitize_independent_source_candidate_plan.mjs', [INPUT, sanitizedInput], { timeout: 60_000 });
  const sanitized = JSON.parse(fs.readFileSync(sanitizedInput, 'utf8'));
  if (sanitized.policy?.hostSanitizedBeforeNetworkReview !== true
    || sanitized.policy?.independentSourceHostPolicyVersion !== INDEPENDENT_SOURCE_HOST_POLICY_VERSION) {
    throw new Error('v4 reviewer did not receive centrally sanitized candidate input');
  }

  // v3 preserves already-approved rows from its output path, so mirror any existing
  // output into the temporary location before invoking the strict page engine.
  if (fs.existsSync(OUTPUT)) fs.copyFileSync(OUTPUT, reviewedOutput);

  const strict = runNode('review_independent_dish_source_candidates_v3.mjs', [sanitizedInput, reviewedOutput]);
  runNode('audit_independent_source_host_policy.mjs', [reviewedOutput], { timeout: 60_000 });

  const reviewed = JSON.parse(fs.readFileSync(reviewedOutput, 'utf8'));
  reviewed.policy = {
    ...(reviewed.policy || {}),
    centralHostPolicyEnforcedInsideReviewer: true,
    independentSourceHostPolicyVersion: INDEPENDENT_SOURCE_HOST_POLICY_VERSION,
    candidateInputSanitizedBeforeStrictPageReview: true,
    reviewedOutputHostAuditedBeforeWrite: true,
    v3UsedAsInternalStrictPageEngine: true,
    explicitMenuUrlsIncludedViaSanitizedReviewRoots: sanitized.policy?.explicitMenuUrlsIncludedInNetworkReviewRoots === true
  };
  reviewed.summary = {
    ...(reviewed.summary || {}),
    originalProposalRowsBeforeHostSanitize: Number(sanitized.summary?.originalProposalRows ?? sanitized.summary?.proposalRows ?? 0),
    sanitizedProposalRows: Number(sanitized.summary?.proposalRows || 0),
    hostPolicyDroppedRows: Number(sanitized.summary?.hostPolicyDroppedRows || 0),
    hostPolicyChangedRows: Number(sanitized.summary?.hostPolicyChangedRows || 0),
    hostPolicyRemovedUrlValues: Number(sanitized.summary?.hostPolicyRemovedUrlValues || 0),
    reviewRootAugmentedRows: Number(sanitized.summary?.reviewRootAugmentedRows || 0)
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(reviewed, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({
    reviewer: 'v4-central-host-policy-wrapper',
    hostPolicyVersion: INDEPENDENT_SOURCE_HOST_POLICY_VERSION,
    sanitized: sanitized.summary,
    reviewed: reviewed.summary,
    sanitizerStdout: sanitize.stdout.trim().slice(0, 500),
    strictStdout: strict.stdout.trim().slice(0, 500)
  }));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
